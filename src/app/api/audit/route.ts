import { NextRequest, NextResponse } from "next/server";
import net from "net";
import tls from "tls";
import http from "http";
import https from "https";
import { performance } from "perf_hooks";
import { parseTargetHost } from "@/lib/validators";
import {
  createPinnedLookup,
  getProbeVantage,
  isCloudEnvironment,
  isPrivateTargetsAllowed,
  NetworkGuardError,
  resolveAllValidatedHosts,
  selectReachableHost,
} from "@/lib/network-guard";
import { enforceCloudRateLimit } from "@/lib/rate-limit";
import type {
  AuditResult,
  CertificateChainItem,
  CertificateParty,
  CookieAuditItem,
  CookieAuditSummary,
  CookieIssueCode,
  HttpResponseInfo,
  SecurityGrade,
  SecurityHeaderCheck,
  SslDetails,
} from "@/types/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function firstStr(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return value[0];
  return undefined;
}

function normalizeParty(raw: tls.Certificate | undefined): CertificateParty {
  if (!raw) return {};
  return {
    CN: firstStr(raw.CN),
    O: firstStr(raw.O),
    OU: firstStr(raw.OU),
    C: firstStr(raw.C),
    L: firstStr(raw.L),
    ST: firstStr(raw.ST),
  };
}

function parseSanList(rawSan: string | undefined): string[] {
  if (!rawSan) return [];
  return rawSan
    .split(",")
    .map((entry) => entry.trim().replace(/^DNS:/i, "").replace(/^IP Address:/i, ""))
    .filter(Boolean);
}

function safeDestroySocket(socket: net.Socket | tls.TLSSocket) {
  if (socket.listenerCount("error") === 0) {
    socket.on("error", () => {});
  }
  socket.destroy();
}

