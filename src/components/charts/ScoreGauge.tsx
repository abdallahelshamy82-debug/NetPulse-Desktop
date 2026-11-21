"use client";

import React from "react";
import { motion } from "framer-motion";
import type { SecurityGrade } from "@/types/telemetry";

interface ScoreGaugeProps {
  score: number;
  grade: SecurityGrade;
  label: string;
}

export function getGradePalette(grade: SecurityGrade): {
  stroke: string;
  text: string;
  bg: string;
  border: string;
} {
  if (grade === "A+" || grade === "A" || grade === "A-") {
    return {
      stroke: "#10B981",
      text: "text-emerald-500 dark:text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
    };
  }
  if (grade === "B+" || grade === "B") {
    return {
      stroke: "#06B6D4",
      text: "text-cyan-600 dark:text-cyan-400",
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/30",
    };
  }
  if (grade === "C") {
    return {
      stroke: "#F59E0B",
      text: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
    };
  }
  return {
    stroke: "#F43F5E",
    text: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/30",
  };
}

export function ScoreGauge({ score, grade, label }: ScoreGaugeProps) {
  const palette = getGradePalette(grade);
  const clampedScore = Math.max(0, Math.min(100, score));
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const arcFraction = 0.72; // 260-degree sweep
  const arcLength = circumference * arcFraction;
  const fillLength = (clampedScore / 100) * arcLength;

  return (
    <div className="relative flex flex-col items-center justify-center">
      <div className="relative w-44 h-40 flex items-center justify-center">
        <svg viewBox="0 0 160 160" className="w-full h-full overflow-visible">
          <defs>
            <filter id="gaugeGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Background Track */}
          <circle
            cx="80"
            cy="84"
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-stroke"
            strokeWidth="11"
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${circumference}`}
            transform="rotate(140 80 84)"
          />
          {/* Animated Score Arc */}
          <motion.circle
            cx="80"
            cy="84"
            r={radius}
            fill="none"
            stroke={palette.stroke}
            strokeWidth="11"
            strokeLinecap="round"
            filter="url(#gaugeGlow)"
            strokeDasharray={`${arcLength} ${circumference}`}
            initial={{ strokeDashoffset: arcLength }}
            animate={{ strokeDashoffset: arcLength - fillLength }}
            transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
            transform="rotate(140 80 84)"
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
          <motion.span
            key={grade}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.35 }}
            className={`text-4xl font-bold font-mono tracking-tight ${palette.text}`}
          >
            {grade}
          </motion.span>
          <span className="mt-0.5 text-sm font-mono font-semibold text-ink ltr-data">
            {clampedScore}
            <span className="text-ink-muted text-xs"> / 100</span>
          </span>
          <span className="mt-1 text-[11px] font-medium text-ink-muted">{label}</span>
        </div>
      </div>
    </div>
  );
}
