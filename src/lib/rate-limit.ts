import { NextRequest, NextResponse } from "next/server";
import { isCloudEnvironment } from "@/lib/network-guard";

interface BucketEntry {
  timestamps: number[];
}

const WINDOW_MS = 60_000;
const MAX_TRACKED_KEYS = 1500;
const buckets = new Map<string, BucketEntry>();

function extractClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 64);
  return "anonymous";
}

function pruneStaleEntries(now: number) {
  if (buckets.size <= MAX_TRACKED_KEYS) return;
  for (const [key, entry] of buckets.entries()) {
    const active = entry.timestamps.filter((t) => now - t < WINDOW_MS);
    if (active.length === 0) {
      buckets.delete(key);
    } else {
      entry.timestamps = active;
    }
    if (buckets.size <= MAX_TRACKED_KEYS * 0.75) break;
  }
}

export function enforceCloudRateLimit(
  req: NextRequest,
  scope: "audit" | "dns" | "ports",
  maxPerMinute: number
): NextResponse | null {
  if (!isCloudEnvironment()) {
    return null;
  }

  const now = Date.now();
  pruneStaleEntries(now);

  const clientIp = extractClientIp(req);
  const key = `${scope}:${clientIp}`;
  const existing = buckets.get(key);
  const recent = existing ? existing.timestamps.filter((t) => now - t < WINDOW_MS) : [];

  if (recent.length >= maxPerMinute) {
    const oldest = recent[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000));
    return NextResponse.json(
      {
        error: `Rate limit exceeded (${maxPerMinute} requests/min on cloud demo). Please wait ${retryAfterSec}s or use NetPulse Desktop locally for unlimited scans.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSec),
        },
      }
    );
  }

  recent.push(now);
  buckets.set(key, { timestamps: recent });
  return null;
}
