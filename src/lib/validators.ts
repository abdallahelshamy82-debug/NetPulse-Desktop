export interface ParsedTarget {
  raw: string;
  hostname: string;
  port: number | null;
  path: string;
  isIp: boolean;
}

const HOSTNAME_REGEX =
  /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

const IPV4_REGEX =
  /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

const IPV6_REGEX = /^[0-9a-fA-F:]+$/;

function isIpAddress(host: string): boolean {
  if (IPV4_REGEX.test(host)) return true;
  if (host.includes(":") && IPV6_REGEX.test(host)) {
    const parts = host.split(":");
    return parts.length >= 3 && parts.length <= 8;
  }
  return false;
}

export function parseTargetHost(
  input: unknown
): { ok: true; data: ParsedTarget } | { ok: false; error: string } {
  if (typeof input !== "string") {
    return { ok: false, error: "Target must be a valid domain, URL, or IP address." };
  }

  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 512) {
    return { ok: false, error: "Please provide a valid non-empty domain or host." };
  }

  // Reject whitespace or control characters
  if (/[\s\x00-\x1f\x7f]/.test(trimmed)) {
    return { ok: false, error: "Target contains invalid whitespace or control characters." };
  }

  // Reject any explicit non-HTTP(S) protocol schemes immediately
  if (
    (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) && !/^https?:\/\//i.test(trimmed)) ||
    /^(javascript|data|vbscript|file|mailto|blob|about|ftp|tel):/i.test(trimmed)
  ) {
    return {
      ok: false,
      error: "Unsupported protocol. Only http:// and https:// targets are allowed.",
    };
  }

  let hostname = "";
  let port: number | null = null;
  let targetPath = "/";

  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsedUrl = new URL(withScheme);
    hostname = parsedUrl.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    targetPath = `${parsedUrl.pathname || "/"}${parsedUrl.search || ""}`;
    if (parsedUrl.port) {
      const p = Number(parsedUrl.port);
      if (!Number.isInteger(p) || p < 1 || p > 65535) {
        return { ok: false, error: "Invalid port number in target URL." };
      }
      port = p;
    }
  } catch {
    return { ok: false, error: "Unable to parse target URL or hostname." };
  }

  // Remove trailing dot from FQDN if provided
  if (hostname.endsWith(".") && hostname.length > 1) {
    hostname = hostname.slice(0, -1);
  }

  if (isIpAddress(hostname)) {
    return {
      ok: true,
      data: {
        raw: trimmed,
        hostname,
        port,
        path: targetPath,
        isIp: true,
      },
    };
  }

  if (!HOSTNAME_REGEX.test(hostname)) {
    return { ok: false, error: "Hostname format is invalid. Example: magixa.tech or github.com" };
  }

  return {
    ok: true,
    data: {
      raw: trimmed,
      hostname,
      port,
      path: targetPath,
      isIp: false,
    },
  };
}

export const DEFAULT_SCAN_PORTS: readonly number[] = [
  21, 22, 80, 443, 3000, 3306, 5432, 6379, 8080,
];

export function parsePortListStrict(
  ports: unknown
): { ok: true; ports: number[] } | { ok: false; error: string } {
  if (ports === undefined || ports === null) {
    return { ok: true, ports: [...DEFAULT_SCAN_PORTS] };
  }

  if (!Array.isArray(ports)) {
    return { ok: false, error: "Ports must be an array of integers between 1 and 65535." };
  }

  const unique = new Set<number>();
  for (const item of ports) {
    const num = typeof item === "number" ? item : Number(item);
    if (Number.isInteger(num) && num >= 1 && num <= 65535) {
      unique.add(num);
      if (unique.size >= 24) break;
    }
  }

  if (unique.size === 0) {
    return { ok: false, error: "No valid TCP ports (1-65535) were provided." };
  }

  return { ok: true, ports: Array.from(unique).sort((a, b) => a - b) };
}

export function sanitizePortList(ports: unknown): number[] {
  const strict = parsePortListStrict(ports);
  return strict.ok ? strict.ports : [...DEFAULT_SCAN_PORTS];
}
