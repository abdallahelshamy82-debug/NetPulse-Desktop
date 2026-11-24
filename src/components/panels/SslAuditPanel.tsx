"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Lock,
  Unlock,
  Globe,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Check,
  FileText,
  Download,
  RefreshCw,
  ArrowRight,
  KeyRound,
  Server,
  Layers,
  Cloud,
  Monitor,
} from "lucide-react";
import type { AuditResult, CookieIssueCode, SecurityHeaderCheck } from "@/types/telemetry";
import type { Dictionary, Locale } from "@/lib/i18n";
import { formatDateTime } from "@/lib/cn";
import { ScoreGauge, getGradePalette } from "@/components/charts/ScoreGauge";

interface SslAuditPanelProps {
  t: Dictionary;
  lang: Locale;
  target: string;
  onTargetChange: (val: string) => void;
  result: AuditResult | null;
  loading: boolean;
  error: string | null;
  onRunAudit: (targetOverride?: string) => void;
  onOpenReport: () => void;
  onExportJson: () => void;
}

const QUICK_DOMAINS = ["magixa.tech", "github.com", "cloudflare.com", "google.com"];

export function SslAuditPanel({
  t,
  lang,
  target,
  onTargetChange,
  result,
  loading,
  error,
  onRunAudit,
  onOpenReport,
  onExportJson,
}: SslAuditPanelProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const isAr = lang === "ar";
  const proseDir = isAr ? "rtl" : "ltr";

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1600);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onRunAudit();
  };

  const headerIssueText = (key: string): string => {
    const map = t.headerIssues as Record<string, string>;
    return map[key] ?? key;
  };

  const cookieIssueLabel = (code: CookieIssueCode): string => {
    if (code === "missing_secure") return t.audit.cookieMissingSecure;
    if (code === "missing_httponly") return t.audit.cookieMissingHttpOnly;
    return t.audit.cookieWeakSameSite;
  };

  const renderStatusBadge = (status: SecurityHeaderCheck["status"]) => {
    if (status === "pass") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
          <CheckCircle2 className="w-3 h-3" />
          {t.common.pass}
        </span>
      );
    }
    if (status === "warn") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25">
          <AlertTriangle className="w-3 h-3" />
          {t.common.warn}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/25">
        <XCircle className="w-3 h-3" />
        {t.common.fail}
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header + Target Bar */}
      <div className="rounded-xl bg-canvas-elevated border border-stroke p-5 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-500">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h1 dir={proseDir} className="text-lg font-bold tracking-tight text-ink">
                  {t.audit.title}
                </h1>
                <p dir={proseDir} className="text-xs text-ink-secondary mt-0.5">
                  {t.audit.subtitle}
                </p>
              </div>
            </div>
          </div>

          {result && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onExportJson}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-canvas-subtle hover:bg-stroke/60 text-ink border border-stroke transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-ink-secondary" />
                <span dir={proseDir}>{t.controls.exportJson}</span>
              </button>
              <button
                type="button"
                onClick={onOpenReport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-glowCyan transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                {t.controls.exportReport}
              </button>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Globe className="w-4 h-4 text-ink-muted absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none" />
            <input
              type="text"
              value={target}
              onChange={(e) => onTargetChange(e.target.value)}
              placeholder={t.common.targetPlaceholder}
              className="w-full h-11 ps-10 pe-4 rounded-lg bg-canvas border border-stroke focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 outline-none text-sm font-mono text-ink placeholder:font-sans placeholder:text-ink-muted ltr-data transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !target.trim()}
            className="h-11 px-5 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-semibold text-sm inline-flex items-center justify-center gap-2 shadow-glowCyan transition-all shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? t.common.scanning : t.audit.cta}
          </button>
        </form>

        {/* Quick Targets */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span dir={proseDir} className="text-[11px] font-medium text-ink-muted">
            {t.common.quickTargets}
            {isAr ? "" : ":"}
          </span>
          {QUICK_DOMAINS.map((domain) => (
            <button
              key={domain}
              type="button"
              disabled={loading}
              onClick={() => {
                onTargetChange(domain);
                onRunAudit(domain);
              }}
              className="px-2.5 py-0.5 rounded-md text-xs font-mono ltr-data bg-canvas-subtle hover:bg-cyan-500/15 hover:text-cyan-500 hover:border-cyan-500/30 border border-stroke text-ink-secondary transition-colors"
            >
              {domain}
            </button>
          ))}
        </div>

        {/* Live Scan Progress Bar */}
        {loading && (
          <div className="mt-4 h-1.5 w-full rounded-full bg-canvas-subtle overflow-hidden">
            <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-cyan-400 animate-scan-line" />
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-500 dark:text-rose-400 text-xs flex items-center gap-2">
            <ShieldX className="w-4 h-4 shrink-0" />
            <span dir={proseDir} className={isAr ? "text-right flex-1" : "flex-1"}>
              <strong>{t.common.errorPrefix}:</strong> {error}
            </span>
          </div>
        )}
      </div>

      {/* Empty State */}
      {!result && !loading && (
        <div className="rounded-xl bg-canvas-elevated border border-dashed border-stroke-strong p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-500 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7" />
          </div>
          <h2 dir={proseDir} className="text-base font-semibold text-ink">
            {t.common.noDataYet}
          </h2>
          <p
            dir={proseDir}
            className="text-xs text-ink-secondary max-w-md mx-auto mt-1.5 leading-relaxed"
          >
            {t.audit.emptyHint}
          </p>
        </div>
      )}

      {/* Results View */}
      {result && (
        <motion.div
          key={result.scannedAt}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-5"
        >
          {/* Top Grid: Score Gauge + Live SSL Certificate Details */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            {/* Score Summary Card */}
            <div className="xl:col-span-4 rounded-xl bg-canvas-elevated border border-stroke p-5 shadow-panel flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-stroke">
                <div>
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-ink-muted">
                    {t.audit.overallScore}
                  </span>
                  <div className="text-sm font-mono font-bold text-ink ltr-data mt-0.5">
                    {result.hostname}
                  </div>
                </div>
                <span
                  dir={proseDir}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border ${getGradePalette(result.grade).bg} ${getGradePalette(result.grade).text} ${getGradePalette(result.grade).border}`}
                >
                  {t.audit.grade} <span className="inline-block ltr-data">{result.grade}</span>
                </span>
              </div>

              <div className="my-2">
                <ScoreGauge
                  score={result.score}
                  grade={result.grade}
                  label={t.audit.overallScore}
                />
                {result.grade === "F" &&
                  typeof result.rawScore === "number" &&
                  result.rawScore > result.score && (
                    <p
                      dir={proseDir}
                      className="text-[11px] text-rose-500 text-center mt-1 font-medium"
                    >
                      {t.audit.scoreCappedNote}
                    </p>
                  )}
              </div>

              {/* Sub-scores */}
              <div className="space-y-2.5 pt-2 border-t border-stroke">
                {[
                  {
                    label: t.audit.tlsHealth,
                    val: result.breakdown.tlsScore,
                    max: result.breakdown.tlsMax,
                    color: "bg-emerald-500",
                  },
                  {
                    label: t.audit.headersHealth,
                    val: result.breakdown.headersScore,
                    max: result.breakdown.headersMax,
                    color: "bg-cyan-500",
                  },
                  {
                    label: t.audit.transportHealth,
                    val: result.breakdown.transportScore,
                    max: result.breakdown.transportMax,
                    color: "bg-blue-500",
                  },
                ].map((bar) => (
                  <div key={bar.label}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span dir={proseDir} className="text-ink-secondary font-medium">
                        {bar.label}
                      </span>
                      <span className="font-mono text-ink font-semibold ltr-data">
                        {bar.val} / {bar.max}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-canvas-subtle overflow-hidden">
                      <div
                        className={`h-full rounded-full ${bar.color} transition-all duration-500`}
                        style={{ width: `${Math.round((bar.val / bar.max) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}

                {/* Pass/Warn/Fail pills */}
                <div className="grid grid-cols-3 gap-2 pt-2">
                  <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2 py-1.5 text-center">
                    <div className="text-sm font-mono font-bold text-emerald-500">
                      {result.issuesCount.pass}
                    </div>
                    <div className="text-[10px] text-ink-muted">{t.audit.passedCount}</div>
                  </div>
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-2 py-1.5 text-center">
                    <div className="text-sm font-mono font-bold text-amber-500">
                      {result.issuesCount.warn}
                    </div>
                    <div className="text-[10px] text-ink-muted">{t.audit.warningsCount}</div>
                  </div>
                  <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-2 py-1.5 text-center">
                    <div className="text-sm font-mono font-bold text-rose-500">
                      {result.issuesCount.fail}
                    </div>
                    <div className="text-[10px] text-ink-muted">{t.audit.missingCount}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Live SSL Certificate Telemetry Card */}
            <div className="xl:col-span-8 rounded-xl bg-canvas-elevated border border-stroke p-5 shadow-panel flex flex-col justify-between gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-stroke">
                <div className="flex items-center gap-2">
                  {result.ssl.authorized &&
                  !result.ssl.isExpired &&
                  !result.ssl.isNotYetValid &&
                  !result.ssl.chainHasExpiredCert ? (
                    <Lock className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Unlock className="w-4 h-4 text-rose-500" />
                  )}
                  <h2 dir={proseDir} className="text-sm font-bold text-ink">
                    {t.audit.certDetails}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {result.probeVantage && (
                    <span
                      dir={proseDir}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                        result.probeVantage.mode === "cloud"
                          ? "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/25"
                          : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25"
                      }`}
                    >
                      {result.probeVantage.mode === "cloud" ? (
                        <Cloud className="w-3 h-3 shrink-0" />
                      ) : (
                        <Monitor className="w-3 h-3 shrink-0" />
                      )}
                      <span>
                        {result.probeVantage.mode === "cloud"
                          ? `${t.common.vantageCloud}${
                              result.probeVantage.region ? ` (${result.probeVantage.region})` : ""
                            }`
                          : t.common.vantageLocal}
                      </span>
                    </span>
                  )}
                  {result.ssl.protocol && (
                    <span className="px-2.5 py-0.5 rounded-md text-xs font-mono font-semibold bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/25 ltr-data">
                      {result.ssl.protocol}
                      {result.ssl.alpnProtocol === "h2" ? " • HTTP/2" : ""}
                    </span>
                  )}
                  <span
                    className={`px-2.5 py-0.5 rounded-md text-xs font-semibold border ${
                      result.ssl.authorized &&
                      !result.ssl.isExpired &&
                      !result.ssl.isNotYetValid &&
                      !result.ssl.chainHasExpiredCert
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25"
                        : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/25"
                    }`}
                  >
                    {result.ssl.isExpired || result.ssl.chainHasExpiredCert
                      ? t.audit.expired
                      : result.ssl.authorized && !result.ssl.isNotYetValid
                        ? t.audit.trusted
                        : t.audit.untrusted}
                  </span>
                </div>
              </div>

              {!result.ssl.available && (
                <div className="p-3 rounded-lg border text-xs bg-rose-500/10 border-rose-500/30 text-rose-500 dark:text-rose-400 flex items-center gap-2 font-semibold">
                  <Unlock className="w-4 h-4 shrink-0" />
                  <span dir={proseDir} className={isAr ? "text-right flex-1" : "flex-1"}>
                    {t.audit.httpOnlyBanner}
                  </span>
                </div>
              )}

              {(result.ssl.error ||
                result.ssl.authorizationError ||
                result.ssl.chainHasExpiredCert ||
                result.ssl.chainHasExpiringSoonCert) && (
                <div
                  className={`p-3 rounded-lg border text-xs space-y-1 ${
                    !result.ssl.authorized ||
                    result.ssl.isExpired ||
                    result.ssl.isNotYetValid ||
                    result.ssl.chainHasExpiredCert ||
                    result.ssl.error
                      ? "bg-rose-500/10 border-rose-500/30 text-rose-500 dark:text-rose-400"
                      : "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {result.ssl.error && (
                    <div className="flex items-center gap-2 font-mono ltr-data">
                      <ShieldX className="w-4 h-4 shrink-0" />
                      <span>{result.ssl.error}</span>
                    </div>
                  )}
                  {result.ssl.authorizationError && (
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span dir={proseDir} className={isAr ? "text-right flex-1" : "flex-1"}>
                        <strong>{t.audit.authErrorLabel}:</strong>{" "}
                        <span className="font-mono ltr-data">{result.ssl.authorizationError}</span>
                      </span>
                    </div>
                  )}
                  {(result.ssl.chainHasExpiredCert || result.ssl.chainHasExpiringSoonCert) && (
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span dir={proseDir} className={isAr ? "text-right flex-1" : "flex-1"}>
                        {t.audit.chainWarning}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Certificate Metadata Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-canvas-subtle border border-stroke">
                  <div dir={proseDir} className={`text-[11px] text-ink-muted ${isAr ? "text-right" : ""}`}>
                    {t.audit.issuer}
                  </div>
                  <div className="text-xs font-semibold text-ink mt-1 truncate">
                    {result.ssl.issuer.O || result.ssl.issuer.CN || (result.ssl.available ? t.common.unknown : "—")}
                  </div>
                  {result.ssl.issuer.CN && (
                    <div className="text-[11px] font-mono text-ink-secondary truncate mt-0.5 ltr-data">
                      CN: {result.ssl.issuer.CN}
                    </div>
                  )}
                </div>

                <div className="p-3 rounded-lg bg-canvas-subtle border border-stroke">
                  <div dir={proseDir} className={`text-[11px] text-ink-muted ${isAr ? "text-right" : ""}`}>
                    {t.audit.subject}
                  </div>
                  <div className="text-xs font-mono font-semibold text-ink mt-1 truncate ltr-data">
                    {result.ssl.subject.CN || "—"}
                  </div>
                  <div className="text-[11px] font-mono text-ink-secondary mt-0.5 ltr-data">
                    IP: {result.resolvedIp ?? "—"}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-canvas-subtle border border-stroke">
                  <div dir={proseDir} className={`text-[11px] text-ink-muted ${isAr ? "text-right" : ""}`}>
                    {t.audit.daysRemaining}
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span
                      dir="ltr"
                      className={`text-lg font-mono font-bold inline-block ltr-data ${
                        result.ssl.daysRemaining === null || result.ssl.daysRemaining < 14
                          ? "text-rose-500"
                          : result.ssl.daysRemaining < 30
                            ? "text-amber-500"
                            : "text-emerald-500"
                      }`}
                    >
                      {result.ssl.daysRemaining !== null ? result.ssl.daysRemaining : "—"}
                    </span>
                    {result.ssl.daysRemaining !== null && (
                      <span dir={proseDir} className="text-xs text-ink-secondary">
                        {t.common.days}
                      </span>
                    )}
                  </div>
                  <div
                    dir={proseDir}
                    className={`text-[11px] font-mono text-ink-muted mt-0.5 ${isAr ? "text-right" : ""}`}
                  >
                    {t.audit.handshakeTime}:{" "}
                    <span className="inline-block ltr-data">{result.ssl.handshakeMs} ms</span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-canvas-subtle border border-stroke">
                  <div dir={proseDir} className={`text-[11px] text-ink-muted ${isAr ? "text-right" : ""}`}>
                    {t.audit.validFrom}
                  </div>
                  <div dir={proseDir} className={`text-xs font-mono text-ink mt-1 leading-snug ${isAr ? "text-right" : ""}`}>
                    {formatDateTime(result.ssl.validFrom, lang)}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-canvas-subtle border border-stroke">
                  <div dir={proseDir} className={`text-[11px] text-ink-muted ${isAr ? "text-right" : ""}`}>
                    {t.audit.validTo}
                  </div>
                  <div dir={proseDir} className={`text-xs font-mono text-ink mt-1 leading-snug ${isAr ? "text-right" : ""}`}>
                    {formatDateTime(result.ssl.validTo, lang)}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-canvas-subtle border border-stroke">
                  <div dir={proseDir} className={`text-[11px] text-ink-muted ${isAr ? "text-right" : ""}`}>
                    {t.audit.cipher}
                  </div>
                  <div className="text-[11px] font-mono font-semibold text-cyan-600 dark:text-cyan-400 mt-1 break-all ltr-data">
                    {result.ssl.cipherName || "—"}
                  </div>
                  {result.ssl.keyBits && (
                    <div className="text-[11px] font-mono text-ink-muted mt-0.5 ltr-data">
                      {result.ssl.keyBits}-bit {result.ssl.asn1Curve ?? "Key"}
                    </div>
                  )}
                </div>
              </div>

              {/* Fingerprint & Serial */}
              {result.ssl.fingerprint256 && (
                <div className="p-3 rounded-lg bg-canvas border border-stroke flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
                      <KeyRound className="w-3.5 h-3.5 text-cyan-500" />
                      <span dir={proseDir}>{t.audit.fingerprint}</span>
                    </div>
                    <div className="text-[11px] font-mono text-ink-secondary truncate mt-1 ltr-data">
                      {result.ssl.fingerprint256}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy("fp", result.ssl.fingerprint256 ?? "")}
                    className="px-2.5 py-1 rounded-md text-[11px] bg-canvas-subtle hover:bg-stroke text-ink-secondary border border-stroke inline-flex items-center gap-1 shrink-0"
                  >
                    {copiedId === "fp" ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-500" />
                        {t.common.copied}
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        {t.common.copy}
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* SANs + Certificate Chain */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {result.ssl.subjectAltNames.length > 0 && (
                  <div className="p-3 rounded-lg bg-canvas-subtle border border-stroke">
                    <div dir={proseDir} className={`text-[11px] font-semibold text-ink-muted mb-2 ${isAr ? "text-right" : ""}`}>
                      {t.audit.sanTitle} (<span className="inline-block ltr-data">{result.ssl.subjectAltNames.length}</span>)
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto ltr-data">
                      {result.ssl.subjectAltNames.slice(0, 14).map((san) => (
                        <span
                          key={san}
                          className="px-2 py-0.5 rounded text-[11px] font-mono bg-canvas border border-stroke text-ink-secondary"
                        >
                          {san}
                        </span>
                      ))}
                      {result.ssl.subjectAltNames.length > 14 && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono text-cyan-500">
                          +{result.ssl.subjectAltNames.length - 14} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {result.ssl.chain.length > 0 && (
                  <div className="p-3 rounded-lg bg-canvas-subtle border border-stroke">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-muted mb-2">
                      <Layers className="w-3.5 h-3.5 text-cyan-500" />
                      <span dir={proseDir}>{t.audit.chainTitle}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 ltr-data">
                      {result.ssl.chain.map((link, idx) => (
                        <React.Fragment key={`${link.subjectCN}-${idx}`}>
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-mono bg-canvas border inline-flex items-center gap-1 ${
                              link.isExpired
                                ? "border-rose-500/40 text-rose-500"
                                : link.expiringSoon
                                  ? "border-amber-500/40 text-amber-500"
                                  : "border-stroke text-ink"
                            }`}
                          >
                            <span>{link.subjectCN}</span>
                            {link.isExpired && (
                              <span className="text-[9px] font-bold uppercase text-rose-500">
                                ({t.audit.expired})
                              </span>
                            )}
                            {!link.isExpired && link.expiringSoon && (
                              <span className="text-[9px] font-semibold text-amber-500">
                                ({link.daysRemaining}d)
                              </span>
                            )}
                          </span>
                          {idx < result.ssl.chain.length - 1 && (
                            <ArrowRight className="w-3 h-3 text-ink-muted shrink-0" />
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* HTTP Transport Metadata Bar */}
          <div className="rounded-xl bg-canvas-elevated border border-stroke p-4 shadow-panel">
            <div className="flex items-center gap-2 text-xs font-bold text-ink mb-3">
              <Server className="w-4 h-4 text-cyan-500" />
              <h2 dir={proseDir}>{t.audit.httpMetaTitle}</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="p-2.5 rounded-lg bg-canvas-subtle border border-stroke">
                <div dir={proseDir} className={`text-[10px] text-ink-muted ${isAr ? "text-right" : ""}`}>
                  {t.audit.httpStatus}
                </div>
                <div className="text-xs font-mono font-bold text-emerald-500 mt-0.5 ltr-data">
                  HTTP/{result.http.httpVersion} • {result.http.statusCode}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-canvas-subtle border border-stroke">
                <div dir={proseDir} className={`text-[10px] text-ink-muted ${isAr ? "text-right" : ""}`}>
                  {t.audit.responseTime}
                </div>
                <div className="text-xs font-mono font-bold text-ink mt-0.5 ltr-data">
                  {result.http.responseTimeMs} ms
                </div>
                {result.http.redirects.length > 0 &&
                  typeof result.http.totalChainMs === "number" &&
                  result.http.totalChainMs > result.http.responseTimeMs && (
                    <div className="text-[10px] font-mono text-ink-muted mt-0.5 ltr-data">
                      Chain: {result.http.totalChainMs} ms
                    </div>
                  )}
              </div>
              <div className="p-2.5 rounded-lg bg-canvas-subtle border border-stroke">
                <div dir={proseDir} className={`text-[10px] text-ink-muted ${isAr ? "text-right" : ""}`}>
                  {t.audit.httpsRedirect}
                </div>
                <div
                  dir={proseDir}
                  className={`text-xs font-semibold mt-0.5 ${isAr ? "text-right" : ""} ${
                    result.http.httpsRedirectEnforced === true
                      ? "text-emerald-500"
                      : result.http.httpsRedirectEnforced === false
                        ? "text-amber-500"
                        : "text-ink-muted"
                  }`}
                >
                  {result.http.httpsRedirectEnforced === true
                    ? t.audit.enforced
                    : result.http.httpsRedirectEnforced === false
                      ? t.audit.notEnforced
                      : t.audit.port80Unreachable}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-canvas-subtle border border-stroke">
                <div className="flex items-center justify-between gap-1.5">
                  <div dir={proseDir} className={`text-[10px] text-ink-muted ${isAr ? "text-right" : ""}`}>
                    {t.audit.serverBanner}
                  </div>
                  {result.http.techDisclosureWarning && (
                    <span
                      dir={proseDir}
                      className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25"
                    >
                      {t.audit.techDisclosureWarn}
                    </span>
                  )}
                </div>
                <div
                  dir={result.http.serverHeader ? "ltr" : proseDir}
                  className={`text-xs font-mono text-ink mt-0.5 break-words ${
                    result.http.serverHeader ? "ltr-data" : isAr ? "text-right" : ""
                  }`}
                >
                  {result.http.serverHeader || t.audit.hiddenBanner}
                </div>
                {result.http.poweredByHeader && (
                  <div className="text-[10px] font-mono text-amber-600 dark:text-amber-400 mt-0.5 break-all ltr-data">
                    X-Powered-By: {result.http.poweredByHeader}
                  </div>
                )}
              </div>
              <div className="p-2.5 rounded-lg bg-canvas-subtle border border-stroke">
                <div dir={proseDir} className={`text-[10px] text-ink-muted ${isAr ? "text-right" : ""}`}>
                  {t.audit.redirects}
                </div>
                <div className="text-xs font-mono text-ink mt-0.5 ltr-data">
                  {result.http.redirects.length}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-canvas-subtle border border-stroke">
                <div dir={proseDir} className={`text-[10px] text-ink-muted ${isAr ? "text-right" : ""}`}>
                  {t.common.scannedAt}
                </div>
                <div className="text-[11px] font-mono text-ink-secondary mt-0.5 flex items-start gap-1.5">
                  <Clock className="w-3 h-3 shrink-0 mt-0.5" />
                  <span dir={proseDir} className={`leading-snug break-words flex-1 ${isAr ? "text-right" : ""}`}>
                    {formatDateTime(result.scannedAt, lang)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Cookie Security Audit (Set-Cookie) */}
          <div className="rounded-xl bg-canvas-elevated border border-stroke p-4 shadow-panel">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-3 border-b border-stroke">
              <div className="flex items-center gap-2 text-xs font-bold text-ink">
                <ShieldAlert className="w-4 h-4 text-amber-500" />
                <h2 dir={proseDir}>{t.audit.cookiesTitle}</h2>
              </div>
              {result.cookies && result.cookies.total > 0 && (
                <div className="flex items-center gap-2 text-[11px] font-mono">
                  <span
                    dir={proseDir}
                    className="px-2 py-0.5 rounded inline-block bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25"
                  >
                    {t.common.pass}:{" "}
                    <span className="inline-block ltr-data">{result.cookies.secureCount}</span>
                  </span>
                  <span
                    dir={proseDir}
                    className={`px-2 py-0.5 rounded inline-block border ${
                      result.cookies.insecureCount > 0
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25"
                        : "bg-canvas-subtle text-ink-muted border-stroke"
                    }`}
                  >
                    {t.common.warn}:{" "}
                    <span className="inline-block ltr-data">{result.cookies.insecureCount}</span>
                  </span>
                </div>
              )}
            </div>

            {!result.cookies || result.cookies.total === 0 ? (
              <p
                dir={proseDir}
                className={`text-xs text-ink-secondary ${isAr ? "text-right" : ""}`}
              >
                {t.audit.cookiesNone}
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {result.cookies.cookies.map((cookie, idx) => (
                  <div
                    key={`${cookie.name}-${idx}`}
                    className="p-2.5 rounded-lg bg-canvas-subtle border border-stroke flex flex-wrap items-center justify-between gap-2"
                  >
                    <span className="font-mono text-xs font-semibold text-ink inline-block ltr-data">
                      {cookie.name}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {cookie.issues.length === 0 ? (
                        <span
                          dir={proseDir}
                          className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25"
                        >
                          {t.common.pass}
                        </span>
                      ) : (
                        cookie.issues.map((issue) => (
                          <span
                            key={issue}
                            dir={proseDir}
                            className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25"
                          >
                            {cookieIssueLabel(issue)}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Security Headers Compliance Matrix & Actionable Remediation */}
          <div className="rounded-xl bg-canvas-elevated border border-stroke p-5 shadow-panel">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-stroke">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-cyan-500" />
                <h2 dir={proseDir} className="text-sm font-bold text-ink">
                  {t.audit.headersMatrixTitle}
                </h2>
              </div>
              <span dir={proseDir} className="text-xs font-mono text-ink-muted">
                <span className="inline-block ltr-data">
                  {result.breakdown.headersScore} / {result.breakdown.headersMax}
                </span>{" "}
                {t.audit.ptsUnit}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
              {result.headers.map((header) => (
                <div
                  key={header.id}
                  className="rounded-xl bg-canvas-subtle/80 border border-stroke p-4 flex flex-col justify-between gap-3 hover:border-stroke-strong transition-colors"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="font-mono text-xs font-bold text-ink ltr-data">
                        {header.name}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] font-mono text-ink-muted ltr-data">
                          {header.score}/{header.maxScore}
                        </span>
                        {renderStatusBadge(header.status)}
                      </div>
                    </div>

                    <p
                      dir={proseDir}
                      className={`text-xs text-ink-secondary leading-relaxed ${isAr ? "text-right" : ""}`}
                    >
                      {headerIssueText(header.issueKey)}
                    </p>

                    {/* Observed Header Value */}
                    <div className="mt-2.5 p-2 rounded-lg bg-canvas border border-stroke">
                      <div
                        dir={proseDir}
                        className={`text-[10px] uppercase tracking-wide text-ink-muted mb-0.5 ${
                          isAr ? "text-right" : ""
                        }`}
                      >
                        {t.audit.headerValue}
                      </div>
                      <div
                        dir={header.value ? "ltr" : proseDir}
                        className={`text-[11px] font-mono break-all ${
                          header.value
                            ? "ltr-data text-left text-ink"
                            : `text-rose-500/80 italic ${isAr ? "text-right" : "text-left"}`
                        }`}
                      >
                        {header.value ?? t.audit.notPresent}
                      </div>
                    </div>
                  </div>

                  {/* Actionable Fix Snippet for non-passing headers */}
                  {header.status !== "pass" && (
                    <div className="rounded-lg bg-amber-500/5 border border-amber-500/25 p-2.5">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span
                          dir={proseDir}
                          className="text-[10px] font-semibold text-amber-600 dark:text-amber-400"
                        >
                          {t.audit.recommendedConfig}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(header.id, header.fixSnippet)}
                          className="text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-canvas border border-stroke text-ink-secondary hover:text-ink"
                        >
                          {copiedId === header.id ? (
                            <>
                              <Check className="w-2.5 h-2.5 text-emerald-500" />
                              {t.common.copied}
                            </>
                          ) : (
                            <>
                              <Copy className="w-2.5 h-2.5" />
                              {t.common.copy}
                            </>
                          )}
                        </button>
                      </div>
                      <p
                        dir={proseDir}
                        className={`text-[11px] text-ink-secondary mb-1.5 ${isAr ? "text-right" : ""}`}
                      >
                        {headerIssueText(header.recommendationKey)}
                      </p>
                      <code
                        dir="ltr"
                        className="block text-[11px] font-mono text-left text-cyan-600 dark:text-cyan-300 bg-canvas px-2 py-1.5 rounded border border-stroke whitespace-pre-wrap break-words overflow-x-auto ltr-data"
                      >
                        {header.fixSnippet}
                      </code>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
