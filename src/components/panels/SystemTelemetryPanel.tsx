"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Cpu,
  HardDrive,
  Clock,
  Monitor,
  Wifi,
  RefreshCw,
  Pause,
  Play,
  Copy,
  Check,
  Activity,
  ShieldAlert,
  AlertTriangle,
  Database,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import type { SystemTelemetryResult } from "@/types/telemetry";
import type { Dictionary, Locale } from "@/lib/i18n";
import { formatByteRate, formatBytes, formatClockGhz, formatUptime } from "@/lib/cn";
import {
  TelemetrySparkline,
  type TelemetryPoint,
} from "@/components/charts/TelemetrySparkline";

interface SystemTelemetryPanelProps {
  t: Dictionary;
  lang: Locale;
  telemetry: SystemTelemetryResult | null;
  history: TelemetryPoint[];
  loading: boolean;
  autoRefresh: boolean;
  cloudDisabled: boolean;
  error: string | null;
  onToggleAutoRefresh: () => void;
  onManualRefresh: () => void;
}

export const SystemTelemetryPanel = React.memo(function SystemTelemetryPanel({
  t,
  lang,
  telemetry,
  history,
  loading,
  autoRefresh,
  cloudDisabled,
  error,
  onToggleAutoRefresh,
  onManualRefresh,
}: SystemTelemetryPanelProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAr = lang === "ar";
  const proseDir = isAr ? "rtl" : "ltr";

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const handleCopy = (key: string, val: string) => {
    navigator.clipboard?.writeText(val).catch(() => undefined);
    setCopiedKey(key);
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 1500);
  };

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="rounded-xl bg-canvas-elevated border border-stroke p-5 shadow-panel flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-500">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h1 dir={proseDir} className="text-lg font-bold tracking-tight text-ink">
              {t.system.title}
            </h1>
            <p dir={proseDir} className="text-xs text-ink-secondary mt-0.5">
              {telemetry
                ? telemetry.cpu.metricSource === "windows-pdh"
                  ? t.system.subtitlePdh
                  : t.system.subtitleOsDelta
                : t.system.subtitle}
            </p>
          </div>
        </div>

        {!cloudDisabled && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleAutoRefresh}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                autoRefresh
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                  : "bg-canvas-subtle text-ink-secondary border-stroke"
              }`}
            >
              {autoRefresh ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <Pause className="w-3 h-3" />
                  <span dir={proseDir}>
                    {t.common.autoRefresh} ({t.system.pollInterval})
                  </span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3" />
                  <span dir={proseDir}>{t.common.paused}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onManualRefresh}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-canvas-subtle hover:bg-stroke text-ink border border-stroke transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              {t.common.refresh}
            </button>
          </div>
        )}
      </div>

      {cloudDisabled ? (
        <div className="rounded-xl bg-canvas-elevated border border-amber-500/30 p-10 text-center space-y-3 shadow-panel">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-500 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <span
            dir={proseDir}
            className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/25"
          >
            {t.system.desktopOnlyBadge}
          </span>
          <h2 dir={proseDir} className="text-base font-bold text-ink">
            {t.system.cloudDisabledTitle}
          </h2>
          <p
            dir={proseDir}
            className={`text-xs text-ink-secondary max-w-xl mx-auto leading-relaxed ${
              isAr ? "text-right" : ""
            }`}
          >
            {t.system.cloudDisabledDesc}
          </p>
        </div>
      ) : error && !telemetry ? (
        <div className="rounded-xl bg-canvas-elevated border border-rose-500/30 p-10 text-center space-y-3 shadow-panel">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-500 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 dir={proseDir} className="text-base font-bold text-ink">
            {t.system.errorTitle}
          </h2>
          <p className="text-xs font-mono text-rose-500 dark:text-rose-400 max-w-lg mx-auto">
            {error}
          </p>
          <button
            type="button"
            onClick={onManualRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            {t.system.retry}
          </button>
        </div>
      ) : !telemetry ? (
        <div className="rounded-xl bg-canvas-elevated border border-stroke p-12 text-center">
          <RefreshCw className="w-6 h-6 text-cyan-500 animate-spin mx-auto mb-3" />
          <p dir={proseDir} className="text-xs text-ink-secondary">
            {t.common.scanning}
          </p>
        </div>
      ) : (
        <>
          {error && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span dir={proseDir} className={isAr ? "text-right flex-1" : "flex-1"}>
                {error}
              </span>
            </div>
          )}

          {/* Top 6 Hardware KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {/* CPU Card */}
            <div className="rounded-xl bg-canvas-elevated border border-stroke p-4 shadow-panel">
              <div className="flex items-center justify-between gap-2 text-xs text-ink-muted mb-2">
                <span dir={proseDir}>{t.system.cpuUsage}</span>
                <div className="flex items-center gap-1.5">
                  <span
                    dir={proseDir}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                      telemetry.cpu.metricSource === "windows-pdh"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25"
                        : "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/25"
                    }`}
                  >
                    {telemetry.cpu.metricSource === "windows-pdh"
                      ? t.system.sourceWindowsPdh
                      : t.system.sourceOsDelta}
                  </span>
                  <Cpu className="w-4 h-4 text-cyan-500" />
                </div>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-2xl font-mono font-bold text-cyan-500 ltr-data">
                  {telemetry.cpu.usagePercent}%
                </div>
                {telemetry.cpu.currentSpeedMhz && (
                  <div className="text-xs font-mono font-semibold text-emerald-500 ltr-data">
                    {formatClockGhz(telemetry.cpu.currentSpeedMhz)}
                  </div>
                )}
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-canvas-subtle overflow-hidden">
                <div
                  className="h-full rounded-full bg-cyan-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, telemetry.cpu.usagePercent)}%` }}
                />
              </div>
              <div className="mt-2 text-[11px] text-ink-secondary truncate" title={telemetry.cpu.model}>
                {telemetry.cpu.model}
              </div>
              <div className="text-[10px] font-mono text-ink-muted mt-0.5">
                <span dir={proseDir} className="inline-block">
                  <span className="inline-block ltr-data">{telemetry.cpu.coresCount}</span>{" "}
                  {t.system.cores}
                </span>{" "}
                •{" "}
                <span dir={proseDir} className="inline-block">
                  {t.system.baseClock}:{" "}
                  <span className="inline-block ltr-data">{telemetry.cpu.speedMhz} MHz</span>
                </span>
              </div>
            </div>

            {/* RAM Card */}
            <div className="rounded-xl bg-canvas-elevated border border-stroke p-4 shadow-panel">
              <div className="flex items-center justify-between text-xs text-ink-muted mb-2">
                <span dir={proseDir}>{t.system.ramUsage}</span>
                <HardDrive className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-mono font-bold text-emerald-500 ltr-data">
                {telemetry.memory.usagePercent}%
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-canvas-subtle overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, telemetry.memory.usagePercent)}%` }}
                />
              </div>
              <div className="mt-2 text-[11px] font-mono text-ink-secondary ltr-data">
                {formatBytes(telemetry.memory.usedBytes)} / {formatBytes(telemetry.memory.totalBytes)}
              </div>
              <div dir={proseDir} className={`text-[10px] text-ink-muted mt-0.5 ${isAr ? "text-right" : ""}`}>
                {t.system.usablePhysicalRam}
              </div>
              <div
                dir={proseDir}
                className={`text-[10px] font-mono text-ink-muted mt-0.5 flex flex-wrap items-center gap-1 ${
                  isAr ? "justify-end text-right" : ""
                }`}
              >
                <span>
                  {t.system.free}:{" "}
                  <span className="inline-block ltr-data">
                    {formatBytes(telemetry.memory.availableBytes)}
                  </span>
                </span>
                <span>•</span>
                {telemetry.memory.appWorkingSetBytes !== null ? (
                  <span>
                    {t.system.appWorkingSet}:{" "}
                    <span className="inline-block ltr-data">
                      {formatBytes(telemetry.memory.appWorkingSetBytes, 1)}
                    </span>
                  </span>
                ) : (
                  <span className="inline-block ltr-data">
                    RSS: {formatBytes(telemetry.memory.processRssBytes, 1)}
                  </span>
                )}
              </div>
            </div>

            {/* Live Network Speed Card */}
            <div className="rounded-xl bg-canvas-elevated border border-stroke p-4 shadow-panel">
              <div className="flex items-center justify-between text-xs text-ink-muted mb-2">
                <span dir={proseDir}>{t.system.netThroughput}</span>
                <Wifi className="w-4 h-4 text-cyan-500" />
              </div>
              <div className="grid grid-cols-2 gap-2.5 mt-1">
                <div className="p-2 rounded-lg bg-canvas-subtle border border-stroke">
                  <div className="flex items-center gap-1 text-[10px] text-ink-muted">
                    <ArrowDown className="w-3 h-3 text-emerald-500 shrink-0" />
                    <span dir={proseDir}>{t.system.downloadShort}</span>
                  </div>
                  <div className="text-sm font-mono font-bold text-emerald-500 mt-0.5 ltr-data">
                    {formatByteRate(telemetry.networkThroughput?.rxBytesPerSec ?? 0)}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-canvas-subtle border border-stroke">
                  <div className="flex items-center gap-1 text-[10px] text-ink-muted">
                    <ArrowUp className="w-3 h-3 text-cyan-500 shrink-0" />
                    <span dir={proseDir}>{t.system.uploadShort}</span>
                  </div>
                  <div className="text-sm font-mono font-bold text-cyan-500 mt-0.5 ltr-data">
                    {formatByteRate(telemetry.networkThroughput?.txBytesPerSec ?? 0)}
                  </div>
                </div>
              </div>
              <div
                dir={proseDir}
                className={`text-[10px] font-mono text-ink-muted mt-2 ${isAr ? "text-right" : ""}`}
              >
                <span className="inline-block ltr-data">
                  {telemetry.networkInterfaces.filter((n) => !n.internal).length}
                </span>{" "}
                {t.system.adaptersUnit}
              </div>
            </div>

            {/* System Disk Card */}
            <div className="rounded-xl bg-canvas-elevated border border-stroke p-4 shadow-panel">
              <div className="flex items-center justify-between text-xs text-ink-muted mb-2">
                <span dir={proseDir}>
                  {t.system.diskUsage}
                  {telemetry.disk?.mount ? ` (${telemetry.disk.mount})` : ""}
                </span>
                <Database className="w-4 h-4 text-violet-400" />
              </div>
              {telemetry.disk ? (
                <>
                  <div className="text-2xl font-mono font-bold text-violet-400 ltr-data">
                    {telemetry.disk.usagePercent}%
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-canvas-subtle overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        telemetry.disk.usagePercent > 90 ? "bg-rose-500" : "bg-violet-500"
                      }`}
                      style={{ width: `${Math.min(100, telemetry.disk.usagePercent)}%` }}
                    />
                  </div>
                  <div className="mt-2 text-[11px] font-mono text-ink-secondary ltr-data">
                    {formatBytes(telemetry.disk.usedBytes, 1)} /{" "}
                    {formatBytes(telemetry.disk.totalBytes, 1)}
                  </div>
                  <div
                    dir={proseDir}
                    className={`text-[10px] font-mono text-ink-muted mt-0.5 ${isAr ? "text-right" : ""}`}
                  >
                    {t.system.free}:{" "}
                    <span className="inline-block ltr-data">
                      {formatBytes(telemetry.disk.freeBytes, 1)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-sm font-mono text-ink-muted mt-4">—</div>
              )}
            </div>

            {/* Uptime Card */}
            <div className="rounded-xl bg-canvas-elevated border border-stroke p-4 shadow-panel">
              <div className="flex items-center justify-between text-xs text-ink-muted mb-2">
                <span dir={proseDir}>{t.system.uptime}</span>
                <Clock className="w-4 h-4 text-amber-500" />
              </div>
              <div dir={proseDir} className={`text-2xl font-mono font-bold text-ink ${isAr ? "text-right" : ""}`}>
                {formatUptime(telemetry.uptimeSeconds, lang)}
              </div>
              <div className={`mt-2 text-[11px] font-mono text-ink-secondary ${isAr ? "text-right" : ""}`}>
                <span dir={proseDir} className="inline-block">
                  <span className="inline-block ltr-data">
                    {telemetry.uptimeSeconds.toLocaleString()}
                  </span>{" "}
                  {t.system.secondsUnit}
                </span>
              </div>
              <div dir={proseDir} className={`text-[10px] font-mono text-ink-muted mt-0.5 ${isAr ? "text-right" : ""}`}>
                {t.system.nodeRuntime}:{" "}
                <span className="inline-block ltr-data">{telemetry.nodeVersion}</span>
              </div>
            </div>

            {/* Host / OS Card */}
            <div className="rounded-xl bg-canvas-elevated border border-stroke p-4 shadow-panel">
              <div className="flex items-center justify-between text-xs text-ink-muted mb-2">
                <span dir={proseDir}>{t.system.hostOs}</span>
                <Monitor className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-lg font-mono font-bold text-ink truncate ltr-data">
                {telemetry.hostname}
              </div>
              <div className="mt-2 text-[11px] text-ink-secondary truncate" title={telemetry.version}>
                {telemetry.version}
              </div>
              <div className="text-[10px] font-mono text-ink-muted mt-0.5 ltr-data">
                {telemetry.osType} ({telemetry.platform}) • {telemetry.arch} • {telemetry.release}
              </div>
            </div>
          </div>

          {/* Live Stream Chart & Per-Core Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            <div className="xl:col-span-7 rounded-xl bg-canvas-elevated border border-stroke p-5 shadow-panel">
              <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-stroke">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-500" />
                  <h2 dir={proseDir} className="text-sm font-bold text-ink">
                    {t.system.historyChartTitle}
                  </h2>
                </div>
                <span dir={proseDir} className="text-[11px] font-mono text-ink-muted">
                  <span className="inline-block ltr-data">{history.length}</span>{" "}
                  {t.system.samplesUnit}
                </span>
              </div>

              <TelemetrySparkline
                points={history}
                cpuLabel={`${t.system.cpuUsage} (${telemetry.cpu.usagePercent}%)`}
                ramLabel={`${t.system.ramUsage} (${telemetry.memory.usagePercent}%)`}
              />
            </div>

            {/* Per-Core CPU Utilization */}
            <div className="xl:col-span-5 rounded-xl bg-canvas-elevated border border-stroke p-5 shadow-panel">
              <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-stroke">
                <h2 dir={proseDir} className="text-sm font-bold text-ink">
                  {t.system.perCoreTitle}
                </h2>
                <span dir={proseDir} className="text-xs font-mono text-cyan-500">
                  <span className="inline-block ltr-data">{telemetry.cpu.coresCount}</span>{" "}
                  {t.system.coresShort}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[210px] overflow-y-auto pe-1">
                {telemetry.cpu.perCore.map((c) => (
                  <div
                    key={c.core}
                    className="p-2.5 rounded-lg bg-canvas-subtle border border-stroke"
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono mb-1.5">
                      <span dir={proseDir} className="text-ink-muted">
                        {t.system.corePrefix} <span className="inline-block ltr-data">#{c.core}</span>
                      </span>
                      <span
                        className={`font-bold inline-block ltr-data ${
                          c.usagePercent > 80
                            ? "text-rose-500"
                            : c.usagePercent > 50
                              ? "text-amber-500"
                              : "text-cyan-500"
                        }`}
                      >
                        {c.usagePercent}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-canvas overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          c.usagePercent > 80
                            ? "bg-rose-500"
                            : c.usagePercent > 50
                              ? "bg-amber-500"
                              : "bg-cyan-500"
                        }`}
                        style={{ width: `${Math.min(100, c.usagePercent)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Real Network Interfaces Table */}
          <div className="rounded-xl bg-canvas-elevated border border-stroke p-5 shadow-panel">
            <div className="flex items-center justify-between gap-2 pb-3 mb-4 border-b border-stroke">
              <div className="flex items-center gap-2">
                <Wifi className="w-4 h-4 text-emerald-500" />
                <h2 dir={proseDir} className="text-sm font-bold text-ink">
                  {t.system.nicTitle}
                </h2>
              </div>
              <span dir={proseDir} className="text-xs font-mono text-ink-muted">
                <span className="inline-block ltr-data">{telemetry.networkInterfaces.length}</span>{" "}
                {t.system.adaptersUnit}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-canvas-subtle/80 border-b border-stroke text-ink-muted text-[11px] uppercase tracking-wider">
                    <th dir={proseDir} className="py-2.5 px-3 text-start font-semibold">
                      {t.system.adapter}
                    </th>
                    <th dir={proseDir} className="py-2.5 px-3 text-start font-semibold">
                      {t.system.scope}
                    </th>
                    <th dir={proseDir} className="py-2.5 px-3 text-start font-semibold">
                      {t.system.ipv4}
                    </th>
                    <th dir={proseDir} className="py-2.5 px-3 text-start font-semibold">
                      {t.system.macAddress}
                    </th>
                    <th dir={proseDir} className="py-2.5 px-3 text-start font-semibold">
                      {t.system.cidr}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke">
                  {telemetry.networkInterfaces.map((nic) => (
                    <tr key={nic.name} className="hover:bg-canvas-subtle/60 transition-colors">
                      <td className="py-3 px-3 font-semibold text-ink">{nic.name}</td>
                      <td className="py-3 px-3">
                        <span
                          dir={proseDir}
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            nic.internal
                              ? "bg-slate-500/10 text-ink-muted border-stroke"
                              : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25"
                          }`}
                        >
                          {nic.internal ? t.system.loopback : t.system.external}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-cyan-600 dark:text-cyan-400 ltr-data">
                        {nic.ipv4.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {nic.ipv4.map((ip) => (
                              <span key={ip} className="inline-flex items-center gap-1.5">
                                {ip}
                                <button
                                  type="button"
                                  onClick={() => handleCopy(`ip-${nic.name}-${ip}`, ip)}
                                  className="text-ink-muted hover:text-ink"
                                >
                                  {copiedKey === `ip-${nic.name}-${ip}` ? (
                                    <Check className="w-3 h-3 text-emerald-500" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-ink-secondary ltr-data">
                        <span className="inline-flex items-center gap-1.5">
                          {nic.mac}
                          {nic.mac !== "00:00:00:00:00:00" && (
                            <button
                              type="button"
                              onClick={() => handleCopy(`mac-${nic.name}`, nic.mac)}
                              className="text-ink-muted hover:text-ink"
                            >
                              {copiedKey === `mac-${nic.name}` ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          )}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-ink-muted ltr-data">
                        {nic.cidr.length > 0 ? nic.cidr.join(", ") : nic.ipv6[0] ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
});
