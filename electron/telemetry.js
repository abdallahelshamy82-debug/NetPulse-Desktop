const os = require("os");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

let prevCpuSnapshot = null;
let lastCpuResult = null;

let typeperfProcess = null;
let pdhColRoles = [];
let pdhState = {
  cpuUtility: null,
  cpuPerfPercent: null,
  rxBytesPerSec: null,
  txBytesPerSec: null,
  lastUpdatedAt: 0,
};
let pdhLineBuffer = "";
let cachedServerRssBytes = 0;

let prevLinuxNet = null;

function snapshotCpus() {
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

function computeCpuDelta(start, end) {
  let totalIdleDiff = 0;
  let totalTickDiff = 0;

  const perCore = end.map((cur, idx) => {
    const prev = start[idx] || cur;
    const idleDiff = Math.max(0, cur.idle - prev.idle);
    const totalDiff = Math.max(0, cur.total - prev.total);

    totalIdleDiff += idleDiff;
    totalTickDiff += totalDiff;

    const usage =
      totalDiff > 0
        ? Math.min(100, Math.max(0, ((totalDiff - idleDiff) / totalDiff) * 100))
        : lastCpuResult && lastCpuResult.perCore[idx]
          ? lastCpuResult.perCore[idx].usagePercent
          : 0;

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

async function sampleCpuDelta() {
  if (!prevCpuSnapshot) {
    const start = snapshotCpus();
    await new Promise((resolve) => setTimeout(resolve, 350));
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

function splitCsvRow(line) {
  const cells = [];
  const regex = /"([^"]*)"|([^,]+)/g;
  let match;
  while ((match = regex.exec(line)) !== null) {
    cells.push((match[1] !== undefined ? match[1] : match[2] || "").trim());
  }
  return cells;
}

function parsePdhNumber(raw) {
  if (!raw) return null;
  const normalized = /^\d+,\d+$/.test(raw) ? raw.replace(",", ".") : raw;
  const num = Number(normalized);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

function processTypeperfLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return;

  const cells = splitCsvRow(trimmed);
  if (cells.length < 2) return;

  if (cells[0].includes("PDH-CSV")) {
    pdhColRoles = cells.map((header, idx) => {
      if (idx === 0) return "timestamp";
      const lower = header.toLowerCase();
      if (lower.endsWith("\\% processor utility")) return "cpuUtility";
      if (lower.endsWith("\\% processor performance")) return "cpuPerf";
      const ignoredAdapter = /loopback|isatap|teredo/i.test(lower);
      if (!ignoredAdapter && lower.endsWith("\\bytes received/sec")) return "netRx";
      if (!ignoredAdapter && lower.endsWith("\\bytes sent/sec")) return "netTx";
      return "ignore";
    });
    return;
  }

  if (pdhColRoles.length === 0) {
    // Fallback if header was missed: col 1 = utility, col 2 = perf
    const util = parsePdhNumber(cells[1]);
    if (util !== null) {
      pdhState = {
        ...pdhState,
        cpuUtility: Number(Math.min(100, Math.max(0, util)).toFixed(1)),
        lastUpdatedAt: Date.now(),
      };
    }
    return;
  }

  let cpuUtil = null;
  let cpuPerf = null;
  let rxSum = 0;
  let txSum = 0;
  let sawNet = false;

  for (let i = 1; i < cells.length && i < pdhColRoles.length; i++) {
    const role = pdhColRoles[i];
    if (role === "ignore") continue;
    const val = parsePdhNumber(cells[i]);
    if (val === null) continue;

    if (role === "cpuUtility") {
      cpuUtil = Number(Math.min(100, Math.max(0, val)).toFixed(1));
    } else if (role === "cpuPerf") {
      cpuPerf = val > 0 ? val : null;
    } else if (role === "netRx") {
      rxSum += val;
      sawNet = true;
    } else if (role === "netTx") {
      txSum += val;
      sawNet = true;
    }
  }

  if (cpuUtil !== null || sawNet) {
    pdhState = {
      cpuUtility: cpuUtil !== null ? cpuUtil : pdhState.cpuUtility,
      cpuPerfPercent: cpuPerf !== null ? cpuPerf : pdhState.cpuPerfPercent,
      rxBytesPerSec: sawNet ? Math.round(rxSum) : pdhState.rxBytesPerSec,
      txBytesPerSec: sawNet ? Math.round(txSum) : pdhState.txBytesPerSec,
      lastUpdatedAt: Date.now(),
    };
  }
}

function startWindowsPdhCollector() {
  if (process.platform !== "win32" || typeperfProcess) return;

  try {
    const systemRoot = process.env.SystemRoot || "C:\\Windows";
    const typeperfPath = path.join(systemRoot, "System32", "typeperf.exe");
    const typeperfBin = fs.existsSync(typeperfPath) ? typeperfPath : "typeperf";

    pdhColRoles = [];
    const child = spawn(
      typeperfBin,
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

    typeperfProcess = child;

    if (child.stdout) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        pdhLineBuffer += chunk;
        const lines = pdhLineBuffer.split(/\r?\n/);
        pdhLineBuffer = lines.pop() ?? "";

        for (const line of lines) {
          processTypeperfLine(line);
        }
      });
    }

    child.on("error", () => {
      if (typeperfProcess === child) {
        typeperfProcess = null;
      }
    });

    child.on("exit", () => {
      if (typeperfProcess === child) {
        typeperfProcess = null;
      }
    });
  } catch {
    typeperfProcess = null;
  }
}

function stopTelemetryCollector() {
  if (typeperfProcess && !typeperfProcess.killed) {
    try {
      typeperfProcess.kill();
    } catch {
      // Ignore cleanup errors during shutdown
    }
  }
  typeperfProcess = null;
  pdhColRoles = [];
  pdhLineBuffer = "";
  cachedServerRssBytes = 0;
}

function fetchServerRssBytes(serverUrl) {
  if (!serverUrl) {
    cachedServerRssBytes = 0;
    return Promise.resolve(0);
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = (val) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };

    try {
      const req = http.get(`${serverUrl}/api/system?rssOnly=1`, { timeout: 350 }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          done(cachedServerRssBytes);
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(body);
            if (
              typeof parsed?.rssBytes === "number" &&
              Number.isFinite(parsed.rssBytes) &&
              parsed.rssBytes > 0
            ) {
              cachedServerRssBytes = parsed.rssBytes;
              done(parsed.rssBytes);
              return;
            }
          } catch {
            // Ignore malformed response
          }
          done(cachedServerRssBytes);
        });
      });

      req.on("timeout", () => {
        req.destroy();
        done(cachedServerRssBytes);
      });
      req.on("error", () => {
        done(cachedServerRssBytes);
      });
    } catch {
      done(cachedServerRssBytes);
    }
  });
}

