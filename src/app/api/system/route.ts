import { NextRequest, NextResponse } from "next/server";
import os from "os";
import fs from "fs";
import path from "path";
import { spawn, type ChildProcess } from "child_process";
import type {
  CpuCoreTelemetry,
  DiskTelemetry,
  NetworkInterfaceEntry,
  NetworkThroughputTelemetry,
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

let pdhChild: ChildProcess | null = null;
let pdhColRoles: string[] = [];
let pdhBuffer = "";
let pdhState: {
  cpuUtility: number | null;
  cpuPerfPercent: number | null;
  rxBytesPerSec: number | null;
  txBytesPerSec: number | null;
  lastUpdatedAt: number;
} = {
  cpuUtility: null,
  cpuPerfPercent: null,
  rxBytesPerSec: null,
  txBytesPerSec: null,
  lastUpdatedAt: 0,
};

let prevLinuxNet: { rxBytes: number; txBytes: number; at: number } | null = null;

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

function splitCsvRow(line: string): string[] {
  const cells: string[] = [];
  const regex = /"([^"]*)"|([^,]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(line)) !== null) {
    cells.push((match[1] !== undefined ? match[1] : (match[2] ?? "")).trim());
  }
  return cells;
}

function parsePdhNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const normalized = /^\d+,\d+$/.test(raw) ? raw.replace(",", ".") : raw;
  const num = Number(normalized);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

function ensureLocalWindowsPdh() {
  if (
    process.platform !== "win32" ||
    process.env.ELECTRON_RUN_AS_NODE === "1" ||
    pdhChild
  ) {
    return;
  }

  try {
    const sysRoot = process.env.SystemRoot || "C:\\Windows";
    const tpPath = path.join(sysRoot, "System32", "typeperf.exe");
    const bin = fs.existsSync(tpPath) ? tpPath : "typeperf";

    pdhColRoles = [];
    const child = spawn(
      bin,
      [
        "\\Processor Information(_Total)\\% Processor Utility",
        "\\Processor Information(_Total)\\% Processor Performance",
        "\\Network Interface(*)\\Bytes Received/sec",
        "\\Network Interface(*)\\Bytes Sent/sec",
        "-si",
        "2",
      ],
      {
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
      }
    );
    child.unref();
    pdhChild = child;

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      pdhBuffer += chunk;
      const lines = pdhBuffer.split(/\r?\n/);
      pdhBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const cells = splitCsvRow(trimmed);
        if (cells.length < 2) continue;
        if (cells[0].includes("PDH-CSV")) {
          pdhColRoles = cells.map((h, idx) => {
            if (idx === 0) return "timestamp";
            const low = h.toLowerCase();
            if (low.endsWith("\\% processor utility")) return "cpuUtility";
            if (low.endsWith("\\% processor performance")) return "cpuPerf";
            const ignored = /loopback|isatap|teredo/i.test(low);
            if (!ignored && low.endsWith("\\bytes received/sec")) return "netRx";
            if (!ignored && low.endsWith("\\bytes sent/sec")) return "netTx";
            return "ignore";
          });
          continue;
        }
        let util: number | null = null;
        let perf: number | null = null;
        let rxSum = 0;
        let txSum = 0;
        let sawNet = false;
        for (let i = 1; i < cells.length && i < pdhColRoles.length; i++) {
          const role = pdhColRoles[i];
          if (role === "ignore") continue;
          const v = parsePdhNumber(cells[i]);
          if (v === null) continue;
          if (role === "cpuUtility") util = Number(Math.min(100, Math.max(0, v)).toFixed(1));
          else if (role === "cpuPerf") perf = v > 0 ? v : null;
          else if (role === "netRx") {
            rxSum += v;
            sawNet = true;
          } else if (role === "netTx") {
            txSum += v;
            sawNet = true;
          }
        }
        if (util !== null || sawNet) {
          pdhState = {
            cpuUtility: util ?? pdhState.cpuUtility,
            cpuPerfPercent: perf ?? pdhState.cpuPerfPercent,
            rxBytesPerSec: sawNet ? Math.round(rxSum) : pdhState.rxBytesPerSec,
            txBytesPerSec: sawNet ? Math.round(txSum) : pdhState.txBytesPerSec,
            lastUpdatedAt: Date.now(),
          };
        }
      }
    });

    child.on("error", () => {
      if (pdhChild === child) pdhChild = null;
    });
    child.on("exit", () => {
      if (pdhChild === child) pdhChild = null;
    });
  } catch {
    pdhChild = null;
  }
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

