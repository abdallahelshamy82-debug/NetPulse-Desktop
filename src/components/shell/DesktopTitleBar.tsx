"use client";

import React, { useEffect, useState } from "react";
import {
  Minus,
  Square,
  Copy,
  X,
  Sun,
  Moon,
  Languages,
  FileText,
  Zap,
  Menu,
} from "lucide-react";
import type { Dictionary, Locale } from "@/lib/i18n";

interface DesktopTitleBarProps {
  t: Dictionary;
  lang: Locale;
  theme: "dark" | "light";
  isElectron: boolean;
  hasReportData: boolean;
  fullScanLoading: boolean;
  onToggleTheme: () => void;
  onToggleLang: () => void;
  onOpenReport: () => void;
  onRunFullSuite: () => void;
  onToggleMobileMenu: () => void;
}

export function DesktopTitleBar({
  t,
  lang,
  theme,
  isElectron,
  hasReportData,
  fullScanLoading,
  onToggleTheme,
  onToggleLang,
  onOpenReport,
  onRunFullSuite,
  onToggleMobileMenu,
}: DesktopTitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const proseDir = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    const api = typeof window !== "undefined" ? window.netpulseElectron : undefined;
    if (api) {
      api.isMaximized().then(setIsMaximized).catch(() => undefined);
      const unsub = api.onMaximizedChange((state) => setIsMaximized(state));
      return unsub;
    }

    const handleFullscreenChange = () => {
      if (!window.netpulseElectron) {
        setIsMaximized(Boolean(document.fullscreenElement));
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const handleMinimize = () => {
    if (window.netpulseElectron) {
      window.netpulseElectron.minimize();
    }
  };

  const handleMaximize = () => {
    if (window.netpulseElectron) {
      window.netpulseElectron.toggleMaximize().then(setIsMaximized).catch(() => undefined);
      return;
    }
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => undefined);
      setIsMaximized(true);
    } else {
      document.exitFullscreen?.().catch(() => undefined);
      setIsMaximized(false);
    }
  };

  const handleClose = () => {
    if (window.netpulseElectron) {
      window.netpulseElectron.close();
    }
  };

  return (
    <header
      dir="ltr"
      className="no-print h-11 shrink-0 bg-canvas-elevated border-b border-stroke flex items-center justify-between px-3 electron-drag select-none z-30"
    >
      {/* Start: App Branding & Runtime Mode */}
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={onToggleMobileMenu}
          className="lg:hidden electron-no-drag p-1.5 rounded-md hover:bg-canvas-subtle text-ink-secondary"
          aria-label="Toggle navigation"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Custom NetPulse Shield-Pulse Mark */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-500/40 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
              <path
                d="M12 2.5L19.5 5.8V11.5C19.5 16.5 16.2 20.1 12 21.5C7.8 20.1 4.5 16.5 4.5 11.5V5.8L12 2.5Z"
                stroke="#06B6D4"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
              <path
                d="M6.8 12.2H9.3L10.7 8.4L12.9 15.4L14.4 11.4H17.2"
                stroke="#22D3EE"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="font-bold text-xs sm:text-sm tracking-tight text-ink truncate">
            {t.appName}
          </span>
        </div>

        <span className="hidden md:inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/25">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span dir={proseDir}>{isElectron ? t.modeDesktop : t.modeWeb}</span>
        </span>

        <span className="hidden xl:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-canvas-subtle text-ink-muted border border-stroke">
          <span dir={proseDir}>{t.zeroMockBadge}</span>
        </span>
      </div>

      {/* End: Actions + Locale/Theme + Native Window Controls */}
      <div className="flex items-center gap-1.5 electron-no-drag">
        <button
          type="button"
          onClick={onRunFullSuite}
          disabled={fullScanLoading}
          className="hidden sm:inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-semibold bg-emerald-500/15 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 disabled:opacity-50 transition-colors"
        >
          <Zap className={`w-3 h-3 ${fullScanLoading ? "animate-pulse" : ""}`} />
          <span dir={proseDir}>{t.controls.runFullScan}</span>
        </button>

        {hasReportData && (
          <button
            type="button"
            onClick={onOpenReport}
            className="hidden md:inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-semibold bg-cyan-500/15 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/25 transition-colors"
          >
            <FileText className="w-3 h-3" />
            <span dir={proseDir}>{t.controls.exportReport}</span>
          </button>
        )}

        <div className="h-4 w-px bg-stroke mx-1 hidden sm:block" />

        {/* Language Toggle (RTL / LTR) */}
        <button
          type="button"
          onClick={onToggleLang}
          className="h-7 px-2.5 rounded-md bg-canvas-subtle hover:bg-stroke text-ink-secondary hover:text-ink border border-stroke text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors"
          title={lang === "en" ? "التبديل إلى العربية" : "Switch to English"}
        >
          <Languages className="w-3.5 h-3.5 text-cyan-500" />
          <span dir={proseDir}>{t.controls.switchLang}</span>
        </button>

        {/* Dark / Light Theme Toggle */}
        <button
          type="button"
          onClick={onToggleTheme}
          className="h-7 w-7 rounded-md bg-canvas-subtle hover:bg-stroke text-ink-secondary hover:text-ink border border-stroke inline-flex items-center justify-center transition-colors"
          title={t.controls.switchTheme}
          aria-label={t.controls.switchTheme}
        >
          {theme === "dark" ? (
            <Sun className="w-3.5 h-3.5 text-amber-400" />
          ) : (
            <Moon className="w-3.5 h-3.5 text-slate-700" />
          )}
        </button>

        <div className="h-4 w-px bg-stroke mx-1" />

        {/* Native Desktop Window Control Buttons */}
        <div className="flex items-center gap-0.5 ltr-data">
          <button
            type="button"
            onClick={handleMinimize}
            disabled={!isElectron}
            className="h-7 w-8 rounded-md hover:bg-canvas-subtle disabled:opacity-45 text-ink-secondary hover:text-ink inline-flex items-center justify-center transition-colors"
            title={t.controls.minimize}
            aria-label={t.controls.minimize}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleMaximize}
            className="h-7 w-8 rounded-md hover:bg-canvas-subtle text-ink-secondary hover:text-ink inline-flex items-center justify-center transition-colors"
            title={
              isElectron
                ? isMaximized
                  ? t.controls.restore
                  : t.controls.maximize
                : t.controls.fullscreen
            }
            aria-label={t.controls.maximize}
          >
            {isMaximized ? (
              <Copy className="w-3 h-3" />
            ) : (
              <Square className="w-3 h-3" />
            )}
          </button>
          <button
            type="button"
            onClick={handleClose}
            disabled={!isElectron}
            className="h-7 w-8 rounded-md hover:bg-rose-500 hover:text-white disabled:opacity-45 text-ink-secondary inline-flex items-center justify-center transition-colors"
            title={t.controls.close}
            aria-label={t.controls.close}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
