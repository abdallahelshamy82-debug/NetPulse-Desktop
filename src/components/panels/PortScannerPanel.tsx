"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Network,
  Globe,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldAlert,
  AlertCircle,
  AlertTriangle,
  Cloud,
  Monitor,
} from "lucide-react";
import type { PortScanResult, PortScanTimeoutMode, PortStatus } from "@/types/telemetry";
import type { Dictionary, Locale } from "@/lib/i18n";

interface PortScannerPanelProps {
  t: Dictionary;
  lang: Locale;
  target: string;
  onTargetChange: (val: string) => void;
  result: PortScanResult | null;
  loading: boolean;
  error: string | null;
  isElectron: boolean;
  cloudMode?: boolean;
  timeoutMode: PortScanTimeoutMode;
  onTimeoutModeChange: (mode: PortScanTimeoutMode) => void;
  onRunPortScan: (
    targetOverride?: string,
    portsOverride?: number[],
    timeoutOverride?: PortScanTimeoutMode
  ) => void;
}

const PRESETS = {
  standard: [21, 22, 80, 443, 3000, 3306, 5432, 6379, 8080],
  web: [80, 443, 3000, 8080, 8443],
  database: [1433, 3306, 5432, 6379, 27017],
};

function parseCustomPorts(raw: string): {
  ports: number[];
  invalidTokens: string[];
} {
  const tokens = raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const valid: number[] = [];
  const invalidTokens: string[] = [];

  for (const token of tokens) {
    const num = Number(token);
    if (Number.isInteger(num) && num >= 1 && num <= 65535) {
      if (!valid.includes(num)) {
        valid.push(num);
      }
    } else {
      invalidTokens.push(token);
    }
  }

  return { ports: valid, invalidTokens };
}