async function getDiskStats(): Promise<DiskTelemetry | null> {
  try {
    if (typeof fs.promises.statfs !== "function") return null;
    const mount =
      os.platform() === "win32" ? `${process.env.SystemDrive || "C:"}\\` : "/";
    const stat = await fs.promises.statfs(mount);
    const totalBytes = Number(stat.bsize) * Number(stat.blocks);
    const freeBytes = Number(stat.bsize) * Number(stat.bavail ?? stat.bfree);
    if (!Number.isFinite(totalBytes) || totalBytes <= 0) return null;
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    const usagePercent = Number(((usedBytes / totalBytes) * 100).toFixed(1));
    return {
      mount: os.platform() === "win32" ? mount.replace(/\\$/, "") : mount,
      totalBytes,
      usedBytes,
      freeBytes,
      usagePercent,
    };
  } catch {
    return null;
  }
}

async function sampleLinuxNetworkThroughput(): Promise<NetworkThroughputTelemetry | null> {
  if (os.platform() !== "linux") return null;
  try {
    const raw = await fs.promises.readFile("/proc/net/dev", "utf8");
    const lines = raw.split(/\r?\n/).slice(2);
    let rxBytes = 0;
    let txBytes = 0;
    for (const line of lines) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const iface = line.slice(0, idx).trim();
      if (!iface || iface === "lo") continue;
      const cols = line.slice(idx + 1).trim().split(/\s+/);
      if (cols.length >= 9) {
        rxBytes += Number(cols[0]) || 0;
        txBytes += Number(cols[8]) || 0;
      }
    }
    const now = Date.now();
    if (!prevLinuxNet) {
      prevLinuxNet = { rxBytes, txBytes, at: now };
      return { rxBytesPerSec: 0, txBytesPerSec: 0 };
    }
    const elapsedSec = (now - prevLinuxNet.at) / 1000;
    if (elapsedSec <= 0.2) {
      return { rxBytesPerSec: 0, txBytesPerSec: 0 };
    }
    const rxRate = Math.max(0, Math.round((rxBytes - prevLinuxNet.rxBytes) / elapsedSec));
    const txRate = Math.max(0, Math.round((txBytes - prevLinuxNet.txBytes) / elapsedSec));
    prevLinuxNet = { rxBytes, txBytes, at: now };
    return { rxBytesPerSec: rxRate, txBytesPerSec: txRate };
  } catch {
    return null;
  }
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
    ensureLocalWindowsPdh();

    const [cpuSample, memory, disk, linuxNet] = await Promise.all([
      sampleContinuousCpuUsage(),
      getMemoryStats(),
      getDiskStats(),
      sampleLinuxNetworkThroughput(),
    ]);
    const cpus = os.cpus();
    const baseSpeedMhz = cpus[0]?.speed || 0;
    const platform = os.platform();
    const pdhFresh =
      platform === "win32" &&
      pdhState.cpuUtility !== null &&
      Date.now() - pdhState.lastUpdatedAt < 6500;

    const usagePercent = pdhFresh
      ? (pdhState.cpuUtility ?? cpuSample.overallPercent)
      : cpuSample.overallPercent;
    const metricSource = pdhFresh ? "windows-pdh" : "os-delta";
    const currentSpeedMhz =
      pdhFresh && pdhState.cpuPerfPercent !== null && baseSpeedMhz > 0
        ? Math.round(baseSpeedMhz * (pdhState.cpuPerfPercent / 100))
        : baseSpeedMhz || null;

    const networkThroughput: NetworkThroughputTelemetry | null =
      pdhFresh && pdhState.rxBytesPerSec !== null && pdhState.txBytesPerSec !== null
        ? {
            rxBytesPerSec: pdhState.rxBytesPerSec,
            txBytesPerSec: pdhState.txBytesPerSec,
          }
        : linuxNet;

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
        speedMhz: baseSpeedMhz,
        currentSpeedMhz,
        usagePercent,
        metricSource,
        loadAvg,
        perCore: cpuSample.perCore,
      },
      memory,
      disk,
      networkThroughput,
      networkInterfaces: collectNetworkInterfaces(),
    };

    return NextResponse.json(payload);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to collect local OS hardware telemetry.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
