"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  Radar,
  Network,
  Cpu,
  History,
  Activity,
} from "lucide-react";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { SystemTelemetryResult } from "@/types/telemetry";

export type ModuleKey = "audit" | "dns" | "ports" | "system" | "history";

interface DesktopSidebarProps {
  t: Dictionary;
  lang: Locale;
  activeModule: ModuleKey;
  onSelectModule: (key: ModuleKey) => void;
  historyCount: number;
  systemTelemetry: SystemTelemetryResult | null;
  systemCloudDisabled?: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const DesktopSidebar = React.memo(function DesktopSidebar({
  t,
  lang,
  activeModule,
  onSelectModule,
  historyCount,
  systemTelemetry,
  systemCloudDisabled = false,
  mobileOpen,
  onCloseMobile,
}: DesktopSidebarProps) {
  const proseDir = lang === "ar" ? "rtl" : "ltr";
  const diagnosticItems: {
    key: ModuleKey;
    label: string;
    sub: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      key: "audit",
      label: t.nav.audit,
      sub: t.nav.auditShort,
      icon: ShieldCheck,
    },
    {
      key: "dns",
      label: t.nav.dns,
      sub: t.nav.dnsShort,
      icon: Radar,
    },
    {
      key: "ports",
      label: t.nav.ports,
      sub: t.nav.portsShort,
      icon: Network,
    },
    {
      key: "system",
      label: t.nav.system,
      sub: t.nav.systemShort,
      icon: Cpu,
    },
  ];

  const handleSelect = (key: ModuleKey) => {
    onSelectModule(key);
    onCloseMobile();
  };

  const sidebarContent = (
    <aside
      dir="ltr"
      className="w-64 h-full bg-canvas-elevated border-e border-stroke flex flex-col justify-between select-none"
    >
      <div className="p-3 space-y-5 overflow-y-auto">
        {/* Diagnostics Group */}
        <div>
          <div className="px-2.5 mb-2 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
            <span dir={proseDir}>{t.nav.sectionDiagnostics}</span>
          </div>
          <nav className="space-y-1">
            {diagnosticItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeModule === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleSelect(item.key)}
                  className={`relative w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-colors ${
                    isActive
                      ? "text-ink"
                      : "text-ink-secondary hover:text-ink hover:bg-canvas-subtle/70"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="sidebarActivePill"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      className="absolute inset-0 rounded-lg bg-cyan-500/15 border border-cyan-500/30"
                    />
                  )}
                  <Icon
                    className={`relative z-10 w-4 h-4 shrink-0 ${
                      isActive ? "text-cyan-500" : "text-ink-muted"
                    }`}
                  />
                  <div className="relative z-10 min-w-0 flex-1 text-left">
                    <div className="text-xs font-semibold truncate">
                      <span dir={proseDir}>{item.label}</span>
                    </div>
                    <div className="text-[10px] text-ink-muted truncate mt-0.5">
                      <span dir={proseDir}>{item.sub}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Workspace Group */}
        <div>
          <div className="px-2.5 mb-2 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
            <span dir={proseDir}>{t.nav.sectionWorkspace}</span>
          </div>
          <button
            type="button"
            onClick={() => handleSelect("history")}
            className={`relative w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-colors ${
              activeModule === "history"
                ? "text-ink"
                : "text-ink-secondary hover:text-ink hover:bg-canvas-subtle/70"
            }`}
          >
            {activeModule === "history" && (
              <motion.div
                layoutId="sidebarActivePill"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-lg bg-cyan-500/15 border border-cyan-500/30"
              />
            )}
            <History
              className={`relative z-10 w-4 h-4 shrink-0 ${
                activeModule === "history" ? "text-cyan-500" : "text-ink-muted"
              }`}
            />
            <div className="relative z-10 min-w-0 flex-1 text-left">
              <div className="text-xs font-semibold truncate">
                <span dir={proseDir}>{t.nav.history}</span>
              </div>
              <div className="text-[10px] text-ink-muted truncate mt-0.5">
                <span dir={proseDir}>{t.nav.historyShort}</span>
              </div>
            </div>
            {historyCount > 0 && (
              <span className="relative z-10 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-canvas border border-stroke text-cyan-500 ltr-data">
                {historyCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Live Local Hardware Mini-Monitor */}
      <div className="p-3 border-t border-stroke bg-canvas-subtle/40">
        <button
          type="button"
          onClick={() => handleSelect("system")}
          className="w-full text-left p-3 rounded-xl bg-canvas border border-stroke hover:border-cyan-500/35 transition-colors space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
              <Activity className="w-3 h-3 text-emerald-500" />
              {t.system.hostVitals}
            </span>
            <span className="text-[10px] font-mono text-ink-muted truncate max-w-[100px] inline-block ltr-data">
              {systemCloudDisabled
                ? t.system.desktopOnlyBadge
                : (systemTelemetry?.hostname ?? t.system.localHost)}
            </span>
          </div>

          {systemCloudDisabled ? (
            <div className="text-[11px] text-ink-secondary py-1">
              {t.system.desktopOnlyBadge}
            </div>
          ) : (
            <div className="space-y-1.5">
              <div>
                <div className="flex justify-between text-[10px] font-mono mb-0.5">
                  <span className="text-ink-muted">{t.system.cpuShort}</span>
                  <span className="text-cyan-500 font-semibold inline-block ltr-data">
                    {systemTelemetry ? `${systemTelemetry.cpu.usagePercent}%` : "—"}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-canvas-subtle overflow-hidden">
                  <div
                    className="h-full rounded-full bg-cyan-500 transition-all duration-500"
                    style={{
                      width: `${Math.min(100, systemTelemetry?.cpu.usagePercent ?? 0)}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[10px] font-mono mb-0.5">
                  <span className="text-ink-muted">{t.system.ramShort}</span>
                  <span className="text-emerald-500 font-semibold inline-block ltr-data">
                    {systemTelemetry ? `${systemTelemetry.memory.usagePercent}%` : "—"}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-canvas-subtle overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{
                      width: `${Math.min(100, systemTelemetry?.memory.usagePercent ?? 0)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop Permanent Sidebar */}
      <div className="no-print hidden lg:block h-full shrink-0">{sidebarContent}</div>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="no-print lg:hidden fixed inset-0 z-40 flex">
          <div className="relative z-10 h-full">{sidebarContent}</div>
          <div
            className="flex-1 bg-slate-950/60 backdrop-blur-sm"
            onClick={onCloseMobile}
          />
        </div>
      )}
    </>
  );
});
