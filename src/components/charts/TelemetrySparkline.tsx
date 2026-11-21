"use client";

import React from "react";

export interface TelemetryPoint {
  timeLabel: string;
  cpu: number;
  ram: number;
}

interface TelemetrySparklineProps {
  points: TelemetryPoint[];
  cpuLabel: string;
  ramLabel: string;
}

export const TelemetrySparkline = React.memo(function TelemetrySparkline({
  points,
  cpuLabel,
  ramLabel,
}: TelemetrySparklineProps) {
  const width = 620;
  const height = 165;
  const padLeft = 38;
  const padRight = 14;
  const padTop = 14;
  const padBottom = 24;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const safePoints =
    points.length >= 2
      ? points
      : points.length === 1
        ? [points[0], points[0]]
        : [
            { timeLabel: "--:--", cpu: 0, ram: 0 },
            { timeLabel: "--:--", cpu: 0, ram: 0 },
          ];

  const xAt = (idx: number) => padLeft + (idx / (safePoints.length - 1)) * plotW;
  const yAt = (pct: number) =>
    padTop + plotH - (Math.min(100, Math.max(0, pct)) / 100) * plotH;

  const linePath = (key: "cpu" | "ram") =>
    safePoints
      .map((pt, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(pt[key]).toFixed(1)}`)
      .join(" ");

  const areaPath = (key: "cpu" | "ram") => {
    const base = linePath(key);
    const lastX = xAt(safePoints.length - 1).toFixed(1);
    const firstX = xAt(0).toFixed(1);
    const bottomY = (padTop + plotH).toFixed(1);
    return `${base} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-4 mb-2 text-xs">
        <span className="inline-flex items-center gap-1.5 text-cyan-500 font-medium">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
          <span dir="auto">{cpuLabel}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-emerald-500 font-medium">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          <span dir="auto">{ramLabel}</span>
        </span>
      </div>

      <div className="w-full overflow-x-auto ltr-data">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[400px]">
          <defs>
            <linearGradient id="cpuArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#06B6D4" stopOpacity="0.01" />
            </linearGradient>
            <linearGradient id="ramArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {[0, 25, 50, 75, 100].map((tick) => {
            const y = yAt(tick);
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
                  x={padLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-ink-muted text-[9px] font-mono"
                >
                  {tick}%
                </text>
              </g>
            );
          })}

          <path d={areaPath("ram")} fill="url(#ramArea)" />
          <path d={areaPath("cpu")} fill="url(#cpuArea)" />

          <path
            d={linePath("ram")}
            fill="none"
            stroke="#10B981"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d={linePath("cpu")}
            fill="none"
            stroke="#06B6D4"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />

          {/* First, middle, last timestamps */}
          {[0, Math.floor((safePoints.length - 1) / 2), safePoints.length - 1].map((idx, k) => (
            <text
              key={`${idx}-${k}`}
              x={xAt(idx)}
              y={height - 6}
              textAnchor={k === 0 ? "start" : k === 2 ? "end" : "middle"}
              className="fill-ink-muted text-[9px] font-mono"
            >
              {safePoints[idx]?.timeLabel}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
});
