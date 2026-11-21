"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Radar,
  Globe,
  RefreshCw,
  Activity,
  Zap,
  Timer,
  Signal,
  Copy,
  Check,
  Database,
  AlertCircle,
} from "lucide-react";
import type { DnsPingResult, DnsRecordTypeKey } from "@/types/telemetry";
import type { Dictionary, Locale } from "@/lib/i18n";
import { LatencyChart } from "@/components/charts/LatencyChart";

interface DnsRadarPanelProps {
  t: Dictionary;
  lang: Locale;
  target: string;
  onTargetChange: (val: string) => void;
  result: DnsPingResult | null;
  loading: boolean;
  error: string | null;
  pulsesCount: number;
  onPulsesCountChange: (n: number) => void;
  onRunDnsPing: (targetOverride?: string) => void;
}

type RecordTab = "ALL" | "A" | "AAAA" | "MX" | "TXT" | "NS" | "CNAME";
const RECORD_TABS: RecordTab[] = ["ALL", "A", "AAAA", "MX", "TXT", "NS", "CNAME"];
const QUICK_TARGETS = ["magixa.tech", "github.com", "cloudflare.com", "vercel.com"];

export function DnsRadarPanel({
  t,
  lang,
  target,
  onTargetChange,
  result,
  loading,
  error,
  pulsesCount,
  onPulsesCountChange,
  onRunDnsPing,
}: DnsRadarPanelProps) {
  const [activeTab, setActiveTab] = useState<RecordTab>("ALL");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const isAr = lang === "ar";
  const proseDir = isAr ? "rtl" : "ltr";

  const handleCopy = (key: string, value: string) => {
    navigator.clipboard?.writeText(value).catch(() => undefined);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1500);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onRunDnsPing();
  };

  const recordCount = (tab: RecordTab): number => {
    if (!result) return 0;
    const r = result.records;
    if (tab === "ALL") {
      return r.A.length + r.AAAA.length + r.MX.length + r.TXT.length + r.NS.length + r.CNAME.length;
    }
    return r[tab].length;
  };

  return (
    <div className="space-y-5">
      {/* Control Card */}
      <div className="rounded-xl bg-canvas-elevated border border-stroke p-5 shadow-panel">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
            <Radar className="w-5 h-5" />
          </div>
          <div>
            <h1 dir={proseDir} className="text-lg font-bold tracking-tight text-ink">
              {t.dns.title}
            </h1>
            <p dir={proseDir} className="text-xs text-ink-secondary mt-0.5">
              {t.dns.subtitle}
            </p>
          </div>
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

          <div className="flex items-center gap-2 shrink-0">
            <div className="h-11 px-3 rounded-lg bg-canvas border border-stroke flex items-center gap-2">
              <span dir={proseDir} className="text-xs text-ink-muted">
                {t.dns.pulsesLabel}
                {isAr ? "" : ":"}
              </span>
              <select
                value={pulsesCount}
                onChange={(e) => onPulsesCountChange(Number(e.target.value))}
                className="bg-transparent text-xs font-mono font-bold text-ink outline-none cursor-pointer"
              >
                {[4, 6, 8, 10].map((n) => (
                  <option key={n} value={n} className="bg-canvas-elevated text-ink">
                    {n}x
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={loading || !target.trim()}
              className="h-11 px-5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-semibold text-sm inline-flex items-center justify-center gap-2 shadow-glowEmerald transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              <span dir={proseDir}>{loading ? t.common.scanning : t.dns.cta}</span>
            </button>
          </div>
        </form>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span dir={proseDir} className="text-[11px] font-medium text-ink-muted">
            {t.common.quickTargets}
            {isAr ? "" : ":"}
          </span>
          {QUICK_TARGETS.map((domain) => (
            <button
              key={domain}
              type="button"
              disabled={loading}
              onClick={() => {
                onTargetChange(domain);
                onRunDnsPing(domain);
              }}
              className="px-2.5 py-0.5 rounded-md text-xs font-mono ltr-data bg-canvas-subtle hover:bg-emerald-500/15 hover:text-emerald-500 hover:border-emerald-500/30 border border-stroke text-ink-secondary transition-colors"
            >
              {domain}
            </button>
          ))}
        </div>

        {loading && (
          <div className="mt-4 h-1.5 w-full rounded-full bg-canvas-subtle overflow-hidden">
            <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400 animate-scan-line" />
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-500 dark:text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span dir={proseDir} className={isAr ? "text-right flex-1" : "flex-1"}>
              <strong>{t.common.errorPrefix}:</strong> {error}
            </span>
          </div>
        )}
      </div>

      {/* Empty State */}
      {!result && !loading && (
        <div className="rounded-xl bg-canvas-elevated border border-dashed border-stroke-strong p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto mb-4">
            <Radar className="w-7 h-7" />
          </div>
          <h2 dir={proseDir} className="text-base font-semibold text-ink">
            {t.common.noDataYet}
          </h2>
          <p
            dir={proseDir}
            className={`text-xs text-ink-secondary max-w-md mx-auto mt-1.5 leading-relaxed ${
              isAr ? "text-right" : ""
            }`}
          >
            {t.dns.emptyHint}
          </p>
        </div>
      )}

      {/* Results */}
      {result && (
        <motion.div
          key={result.scannedAt}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-5"
        >
          {/* KPI Metrics Strip */}
          {result.timedOut && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span dir={proseDir} className={isAr ? "text-right flex-1" : "flex-1"}>
                {t.dns.partialBudgetNote}
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="rounded-xl bg-canvas-elevated border border-stroke p-4 shadow-panel">
              <div className="flex items-center justify-between gap-1.5 text-xs text-ink-muted mb-2">
                <span dir={proseDir}>{t.dns.dnsLookup}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {result.stats.dns.avg !== null && result.stats.dns.avg < 2 && (
                    <span
                      dir={proseDir}
                      title={t.dns.osCacheTooltip}
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 shrink-0"
                    >
                      {t.dns.osCacheBadge}
                    </span>
                  )}
                  <Zap className="w-4 h-4 text-amber-500" />
                </div>
              </div>
              <div className="text-2xl font-mono font-bold text-amber-500 ltr-data whitespace-nowrap">
                {result.stats.dns.avg !== null ? (
                  <>
                    {result.stats.dns.avg} <span className="text-xs font-normal text-ink-muted">ms</span>
                  </>
                ) : (
                  "—"
                )}
              </div>
              <div
                dir={proseDir}
                className={`mt-1.5 text-[11px] font-mono text-ink-secondary ${isAr ? "text-right" : ""}`}
              >
                {t.dns.min}:{" "}
                <span className="inline-block ltr-data">{result.stats.dns.min ?? "—"}</span> •{" "}
                {t.dns.max}:{" "}
                <span className="inline-block ltr-data">{result.stats.dns.max ?? "—"}</span>
              </div>
            </div>

            <div className="rounded-xl bg-canvas-elevated border border-stroke p-4 shadow-panel">
              <div className="flex items-center justify-between text-xs text-ink-muted mb-2">
                <span dir={proseDir}>{t.dns.tcpConnect}</span>
                <Signal className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-mono font-bold text-emerald-500 ltr-data whitespace-nowrap">
                {result.stats.tcp.avg !== null ? (
                  <>
                    {result.stats.tcp.avg} <span className="text-xs font-normal text-ink-muted">ms</span>
                  </>
                ) : (
                  "—"
                )}
              </div>
              <div
                dir={proseDir}
                className={`mt-1.5 text-[11px] font-mono text-ink-secondary ${isAr ? "text-right" : ""}`}
              >
                {t.dns.min}:{" "}
                <span className="inline-block ltr-data">{result.stats.tcp.min ?? "—"}</span> •{" "}
                {t.dns.max}:{" "}
                <span className="inline-block ltr-data">{result.stats.tcp.max ?? "—"}</span>
              </div>
            </div>

            <div className="rounded-xl bg-canvas-elevated border border-stroke p-4 shadow-panel">
              <div className="flex items-center justify-between text-xs text-ink-muted mb-2">
                <span dir={proseDir}>{t.dns.tlsHandshake}</span>
                <Signal className="w-4 h-4 text-violet-400" />
              </div>
              <div className="text-2xl font-mono font-bold text-violet-400 ltr-data whitespace-nowrap">
                {result.stats.tls.avg !== null ? (
                  <>
                    {result.stats.tls.avg} <span className="text-xs font-normal text-ink-muted">ms</span>
                  </>
                ) : (
                  "—"
                )}
              </div>
              <div
                dir={proseDir}
                className={`mt-1.5 text-[11px] font-mono text-ink-secondary ${isAr ? "text-right" : ""}`}
              >
                {t.dns.min}:{" "}
                <span className="inline-block ltr-data">{result.stats.tls.min ?? "—"}</span> •{" "}
                {t.dns.max}:{" "}
                <span className="inline-block ltr-data">{result.stats.tls.max ?? "—"}</span>
              </div>
            </div>

            <div className="rounded-xl bg-canvas-elevated border border-stroke p-4 shadow-panel">
              <div className="flex items-center justify-between text-xs text-ink-muted mb-2">
                <span dir={proseDir}>{t.dns.httpTtfb}</span>
                <Timer className="w-4 h-4 text-cyan-500" />
              </div>
              <div className="text-2xl font-mono font-bold text-cyan-500 ltr-data whitespace-nowrap">
                {result.stats.ttfb.avg !== null ? (
                  <>
                    {result.stats.ttfb.avg} <span className="text-xs font-normal text-ink-muted">ms</span>
                  </>
                ) : (
                  "—"
                )}
              </div>
              <div
                dir={proseDir}
                className={`mt-1.5 text-[11px] font-mono text-ink-secondary ${isAr ? "text-right" : ""}`}
              >
                {t.dns.min}:{" "}
                <span className="inline-block ltr-data">{result.stats.ttfb.min ?? "—"}</span> •{" "}
                {t.dns.max}:{" "}
                <span className="inline-block ltr-data">{result.stats.ttfb.max ?? "—"}</span>
              </div>
            </div>

            <div className="rounded-xl bg-canvas-elevated border border-stroke p-4 shadow-panel">
              <div className="flex items-center justify-between text-xs text-ink-muted mb-2">
                <span dir={proseDir}>{t.dns.jitter} / IP</span>
                <Activity className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-2xl font-mono font-bold text-ink ltr-data whitespace-nowrap">
                {result.stats.ttfb.jitter !== null ? (
                  <>
                    ±{result.stats.ttfb.jitter}{" "}
                    <span className="text-xs font-normal text-ink-muted">ms</span>
                  </>
                ) : (
                  "—"
                )}
              </div>
              <div
                dir={proseDir}
                className={`mt-1.5 text-[11px] font-mono text-ink-secondary flex flex-wrap items-center gap-x-1.5 gap-y-0.5 ${
                  isAr ? "justify-end text-right" : ""
                }`}
              >
                <span className="inline-block ltr-data">{result.resolvedIp ?? "—"}</span>
                <span>•</span>
                <span>
                  {t.dns.packetLoss}:{" "}
                  <span className="inline-block ltr-data">{result.stats.packetLossPercent}%</span>
                </span>
              </div>
            </div>
          </div>

          {/* Live Multi-Pulse Latency Chart */}
          <div className="rounded-xl bg-canvas-elevated border border-stroke p-5 shadow-panel">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-stroke">
              <h2 dir={proseDir} className="text-sm font-bold text-ink">
                {t.dns.latencyChartTitle}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {result.resolverSource === "public-fallback" && (
                  <span
                    dir={proseDir}
                    className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/25"
                  >
                    {t.dns.publicFallbackBadge}
                  </span>
                )}
                <span dir={proseDir} className="text-xs font-mono text-ink-muted">
                  {t.dns.queryDuration}:{" "}
                  <span className="inline-block ltr-data">{result.dnsTotalQueryMs} ms</span> •{" "}
                  <span className="inline-block ltr-data">{result.pulses.length}</span>{" "}
                  {t.dns.pulsesUnit}
                </span>
              </div>
            </div>

            <LatencyChart
              pulses={result.pulses}
              labels={{
                dns: t.dns.dnsLookup,
                tcp: t.dns.tcpConnect,
                tls: t.dns.tlsHandshake,
                ttfb: t.dns.httpTtfb,
                pulse: t.dns.pulseNum,
                ms: t.common.ms,
                hoverInspect: t.dns.hoverInspect,
              }}
            />
          </div>

          {/* DNS Zone Records & Per-Pulse Log */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            {/* DNS Records Panel */}
            <div className="xl:col-span-7 rounded-xl bg-canvas-elevated border border-stroke p-5 shadow-panel">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-stroke">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-cyan-500" />
                  <h2 dir={proseDir} className="text-sm font-bold text-ink">
                    {t.dns.recordsTitle}
                  </h2>
                </div>
                <span className="text-xs font-mono text-ink-muted ltr-data">{result.hostname}</span>
              </div>

              {/* Filter Tabs */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {RECORD_TABS.map((tab) => {
                  const count = recordCount(tab);
                  const active = activeTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={`px-2.5 py-1 rounded-md text-xs font-mono font-semibold border transition-colors ${
                        active
                          ? "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/40"
                          : "bg-canvas-subtle text-ink-secondary border-stroke hover:border-stroke-strong"
                      }`}
                    >
                      {tab} <span className="opacity-70">({count})</span>
                    </button>
                  );
                })}
              </div>

              {/* Records List */}
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pe-1">
                {(activeTab === "ALL" || activeTab === "A") &&
                  result.records.A.map((rec, i) => (
                    <RecordRow
                      key={`a-${i}`}
                      type="A"
                      badgeColor="bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30"
                      value={rec.address}
                      meta={rec.ttl ? `TTL ${rec.ttl}s` : undefined}
                      copied={copiedKey === `a-${i}`}
                      onCopy={() => handleCopy(`a-${i}`, rec.address)}
                    />
                  ))}

                {(activeTab === "ALL" || activeTab === "AAAA") &&
                  result.records.AAAA.map((rec, i) => (
                    <RecordRow
                      key={`aaaa-${i}`}
                      type="AAAA"
                      badgeColor="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30"
                      value={rec.address}
                      meta={rec.ttl ? `TTL ${rec.ttl}s` : undefined}
                      copied={copiedKey === `aaaa-${i}`}
                      onCopy={() => handleCopy(`aaaa-${i}`, rec.address)}
                    />
                  ))}

                {(activeTab === "ALL" || activeTab === "MX") &&
                  result.records.MX.map((rec, i) => (
                    <RecordRow
                      key={`mx-${i}`}
                      type="MX"
                      badgeColor="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                      value={rec.exchange}
                      meta={
                        <span dir={proseDir} className="inline-block">
                          {t.dns.priority}: <span className="inline-block ltr-data">{rec.priority}</span>
                        </span>
                      }
                      copied={copiedKey === `mx-${i}`}
                      onCopy={() => handleCopy(`mx-${i}`, rec.exchange)}
                    />
                  ))}

                {(activeTab === "ALL" || activeTab === "NS") &&
                  result.records.NS.map((ns, i) => (
                    <RecordRow
                      key={`ns-${i}`}
                      type="NS"
                      badgeColor="bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30"
                      value={ns}
                      copied={copiedKey === `ns-${i}`}
                      onCopy={() => handleCopy(`ns-${i}`, ns)}
                    />
                  ))}

                {(activeTab === "ALL" || activeTab === "CNAME") &&
                  result.records.CNAME.map((cn, i) => (
                    <RecordRow
                      key={`cname-${i}`}
                      type="CNAME"
                      badgeColor="bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30"
                      value={cn}
                      copied={copiedKey === `cname-${i}`}
                      onCopy={() => handleCopy(`cname-${i}`, cn)}
                    />
                  ))}

                {(activeTab === "ALL" || activeTab === "TXT") &&
                  result.records.TXT.map((txt, i) => (
                    <RecordRow
                      key={`txt-${i}`}
                      type="TXT"
                      badgeColor="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                      value={txt}
                      copied={copiedKey === `txt-${i}`}
                      onCopy={() => handleCopy(`txt-${i}`, txt)}
                    />
                  ))}

                {activeTab !== "ALL" && result.recordErrors?.[activeTab as DnsRecordTypeKey] ? (
                  <div className="p-4 text-center text-xs text-amber-600 dark:text-amber-400 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span dir={proseDir}>
                      {t.dns.recordQueryError} (
                      <span className="font-mono ltr-data">
                        {result.recordErrors[activeTab as DnsRecordTypeKey]}
                      </span>
                      )
                    </span>
                  </div>
                ) : (
                  recordCount(activeTab) === 0 && (
                    <div
                      dir={proseDir}
                      className="p-6 text-center text-xs text-ink-muted rounded-lg bg-canvas-subtle border border-dashed border-stroke"
                    >
                      {t.dns.noRecords}
                    </div>
                  )
                )}
              </div>

              {/* SOA Box */}
              {result.records.SOA && (
                <div className="mt-4 p-3 rounded-lg bg-canvas-subtle border border-stroke">
                  <div
                    dir={proseDir}
                    className={`text-[11px] font-bold text-ink-muted mb-1.5 ${isAr ? "text-right" : ""}`}
                  >
                    {t.dns.soaTitle}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono">
                    <div dir={proseDir} className={isAr ? "text-right" : ""}>
                      <span className="text-ink-muted">{t.dns.primaryNs}: </span>
                      <span className="text-ink inline-block ltr-data">
                        {result.records.SOA.nsname}
                      </span>
                    </div>
                    <div dir={proseDir} className={`truncate ${isAr ? "text-right" : ""}`}>
                      <span className="text-ink-muted">{t.dns.hostmaster}: </span>
                      <span className="text-ink inline-block ltr-data">
                        {result.records.SOA.hostmaster}
                      </span>
                    </div>
                    <div dir={proseDir} className={isAr ? "text-right" : ""}>
                      <span className="text-ink-muted">{t.dns.serial}: </span>
                      <span className="text-cyan-500 inline-block ltr-data">
                        {result.records.SOA.serial}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Per-Pulse Table */}
            <div className="xl:col-span-5 rounded-xl bg-canvas-elevated border border-stroke p-5 shadow-panel">
              <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-stroke">
                <h2 dir={proseDir} className="text-sm font-bold text-ink">
                  {t.dns.pulseTableTitle}
                </h2>
                <span dir={proseDir} className="text-[11px] font-mono text-ink-muted">
                  {t.dns.avg}:{" "}
                  <span className="inline-block ltr-data">
                    {result.stats.total.avg !== null ? `${result.stats.total.avg} ms` : "—"}
                  </span>
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-stroke text-ink-muted text-[11px]">
                      <th dir={proseDir} className="py-2 text-start font-medium">
                        {t.dns.pulseNum}
                      </th>
                      <th className="py-2 text-end font-medium">DNS</th>
                      <th className="py-2 text-end font-medium">TCP</th>
                      <th className="py-2 text-end font-medium">TLS</th>
                      <th className="py-2 text-end font-medium">TTFB</th>
                      <th dir={proseDir} className="py-2 text-end font-medium">
                        {t.dns.httpCode}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stroke font-mono ltr-data">
                    {result.pulses.map((p) => (
                      <tr
                        key={p.index}
                        title={p.error ?? undefined}
                        className="hover:bg-canvas-subtle/70 transition-colors"
                      >
                        <td className="py-2.5 text-ink-secondary font-semibold">#{p.index}</td>
                        <td className="py-2.5 text-end text-amber-500">
                          {p.dnsMs !== null ? `${p.dnsMs}ms` : "—"}
                        </td>
                        <td className="py-2.5 text-end text-emerald-500">
                          {p.tcpMs !== null ? `${p.tcpMs}ms` : "—"}
                        </td>
                        <td className="py-2.5 text-end text-violet-400">
                          {p.tlsMs !== null ? `${p.tlsMs}ms` : "—"}
                        </td>
                        <td className="py-2.5 text-end text-cyan-500 font-semibold">
                          {p.ttfbMs !== null ? `${p.ttfbMs}ms` : "—"}
                        </td>
                        <td className="py-2.5 text-end">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              p.ok
                                ? "bg-emerald-500/15 text-emerald-500"
                                : "bg-rose-500/15 text-rose-500"
                            }`}
                          >
                            {p.statusCode ?? "ERR"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function RecordRow({
  type,
  badgeColor,
  value,
  meta,
  copied,
  onCopy,
}: {
  type: string;
  badgeColor: string;
  value: string;
  meta?: React.ReactNode;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="p-2.5 rounded-lg bg-canvas-subtle/80 border border-stroke flex items-start justify-between gap-2.5 hover:border-stroke-strong transition-colors">
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border shrink-0 mt-0.5 ${badgeColor}`}
        >
          {type}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-mono text-ink break-all ltr-data">{value}</div>
          {meta && <div className="text-[10px] font-mono text-ink-muted mt-0.5">{meta}</div>}
        </div>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="p-1.5 rounded-md bg-canvas hover:bg-stroke border border-stroke text-ink-muted hover:text-ink shrink-0 transition-colors"
        title={value}
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}
