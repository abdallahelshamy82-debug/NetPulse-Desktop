const { app, BrowserWindow, ipcMain, shell, dialog, session, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const net = require("net");
const { spawn, spawnSync } = require("child_process");
const {
  startWindowsPdhCollector,
  stopTelemetryCollector,
  getSystemTelemetry,
} = require("./telemetry");

let mainWindow = null;
let serverProcess = null;
let serverStderrTail = "";
let allowedOrigin = null;
let activeServerUrl = null;

function assertTrustedSender(event) {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    throw new Error("Untrusted IPC sender");
  }
  if (!allowedOrigin || !event.senderFrame || !event.senderFrame.url) {
    throw new Error("Untrusted IPC sender frame");
  }
  let frameOrigin;
  try {
    frameOrigin = new URL(event.senderFrame.url).origin;
  } catch {
    throw new Error("Invalid IPC sender frame URL");
  }
  if (frameOrigin !== allowedOrigin) {
    throw new Error("Untrusted IPC sender origin");
  }
}

function findFreePort(startPort = 3210) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => {
      findFreePort(startPort + 1).then(resolve).catch(reject);
    });
    server.listen(startPort, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : startPort;
      server.close(() => resolve(port));
    });
  });
}

function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const parsed = new URL(url);
      const socket = net.createConnection(
        { host: parsed.hostname, port: Number(parsed.port) || 80 },
        () => {
          socket.end();
          resolve();
        }
      );
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error("Timed out waiting for embedded NetPulse server."));
        } else {
          setTimeout(check, 250);
        }
      });
    };
    check();
  });
}

async function startStandaloneServer() {
  const port = await findFreePort(3210);
  const standaloneDir = app.isPackaged
    ? path.join(process.resourcesPath, "standalone")
    : path.join(app.getAppPath(), ".next", "standalone");
  const serverEntry = path.join(standaloneDir, "server.js");

  if (!fs.existsSync(serverEntry)) {
    throw new Error(
      `Standalone Next.js server not found at ${serverEntry}. Run "npm run build" first.`
    );
  }

  serverStderrTail = "";
  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NETPULSE_DESKTOP_MODE: "1",
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
    },
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });

  if (serverProcess.stderr) {
    serverProcess.stderr.setEncoding("utf8");
    serverProcess.stderr.on("data", (chunk) => {
      serverStderrTail = (serverStderrTail + chunk).slice(-4096);
    });
  }

  const url = `http://127.0.0.1:${port}`;
  try {
    await waitForServer(url);
  } catch (err) {
    const tail = serverStderrTail.trim();
    throw new Error(
      tail
        ? `${err instanceof Error ? err.message : String(err)} Server stderr: ${tail}`
        : err instanceof Error
          ? err.message
          : String(err)
    );
  }
  activeServerUrl = url;
  return url;
}

function terminateServerProcess() {
  activeServerUrl = null;
  if (!serverProcess) return;
  const pid = serverProcess.pid;
  try {
    if (!serverProcess.killed) {
      serverProcess.kill();
    }
  } catch {
    // Ignore termination errors
  }
  if (process.platform === "win32" && pid) {
    try {
      const systemRoot = process.env.SystemRoot || "C:\\Windows";
      const taskkillPath = path.join(systemRoot, "System32", "taskkill.exe");
      const cmd = fs.existsSync(taskkillPath) ? taskkillPath : "taskkill";
      spawnSync(cmd, ["/pid", String(pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } catch {
      // Ignore taskkill errors
    }
  }
  serverProcess = null;
}

async function createWindow() {
  const startUrl = process.env.ELECTRON_START_URL;
  let targetUrl = startUrl;

  if (!targetUrl) {
    if (app.isPackaged) {
      targetUrl = await startStandaloneServer();
    } else {
      targetUrl = "http://127.0.0.1:3000";
    }
  }

  allowedOrigin = new URL(targetUrl).origin;

  const appIconPath = path.join(__dirname, "assets", "icon.png");
  const windowIcon = fs.existsSync(appIconPath) ? nativeImage.createFromPath(appIconPath) : undefined;

  mainWindow = new BrowserWindow({
    width: 1420,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#090C11",
    show: false,
    title: "NetPulse Desktop — Network Telemetry, SSL & Cybersecurity Suite",
    ...(windowIcon && !windowIcon.isEmpty() ? { icon: windowIcon } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    try {
      const navOrigin = new URL(navigationUrl).origin;
      if (navOrigin !== allowedOrigin) {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.once("ready-to-show", () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });

  mainWindow.on("maximize", () => {
    mainWindow?.webContents.send("window:maximized-change", true);
  });

  mainWindow.on("unmaximize", () => {
    mainWindow?.webContents.send("window:maximized-change", false);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  await mainWindow.loadURL(targetUrl);
}

// IPC Handlers for Custom Native Desktop Titlebar, Telemetry & PDF Export
ipcMain.handle("window:minimize", (event) => {
  assertTrustedSender(event);
  mainWindow?.minimize();
});

ipcMain.handle("window:toggle-maximize", (event) => {
  assertTrustedSender(event);
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return false;
  }
  mainWindow.maximize();
  return true;
});

ipcMain.handle("window:close", (event) => {
  assertTrustedSender(event);
  mainWindow?.close();
});

ipcMain.handle("window:is-maximized", (event) => {
  assertTrustedSender(event);
  return mainWindow ? mainWindow.isMaximized() : false;
});

ipcMain.handle("app:get-info", (event) => {
  assertTrustedSender(event);
  return {
    isElectron: true,
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    appVersion: app.getVersion(),
  };
});

ipcMain.handle("telemetry:system", async (event) => {
  assertTrustedSender(event);
  return getSystemTelemetry(app, activeServerUrl);
});

ipcMain.handle("app:open-external", async (event, url) => {
  assertTrustedSender(event);
  if (typeof url === "string" && (url.startsWith("https://") || url.startsWith("http://"))) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});

ipcMain.handle("window:export-pdf", async (event, suggestedName) => {
  assertTrustedSender(event);
  if (!mainWindow) return { ok: false, saved: false, error: "Main window is unavailable." };
  const safeName =
    typeof suggestedName === "string" && suggestedName.trim().length > 0
      ? suggestedName.replace(/[^a-zA-Z0-9._-]/g, "_")
      : "netpulse-security-report.pdf";

  try {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: "Save NetPulse Security Report PDF",
      defaultPath: path.join(app.getPath("documents"), safeName),
      filters: [{ name: "PDF Document", extensions: ["pdf"] }],
    });

    if (canceled || !filePath) {
      return { ok: false, saved: false, canceled: true };
    }

    const pdfBuffer = await mainWindow.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      pageSize: "A4",
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });

    await fs.promises.writeFile(filePath, pdfBuffer);
    return { ok: true, saved: true, filePath };
  } catch (err) {
    return {
      ok: false,
      saved: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
        callback(false);
      });
      startWindowsPdhCollector();
      await createWindow();
    } catch (err) {
      console.error("Failed to initialize NetPulse Desktop:", err);
      app.quit();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.on("before-quit", () => {
    stopTelemetryCollector();
    terminateServerProcess();
  });

  app.on("will-quit", () => {
    stopTelemetryCollector();
    terminateServerProcess();
  });
}
