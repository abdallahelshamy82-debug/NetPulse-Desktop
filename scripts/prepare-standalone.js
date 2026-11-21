const fs = require("fs");
const path = require("path");

function main() {
  const rootDir = path.resolve(__dirname, "..");
  const nextDir = path.join(rootDir, ".next");
  const standaloneDir = path.join(nextDir, "standalone");
  const serverEntry = path.join(standaloneDir, "server.js");

  if (!fs.existsSync(serverEntry)) {
    console.error(
      `[prepare-standalone] Error: Standalone server entry not found at ${serverEntry}. Did 'next build' run with output: 'standalone'?`
    );
    process.exit(1);
  }

  const staticSrc = path.join(nextDir, "static");
  const staticDest = path.join(standaloneDir, ".next", "static");
  if (fs.existsSync(staticSrc)) {
    fs.mkdirSync(path.dirname(staticDest), { recursive: true });
    fs.cpSync(staticSrc, staticDest, { recursive: true, force: true });
    console.log(`[prepare-standalone] Copied .next/static -> .next/standalone/.next/static`);
  } else {
    console.error(`[prepare-standalone] Error: .next/static not found at ${staticSrc}`);
    process.exit(1);
  }

  const publicSrc = path.join(rootDir, "public");
  const publicDest = path.join(standaloneDir, "public");
  if (fs.existsSync(publicSrc)) {
    fs.cpSync(publicSrc, publicDest, { recursive: true, force: true });
    console.log(`[prepare-standalone] Copied public -> .next/standalone/public`);
  }

  console.log("[prepare-standalone] Standalone bundle is ready for Electron packaging.");
}

main();
