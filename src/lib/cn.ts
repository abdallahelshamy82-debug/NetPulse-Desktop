import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const k = 1024;
  const dm = Math.max(0, decimals);
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  if (i === 0) return `${Math.round(bytes)} B`;
  return `${(bytes / Math.pow(k, i)).toFixed(dm)} ${sizes[i]}`;
}

export function formatByteRate(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return "0 B/s";
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
}

export function formatClockGhz(mhz: number): string {
  if (!Number.isFinite(mhz) || mhz <= 0) return "—";
  return `${(mhz / 1000).toFixed(2)} GHz`;
}

export function formatUptime(seconds: number, lang: "en" | "ar"): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (lang === "ar") {
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}ي`);
    if (hours > 0 || days > 0) parts.push(`${hours}س`);
    parts.push(`${mins}د`);
    if (days === 0) parts.push(`${secs}ث`);
    return parts.join(" ");
  }

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  if (days === 0) parts.push(`${secs}s`);
  return parts.join(" ");
}

export function formatDateTime(iso: string | null, lang: "en" | "ar"): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    const formatted = new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(date);
    return formatted.replace(/\s+([صم]|AM|PM)(?=\s|$)/g, "\u00A0$1");
  } catch {
    return date.toISOString();
  }
}