function inspectTls(
  hostname: string,
  resolvedIp: string,
  family: 4 | 6,
  port: number,
  timeoutMs: number
): Promise<SslDetails> {
  return new Promise((resolve) => {
    const start = performance.now();
    let settled = false;

    const finish = (result: SslDetails) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const sniServerName = net.isIP(hostname) ? undefined : hostname;

    const socket = tls.connect({
      host: hostname,
      port,
      servername: sniServerName,
      ALPNProtocols: ["h2", "http/1.1"],
      lookup: createPinnedLookup(resolvedIp, family),
      rejectUnauthorized: false,
      timeout: timeoutMs,
    });

    socket.once("secureConnect", () => {
      const handshakeMs = Math.round(performance.now() - start);
      const cert = socket.getPeerCertificate(true);
      const protocol = socket.getProtocol() || null;
      const alpnProtocol = socket.alpnProtocol ? String(socket.alpnProtocol) : null;
      const cipher = socket.getCipher();
      const authorized = socket.authorized;
      const authErrorRaw = socket.authorizationError;
      const authorizationError = authErrorRaw ? String(authErrorRaw) : null;

      const hasCert = Boolean(cert && Object.keys(cert).length > 0);
      const validFromDate = hasCert && cert.valid_from ? new Date(cert.valid_from) : null;
      const validToDate = hasCert && cert.valid_to ? new Date(cert.valid_to) : null;
      const now = Date.now();

      const validFromIso =
        validFromDate && !Number.isNaN(validFromDate.getTime()) ? validFromDate.toISOString() : null;
      const validToIso =
        validToDate && !Number.isNaN(validToDate.getTime()) ? validToDate.toISOString() : null;

      const daysRemaining =
        validToDate && !Number.isNaN(validToDate.getTime())
          ? Math.floor((validToDate.getTime() - now) / 86_400_000)
          : null;

      const isExpired = daysRemaining !== null ? daysRemaining < 0 : false;
      const isNotYetValid =
        validFromDate && !Number.isNaN(validFromDate.getTime())
          ? validFromDate.getTime() > now
          : false;

      // Walk certificate chain safely without infinite loops & inspect expiry for every link
      const chain: CertificateChainItem[] = [];
      const seenFingerprints = new Set<string>();
      let current: tls.DetailedPeerCertificate | undefined = hasCert ? cert : undefined;

      while (current && chain.length < 6) {
        const fp = current.fingerprint256 || current.fingerprint || `${chain.length}`;
        if (seenFingerprints.has(fp)) break;
        seenFingerprints.add(fp);

        const linkValidTo = current.valid_to ? new Date(current.valid_to) : null;
        const linkValidFrom = current.valid_from ? new Date(current.valid_from) : null;
        const linkDaysRemaining =
          linkValidTo && !Number.isNaN(linkValidTo.getTime())
            ? Math.floor((linkValidTo.getTime() - now) / 86_400_000)
            : null;
        const linkNotYetValid =
          linkValidFrom && !Number.isNaN(linkValidFrom.getTime())
            ? linkValidFrom.getTime() > now
            : false;
        const linkExpired =
          (linkDaysRemaining !== null && linkDaysRemaining < 0) || linkNotYetValid;
        const linkExpiringSoon =
          linkDaysRemaining !== null && linkDaysRemaining >= 0 && linkDaysRemaining <= 30;

        chain.push({
          subjectCN: firstStr(current.subject?.CN) || firstStr(current.subject?.O) || "Unknown",
          issuerCN: firstStr(current.issuer?.CN) || firstStr(current.issuer?.O) || "Unknown",
          validFrom: current.valid_from || "",
          validTo: current.valid_to || "",
          daysRemaining: linkDaysRemaining,
          isExpired: linkExpired,
          expiringSoon: linkExpiringSoon,
          fingerprint256: current.fingerprint256 || "",
        });

        const nextCert = current.issuerCertificate;
        if (!nextCert || nextCert === current) break;
        current = nextCert;
      }

      const chainHasExpiredCert = chain.some((item) => item.isExpired);
      const chainHasExpiringSoonCert = chain.slice(1).some((item) => item.expiringSoon);

      socket.on("error", () => {});
      socket.end();
      safeDestroySocket(socket);

      finish({
        available: hasCert,
        authorized,
        authorizationError,
        protocol,
        alpnProtocol,
        cipherName: cipher?.standardName || cipher?.name || null,
        cipherVersion: cipher?.version || null,
        subject: normalizeParty(cert?.subject),
        issuer: normalizeParty(cert?.issuer),
        validFrom: validFromIso,
        validTo: validToIso,
        daysRemaining,
        isExpired,
        isNotYetValid,
        chainHasExpiredCert,
        chainHasExpiringSoonCert,
        serialNumber: cert?.serialNumber || null,
        fingerprint256: cert?.fingerprint256 || null,
        keyBits: typeof cert?.bits === "number" ? cert.bits : null,
        asn1Curve: typeof cert?.asn1Curve === "string" ? cert.asn1Curve : null,
        subjectAltNames: parseSanList(cert?.subjectaltname),
        chain,
        handshakeMs,
      });
    });

    socket.once("timeout", () => {
      socket.on("error", () => {});
      safeDestroySocket(socket);
      finish({
        available: false,
        authorized: false,
        authorizationError: "TLS_TIMEOUT",
        protocol: null,
        cipherName: null,
        cipherVersion: null,
        subject: {},
        issuer: {},
        validFrom: null,
        validTo: null,
        daysRemaining: null,
        isExpired: false,
        isNotYetValid: false,
        chainHasExpiredCert: false,
        chainHasExpiringSoonCert: false,
        serialNumber: null,
        fingerprint256: null,
        keyBits: null,
        asn1Curve: null,
        subjectAltNames: [],
        chain: [],
        handshakeMs: Math.round(performance.now() - start),
        error: `TLS handshake timed out after ${timeoutMs}ms.`,
      });
    });

    socket.on("error", (err: Error) => {
      safeDestroySocket(socket);
      finish({
        available: false,
        authorized: false,
        authorizationError: err.message,
        protocol: null,
        cipherName: null,
        cipherVersion: null,
        subject: {},
        issuer: {},
        validFrom: null,
        validTo: null,
        daysRemaining: null,
        isExpired: false,
        isNotYetValid: false,
        chainHasExpiredCert: false,
        chainHasExpiringSoonCert: false,
        serialNumber: null,
        fingerprint256: null,
        keyBits: null,
        asn1Curve: null,
        subjectAltNames: [],
        chain: [],
        handshakeMs: Math.round(performance.now() - start),
        error: err.message,
      });
    });
  });
}

interface SingleHttpFetch {
  statusCode: number;
  statusMessage: string;
  httpVersion: string;
  headers: http.IncomingHttpHeaders;
}

