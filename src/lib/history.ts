import type { ScanHistoryEntry } from "@/types/telemetry";

const STORAGE_KEY = "netpulse_desktop_history_v1";
const MAX_ENTRIES = 50;

export function loadScanHistory(): ScanHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ScanHistoryEntry[];
  } catch {
    return [];
  }
}

export function saveScanHistoryEntry(entry: ScanHistoryEntry): ScanHistoryEntry[] {
  const existing = loadScanHistory();
  const next = [entry, ...existing.filter((item) => item.id !== entry.id)].slice(0, MAX_ENTRIES);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage quota fallback: trim older entries
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, 15)));
      } catch {
        // Ignore quota failure
      }
    }
  }
  return next;
}

export function deleteScanHistoryEntry(id: string): ScanHistoryEntry[] {
  const existing = loadScanHistory();
  const next = existing.filter((item) => item.id !== id);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore
    }
  }
  return next;
}

export function clearScanHistory(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}
