const os = require("os");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

let prevCpuSnapshot = null;
let lastCpuResult = null;

let typeperfProcess = null;
let pdhState = { value: null, lastUpdatedAt: 0 };
let pdhLineBuffer = "";
let cachedServerRssBytes = 0;

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

function parseTypeperfLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.includes("PDH-CSV")) return null;

  let rawValue = null;
  const quotedMatch = /"([^"]+)"\s*$/.exec(trimmed);
  if (quotedMatch) {
    rawValue = quotedMatch[1].trim();
  } else {
    const parts = trimmed.split(",");
    if (parts.length >= 2) {
      rawValue = parts[parts.length - 1].replace(/^"+|"+$/g, "").trim();
    }
  }

  if (!rawValue) return null;

  const normalized = /^\d+,\d+$/.test(rawValue) ? rawValue.replace(",", ".") : rawValue;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;

  return Number(Math.min(100, Math.max(0, parsed)).toFixed(1));
}

function startWindowsPdhCollector() {
  if (process.platform !== "win32" || typeperfProcess) return;

  try {
    const systemRoot = process.env.SystemRoot || "C:\\Windows";
    const typeperfPath = path.join(systemRoot, "System32", "typeperf.exe");
    const typeperfBin = fs.existsSync(typeperfPath) ? typeperfPath : "typeperf";

    const child = spawn(
      typeperfBin,
      ["\\Processor Information(_Total)\\% Processor Utility", "-si", "2"],
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
          const val = parseTypeperfLine(line);
          if (val !== null) {
            pdhState = {
              value: val,
              lastUpdatedAt: Date.now(),
            };
          }
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
            if (typeof parsed?.rssBytes === "number" && Number.isFinite(parsed.rssBytes) && parsed.rssBytes > 0) {
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
          if (metric && metric.memory && typeof metric.memory.workingSetSize === "number") {
            totalKb += metric.memory.workingSetSize;
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

  const [cpuDelta, memory] = await Promise.all([
    sampleCpuDelta(),
    getMemoryStats(electronApp, serverUrl),
  ]);

  const cpus = os.cpus();
  const pdhFresh =
    process.platform === "win32" &&
    pdhState.value !== null &&
    Date.now() - pdhState.lastUpdatedAt < 6000;

  const usagePercent = pdhFresh ? pdhState.value : cpuDelta.overallPercent;
  const metricSource = pdhFresh ? "windows-pdh" : "os-delta";
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
      speedMhz: cpus[0]?.speed || 0,
      usagePercent,
      metricSource,
      loadAvg,
      perCore: cpuDelta.perCore,
    },
    memory,
    networkInterfaces: collectNetworkInterfaces(),
  };
}

module.exports = {
  startWindowsPdhCollector,
  stopTelemetryCollector,
  getSystemTelemetry,
};
