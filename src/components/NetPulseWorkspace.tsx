"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Terminal, Cloud } from "lucide-react";
import { translations, type Locale } from "@/lib/i18n";
import {
  clearScanHistory,
  deleteScanHistoryEntry,
  loadScanHistory,
  saveScanHistoryEntry,
} from "@/lib/history";
import { DEFAULT_SCAN_PORTS, parseTargetHost } from "@/lib/validators";
import type {
  AuditResult,
  DnsPingResult,
  PortScanResult,
  PortScanTimeoutMode,
  ScanHistoryEntry,
  SystemTelemetryResult,
} from "@/types/telemetry";
import type { TelemetryPoint } from "@/components/charts/TelemetrySparkline";
import { DesktopTitleBar } from "@/components/shell/DesktopTitleBar";
import { DesktopSidebar, type ModuleKey } from "@/components/shell/DesktopSidebar";
import { SslAuditPanel } from "@/components/panels/SslAuditPanel";
import { DnsRadarPanel } from "@/components/panels/DnsRadarPanel";
import { PortScannerPanel } from "@/components/panels/PortScannerPanel";
import { SystemTelemetryPanel } from "@/components/panels/SystemTelemetryPanel";
import { HistoryPanel } from "@/components/panels/HistoryPanel";
import { PrintableReport } from "@/components/report/PrintableReport";

const VALID_TABS = new Set<ModuleKey>(["audit", "dns", "ports", "system", "history"]);

