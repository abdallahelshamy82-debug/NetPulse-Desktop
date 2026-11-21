import { NextRequest, NextResponse } from "next/server";
import os from "os";
import fs from "fs";
import type {
  CpuCoreTelemetry,
  NetworkInterfaceEntry,
  SystemTelemetryResult,
} from "@/types/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CpuSnapshot {
  idle: number;
  total: number;
  model: string;
  speed: number;
}

interface CpuDeltaResult {
  overallPercent: number;
  perCore: CpuCoreTelemetry[];
}

let prevCpuSnapshot: CpuSnapshot[] | null = null;
let lastCpuResult: CpuDeltaResult | null = null;

function snapshotCpus(): CpuSnapshot[] {
  return os.cpus().map((cpu) => {
    const { user, nice, sys, idle, irq } = cpu.times;
    return {
      idle,
      total: user + nice + sys + idle + irq,
      model: cpu.model.trim(),
      speed: cpu.speed,
    };
  });
}

function computeCpuDelta(start: CpuSnapshot[], end: CpuSnapshot[]): CpuDeltaResult {
  let totalIdleDiff = 0;
  let totalTickDiff = 0;

  const perCore: CpuCoreTelemetry[] = end.map((cur, idx) => {
    const prev = start[idx] ?? cur;
    const idleDiff = Math.max(0, cur.idle - prev.idle);
    const totalDiff = Math.max(0, cur.total - prev.total);

    totalIdleDiff += idleDiff;
    totalTickDiff += totalDiff;

    const usage =
      totalDiff > 0
        ? Math.min(100, Math.max(0, ((totalDiff - idleDiff) / totalDiff) * 100))
        : (lastCpuResult?.perCore[idx]?.usagePercent ?? 0);

    return {
      core: idx + 1,
      model: cur.model,
      speedMhz: cur.speed,
      usagePercent: Number(usage.toFixed(1)),
    };
  });

  if (totalTickDiff === 0 && lastCpuResult) {
    return lastCpuResult;
  }

  const overall =
    totalTickDiff > 0
      ? Math.min(100, Math.max(0, ((totalTickDiff - totalIdleDiff) / totalTickDiff) * 100))
      : 0;

  return {
    overallPercent: Number(overall.toFixed(1)),
    perCore,
  };
}

async function sampleContinuousCpuUsage(): Promise<CpuDeltaResult> {
  if (!prevCpuSnapshot) {
    const start = snapshotCpus();
    await new Promise<void>((resolve) => setTimeout(resolve, 350));
    const end = snapshotCpus();
    prevCpuSnapshot = end;
    lastCpuResult = computeCpuDelta(start, end);
    return lastCpuResult;
  }

  const end = snapshotCpus();
  const result = computeCpuDelta(prevCpuSnapshot, end);
  prevCpuSnapshot = end;
  lastCpuResult = result;
  return result;
}

async function getMemoryStats() {
  const totalBytes = os.totalmem();
  let availableBytes = os.freemem();

  if (os.platform() === "linux") {
    try {
      const meminfo = await fs.promises.readFile("/proc/meminfo", "utf8");
      const match = /^MemAvailable:\s+(\d+)\s+kB/m.exec(meminfo);
      if (match) {
        availableBytes = Number(match[1]) * 1024;
      }
    } catch {
      // Fallback to os.freemem()
    }
  }

  const usedBytes = Math.max(0, totalBytes - availableBytes);
  const usagePercent = totalBytes > 0 ? Number(((usedBytes / totalBytes) * 100).toFixed(1)) : 0;
  const procMem = process.memoryUsage();

  return {
    totalBytes,
    usedBytes,
    freeBytes: availableBytes,
    availableBytes,
    usagePercent,
    processRssBytes: procMem.rss,
    processHeapUsedBytes: procMem.heapUsed,
    appWorkingSetBytes: null,
  };
}

function collectNetworkInterfaces(): NetworkInterfaceEntry[] {
  const rawMap = os.networkInterfaces();
  const entries: NetworkInterfaceEntry[] = [];

  for (const [name, addresses] of Object.entries(rawMap)) {
    if (!addresses || addresses.length === 0) continue;

    const ipv4: string[] = [];
    const ipv6: string[] = [];
    const cidr: string[] = [];
    const netmask: string[] = [];
    let mac = "00:00:00:00:00:00";
    let internal = true;

    for (const addr of addresses) {
      if (addr.mac && addr.mac !== "00:00:00:00:00:00") {
        mac = addr.mac;
      }
      if (!addr.internal) {
        internal = false;
      }
      if (addr.family === "IPv4") {
        ipv4.push(addr.address);
        if (addr.cidr) cidr.push(addr.cidr);
        if (addr.netmask) netmask.push(addr.netmask);
      } else if (addr.family === "IPv6") {
        ipv6.push(addr.address);
      }
    }

    entries.push({
      name,
      mac,
      ipv4,
      ipv6,
      cidr,
      netmask,
      internal,
    });
  }

  // Sort external interfaces with IPv4 addresses first
  return entries.sort((a, b) => {
    if (a.internal !== b.internal) return a.internal ? 1 : -1;
    if ((a.ipv4.length > 0) !== (b.ipv4.length > 0)) return a.ipv4.length > 0 ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export async function GET(req: NextRequest) {
  if (process.env.VERCEL === "1" || process.env.NETPULSE_CLOUD_MODE === "1") {
    return NextResponse.json(
      {
        available: false,
        mode: "cloud-disabled",
        error: "Local hardware telemetry is only available in NetPulse Desktop.",
      },
      { status: 403 }
    );
  }

  if (req.nextUrl.searchParams.get("rssOnly") === "1") {
    return NextResponse.json({ rssBytes: process.memoryUsage().rss });
  }

  try {
    const [cpuSample, memory] = await Promise.all([
      sampleContinuousCpuUsage(),
      getMemoryStats(),
    ]);
    const cpus = os.cpus();
    const platform = os.platform();
    const rawLoad = os.loadavg();
    const loadAvg: [number, number, number] | null =
      platform === "win32"
        ? null
        : [
            Number((rawLoad[0] ?? 0).toFixed(2)),
            Number((rawLoad[1] ?? 0).toFixed(2)),
            Number((rawLoad[2] ?? 0).toFixed(2)),
          ];

    const payload: SystemTelemetryResult = {
      timestamp: new Date().toISOString(),
      hostname: os.hostname(),
      platform,
      osType: os.type(),
      release: os.release(),
      version: typeof os.version === "function" ? os.version() : os.release(),
      arch: os.arch(),
      uptimeSeconds: Math.floor(os.uptime()),
      nodeVersion: process.version,
      cpu: {
        model: cpus[0]?.model.trim() || "Unknown Processor",
        coresCount: cpus.length,
        speedMhz: cpus[0]?.speed || 0,
        usagePercent: cpuSample.overallPercent,
        metricSource: "os-delta",
        loadAvg,
        perCore: cpuSample.perCore,
      },
      memory,
      networkInterfaces: collectNetworkInterfaces(),
    };

    return NextResponse.json(payload);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to collect local OS hardware telemetry.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