function performSingleRequest(
  urlString: string,
  resolvedIp: string,
  family: 4 | 6,
  timeoutMs: number
): Promise<SingleHttpFetch> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlString);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      reject(
        new NetworkGuardError(
          `Blocked unsupported URL protocol "${parsed.protocol}".`,
          403,
          "INVALID_PROTOCOL"
        )
      );
      return;
    }

    const isHttps = parsed.protocol === "https:";
    const mod = isHttps ? https : http;
    const cleanHost = parsed.hostname.replace(/^\[|\]$/g, "");
    const servername = isHttps && !net.isIP(cleanHost) ? cleanHost : undefined;

    const req = mod.request(
      {
        hostname: cleanHost,
        port: parsed.port || (isHttps ? 443 : 80),
        path: `${parsed.pathname || "/"}${parsed.search || ""}`,
        method: "GET",
        timeout: timeoutMs,
        rejectUnauthorized: false,
        agent: false,
        lookup: createPinnedLookup(resolvedIp, family),
        ...(servername ? { servername } : {}),
        headers: {
          "User-Agent": "NetPulse-Desktop/1.0 (+https://netpulse.local)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Encoding": "identity",
          Connection: "close",
        },
      },
      (res) => {
        const result: SingleHttpFetch = {
          statusCode: res.statusCode ?? 0,
          statusMessage: res.statusMessage ?? "",
          httpVersion: res.httpVersion ?? "1.1",
          headers: res.headers,
        };
        res.on("error", () => {});
        res.resume();
        res.destroy();
        resolve(result);
      }
    );

    req.once("timeout", () => {
      req.destroy(new Error("HTTP request timed out."));
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.end();
  });
}