export function NetPulseWorkspace() {
  const [lang, setLang] = useState<Locale>("en");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [isElectron, setIsElectron] = useState(false);
  const [activeModule, setActiveModule] = useState<ModuleKey>("audit");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [urlHydrated, setUrlHydrated] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const mainScrollRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0 });
  }, [activeModule]);

  // Shared Target Input
  const [target, setTarget] = useState("magixa.tech");
  const [pulsesCount, setPulsesCount] = useState(6);

  // Live Telemetry States
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const [dnsResult, setDnsResult] = useState<DnsPingResult | null>(null);
  const [dnsLoading, setDnsLoading] = useState(false);
  const [dnsError, setDnsError] = useState<string | null>(null);

  const [portResult, setPortResult] = useState<PortScanResult | null>(null);
  const [portLoading, setPortLoading] = useState(false);
  const [portError, setPortError] = useState<string | null>(null);
  const [portTimeoutMode, setPortTimeoutMode] = useState<PortScanTimeoutMode>("fast");

  const [systemTelemetry, setSystemTelemetry] = useState<SystemTelemetryResult | null>(null);
  const [systemHistory, setSystemHistory] = useState<TelemetryPoint[]>([]);
  const [systemLoading, setSystemLoading] = useState(false);
  const [systemError, setSystemError] = useState<string | null>(null);
  const [systemCloudDisabled, setSystemCloudDisabled] = useState(false);
  const [autoRefreshSystem, setAutoRefreshSystem] = useState(true);
  const telemetryInFlightRef = useRef(false);
  const telemetryAbortRef = useRef<AbortController | null>(null);

  // History & Report Modal
  const [historyEntries, setHistoryEntries] = useState<ScanHistoryEntry[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [fullScanLoading, setFullScanLoading] = useState(false);
  const [fullScanStage, setFullScanStage] = useState<string | null>(null);

  const t = translations[lang];

  const displayTarget = useMemo(() => {
    const trimmed = target.trim();
    if (!trimmed) return "";
    const parsed = parseTargetHost(trimmed);
    return parsed.ok ? parsed.data.hostname : trimmed;
  }, [target]);

  const observedProbeRegion =
    auditResult?.probeVantage?.region ??
    dnsResult?.probeVantage?.region ??
    portResult?.probeVantage?.region ??
    null;

  // Hydrate persisted preferences, Electron bridge detection, URL query params, and scan history
  useEffect(() => {
    try {
      const savedTheme = window.localStorage.getItem("netpulse_theme_v1");
      if (savedTheme === "light" || savedTheme === "dark") {
        setTheme(savedTheme);
      }
      const savedLang = window.localStorage.getItem("netpulse_lang_v1");
      if (savedLang === "ar" || savedLang === "en") {
        setLang(savedLang);
      }
    } catch {
      // Ignore storage access failures
    }

    const electronDetected = Boolean(window.netpulseElectron?.isElectron);
    if (electronDetected) {
      setIsElectron(true);
    }

    try {
      const params = new URLSearchParams(window.location.search);
      const qTarget = params.get("target")?.trim();
      if (qTarget) {
        const parsed = parseTargetHost(qTarget);
        if (parsed.ok) {
          setTarget(parsed.data.hostname);
        }
      }
      const qTab = params.get("tab")?.trim() as ModuleKey | undefined;
      if (qTab && VALID_TABS.has(qTab)) {
        setActiveModule(qTab);
      }
    } catch {
      // Ignore URL parse errors
    }

    setHistoryEntries(loadScanHistory());
    setUrlHydrated(true);
  }, []);

  // Keep web URL synchronized with target & active tab so links are directly shareable
  useEffect(() => {
    if (!urlHydrated || isElectron) return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (displayTarget) {
        params.set("target", displayTarget);
      } else {
        params.delete("target");
      }
      params.set("tab", activeModule);
      const nextUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState(null, "", nextUrl);
    } catch {
      // Ignore history API restrictions
    }
  }, [urlHydrated, isElectron, displayTarget, activeModule]);

  // If Cloud Web disables local hardware telemetry, redirect away from hidden system tab
  useEffect(() => {
    if (systemCloudDisabled && activeModule === "system") {
      setActiveModule("audit");
    }
  }, [systemCloudDisabled, activeModule]);

  // Sync HTML class & dir attributes on theme / language changes
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    try {
      window.localStorage.setItem("netpulse_theme_v1", theme);
    } catch {
      // Ignore
    }
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.dir = "ltr";
    root.lang = lang;
    try {
      window.localStorage.setItem("netpulse_lang_v1", lang);
    } catch {
      // Ignore
    }
  }, [lang]);

  const handleCopyShareLink = useCallback(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (displayTarget) params.set("target", displayTarget);
    params.set("tab", activeModule);
    const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    navigator.clipboard?.writeText(shareUrl).catch(() => undefined);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 1600);
  }, [displayTarget, activeModule]);

  // Safe JSON response parser for API diagnostics (handles 504 HTML/text gateways cleanly)
  const readJsonSafe = useCallback(
    async <T,>(res: Response): Promise<T> => {
      if (res.status === 504) {
        throw new Error(t.common.timeoutError);
      }
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("application/json")) {
        const text = await res.text().catch(() => "");
        const trimmed = text.trim();
        throw new Error(
          !res.ok
            ? `${t.common.nonJsonError} (HTTP ${res.status})`
            : trimmed || t.common.nonJsonError
        );
      }
      const data = (await res.json()) as T & { error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      return data;
    },
    [t.common.nonJsonError, t.common.timeoutError]
  );

  // Fetch Real OS System Telemetry (IPC in Electron, HTTP in local browser, 403-safe in Cloud)
  const fetchSystemTelemetry = useCallback(async () => {
    if (telemetryInFlightRef.current) return;
    telemetryInFlightRef.current = true;
    setSystemLoading(true);

    const recordSample = (data: SystemTelemetryResult) => {
      setSystemTelemetry(data);
      setSystemError(null);
      setSystemCloudDisabled(false);
      const now = new Date(data.timestamp);
      const timeLabel = now.toTimeString().slice(0, 8);
      setSystemHistory((prev) => [
        ...prev.slice(-24),
        {
          timeLabel,
          cpu: data.cpu.usagePercent,
          ram: data.memory.usagePercent,
        },
      ]);
    };

    try {
      const electronApi =
        typeof window !== "undefined" ? window.netpulseElectron : undefined;

      if (electronApi?.isElectron && typeof electronApi.getSystemTelemetry === "function") {
        const data = await electronApi.getSystemTelemetry();
        recordSample(data);
        return;
      }

      const controller = new AbortController();
      telemetryAbortRef.current = controller;
      const res = await fetch("/api/system", {
        cache: "no-store",
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status === 504) {
          setSystemError(t.common.timeoutError);
          return;
        }
        const contentType = res.headers.get("content-type") ?? "";
        let errBody: { mode?: string; error?: string } | null = null;
        if (contentType.toLowerCase().includes("application/json")) {
          try {
            errBody = (await res.json()) as { mode?: string; error?: string };
          } catch {
            errBody = null;
          }
        }
        if (res.status === 403 || errBody?.mode === "cloud-disabled") {
          setSystemCloudDisabled(true);
          setSystemError(errBody?.error ?? null);
          return;
        }
        setSystemError(errBody?.error || `HTTP ${res.status}`);
        return;
      }

      const data = await readJsonSafe<SystemTelemetryResult>(res);
      recordSample(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      setSystemError(
        err instanceof Error ? err.message : "Failed to fetch system telemetry."
      );
    } finally {
      telemetryInFlightRef.current = false;
      setSystemLoading(false);
    }
  }, [readJsonSafe, t.common.timeoutError]);

  // Initial one-time fetch on mount
  useEffect(() => {
    void fetchSystemTelemetry();
    return () => {
      telemetryAbortRef.current?.abort();
    };
  }, [fetchSystemTelemetry]);

  // Sequential recursive polling paused automatically whenever window/tab is hidden
  useEffect(() => {
    if (!autoRefreshSystem || systemCloudDisabled) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const intervalMs = activeModule === "system" ? 2200 : 9000;

    const clearTimer = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const scheduleNext = () => {
      clearTimer();
      if (cancelled || document.hidden || document.visibilityState !== "visible") return;
      timeoutId = setTimeout(async () => {
        if (cancelled || document.hidden || document.visibilityState !== "visible") return;
        await fetchSystemTelemetry();
        scheduleNext();
      }, intervalMs);
    };

    const handleVisibilityChange = () => {
      if (cancelled) return;
      if (document.hidden || document.visibilityState !== "visible") {
        clearTimer();
        telemetryAbortRef.current?.abort();
      } else {
        void fetchSystemTelemetry().then(() => {
          scheduleNext();
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    scheduleNext();

    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      telemetryAbortRef.current?.abort();
    };
  }, [activeModule, autoRefreshSystem, systemCloudDisabled, fetchSystemTelemetry]);

  // Tool 1: Live SSL & Security Audit
  const runAudit = useCallback(
    async (targetOverride?: string, opts?: { silentHistory?: boolean }): Promise<AuditResult | null> => {
      const host = (targetOverride ?? target).trim();
      if (!host) return null;
      setAuditLoading(true);
      setAuditError(null);
      try {
        const res = await fetch("/api/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: host }),
        });
        const data = await readJsonSafe<AuditResult>(res);
        setAuditResult(data);
        if (!opts?.silentHistory) {
          const entry: ScanHistoryEntry = {
            id: `audit-${data.hostname}-${Date.now()}`,
            type: "audit",
            hostname: data.hostname,
            scannedAt: data.scannedAt,
            grade: data.grade,
            score: data.score,
            summary: `${data.ssl.protocol ?? "TLS"}${data.ssl.alpnProtocol === "h2" ? " • HTTP/2" : ""} • ${data.ssl.issuer.O || data.ssl.issuer.CN || "Cert"} • ${data.issuesCount.pass}/${data.headers.length} headers`,
            auditData: data,
          };
          setHistoryEntries(saveScanHistoryEntry(entry));
        }
        return data;
      } catch (err) {
        setAuditError(err instanceof Error ? err.message : "Audit failed.");
        return null;
      } finally {
        setAuditLoading(false);
      }
    },
    [target, readJsonSafe]
  );

  // Tool 2: DNS Radar & Latency Profiler
  const runDnsPing = useCallback(
    async (
      targetOverride?: string,
      opts?: { silentHistory?: boolean }
    ): Promise<DnsPingResult | null> => {
      const host = (targetOverride ?? target).trim();
      if (!host) return null;
      setDnsLoading(true);
      setDnsError(null);
      try {
        const res = await fetch("/api/dns-ping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: host, pulses: pulsesCount }),
        });
        const data = await readJsonSafe<DnsPingResult>(res);
        setDnsResult(data);
        if (!opts?.silentHistory) {
          const dnsAvg = data.stats.dns.avg !== null ? `${data.stats.dns.avg}ms` : "—";
          const tcpAvg = data.stats.tcp.avg !== null ? `${data.stats.tcp.avg}ms` : "—";
          const ttfbAvg = data.stats.ttfb.avg !== null ? `${data.stats.ttfb.avg}ms` : "—";
          const entry: ScanHistoryEntry = {
            id: `dns-${data.hostname}-${Date.now()}`,
            type: "dns",
            hostname: data.hostname,
            scannedAt: data.scannedAt,
            avgTtfbMs: data.stats.ttfb.avg,
            summary: `IP ${data.resolvedIp ?? "—"} • DNS ${dnsAvg} • TCP ${tcpAvg} • Wait ${ttfbAvg}`,
            dnsData: data,
          };
          setHistoryEntries(saveScanHistoryEntry(entry));
        }
        return data;
      } catch (err) {
        setDnsError(err instanceof Error ? err.message : "DNS Radar failed.");
        return null;
      } finally {
        setDnsLoading(false);
      }
    },
    [target, pulsesCount, readJsonSafe]
  );

  // Tool 3: TCP Port Scanner
  const runPortScan = useCallback(
    async (
      targetOverride?: string,
      portsOverride?: number[],
      timeoutOverride?: PortScanTimeoutMode,
      opts?: { silentHistory?: boolean }
    ): Promise<PortScanResult | null> => {
      const host = (targetOverride ?? target).trim();
      if (!host) return null;
      setPortLoading(true);
      setPortError(null);
      try {
        const res = await fetch("/api/port-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target: host,
            ports: portsOverride ?? [...DEFAULT_SCAN_PORTS],
            timeoutMode: timeoutOverride ?? portTimeoutMode,
          }),
        });
        const data = await readJsonSafe<PortScanResult>(res);
        setPortResult(data);
        if (!opts?.silentHistory) {
          const entry: ScanHistoryEntry = {
            id: `ports-${data.hostname}-${Date.now()}`,
            type: "ports",
            hostname: data.hostname,
            scannedAt: data.scannedAt,
            openPorts: data.summary.open,
            summary: `${data.summary.open} open / ${data.summary.closed} closed / ${data.summary.filtered} filtered (${data.durationMs}ms)`,
            portData: data,
          };
          setHistoryEntries(saveScanHistoryEntry(entry));
        }
        return data;
      } catch (err) {
        setPortError(err instanceof Error ? err.message : "Port scan failed.");
        return null;
      } finally {
        setPortLoading(false);
      }
    },
    [target, portTimeoutMode, readJsonSafe]
  );

  // Staged Sequential Full Diagnostic Suite — prevents socket contention & saves 1 unified archive record
  const runFullSuite = useCallback(async () => {
    const host = target.trim();
    if (!host) return;
    setFullScanLoading(true);
    try {
      setFullScanStage("1/3");
      const aData = await runAudit(host, { silentHistory: true });

      setFullScanStage("2/3");
      const dData = await runDnsPing(host, { silentHistory: true });

      setFullScanStage("3/3");
      const pData = await runPortScan(host, undefined, undefined, { silentHistory: true });

      if (aData || dData || pData) {
        const hostname = aData?.hostname || dData?.hostname || pData?.hostname || host;
        const parts: string[] = [];
        if (aData) parts.push(`SSL ${aData.grade} (${aData.score}/100)`);
        if (dData && dData.stats.total.avg !== null) parts.push(`RTT ${dData.stats.total.avg}ms`);
        if (pData) parts.push(`${pData.summary.open} open ports`);

        const unifiedEntry: ScanHistoryEntry = {
          id: `full-${hostname}-${Date.now()}`,
          type: "full",
          hostname,
          scannedAt: new Date().toISOString(),
          grade: aData?.grade,
          score: aData?.score,
          openPorts: pData?.summary.open,
          avgTtfbMs: dData?.stats.ttfb.avg,
          summary: parts.join(" • "),
          ...(aData ? { auditData: aData } : {}),
          ...(dData ? { dnsData: dData } : {}),
          ...(pData ? { portData: pData } : {}),
        };
        setHistoryEntries(saveScanHistoryEntry(unifiedEntry));
      }
    } finally {
      setFullScanStage(null);
      setFullScanLoading(false);
    }
  }, [target, runAudit, runDnsPing, runPortScan]);

  // Export Structured JSON Report
  const handleExportJson = useCallback(() => {
    const bundle = {
      exportedBy: isElectron ? "NetPulse Desktop v1.1.0" : "NetPulse Web v1.1.0",
      exportedAt: new Date().toISOString(),
      target,
      audit: auditResult,
      dnsRadar: dnsResult,
      portScan: portResult,
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeHost = (auditResult?.hostname || target || "report").replace(/[^a-zA-Z0-9.-]/g, "_");
    a.href = url;
    a.download = `netpulse-telemetry-${safeHost}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [isElectron, target, auditResult, dnsResult, portResult]);

  // History actions
  const handleLoadHistoryEntry = (entry: ScanHistoryEntry) => {
    setTarget(entry.hostname);
    if (entry.type === "full") {
      if (entry.auditData) setAuditResult(entry.auditData);
      if (entry.dnsData) setDnsResult(entry.dnsData);
      if (entry.portData) setPortResult(entry.portData);
      setActiveModule(entry.auditData ? "audit" : entry.dnsData ? "dns" : "ports");
      return;
    }
    if (entry.type === "audit" && entry.auditData) {
      setAuditResult(entry.auditData);
      setActiveModule("audit");
    } else if (entry.type === "dns" && entry.dnsData) {
      setDnsResult(entry.dnsData);
      setActiveModule("dns");
    } else if (entry.type === "ports" && entry.portData) {
      setPortResult(entry.portData);
      setActiveModule("ports");
    }
  };

  const handleDeleteHistory = (id: string) => {
    setHistoryEntries(deleteScanHistoryEntry(id));
  };

  const handleClearHistory = () => {
    clearScanHistory();
    setHistoryEntries([]);
  };

  const hasReportData = Boolean(auditResult || dnsResult || portResult);

  return (
    <>
      <div
        dir="ltr"
        className="no-print h-[100dvh] w-screen flex flex-col overflow-hidden bg-canvas text-ink"
      >
        {/* Adaptive Header: Custom Windows Titlebar in Electron, Clean Web Navbar in Browser */}
        <DesktopTitleBar
          t={t}
          lang={lang}
          theme={theme}
          isElectron={isElectron}
          cloudMode={systemCloudDisabled}
          probeRegion={observedProbeRegion}
          hasReportData={hasReportData}
          fullScanLoading={fullScanLoading}
          fullScanStage={fullScanStage}
          shareCopied={shareCopied}
          onToggleTheme={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
          onToggleLang={() => setLang((prev) => (prev === "en" ? "ar" : "en"))}
          onOpenReport={() => setReportOpen(true)}
          onRunFullSuite={runFullSuite}
          onCopyShareLink={handleCopyShareLink}
          onToggleMobileMenu={() => setMobileMenuOpen((v) => !v)}
        />

        {/* Body: Sidebar + Active Telemetry Workspace */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <DesktopSidebar
            t={t}
            lang={lang}
            activeModule={activeModule}
            onSelectModule={setActiveModule}
            historyCount={historyEntries.length}
            systemTelemetry={systemTelemetry}
            systemCloudDisabled={systemCloudDisabled}
            mobileOpen={mobileMenuOpen}
            onCloseMobile={() => setMobileMenuOpen(false)}
          />

          <main
            ref={mainScrollRef}
            className="flex-1 overflow-y-auto telemetry-grid p-4 sm:p-6"
          >
            <div className="max-w-7xl mx-auto pb-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeModule}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                >
                  {activeModule === "audit" && (
                    <SslAuditPanel
                      t={t}
                      lang={lang}
                      target={target}
                      onTargetChange={setTarget}
                      result={auditResult}
                      loading={auditLoading}
                      error={auditError}
                      onRunAudit={(override) => void runAudit(override)}
                      onOpenReport={() => setReportOpen(true)}
                      onExportJson={handleExportJson}
                    />
                  )}

                  {activeModule === "dns" && (
                    <DnsRadarPanel
                      t={t}
                      lang={lang}
                      target={target}
                      onTargetChange={setTarget}
                      result={dnsResult}
                      loading={dnsLoading}
                      error={dnsError}
                      pulsesCount={pulsesCount}
                      onPulsesCountChange={setPulsesCount}
                      onRunDnsPing={(override) => void runDnsPing(override)}
                    />
                  )}

                  {activeModule === "ports" && (
                    <PortScannerPanel
                      t={t}
                      lang={lang}
                      target={target}
                      onTargetChange={setTarget}
                      result={portResult}
                      loading={portLoading}
                      error={portError}
                      isElectron={isElectron}
                      cloudMode={systemCloudDisabled}
                      timeoutMode={portTimeoutMode}
                      onTimeoutModeChange={setPortTimeoutMode}
                      onRunPortScan={(tOv, pOv, mOv) => void runPortScan(tOv, pOv, mOv)}
                    />
                  )}

                  {activeModule === "system" && (
                    <SystemTelemetryPanel
                      t={t}
                      lang={lang}
                      telemetry={systemTelemetry}
                      history={systemHistory}
                      loading={systemLoading}
                      autoRefresh={autoRefreshSystem}
                      cloudDisabled={systemCloudDisabled}
                      error={systemError}
                      onToggleAutoRefresh={() => setAutoRefreshSystem((v) => !v)}
                      onManualRefresh={fetchSystemTelemetry}
                    />
                  )}

                  {activeModule === "history" && (
                    <HistoryPanel
                      t={t}
                      lang={lang}
                      entries={historyEntries}
                      onLoadEntry={handleLoadHistoryEntry}
                      onDeleteEntry={handleDeleteHistory}
                      onClearAll={handleClearHistory}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>

        {/* Bottom Status Bar */}
        <footer
          dir="ltr"
          className="h-7 shrink-0 bg-canvas-elevated border-t border-stroke px-3 flex items-center justify-between text-[11px] font-mono text-ink-muted select-none"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex items-center gap-1.5 text-emerald-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span
                dir={lang === "ar" ? "rtl" : "ltr"}
                className="font-sans font-medium truncate"
              >
                {systemCloudDisabled ? t.engineCloudOnline : t.engineOnline}
              </span>
            </span>
            {systemCloudDisabled && observedProbeRegion ? (
              <span className="hidden md:inline-flex items-center gap-1 ltr-data text-cyan-500">
                <Cloud className="w-3 h-3" />
                {observedProbeRegion}
              </span>
            ) : (
              systemTelemetry && (
                <span className="hidden md:inline-flex items-center gap-1 ltr-data">
                  <Terminal className="w-3 h-3 text-cyan-500" />
                  {systemTelemetry.nodeVersion} • {systemTelemetry.platform}/{systemTelemetry.arch}
                </span>
              )
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {displayTarget && (
              <span
                dir={lang === "ar" ? "rtl" : "ltr"}
                className="hidden sm:inline-block text-ink-secondary"
              >
                {t.common.targetLabel}:{" "}
                <strong className="text-cyan-500 font-mono inline-block ltr-data">
                  {displayTarget}
                </strong>
              </span>
            )}
            <span className="font-mono inline-block ltr-data">v1.1.0</span>
          </div>
        </footer>
      </div>

      {/* Printable / PDF Security Report Preview & Print Layer */}
      <PrintableReport
        t={t}
        lang={lang}
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        audit={auditResult}
        dns={dnsResult}
        ports={portResult}
        onExportJson={handleExportJson}
      />
    </>
  );
}
