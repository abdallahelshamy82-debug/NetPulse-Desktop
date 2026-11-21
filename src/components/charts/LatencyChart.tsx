"use client";

import React, { useState } from "react";
import type { LatencyPulse } from "@/types/telemetry";

interface LatencyChartProps {
  pulses: LatencyPulse[];
  labels: {
    dns: string;
    tcp: string;
    tls: string;
    ttfb: string;
    pulse: string;
    ms: string;
    hoverInspect: string;
  };
}

export function LatencyChart({ pulses, labels }: LatencyChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [visibleSeries, setVisibleSeries] = useState({
    dns: true,
    tcp: true,
    tls: true,
    ttfb: true,
  });

  if (pulses.length === 0) return null;

  const width = 680;
  const height = 240;
  const padLeft = 48;
  const padRight = 22;
  const padTop = 20;
  const padBottom = 34;

  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const candidateValues: number[] = [];
  for (const p of pulses) {
    if (visibleSeries.dns && p.dnsMs !== null) candidateValues.push(p.dnsMs);
    if (visibleSeries.tcp && p.tcpMs !== null) candidateValues.push(p.tcpMs);
    if (visibleSeries.tls && p.tlsMs !== null) candidateValues.push(p.tlsMs);
    if (visibleSeries.ttfb && p.ttfbMs !== null) candidateValues.push(p.ttfbMs);
  }
  const maxDataVal = Math.max(10, ...candidateValues);
  const yMax = Math.ceil((maxDataVal * 1.18) / 10) * 10;

  const xPos = (idx: number) =>
    pulses.length === 1
      ? padLeft + plotWidth / 2
      : padLeft + (idx / (pulses.length - 1)) * plotWidth;

  const yPos = (val: number) => padTop + plotHeight - (val / yMax) * plotHeight;

  const buildPath = (extractor: (p: LatencyPulse) => number | null) => {
    const segments: string[] = [];
    let drawing = false;
    pulses.forEach((p, i) => {
      const val = extractor(p);
      if (val === null || !Number.isFinite(val)) {
        drawing = false;
        return;
      }
      segments.push(`${drawing ? "L" : "M"} ${xPos(i).toFixed(1)} ${yPos(val).toFixed(1)}`);
      drawing = true;
    });
    return segments.join(" ");
  };

  const buildArea = (extractor: (p: LatencyPulse) => number | null) => {
    const areas: string[] = [];
    const bottomY = (padTop + plotHeight).toFixed(1);
    let run: { x: number; y: number }[] = [];

    const flush = () => {
      if (run.length >= 2) {
        const line = run
          .map((pt, k) => `${k === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
          .join(" ");
        areas.push(
          `${line} L ${run[run.length - 1].x.toFixed(1)} ${bottomY} L ${run[0].x.toFixed(1)} ${bottomY} Z`
        );
      }
      run = [];
    };

    pulses.forEach((p, i) => {
      const val = extractor(p);
      if (val === null || !Number.isFinite(val)) {
        flush();
      } else {
        run.push({ x: xPos(i), y: yPos(val) });
      }
    });
    flush();
    return areas.join(" ");
  };

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(yMax * t));
  const activePulse = hoveredIdx !== null ? pulses[hoveredIdx] : null;

  const fmtMs = (v: number | null) => (v !== null ? `${v}ms` : "—");

  const ttfbArea = visibleSeries.ttfb ? buildArea((p) => p.ttfbMs) : "";
  const tcpArea = visibleSeries.tcp ? buildArea((p) => p.tcpMs) : "";
  const ttfbPath = visibleSeries.ttfb ? buildPath((p) => p.ttfbMs) : "";
  const tlsPath = visibleSeries.tls ? buildPath((p) => p.tlsMs) : "";
  const tcpPath = visibleSeries.tcp ? buildPath((p) => p.tcpMs) : "";
  const dnsPath = visibleSeries.dns ? buildPath((p) => p.dnsMs) : "";

  return (
    <div className="w-full">
      {/* Interactive Series Toggles */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setVisibleSeries((s) => ({ ...s, ttfb: !s.ttfb }))}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
              visibleSeries.ttfb
                ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300"
                : "border-stroke bg-canvas-subtle text-ink-muted opacity-60"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
            <span dir="auto">{labels.ttfb}</span>
          </button>

          <button
            type="button"
            onClick={() => setVisibleSeries((s) => ({ ...s, tls: !s.tls }))}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
              visibleSeries.tls
                ? "border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-300"
                : "border-stroke bg-canvas-subtle text-ink-muted opacity-60"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-violet-400" />
            <span dir="auto">{labels.tls}</span>
          </button>

          <button
            type="button"
            onClick={() => setVisibleSeries((s) => ({ ...s, tcp: !s.tcp }))}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
              visibleSeries.tcp
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                : "border-stroke bg-canvas-subtle text-ink-muted opacity-60"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span dir="auto">{labels.tcp}</span>
          </button>

          <button
            type="button"
            onClick={() => setVisibleSeries((s) => ({ ...s, dns: !s.dns }))}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
              visibleSeries.dns
                ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300"
                : "border-stroke bg-canvas-subtle text-ink-muted opacity-60"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span dir="auto">{labels.dns}</span>
          </button>
        </div>

        {/* Live Hover Readout */}
        <div className="h-6 flex items-center text-xs font-mono">
          {activePulse ? (
            <div className="flex items-center gap-2.5 px-2.5 py-0.5 rounded bg-canvas-subtle border border-stroke ltr-data">
              <span className="text-ink-muted font-semibold">#{activePulse.index}</span>
              <span className="text-amber-500">DNS {fmtMs(activePulse.dnsMs)}</span>
              <span className="text-emerald-500">TCP {fmtMs(activePulse.tcpMs)}</span>
              <span className="text-violet-400">TLS {fmtMs(activePulse.tlsMs)}</span>
              <span className="text-cyan-500">TTFB {fmtMs(activePulse.ttfbMs)}</span>
            </div>
          ) : (
            <span dir="auto" className="text-ink-muted text-[11px] font-sans">
              {labels.hoverInspect}
            </span>
          )}
        </div>
      </div>

      {/* SVG Telemetry Chart */}
      <div className="w-full overflow-x-auto ltr-data">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto min-w-[460px] select-none"
          onMouseLeave={() => setHoveredIdx(null)}
        >
          <defs>
            <linearGradient id="ttfbGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#06B6D4" stopOpacity="0.01" />
            </linearGradient>
            <linearGradient id="tcpGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Horizontal Gridlines & Y Axis Labels */}
          {yTicks.map((tick) => {
            const y = yPos(tick);
            return (
              <g key={tick}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="currentColor"
                  className="text-stroke"
                  strokeDasharray="3 4"
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-ink-muted text-[10px] font-mono"
                >
                  {tick}ms
                </text>
              </g>
            );
          })}

          {/* Area Fills */}
          {ttfbArea && <path d={ttfbArea} fill="url(#ttfbGrad)" />}
          {tcpArea && <path d={tcpArea} fill="url(#tcpGrad)" />}

          {/* Series Lines */}
          {ttfbPath && (
            <path
              d={ttfbPath}
              fill="none"
              stroke="#06B6D4"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {tlsPath && (
            <path
              d={tlsPath}
              fill="none"
              stroke="#8B5CF6"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {tcpPath && (
            <path
              d={tcpPath}
              fill="none"
              stroke="#10B981"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {dnsPath && (
            <path
              d={dnsPath}
              fill="none"
              stroke="#F59E0B"
              strokeWidth="2"
              strokeDasharray="5 3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Hover Vertical Crosshair */}
          {hoveredIdx !== null && (
            <line
              x1={xPos(hoveredIdx)}
              y1={padTop}
              x2={xPos(hoveredIdx)}
              y2={padTop + plotHeight}
              stroke="#06B6D4"
              strokeOpacity="0.45"
              strokeWidth="1.2"
            />
          )}

          {/* Data Points & X Axis Labels */}
          {pulses.map((p, idx) => {
            const cx = xPos(idx);
            const isHovered = hoveredIdx === idx;
            return (
              <g key={p.index}>
                <text
                  x={cx}
                  y={height - 10}
                  textAnchor="middle"
                  className={`text-[10px] font-mono ${
                    !p.ok
                      ? "fill-rose-500 font-bold"
                      : isHovered
                        ? "fill-cyan-400 font-bold"
                        : "fill-ink-muted"
                  }`}
                >
                  #{p.index}
                </text>

                {visibleSeries.ttfb && p.ttfbMs !== null && (
                  <circle
                    cx={cx}
                    cy={yPos(p.ttfbMs)}
                    r={isHovered ? 5 : 3.5}
                    fill="#06B6D4"
                    stroke="var(--bg-elevated)"
                    strokeWidth="1.8"
                  />
                )}
                {visibleSeries.tls && p.tlsMs !== null && (
                  <circle
                    cx={cx}
                    cy={yPos(p.tlsMs)}
                    r={isHovered ? 4.8 : 3.2}
                    fill="#8B5CF6"
                    stroke="var(--bg-elevated)"
                    strokeWidth="1.6"
                  />
                )}
                {visibleSeries.tcp && p.tcpMs !== null && (
                  <circle
                    cx={cx}
                    cy={yPos(p.tcpMs)}
                    r={isHovered ? 5 : 3.5}
                    fill="#10B981"
                    stroke="var(--bg-elevated)"
                    strokeWidth="1.8"
                  />
                )}
                {visibleSeries.dns && p.dnsMs !== null && (
                  <circle
                    cx={cx}
                    cy={yPos(p.dnsMs)}
                    r={isHovered ? 4.5 : 3}
                    fill="#F59E0B"
                    stroke="var(--bg-elevated)"
                    strokeWidth="1.5"
                  />
                )}

                {/* Wide Invisible Hit Column */}
                <rect
                  x={cx - plotWidth / Math.max(2, pulses.length * 2)}
                  y={padTop}
                  width={plotWidth / Math.max(1, pulses.length)}
                  height={plotHeight}
                  fill="transparent"
                  className="cursor-crosshair"
                  onMouseEnter={() => setHoveredIdx(idx)}
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