async function fetchHttpWithRedirects(
  hostname: string,
  initialIp: string,
  initialFamily: 4 | 6,
  port: number,
  allowPrivate: boolean,
  deadline: number,
  protocol: "https:" | "http:" = "https:",
  initialPath = "/"
): Promise<{
  info: HttpResponseInfo;
  rawHeaders: http.IncomingHttpHeaders;
  timedOut: boolean;
}> {
  const start = performance.now();
  const urlHost = net.isIPv6(hostname) ? `[${hostname}]` : hostname;
  const normalizedPath = initialPath.startsWith("/") ? initialPath : `/${initialPath}`;
  const defaultPort = protocol === "https:" ? 443 : 80;
  const scheme = protocol === "https:" ? "https" : "http";
  const initialUrl =
    port === defaultPort
      ? `${scheme}://${urlHost}${normalizedPath}`
      : `${scheme}://${urlHost}:${port}${normalizedPath}`;
  let currentUrl = initialUrl;
  let currentIp = initialIp;
  let currentFamily: 4 | 6 = initialFamily;
  const redirects: string[] = [];
  let lastResponse: SingleHttpFetch | null = null;
  let lastHopMs = 0;
  let timedOut = false;

  for (let hop = 0; hop < 5; hop++) {
    const remaining = Math.floor(deadline - performance.now());
    if (remaining < 700) {
      timedOut = true;
      break;
    }

    const hopStart = performance.now();
    const res = await performSingleRequest(
      currentUrl,
      currentIp,
      currentFamily,
      Math.min(4000, remaining)
    );
    lastHopMs = Math.max(1, Math.round(performance.now() - hopStart));
    lastResponse = res;

    const location = res.headers.location;
    if (
      location &&
      res.statusCode >= 300 &&
      res.statusCode < 400 &&
      typeof location === "string"
    ) {
      let nextUrlObj: URL;
      try {
        nextUrlObj = new URL(location, currentUrl);
      } catch {
        break;
      }

      if (nextUrlObj.protocol !== "http:" && nextUrlObj.protocol !== "https:") {
        throw new NetworkGuardError(
          `Blocked redirect to unsupported protocol "${nextUrlObj.protocol}".`,
          403,
          "INVALID_PROTOCOL"
        );
      }

      const nextRemaining = Math.floor(deadline - performance.now());
      if (nextRemaining < 700) {
        timedOut = true;
        break;
      }

      const nextHost = nextUrlObj.hostname.replace(/^\[|\]$/g, "");
      const hopPort = nextUrlObj.port
        ? Number(nextUrlObj.port)
        : nextUrlObj.protocol === "https:"
          ? 443
          : 80;
      const nextCandidates = await resolveAllValidatedHosts(
        nextHost,
        allowPrivate,
        Math.min(2500, nextRemaining)
      );
      const resolvedNext = await selectReachableHost(nextCandidates, hopPort, 1200);

      currentIp = resolvedNext.address;
      currentFamily = resolvedNext.family;
      const nextUrlStr = nextUrlObj.toString();
      redirects.push(nextUrlStr);
      currentUrl = nextUrlStr;
      continue;
    }
    break;
  }

  const totalChainMs = Math.round(performance.now() - start);
  const responseTimeMs = lastHopMs > 0 ? lastHopMs : totalChainMs;

  // Check if plaintext HTTP redirects to HTTPS within remaining budget (using pinned initial IP)
  let httpsRedirectEnforced: boolean | null = protocol === "http:" ? false : null;
  if (protocol === "https:") {
    const remainingForHttp = Math.floor(deadline - performance.now());
    if (remainingForHttp >= 700) {
      try {
        const httpProbe = await performSingleRequest(
          `http://${urlHost}/`,
          initialIp,
          initialFamily,
          Math.min(2000, remainingForHttp)
        );
        const loc = httpProbe.headers.location;
        if (
          httpProbe.statusCode >= 300 &&
          httpProbe.statusCode < 400 &&
          typeof loc === "string" &&
          loc.toLowerCase().startsWith("https://")
        ) {
          httpsRedirectEnforced = true;
        } else {
          httpsRedirectEnforced = false;
        }
      } catch {
        httpsRedirectEnforced = null;
      }
    }
  }

  const headers = lastResponse?.headers ?? {};
  const headerStr = (key: string): string | null => {
    const val = headers[key];
    if (typeof val === "string") return val;
    if (Array.isArray(val)) return val.join("; ");
    return null;
  };

  const serverHeader = headerStr("server");
  const poweredByHeader = headerStr("x-powered-by");
  const serverLeaksVersion = Boolean(serverHeader && /\/[0-9]+(\.[0-9]+)?/.test(serverHeader));
  const techDisclosureWarning = Boolean(poweredByHeader || serverLeaksVersion);

  return {
    timedOut,
    rawHeaders: headers,
    info: {
      finalUrl: currentUrl,
      statusCode: lastResponse?.statusCode ?? 0,
      statusMessage: lastResponse?.statusMessage ?? "",
      httpVersion: lastResponse?.httpVersion ?? "1.1",
      responseTimeMs,
      totalChainMs,
      redirects,
      httpsRedirectEnforced,
      serverHeader,
      poweredByHeader,
      techDisclosureWarning,
      contentType: headerStr("content-type"),
    },
  };
}

function getHeaderString(headers: http.IncomingHttpHeaders, key: string): string | null {
  const val = headers[key.toLowerCase()];
  if (typeof val === "string") return val.trim();
  if (Array.isArray(val) && val.length > 0) return val.join("; ").trim();
  return null;
}

function parseCspDirectives(csp: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of csp.split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const name = tokens[0].toLowerCase();
    const values = tokens.slice(1).map((t) => t.toLowerCase());
    if (!map.has(name)) {
      map.set(name, values);
    }
  }
  return map;
}

function evaluateSetCookies(headers: http.IncomingHttpHeaders): CookieAuditSummary {
  const rawSetCookie = headers["set-cookie"];
  const entries = Array.isArray(rawSetCookie)
    ? rawSetCookie
    : typeof rawSetCookie === "string"
      ? [rawSetCookie]
      : [];

  const cookies: CookieAuditItem[] = [];

  for (const rawCookie of entries) {
    const parts = rawCookie
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) continue;

    const eqIdx = parts[0].indexOf("=");
    const name = (eqIdx > 0 ? parts[0].slice(0, eqIdx) : parts[0]).trim();
    if (!name) continue;

    let secure = false;
    let httpOnly = false;
    let sameSite: string | null = null;

    for (const attr of parts.slice(1)) {
      const lower = attr.toLowerCase();
      if (lower === "secure") {
        secure = true;
      } else if (lower === "httponly") {
        httpOnly = true;
      } else if (lower.startsWith("samesite=")) {
        sameSite = attr.slice(attr.indexOf("=") + 1).trim() || null;
      }
    }

    const isSensitive =
      /session|sess|sid|token|auth|jwt|login|user|csrf|xsrf|remember|^__(host|secure)-/i.test(
        name
      );
    const issues: CookieIssueCode[] = [];
    if (!secure) issues.push("missing_secure");
    if (isSensitive && !httpOnly) issues.push("missing_httponly");
    if (!sameSite || (sameSite.toLowerCase() === "none" && !secure)) {
      issues.push("weak_samesite");
    }

    cookies.push({
      name: name.slice(0, 80),
      secure,
      httpOnly,
      sameSite,
      isSensitive,
      issues,
    });
  }

  const insecureCount = cookies.filter((c) => c.issues.length > 0).length;
  return {
    total: cookies.length,
    secureCount: cookies.length - insecureCount,
    insecureCount,
    cookies,
  };
}

