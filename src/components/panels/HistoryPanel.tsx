"use client";

import React, { useState } from "react";
import {
  History,
  ShieldCheck,
  Radar,
  Network,
  Trash2,
  ExternalLink,
  Clock,
} from "lucide-react";
import type { ScanHistoryEntry, ScanHistoryType } from "@/types/telemetry";
import type { Dictionary, Locale } from "@/lib/i18n";
import { formatDateTime } from "@/lib/cn";
import { getGradePalette } from "@/components/charts/ScoreGauge";

interface HistoryPanelProps {
  t: Dictionary;
  lang: Locale;
  entries: ScanHistoryEntry[];
  onLoadEntry: (entry: ScanHistoryEntry) => void;
  onDeleteEntry: (id: string) => void;
  onClearAll: () => void;
}

export function HistoryPanel({
  t,
  lang,
  entries,
  onLoadEntry,
  onDeleteEntry,
  onClearAll,
}: HistoryPanelProps) {
  const [filter, setFilter] = useState<"all" | ScanHistoryType>("all");
  const isAr = lang === "ar";
  const proseDir = isAr ? "rtl" : "ltr";

  const filtered =
    filter === "all" ? entries : entries.filter((entry) => entry.type === filter);

  const typeMeta = (type: ScanHistoryType) => {
    if (type === "audit") {
      return {
        label: t.history.filterAudit,
        icon: ShieldCheck,
        color: "bg-cyan-500/15 text-cyan-500 border-cyan-500/25",
      };
    }
    if (type === "dns") {
      return {
        label: t.history.filterDns,
        icon: Radar,
        color: "bg-emerald-500/15 text-emerald-500 border-emerald-500/25",
      };
    }
    return {
      label: t.history.filterPorts,
      icon: Network,
      color: "bg-blue-500/15 text-blue-500 border-blue-500/25",
    };
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-canvas-elevated border border-stroke p-5 shadow-panel flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h1 dir={proseDir} className="text-lg font-bold tracking-tight text-ink">
              {t.history.title}
            </h1>
            <p dir={proseDir} className="text-xs text-ink-secondary mt-0.5">
              {t.history.subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span dir={proseDir} className="text-xs font-mono text-ink-muted">
            <span className="inline-block ltr-data">{entries.length}</span>{" "}
            {t.history.entriesCount}
          </span>
          {entries.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/25 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span dir={proseDir}>{t.common.clearAll}</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", t.history.filterAll],
            ["audit", t.history.filterAudit],
            ["dns", t.history.filterDns],
            ["ports", t.history.filterPorts],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              filter === key
                ? "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/40"
                : "bg-canvas-elevated text-ink-secondary border-stroke hover:border-stroke-strong"
            }`}
          >
            <span dir={proseDir}>{label}</span>
          </button>
        ))}
      </div>

      {/* Entries */}
      {filtered.length === 0 ? (
        <div className="rounded-xl bg-canvas-elevated border border-dashed border-stroke-strong p-12 text-center">
          <History className="w-8 h-8 text-ink-muted mx-auto mb-3" />
          <h2 dir={proseDir} className="text-sm font-semibold text-ink">
            {t.history.emptyTitle}
          </h2>
          <p
            dir={proseDir}
            className="text-xs text-ink-secondary max-w-md mx-auto mt-1"
          >
            {t.history.emptyDesc}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((entry) => {
            const meta = typeMeta(entry.type);
            const Icon = meta.icon;
            return (
              <div
                key={entry.id}
                className="rounded-xl bg-canvas-elevated border border-stroke p-4 flex flex-wrap items-center justify-between gap-4 hover:border-stroke-strong transition-colors shadow-panel"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className={`p-2 rounded-lg border shrink-0 ${meta.color}`}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-sm text-ink ltr-data">
                        {entry.hostname}
                      </span>
                      <span
                        dir={proseDir}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${meta.color}`}
                      >
                        {meta.label}
                      </span>
                      {entry.grade && (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${getGradePalette(entry.grade).bg} ${getGradePalette(entry.grade).text} ${getGradePalette(entry.grade).border}`}
                        >
                          {entry.grade} ({entry.score}/100)
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-ink-secondary">
                      <span>{entry.summary}</span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-ink-muted">
                        <Clock className="w-3 h-3" />
                        {formatDateTime(entry.scannedAt, lang)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onLoadEntry(entry)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/15 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {t.common.loadResult}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteEntry(entry.id)}
                    className="p-1.5 rounded-lg bg-canvas-subtle hover:bg-rose-500/15 text-ink-muted hover:text-rose-500 border border-stroke transition-colors"
                    title={t.common.delete}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