async function getMemoryStats(electronApp, serverUrl) {
  const totalBytes = os.totalmem();
  let availableBytes = os.freemem();

  if (process.platform === "linux") {
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

  const serverRssBytes = serverUrl ? await fetchServerRssBytes(serverUrl) : 0;

  let appWorkingSetBytes = null;
  if (electronApp && typeof electronApp.getAppMetrics === "function") {
    try {
      const metrics = electronApp.getAppMetrics();
      if (Array.isArray(metrics)) {
        let totalKb = 0;
        for (const metric of metrics) {
          if (metric && metric.memory) {
            if (typeof metric.memory.privateBytes === "number" && metric.memory.privateBytes > 0) {
              totalKb += metric.memory.privateBytes;
            } else if (typeof metric.memory.workingSetSize === "number") {
              totalKb += metric.memory.workingSetSize;
            }
          }
        }
        appWorkingSetBytes = totalKb * 1024 + serverRssBytes;
      }
    } catch {
      appWorkingSetBytes = null;
    }
  }

  return {
    totalBytes,
    usedBytes,
    freeBytes: availableBytes,
    availableBytes,
    usagePercent,
    processRssBytes: procMem.rss,
    processHeapUsedBytes: procMem.heapUsed,
    appWorkingSetBytes,
  };
}

async function getDiskStats() {
  try {
    if (typeof fs.promises.statfs !== "function") return null;
    const mount =
      process.platform === "win32" ? `${process.env.SystemDrive || "C:"}\\` : "/";
    const stat = await fs.promises.statfs(mount);
    const totalBytes = Number(stat.bsize) * Number(stat.blocks);
    const freeBytes = Number(stat.bsize) * Number(stat.bavail ?? stat.bfree);
    if (!Number.isFinite(totalBytes) || totalBytes <= 0) return null;
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    const usagePercent = Number(((usedBytes / totalBytes) * 100).toFixed(1));
    return {
      mount: process.platform === "win32" ? mount.replace(/\\$/, "") : mount,
      totalBytes,
      usedBytes,
      freeBytes,
      usagePercent,
    };
  } catch {
    return null;
  }
}

async function sampleLinuxNetworkThroughput() {
  if (process.platform !== "linux") return null;
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

function collectNetworkInterfaces() {
  const rawMap = os.networkInterfaces();
  const entries = [];

  for (const [name, addresses] of Object.entries(rawMap)) {
    if (!addresses || addresses.length === 0) continue;

    const ipv4 = [];
    const ipv6 = [];
    const cidr = [];
    const netmask = [];
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

async function getSystemTelemetry(electronApp, serverUrl) {
  if (process.platform === "win32") {
    startWindowsPdhCollector();
  }

  const [cpuDelta, memory, disk, linuxNet] = await Promise.all([
    sampleCpuDelta(),
    getMemoryStats(electronApp, serverUrl),
    getDiskStats(),
    sampleLinuxNetworkThroughput(),
  ]);

  const cpus = os.cpus();
  const baseSpeedMhz = cpus[0]?.speed || 0;
  const pdhFresh =
    process.platform === "win32" &&
    pdhState.cpuUtility !== null &&
    Date.now() - pdhState.lastUpdatedAt < 6500;

  const usagePercent = pdhFresh ? pdhState.cpuUtility : cpuDelta.overallPercent;
  const metricSource = pdhFresh ? "windows-pdh" : "os-delta";
  const currentSpeedMhz =
    pdhFresh && pdhState.cpuPerfPercent !== null && baseSpeedMhz > 0
      ? Math.round(baseSpeedMhz * (pdhState.cpuPerfPercent / 100))
      : baseSpeedMhz || null;

  const networkThroughput =
    pdhFresh && pdhState.rxBytesPerSec !== null && pdhState.txBytesPerSec !== null
      ? {
          rxBytesPerSec: pdhState.rxBytesPerSec,
          txBytesPerSec: pdhState.txBytesPerSec,
        }
      : linuxNet;

  const loadAvg =
    process.platform === "win32"
      ? null
      : os.loadavg().map((n) => Number((n ?? 0).toFixed(2)));

  return {
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    platform: os.platform(),
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
      perCore: cpuDelta.perCore,
    },
    memory,
    disk,
    networkThroughput,
    networkInterfaces: collectNetworkInterfaces(),
  };
}

module.exports = {
  startWindowsPdhCollector,
  stopTelemetryCollector,
  getSystemTelemetry,
};
