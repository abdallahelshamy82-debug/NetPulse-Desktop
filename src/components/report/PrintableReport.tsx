"use client";

import React, { useEffect, useRef, useState } from "react";
import { Printer, X, Download, ShieldCheck, CheckCircle2, AlertTriangle } from "lucide-react";
import type {
  AuditResult,
  CookieIssueCode,
  DnsPingResult,
  PortScanResult,
  PortStatus,
} from "@/types/telemetry";
import type { Dictionary, Locale } from "@/lib/i18n";
import { formatDateTime } from "@/lib/cn";

interface PrintableReportProps {
  t: Dictionary;
  lang: Locale;
  isOpen: boolean;
  onClose: () => void;
  audit: AuditResult | null;
  dns: DnsPingResult | null;
  ports: PortScanResult | null;
  onExportJson: () => void;
}

function ReportDocumentBody({
  t,
  lang,
  audit,
  dns,
  ports,
}: {
  t: Dictionary;
  lang: Locale;
  audit: AuditResult | null;
  dns: DnsPingResult | null;
  ports: PortScanResult | null;
}) {
  const targetDomain = audit?.hostname || dns?.hostname || ports?.hostname || "—";
  const resolvedIp = audit?.resolvedIp || dns?.resolvedIp || ports?.resolvedIp || "—";
  const matchingDns = dns && dns.hostname === targetDomain ? dns : null;
  const matchingPorts = ports && ports.hostname === targetDomain ? ports : null;

  const headerText = (key: string): string => {
    const map = t.headerIssues as Record<string, string>;
    return map[key] ?? key;
  };

  const portStatusLabel = (status: PortStatus): string => {
    if (status === "open") return t.common.open;
    if (status === "closed") return t.common.closed;
    if (status === "filtered") return t.common.filtered;
    return t.common.errorStatus;
  };

  const formatMetricMs = (value: number | null, prefix = ""): string =>
    value !== null ? `${prefix}${value} ms` : "—";

  const redirectLabel =
    audit?.http.httpsRedirectEnforced === true
      ? t.audit.enforced
      : audit?.http.httpsRedirectEnforced === false
        ? t.audit.notEnforced
        : t.audit.port80Unreachable;

  const cookieIssueLabel = (code: CookieIssueCode): string => {
    if (code === "missing_secure") return t.audit.cookieMissingSecure;
    if (code === "missing_httponly") return t.audit.cookieMissingHttpOnly;
    return t.audit.cookieWeakSameSite;
  };

  const hasSslWarnings =
    audit !== null &&
    Boolean(
      !audit.ssl.available ||
        (!audit.ssl.authorized && audit.ssl.authorizationError) ||
        audit.ssl.error ||
        audit.ssl.chainHasExpiredCert ||
        audit.ssl.chainHasExpiringSoonCert ||
        audit.ssl.isExpired ||
        audit.ssl.isNotYetValid
    );

  return (
    <div
      dir={lang === "ar" ? "rtl" : "ltr"}
      className="bg-white text-slate-900 p-8 print:p-0 space-y-6 text-xs leading-relaxed"
    >
      {/* Executive Header */}
      <div className="flex items-start justify-between gap-4 pb-5 border-b-2 border-slate-900">
        <div>
          <div className="flex items-center gap-2 text-cyan-700 font-bold tracking-wider uppercase text-[11px]">
            <ShieldCheck className="w-4 h-4" />
            <span>{t.report.badgeTitle}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">{t.report.title}</h1>
          <p className="text-slate-600 mt-0.5">{t.report.generatedBy}</p>
        </div>

        {audit && (
          <div className="text-center px-4 py-2.5 rounded-lg border-2 border-slate-900 bg-slate-50 shrink-0">
            <div className="text-[10px] font-bold uppercase text-slate-500">
              {t.audit.overallScore}
            </div>
            <div className="text-2xl font-mono font-extrabold text-slate-900">
              <span className="inline-block ltr-data">
                {audit.grade}{" "}
                <span className="text-sm font-semibold">({audit.score}/100)</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Metadata Summary Grid */}
      <div className="grid grid-cols-3 gap-3 p-3.5 rounded-lg bg-slate-50 border border-slate-200">
        <div>
          <div className="text-[10px] uppercase font-semibold text-slate-500">
            {t.report.targetDomain}
          </div>
          <div className="mt-0.5">
            <span className="inline-block font-mono font-bold text-slate-900 ltr-data">
              {targetDomain}
            </span>
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase font-semibold text-slate-500">
            {t.report.resolvedEndpoint}
          </div>
          <div className="mt-0.5">
            <span className="inline-block font-mono font-bold text-slate-900 ltr-data">
              {resolvedIp}
            </span>
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase font-semibold text-slate-500">
            {t.report.reportDate}
          </div>
          <div className="font-mono text-slate-800 mt-0.5">
            {formatDateTime(audit?.scannedAt ?? dns?.scannedAt ?? ports?.scannedAt ?? null, lang)}
          </div>
        </div>
      </div>

      {/* Section 1: SSL / TLS */}
      {audit && (
        <section className="space-y-2.5 print-avoid-break">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-300 pb-1.5">
            {t.report.sslSection}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <div className="p-2.5 rounded border border-slate-200">
              <div className="text-[10px] text-slate-500">{t.audit.issuer}</div>
              <div className="font-semibold text-slate-900 mt-0.5">
                {audit.ssl.issuer.O || audit.ssl.issuer.CN || "—"}
              </div>
            </div>
            <div className="p-2.5 rounded border border-slate-200">
              <div className="text-[10px] text-slate-500">{t.audit.protocol}</div>
              <div className="font-mono font-bold text-slate-900 mt-0.5">
                <span className="inline-block ltr-data">{audit.ssl.protocol ?? "—"}</span>
              </div>
            </div>
            <div className="p-2.5 rounded border border-slate-200">
              <div className="text-[10px] text-slate-500">{t.audit.daysRemaining}</div>
              <div className="font-mono font-bold text-slate-900 mt-0.5">
                <span dir="ltr" className="inline-block ltr-data">
                  {audit.ssl.daysRemaining ?? "—"}
                </span>{" "}
                {t.common.days}
              </div>
            </div>
            <div className="p-2.5 rounded border border-slate-200">
              <div className="text-[10px] text-slate-500">{t.audit.trustStatus}</div>
              <div
                className={`font-semibold mt-0.5 ${
                  audit.ssl.authorized ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                {audit.ssl.authorized ? t.audit.trusted : t.audit.untrusted}
              </div>
            </div>
            <div className="p-2.5 rounded border border-slate-200">
              <div className="text-[10px] text-slate-500">{t.audit.httpsRedirect}</div>
              <div
                className={`font-semibold mt-0.5 ${
                  audit.http.httpsRedirectEnforced === true
                    ? "text-emerald-700"
                    : audit.http.httpsRedirectEnforced === false
                      ? "text-amber-700"
                      : "text-slate-600"
                }`}
              >
                {redirectLabel}
              </div>
            </div>
          </div>

          {hasSslWarnings && (
            <div className="p-2.5 rounded border border-rose-300 bg-rose-50 text-rose-800 text-[11px] space-y-1">
              {!audit.ssl.available && (
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{t.audit.httpOnlyBanner}</span>
                </div>
              )}
              {(audit.ssl.isExpired || audit.ssl.isNotYetValid) && (
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{t.audit.expired}</span>
                </div>
              )}
              {!audit.ssl.authorized && audit.ssl.authorizationError && (
                <div className="flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    <strong>{t.audit.authErrorLabel}:</strong>{" "}
                    <span className="inline-block ltr-data font-mono">
                      {audit.ssl.authorizationError}
                    </span>
                  </span>
                </div>
              )}
              {audit.ssl.error && (
                <div className="flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="inline-block ltr-data font-mono">{audit.ssl.error}</span>
                </div>
              )}
              {(audit.ssl.chainHasExpiredCert || audit.ssl.chainHasExpiringSoonCert) && (
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{t.audit.chainWarning}</span>
                </div>
              )}
            </div>
          )}

          <div className="text-[11px] text-slate-700 bg-slate-50 p-2.5 rounded border border-slate-200 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>
                <strong>{t.report.cipherLabel}:</strong>{" "}
                <span className="inline-block ltr-data font-mono">
                  {audit.ssl.cipherName ?? "—"}
                </span>
              </span>
              <span>
                <strong>{t.audit.validFrom}:</strong>{" "}
                <span className="font-mono">{formatDateTime(audit.ssl.validFrom, lang)}</span>
              </span>
              <span>
                <strong>{t.audit.validTo}:</strong>{" "}
                <span className="font-mono">{formatDateTime(audit.ssl.validTo, lang)}</span>
              </span>
            </div>
            {audit.ssl.fingerprint256 && (
              <div className="space-y-0.5">
                <div>
                  <strong>{t.report.sha256Label}:</strong>
                </div>
                <div dir="ltr" className="ltr-data font-mono break-all text-start">
                  {audit.ssl.fingerprint256}
                </div>
              </div>
            )}
          </div>

          {audit.cookies && audit.cookies.total > 0 && (
            <div className="p-2.5 rounded border border-slate-200 bg-slate-50 space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between gap-2 font-semibold text-slate-800">
                <span>{t.report.cookiesSection}</span>
                <span>
                  {t.common.pass}:{" "}
                  <span className="inline-block ltr-data">{audit.cookies.secureCount}</span> /{" "}
                  {t.common.warn}:{" "}
                  <span className="inline-block ltr-data">{audit.cookies.insecureCount}</span>
                </span>
              </div>
              <div className="space-y-1">
                {audit.cookies.cookies.map((c, idx) => (
                  <div
                    key={`${c.name}-${idx}`}
                    className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-1"
                  >
                    <span className="font-mono font-semibold text-slate-900 inline-block ltr-data">
                      {c.name}
                    </span>
                    <span className={c.issues.length === 0 ? "text-emerald-700" : "text-amber-700"}>
                      {c.issues.length === 0
                        ? t.common.pass
                        : c.issues.map(cookieIssueLabel).join(" • ")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Section 2: Security Headers Matrix */}
      {audit && (
        <section className="space-y-2.5">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-300 pb-1.5">
            {t.report.headersSection}
          </h2>
          <table className="w-full border-collapse border border-slate-300 text-[11px]">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="border border-slate-300 p-2 text-start">{t.report.headerCol}</th>
                <th className="border border-slate-300 p-2 text-center">{t.common.status}</th>
                <th className="border border-slate-300 p-2 text-start">
                  {t.audit.headerValue} &amp; {t.audit.recommendedConfig}
                </th>
              </tr>
            </thead>
            <tbody>
              {audit.headers.map((h) => (
                <tr key={h.id} className="print-avoid-break">
                  <td className="border border-slate-300 p-2 font-mono font-bold text-slate-900 align-top">
                    <span className="inline-block ltr-data">{h.name}</span>
                    <div className="text-[10px] font-normal text-slate-500 mt-0.5">
                      <span className="inline-block ltr-data">
                        {h.score}/{h.maxScore}
                      </span>{" "}
                      {t.report.ptsUnit}
                    </div>
                  </td>
                  <td className="border border-slate-300 p-2 text-center align-top font-bold">
                    <span
                      className={
                        h.status === "pass"
                          ? "text-emerald-700"
                          : h.status === "warn"
                            ? "text-amber-700"
                            : "text-rose-700"
                      }
                    >
                      {h.status === "pass"
                        ? t.common.pass
                        : h.status === "warn"
                          ? t.common.warn
                          : t.common.fail}
                    </span>
                  </td>
                  <td className="border border-slate-300 p-2 align-top space-y-1">
                    <div className="font-mono text-[10px] break-all text-slate-800 ltr-data">
                      {h.value ?? t.audit.notPresent}
                    </div>
                    <div className="text-slate-600">{headerText(h.issueKey)}</div>
                    {h.status !== "pass" && (
                      <div className="mt-1 p-1.5 rounded bg-slate-100 text-[10px] text-slate-900">
                        <span className="font-semibold text-slate-700">{t.report.fixPrefix}:</span>
                        <div className="font-mono text-[10px] text-emerald-700 ltr-data mt-0.5 whitespace-pre-wrap break-words">
                          {h.fixSnippet}
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Section 3: DNS & Latency (if scanned for this target) */}
      {matchingDns && (
        <section className="space-y-2.5 print-avoid-break">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-300 pb-1.5">
            {t.report.dnsSection}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
            <div className="p-2 rounded border border-slate-200">
              <div className="text-[10px] text-slate-500">{t.report.avgDns}</div>
              <div className="font-mono font-bold text-slate-900">
                <span className="inline-block ltr-data">
                  {formatMetricMs(matchingDns.stats.dns.avg)}
                </span>
              </div>
            </div>
            <div className="p-2 rounded border border-slate-200">
              <div className="text-[10px] text-slate-500">{t.report.avgTcp}</div>
              <div className="font-mono font-bold text-slate-900">
                <span className="inline-block ltr-data">
                  {formatMetricMs(matchingDns.stats.tcp.avg)}
                </span>
              </div>
            </div>
            <div className="p-2 rounded border border-slate-200">
              <div className="text-[10px] text-slate-500">{t.report.avgTls}</div>
              <div className="font-mono font-bold text-slate-900">
                <span className="inline-block ltr-data">
                  {formatMetricMs(matchingDns.stats.tls.avg)}
                </span>
              </div>
            </div>
            <div className="p-2 rounded border border-slate-200">
              <div className="text-[10px] text-slate-500">{t.report.avgTtfb}</div>
              <div className="font-mono font-bold text-slate-900">
                <span className="inline-block ltr-data">
                  {formatMetricMs(matchingDns.stats.ttfb.avg)}
                </span>
              </div>
            </div>
            <div className="p-2 rounded border border-slate-200">
              <div className="text-[10px] text-slate-500">{t.report.jitter}</div>
              <div className="font-mono font-bold text-slate-900">
                <span className="inline-block ltr-data">
                  {formatMetricMs(matchingDns.stats.ttfb.jitter, "±")}
                </span>
              </div>
            </div>
          </div>
          <div className="text-[11px] font-mono bg-slate-50 p-2.5 rounded border border-slate-200 ltr-data space-y-1">
            {matchingDns.records.A.length > 0 && (
              <div>
                <strong>A:</strong> {matchingDns.records.A.map((r) => r.address).join(", ")}
              </div>
            )}
            {matchingDns.records.NS.length > 0 && (
              <div>
                <strong>NS:</strong> {matchingDns.records.NS.join(", ")}
              </div>
            )}
            {matchingDns.records.MX.length > 0 && (
              <div>
                <strong>MX:</strong>{" "}
                {matchingDns.records.MX.map((m) => `${m.exchange} (${m.priority})`).join(", ")}
              </div>
            )}
            {matchingDns.domainSecurity && (
              <div className="pt-1 border-t border-slate-200 flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  <strong>SPF:</strong>{" "}
                  {matchingDns.domainSecurity.spf.present
                    ? matchingDns.domainSecurity.spf.policy ?? "present"
                    : "missing"}
                </span>
                <span>
                  <strong>DMARC:</strong>{" "}
                  {matchingDns.domainSecurity.dmarc.present
                    ? `p=${matchingDns.domainSecurity.dmarc.policy ?? "configured"}`
                    : "missing"}
                </span>
                <span>
                  <strong>CAA:</strong>{" "}
                  {matchingDns.domainSecurity.caa.present
                    ? matchingDns.domainSecurity.caa.issuers.join(", ")
                    : "unrestricted"}
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Section 4: TCP Port Exposure (if scanned for this target) */}
      {matchingPorts && (
        <section className="space-y-2.5 print-avoid-break">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-300 pb-1.5">
            {t.report.portsSection}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
            {matchingPorts.ports.map((p) => (
              <div
                key={p.port}
                className="p-2 rounded border border-slate-200 flex flex-col gap-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono inline-block ltr-data">
                    <strong>:{p.port}</strong> {p.service}
                  </span>
                  <span
                    className={
                      p.status === "open"
                        ? "text-emerald-700 font-bold"
                        : p.status === "filtered"
                          ? "text-amber-700 font-semibold"
                          : p.status === "error"
                            ? "text-rose-700 font-semibold"
                            : "text-slate-500"
                    }
                  >
                    {portStatusLabel(p.status)}{" "}
                    <span className="font-mono inline-block ltr-data">
                      ({p.latencyMs !== null ? `${p.latencyMs}ms` : "—"})
                    </span>
                  </span>
                </div>
                {p.banner && (
                  <div className="text-[10px] font-mono text-slate-600 break-all ltr-data">
                    {p.banner}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Footer Disclaimer */}
      <div className="pt-4 border-t border-slate-300 text-[10px] text-slate-500 flex items-center justify-between gap-4">
        <span>{t.report.footerDisclaimer}</span>
        <span className="font-mono shrink-0 ltr-data">NetPulse v1.1.0</span>
      </div>
    </div>
  );
}

export function PrintableReport({
  t,
  lang,
  isOpen,
  onClose,
  audit,
  dns,
  ports,
  onExportJson,
}: PrintableReportProps) {
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);
  const pdfNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pdfNoticeTimerRef.current) {
        clearTimeout(pdfNoticeTimerRef.current);
        pdfNoticeTimerRef.current = null;
      }
    };
  }, []);

  const handlePrint = async () => {
    if (typeof document !== "undefined" && document.fonts?.ready) {
      await document.fonts.ready;
    }

    if (typeof window !== "undefined" && window.netpulseElectron?.exportPdf) {
      const host = audit?.hostname || dns?.hostname || ports?.hostname || "target";
      const res = await window.netpulseElectron.exportPdf(`netpulse-report-${host}.pdf`);
      if (res.saved) {
        setPdfNotice(`${t.report.pdfSaved}: ${res.filePath ?? ""}`);
        if (pdfNoticeTimerRef.current) {
          clearTimeout(pdfNoticeTimerRef.current);
        }
        pdfNoticeTimerRef.current = setTimeout(() => {
          setPdfNotice(null);
          pdfNoticeTimerRef.current = null;
        }, 4000);
      }
      return;
    }
    window.print();
  };

  return (
    <>
      {/* Dedicated Print-Only Layer (Visible ONLY during @media print / PDF export) */}
      <div className="hidden print-only-report">
        <ReportDocumentBody t={t} lang={lang} audit={audit} dns={dns} ports={ports} />
      </div>

      {/* Interactive Report Preview Modal (Hidden during @media print) */}
      {isOpen && (
        <div
          dir="ltr"
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 sm:p-6"
        >
          <div className="w-full max-w-4xl max-h-[90vh] rounded-2xl bg-canvas-elevated border border-stroke-strong shadow-2xl flex flex-col overflow-hidden">
            {/* Modal Toolbar */}
            <div
              dir="ltr"
              className="px-5 py-3.5 border-b border-stroke bg-canvas-subtle flex flex-wrap items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-500" />
                <span
                  dir={lang === "ar" ? "rtl" : "ltr"}
                  className="text-sm font-bold text-ink"
                >
                  {t.report.previewTitle}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onExportJson}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-canvas hover:bg-stroke text-ink border border-stroke transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  {t.controls.exportJson}
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  {t.controls.printPdf}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-lg bg-canvas hover:bg-rose-500/15 text-ink-secondary hover:text-rose-500 border border-stroke transition-colors"
                  title={t.report.closePreview}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {pdfNotice && (
              <div className="px-5 py-2 bg-emerald-500/15 text-emerald-500 text-xs flex items-center gap-2 border-b border-emerald-500/25">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="truncate">{pdfNotice}</span>
              </div>
            )}

            {/* Paper Preview Canvas */}
            <div className="flex-1 overflow-y-auto bg-slate-900/40 p-4 sm:p-6">
              {!audit && !dns && !ports ? (
                <div className="p-10 text-center text-xs text-ink-secondary bg-canvas-elevated rounded-xl border border-stroke">
                  {t.report.noAuditWarning}
                </div>
              ) : (
                <div className="rounded-lg overflow-hidden shadow-xl border border-slate-300">
                  <ReportDocumentBody
                    t={t}
                    lang={lang}
                    audit={audit}
                    dns={dns}
                    ports={ports}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