export function PortScannerPanel({
  t,
  lang,
  target,
  onTargetChange,
  result,
  loading,
  error,
  isElectron,
  cloudMode = false,
  timeoutMode,
  onTimeoutModeChange,
  onRunPortScan,
}: PortScannerPanelProps) {
  const [portsInput, setPortsInput] = useState(PRESETS.standard.join(", "));
  const [portsError, setPortsError] = useState<string | null>(null);
  const [portsWarning, setPortsWarning] = useState<string | null>(null);
  const isAr = lang === "ar";
  const proseDir = isAr ? "rtl" : "ltr";

  const quickHosts =
    isElectron && !cloudMode
      ? ["magixa.tech", "github.com", "127.0.0.1"]
      : ["magixa.tech", "github.com"];

  const executeWithValidatedPorts = (hostOverride?: string) => {
    const { ports, invalidTokens } = parseCustomPorts(portsInput);
    if (ports.length === 0) {
      setPortsError(t.ports.noValidPortsError);
      setPortsWarning(null);
      return;
    }

    setPortsError(null);
    if (invalidTokens.length > 0) {
      setPortsWarning(`${t.ports.invalidPortsWarning}: ${invalidTokens.join(", ")}`);
    } else {
      setPortsWarning(null);
    }

    onRunPortScan(hostOverride, ports, timeoutMode);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeWithValidatedPorts();
  };

  const applyPreset = (ports: number[]) => {
    setPortsInput(ports.join(", "));
    setPortsError(null);
    setPortsWarning(null);
  };

  const portNote = (key: string): string => {
    const notes = t.portNotes as Record<string, string>;
    return notes[key] ?? "";
  };

  const renderPortBadge = (status: PortStatus, errorCode?: string | null) => {
    if (status === "open") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          {t.common.open}
        </span>
      );
    }
    if (status === "closed") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-500/15 text-ink-secondary border border-stroke">
          <XCircle className="w-3 h-3" />
          {t.common.closed}
        </span>
      );
    }
    if (status === "error") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-500 border border-rose-500/30">
          <AlertCircle className="w-3 h-3" />
          {t.common.errorStatus}
          {errorCode ? ` (${errorCode})` : ""}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
        <Clock className="w-3 h-3" />
        {t.common.filtered}
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* Control Panel */}
      <div className="rounded-xl bg-canvas-elevated border border-stroke p-5 shadow-panel">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-500">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <h1 dir={proseDir} className="text-lg font-bold tracking-tight text-ink">
              {t.ports.title}
            </h1>
            <p dir={proseDir} className="text-xs text-ink-secondary mt-0.5">
              {t.ports.subtitle}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Globe className="w-4 h-4 text-ink-muted absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none" />
              <input
                type="text"
                value={target}
                onChange={(e) => onTargetChange(e.target.value)}
                placeholder={t.common.hostPlaceholder}
                className="w-full h-11 ps-10 pe-4 rounded-lg bg-canvas border border-stroke focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 outline-none text-sm font-mono text-ink placeholder:font-sans placeholder:text-ink-muted ltr-data transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !target.trim()}
              className="h-11 px-5 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-semibold text-sm inline-flex items-center justify-center gap-2 shadow-glowCyan transition-all shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? t.common.scanning : t.ports.cta}
            </button>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
            <input
              type="text"
              value={portsInput}
              onChange={(e) => {
                setPortsInput(e.target.value);
                if (portsError) setPortsError(null);
              }}
              placeholder={t.ports.customPortsPlaceholder}
              className={`flex-1 h-9 px-3 rounded-lg bg-canvas border outline-none text-xs font-mono text-ink-secondary ltr-data ${
                portsError
                  ? "border-rose-500 focus:border-rose-500"
                  : "border-stroke focus:border-cyan-500"
              }`}
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => applyPreset(PRESETS.standard)}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-canvas-subtle hover:bg-stroke border border-stroke text-ink-secondary transition-colors"
              >
                <span dir={proseDir}>{t.ports.presetStandard}</span>
              </button>
              <button
                type="button"
                onClick={() => applyPreset(PRESETS.web)}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-canvas-subtle hover:bg-stroke border border-stroke text-ink-secondary transition-colors"
              >
                <span dir={proseDir}>{t.ports.presetWeb}</span>
              </button>
              <button
                type="button"
                onClick={() => applyPreset(PRESETS.database)}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-canvas-subtle hover:bg-stroke border border-stroke text-ink-secondary transition-colors"
              >
                <span dir={proseDir}>{t.ports.presetDatabase}</span>
              </button>

              <div className="inline-flex items-center gap-1 ms-1 ps-2 border-s border-stroke">
                <span dir={proseDir} className="text-[10px] font-medium text-ink-muted">
                  {t.ports.timeoutModeLabel}
                  {isAr ? "" : ":"}
                </span>
                <button
                  type="button"
                  onClick={() => onTimeoutModeChange("fast")}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                    timeoutMode === "fast"
                      ? "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/40"
                      : "bg-canvas-subtle text-ink-secondary border-stroke hover:bg-stroke"
                  }`}
                >
                  <span dir={proseDir}>{t.ports.timeoutFast}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onTimeoutModeChange("deep")}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                    timeoutMode === "deep"
                      ? "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/40"
                      : "bg-canvas-subtle text-ink-secondary border-stroke hover:bg-stroke"
                  }`}
                >
                  <span dir={proseDir}>{t.ports.timeoutDeep}</span>
                </button>
              </div>
            </div>
          </div>
        </form>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span dir={proseDir} className="text-[11px] font-medium text-ink-muted">
            {t.common.quickTargets}
            {isAr ? "" : ":"}
          </span>
          {quickHosts.map((host) => (
            <button
              key={host}
              type="button"
              disabled={loading}
              onClick={() => {
                onTargetChange(host);
                executeWithValidatedPorts(host);
              }}
              className="px-2.5 py-0.5 rounded-md text-xs font-mono ltr-data bg-canvas-subtle hover:bg-cyan-500/15 hover:text-cyan-500 hover:border-cyan-500/30 border border-stroke text-ink-secondary transition-colors"
            >
              {host}
            </button>
          ))}
        </div>

        {loading && (
          <div className="mt-4 h-1.5 w-full rounded-full bg-canvas-subtle overflow-hidden">
            <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-400 animate-scan-line" />
          </div>
        )}

        {portsWarning && !portsError && (
          <div className="mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span dir={proseDir} className={isAr ? "text-right flex-1" : "flex-1"}>
              {portsWarning}
            </span>
          </div>
        )}

        {(portsError || error) && (
          <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-500 dark:text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span dir={proseDir} className={isAr ? "text-right flex-1" : "flex-1"}>
              <strong>{t.common.errorPrefix}:</strong> {portsError ?? error}
            </span>
          </div>
        )}
      </div>

      {/* Empty State */}
      {!result && !loading && (
        <div className="rounded-xl bg-canvas-elevated border border-dashed border-stroke-strong p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center mx-auto mb-4">
            <Network className="w-7 h-7" />
          </div>
          <h2 dir={proseDir} className="text-base font-semibold text-ink">
            {t.common.noDataYet}
          </h2>
          <p
            dir={proseDir}
            className="text-xs text-ink-secondary max-w-md mx-auto mt-1.5 leading-relaxed"
          >
            {t.ports.emptyHint}
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
          {/* Probe Vantage Strip */}
          {result.probeVantage && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-canvas-elevated border border-stroke text-xs">
              <span
                dir={proseDir}
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-medium border ${
                  result.probeVantage.mode === "cloud"
                    ? "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/25"
                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25"
                }`}
              >
                {result.probeVantage.mode === "cloud" ? (
                  <Cloud className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <Monitor className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>
                  {result.probeVantage.mode === "cloud"
                    ? `${t.common.vantageCloud}${
                        result.probeVantage.region ? ` (${result.probeVantage.region})` : ""
                      }`
                    : t.common.vantageLocal}
                </span>
              </span>
              <span className="text-[11px] font-mono text-ink-muted ltr-data">
                {result.hostname} → {result.resolvedIp}
              </span>
            </div>
          )}

          {/* Summary KPI Row */}
          <div
            className={`grid grid-cols-2 gap-4 ${
              result.summary.error > 0 ? "lg:grid-cols-5" : "lg:grid-cols-4"
            }`}
          >
            <div className="rounded-xl bg-canvas-elevated border border-stroke p-4 shadow-panel">
              <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
                <span dir={proseDir}>{t.ports.openPorts}</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-mono font-bold text-emerald-500">
                {result.summary.open}
              </div>
              <div className="text-[11px] font-mono text-ink-muted mt-1 ltr-data">
                {result.resolvedIp}
              </div>
            </div>

            <div className="rounded-xl bg-canvas-elevated border border-stroke p-4 shadow-panel">
              <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
                <span dir={proseDir}>{t.ports.closedPorts}</span>
                <XCircle className="w-4 h-4 text-ink-muted" />
              </div>
              <div className="text-2xl font-mono font-bold text-ink">{result.summary.closed}</div>
              <div className="text-[11px] text-ink-muted mt-1">TCP RST</div>
            </div>

            <div className="rounded-xl bg-canvas-elevated border border-stroke p-4 shadow-panel">
              <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
                <span dir={proseDir}>{t.ports.filteredPorts}</span>
                <ShieldAlert className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-2xl font-mono font-bold text-amber-500">
                {result.summary.filtered}
              </div>
              <div className="text-[11px] text-ink-muted mt-1">Firewall / Drop</div>
            </div>

            {result.summary.error > 0 && (
              <div className="rounded-xl bg-canvas-elevated border border-rose-500/30 p-4 shadow-panel">
                <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
                  <span dir={proseDir}>{t.ports.errorPorts}</span>
                  <AlertCircle className="w-4 h-4 text-rose-500" />
                </div>
                <div className="text-2xl font-mono font-bold text-rose-500">
                  {result.summary.error}
                </div>
                <div className="text-[11px] text-ink-muted mt-1">Socket Error</div>
              </div>
            )}

            <div className="rounded-xl bg-canvas-elevated border border-stroke p-4 shadow-panel">
              <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
                <span dir={proseDir}>{t.ports.scanDuration}</span>
                <Clock className="w-4 h-4 text-cyan-500" />
              </div>
              <div className="text-2xl font-mono font-bold text-cyan-500 ltr-data">
                {result.durationMs} <span className="text-xs font-normal text-ink-muted">ms</span>
              </div>
              <div className="text-[11px] font-mono text-ink-muted mt-1">
                <span dir={proseDir} className="inline-block">
                  <span className="inline-block ltr-data">{result.summary.total}</span>{" "}
                  {t.ports.tcpPortsUnit}
                </span>
              </div>
            </div>
          </div>

          {/* Detailed Port Matrix Table */}
          <div className="rounded-xl bg-canvas-elevated border border-stroke overflow-hidden shadow-panel">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-canvas-subtle/80 border-b border-stroke text-ink-muted text-[11px] uppercase tracking-wider">
                    <th dir={proseDir} className="py-3 px-4 text-start font-semibold">
                      {t.ports.portCol}
                    </th>
                    <th dir={proseDir} className="py-3 px-4 text-start font-semibold">
                      {t.ports.serviceCol}
                    </th>
                    <th dir={proseDir} className="py-3 px-4 text-start font-semibold">
                      {t.ports.statusCol}
                    </th>
                    <th dir={proseDir} className="py-3 px-4 text-end font-semibold">
                      {t.ports.latencyCol}
                    </th>
                    <th
                      dir={proseDir}
                      className={`py-3 px-4 font-semibold ${isAr ? "text-right" : "text-start"}`}
                    >
                      {t.ports.riskCol}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke">
                  {result.ports.map((item) => (
                    <tr
                      key={item.port}
                      className={`hover:bg-canvas-subtle/60 transition-colors ${
                        item.status === "open" ? "bg-emerald-500/[0.03]" : ""
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-ink ltr-data">
                        <span dir="ltr" className="inline-block ltr-data">
                          {item.port}{" "}
                          <span className="text-[10px] font-normal text-ink-muted">
                            / {item.protocol}
                          </span>
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-ink">
                        <div>{item.service}</div>
                        {item.banner && (
                          <div className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400 mt-0.5 break-all ltr-data">
                            {item.banner}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">{renderPortBadge(item.status, item.errorCode)}</td>
                      <td className="py-3 px-4 text-end font-mono text-ink-secondary ltr-data">
                        {item.latencyMs !== null ? `${item.latencyMs} ms` : "—"}
                      </td>
                      <td className="py-3 px-4 text-ink-secondary max-w-md">
                        <div className="flex items-center gap-2">
                          {item.status === "open" && item.risk === "high" && (
                            <span
                              dir={proseDir}
                              className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-500 text-[10px] font-bold shrink-0"
                            >
                              {t.ports.highRiskBadge}
                            </span>
                          )}
                          <span
                            dir={proseDir}
                            className={isAr ? "text-right flex-1" : "flex-1"}
                          >
                            {portNote(item.noteKey)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