function evaluateSecurityHeaders(headers: http.IncomingHttpHeaders): SecurityHeaderCheck[] {
  const hsts = getHeaderString(headers, "strict-transport-security");
  const csp = getHeaderString(headers, "content-security-policy");
  const xfo = getHeaderString(headers, "x-frame-options");
  const xcto = getHeaderString(headers, "x-content-type-options");
  const rp = getHeaderString(headers, "referrer-policy");
  const pp = getHeaderString(headers, "permissions-policy");

  const checks: SecurityHeaderCheck[] = [];

  // 1. Strict-Transport-Security (max 11)
  if (!hsts) {
    checks.push({
      id: "hsts",
      name: "Strict-Transport-Security",
      value: null,
      status: "fail",
      score: 0,
      maxScore: 11,
      severity: "critical",
      issueKey: "hsts_missing",
      recommendationKey: "hsts_fix",
      fixSnippet: "Strict-Transport-Security: max-age=31536000; includeSubDomains; preload",
    });
  } else {
    const maxAgeMatch = /max-age\s*=\s*(\d+)/i.exec(hsts);
    const maxAge = maxAgeMatch ? Number(maxAgeMatch[1]) : 0;
    const hasSubDomains = /includesubdomains/i.test(hsts);
    if (maxAge >= 31536000 && hasSubDomains) {
      checks.push({
        id: "hsts",
        name: "Strict-Transport-Security",
        value: hsts,
        status: "pass",
        score: 11,
        maxScore: 11,
        severity: "critical",
        issueKey: "hsts_pass",
        recommendationKey: "hsts_fix",
        fixSnippet: "Strict-Transport-Security: max-age=31536000; includeSubDomains; preload",
      });
    } else {
      checks.push({
        id: "hsts",
        name: "Strict-Transport-Security",
        value: hsts,
        status: "warn",
        score: maxAge >= 15552000 ? 7 : 5,
        maxScore: 11,
        severity: "critical",
        issueKey: "hsts_weak",
        recommendationKey: "hsts_fix",
        fixSnippet: "Strict-Transport-Security: max-age=31536000; includeSubDomains; preload",
      });
    }
  }

  // 2. Content-Security-Policy (max 11 — Directive-Aware script-src vs style-src)
  if (!csp) {
    checks.push({
      id: "csp",
      name: "Content-Security-Policy",
      value: null,
      status: "fail",
      score: 0,
      maxScore: 11,
      severity: "high",
      issueKey: "csp_missing",
      recommendationKey: "csp_fix",
      fixSnippet:
        "Content-Security-Policy: default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none';",
    });
  } else {
    const directives = parseCspDirectives(csp);
    const scriptTokens = directives.get("script-src") ?? directives.get("default-src") ?? [];
    const styleTokens = directives.get("style-src") ?? directives.get("default-src") ?? [];
    const hasScriptNonceOrHash = scriptTokens.some((tok) =>
      /^'(nonce-|sha256-|sha384-|sha512-|strict-dynamic)/.test(tok)
    );
    const scriptUnsafeInline = scriptTokens.includes("'unsafe-inline'") && !hasScriptNonceOrHash;
    const scriptUnsafeEval = scriptTokens.includes("'unsafe-eval'");
    const scriptWildcard =
      scriptTokens.includes("*") ||
      scriptTokens.includes("http:") ||
      scriptTokens.includes("data:");
    const styleInlineOnly =
      !scriptUnsafeInline &&
      !scriptUnsafeEval &&
      !scriptWildcard &&
      styleTokens.includes("'unsafe-inline'");

    if (scriptUnsafeInline || scriptUnsafeEval || scriptWildcard) {
      const bothCritical = scriptUnsafeInline && scriptUnsafeEval;
      checks.push({
        id: "csp",
        name: "Content-Security-Policy",
        value: csp,
        status: bothCritical ? "fail" : "warn",
        score: bothCritical ? 2 : 5,
        maxScore: 11,
        severity: "high",
        issueKey: "csp_script_unsafe",
        recommendationKey: "csp_fix",
        fixSnippet:
          "Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'self';",
      });
    } else if (styleInlineOnly) {
      checks.push({
        id: "csp",
        name: "Content-Security-Policy",
        value: csp,
        status: "pass",
        score: 10,
        maxScore: 11,
        severity: "high",
        issueKey: "csp_style_inline_only",
        recommendationKey: "csp_fix",
        fixSnippet:
          "Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'self';",
      });
    } else {
      checks.push({
        id: "csp",
        name: "Content-Security-Policy",
        value: csp,
        status: "pass",
        score: 11,
        maxScore: 11,
        severity: "high",
        issueKey: "csp_pass",
        recommendationKey: "csp_fix",
        fixSnippet:
          "Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'self';",
      });
    }
  }

  // 3. X-Frame-Options (max 8) — also recognizes CSP frame-ancestors
  const hasCspFrameAncestors = Boolean(csp && /frame-ancestors\s+/i.test(csp));
  if (xfo) {
    const validXfo = /^(deny|sameorigin)$/i.test(xfo.trim());
    checks.push({
      id: "xfo",
      name: "X-Frame-Options",
      value: xfo,
      status: validXfo ? "pass" : "warn",
      score: validXfo ? 8 : 4,
      maxScore: 8,
      severity: "high",
      issueKey: validXfo ? "xfo_pass" : "xfo_weak",
      recommendationKey: "xfo_fix",
      fixSnippet: "X-Frame-Options: DENY",
    });
  } else if (hasCspFrameAncestors) {
    checks.push({
      id: "xfo",
      name: "X-Frame-Options",
      value: "Covered via CSP frame-ancestors",
      status: "pass",
      score: 8,
      maxScore: 8,
      severity: "high",
      issueKey: "xfo_pass",
      recommendationKey: "xfo_fix",
      fixSnippet: "X-Frame-Options: DENY",
    });
  } else {
    checks.push({
      id: "xfo",
      name: "X-Frame-Options",
      value: null,
      status: "fail",
      score: 0,
      maxScore: 8,
      severity: "high",
      issueKey: "xfo_missing",
      recommendationKey: "xfo_fix",
      fixSnippet: "X-Frame-Options: DENY",
    });
  }

  // 4. X-Content-Type-Options (max 8)
  const validXcto = Boolean(xcto && /^nosniff$/i.test(xcto.trim()));
  checks.push({
    id: "xcto",
    name: "X-Content-Type-Options",
    value: xcto,
    status: validXcto ? "pass" : "fail",
    score: validXcto ? 8 : 0,
    maxScore: 8,
    severity: "medium",
    issueKey: validXcto ? "xcto_pass" : "xcto_missing",
    recommendationKey: "xcto_fix",
    fixSnippet: "X-Content-Type-Options: nosniff",
  });

  // 5. Referrer-Policy (max 7)
  if (!rp) {
    checks.push({
      id: "rp",
      name: "Referrer-Policy",
      value: null,
      status: "fail",
      score: 0,
      maxScore: 7,
      severity: "medium",
      issueKey: "rp_missing",
      recommendationKey: "rp_fix",
      fixSnippet: "Referrer-Policy: strict-origin-when-cross-origin",
    });
  } else {
    const weakRp = /unsafe-url|no-referrer-when-downgrade/i.test(rp);
    checks.push({
      id: "rp",
      name: "Referrer-Policy",
      value: rp,
      status: weakRp ? "warn" : "pass",
      score: weakRp ? 3 : 7,
      maxScore: 7,
      severity: "medium",
      issueKey: weakRp ? "rp_weak" : "rp_pass",
      recommendationKey: "rp_fix",
      fixSnippet: "Referrer-Policy: strict-origin-when-cross-origin",
    });
  }

  // 6. Permissions-Policy (max 5 — defense-in-depth warning awards partial credit when omitted)
  checks.push({
    id: "pp",
    name: "Permissions-Policy",
    value: pp,
    status: pp ? "pass" : "warn",
    score: pp ? 5 : 2,
    maxScore: 5,
    severity: "low",
    issueKey: pp ? "pp_pass" : "pp_missing",
    recommendationKey: "pp_fix",
    fixSnippet: "Permissions-Policy: camera=(), microphone=(), geolocation=()",
  });

  return checks;
}

function computeGrade(
  score: number,
  ssl: SslDetails,
  cookies: CookieAuditSummary,
  cspCheck: SecurityHeaderCheck | undefined
): SecurityGrade {
  if (
    !ssl.available ||
    ssl.isExpired ||
    ssl.isNotYetValid ||
    !ssl.authorized ||
    ssl.chainHasExpiredCert
  ) {
    return "F";
  }

  let grade: SecurityGrade;
  if (score >= 95) grade = "A+";
  else if (score >= 88) grade = "A";
  else if (score >= 82) grade = "A-";
  else if (score >= 76) grade = "B+";
  else if (score >= 68) grade = "B";
  else if (score >= 55) grade = "C";
  else if (score >= 40) grade = "D";
  else grade = "F";

  const hasUnencryptedCookie = cookies.cookies.some((c) => c.issues.includes("missing_secure"));
  const hasUnsafeScriptCsp = cspCheck?.issueKey === "csp_script_unsafe";
  const highGrades = new Set<SecurityGrade>(["A+", "A", "A-", "B+"]);

  if (hasUnencryptedCookie && hasUnsafeScriptCsp && highGrades.has(grade)) {
    return "B";
  }
  if (hasUnencryptedCookie && (grade === "A+" || grade === "A" || grade === "A-")) {
    return "B+";
  }

  return grade;
}

export async function POST(req: NextRequest) {
  try {
    const rateLimited = enforceCloudRateLimit(req, "audit", 20);
    if (rateLimited) return rateLimited;

    const body = (await req.json()) as { target?: unknown; port?: unknown };
    const parsed = parseTargetHost(body.target);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { hostname, raw, path: targetPath } = parsed.data;
    const port =
      typeof body.port === "number" && Number.isInteger(body.port) && body.port >= 1 && body.port <= 65535
        ? body.port
        : parsed.data.port ?? 443;

    const allowPrivate = isPrivateTargetsAllowed();
    const budgetMs = isCloudEnvironment() ? 8500 : 18000;
    const deadline = performance.now() + budgetMs;

    // Resolve & validate target IPs against SSRF policy and select fastest reachable endpoint
    const candidates = await resolveAllValidatedHosts(hostname, allowPrivate, 2500);
    const resolved = await selectReachableHost(candidates, port, 1400);
    const resolvedIp = resolved.address;
    const ipFamily = resolved.family;

    const tlsTimeout = Math.min(4500, Math.max(1500, Math.floor(deadline - performance.now() - 1800)));

    // Run pinned TLS inspection and SSRF-checked HTTPS header inspection in parallel
    const [ssl, httpsOutcome] = await Promise.all([
      inspectTls(hostname, resolvedIp, ipFamily, port, tlsTimeout),
      fetchHttpWithRedirects(
        hostname,
        resolvedIp,
        ipFamily,
        port,
        allowPrivate,
        deadline,
        "https:",
        targetPath
      ).catch((err: unknown) => {
        if (err instanceof NetworkGuardError) {
          throw err;
        }
        return {
          error: err instanceof Error ? err.message : "HTTPS connection failed.",
        };
      }),
    ]);

    let httpOutcome = httpsOutcome;

    // Fallback to plaintext HTTP (port 80) when HTTPS fails on HTTP-only sites (e.g. neverssl.com)
    if ("error" in httpOutcome && !ssl.available && port === 443) {
      const remainingForPlainHttp = Math.floor(deadline - performance.now());
      if (remainingForPlainHttp >= 1200) {
        const plainOutcome = await fetchHttpWithRedirects(
          hostname,
          resolvedIp,
          ipFamily,
          80,
          allowPrivate,
          deadline,
          "http:",
          targetPath
        ).catch((err: unknown) => {
          if (err instanceof NetworkGuardError) {
            throw err;
          }
          return {
            error: err instanceof Error ? err.message : "HTTP connection failed.",
          };
        });
        if (!("error" in plainOutcome)) {
          httpOutcome = plainOutcome;
        }
      }
    }

    if ("error" in httpOutcome) {
      return NextResponse.json(
        {
          error: `HTTPS connection failed for "${hostname}": ${httpOutcome.error}`,
        },
        { status: 502 }
      );
    }

    const headers = evaluateSecurityHeaders(httpOutcome.rawHeaders);
    const cookies = evaluateSetCookies(httpOutcome.rawHeaders);
    const cspCheck = headers.find((h) => h.id === "csp");

    // Compute TLS Score (max 40) — strictly zero trust points when !ssl.authorized
    let tlsScore = 0;
    if (ssl.available) {
      if (ssl.authorized) {
        tlsScore += 15;
        if (!ssl.isExpired && !ssl.isNotYetValid && !ssl.chainHasExpiredCert) {
          if (
            ssl.daysRemaining !== null &&
            ssl.daysRemaining >= 30 &&
            !ssl.chainHasExpiringSoonCert
          ) {
            tlsScore += 10;
          } else if (ssl.daysRemaining !== null && ssl.daysRemaining >= 0) {
            tlsScore += 6;
          }
        }
      }

      if (ssl.protocol === "TLSv1.3") {
        tlsScore += 15;
      } else if (ssl.protocol === "TLSv1.2") {
        tlsScore += 11;
      } else if (ssl.protocol) {
        tlsScore += 3;
      }
    }

    // Headers Score (max 50)
    const headersScore = headers.reduce((sum, item) => sum + item.score, 0);
    const headersMax = headers.reduce((sum, item) => sum + item.maxScore, 0);

    // Transport Hygiene Score (max 10) — zero for plaintext HTTP-only sites; penalizes insecure Set-Cookie flags & version leaks
    let transportScore = 0;
    const isHttpsFinal = ssl.available && httpOutcome.info.finalUrl.startsWith("https://");
    if (isHttpsFinal && ssl.alpnProtocol === "h2") {
      httpOutcome.info.httpVersion = "2";
    }
    if (isHttpsFinal) {
      if (httpOutcome.info.statusCode >= 200 && httpOutcome.info.statusCode < 500) {
        transportScore += 5;
      }
      if (httpOutcome.info.httpsRedirectEnforced === true) {
        transportScore += 5;
      }
      if (httpOutcome.info.techDisclosureWarning) {
        transportScore -= 2;
      }
      if (cookies.cookies.some((c) => c.issues.includes("missing_secure"))) {
        transportScore -= 5;
      }
      if (cookies.cookies.some((c) => c.issues.includes("weak_samesite"))) {
        transportScore -= 2;
      }
      if (
        cookies.cookies.some(
          (c) => c.issues.includes("missing_secure") && c.issues.includes("missing_httponly")
        )
      ) {
        transportScore -= 1;
      }
      transportScore = Math.max(0, transportScore);
    }

    const rawScore = Math.min(100, Math.max(0, tlsScore + headersScore + transportScore));
    const grade = computeGrade(rawScore, ssl, cookies, cspCheck);
    const totalScore = grade === "F" ? Math.min(rawScore, 35) : rawScore;

    const issuesCount = {
      pass: headers.filter((h) => h.status === "pass").length,
      warn: headers.filter((h) => h.status === "warn").length,
      fail: headers.filter((h) => h.status === "fail").length,
    };

    const result: AuditResult = {
      target: raw,
      hostname,
      resolvedIp,
      ipFamily,
      scannedAt: new Date().toISOString(),
      probeVantage: getProbeVantage(),
      score: totalScore,
      rawScore,
      grade,
      breakdown: {
        tlsScore,
        tlsMax: 40,
        headersScore,
        headersMax,
        transportScore,
        transportMax: 10,
      },
      ssl,
      http: httpOutcome.info,
      headers,
      cookies,
      issuesCount,
      ...(httpOutcome.timedOut ? { timedOut: true } : {}),
    };

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NetworkGuardError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    const message = err instanceof Error ? err.message : "Unexpected error during SSL audit.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
