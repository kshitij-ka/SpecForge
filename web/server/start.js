/**
 * start.js - safe server launcher
 * Kills any process already on PORT before starting index.js.
 * Run with: node web/server/start.js
 */
const { execSync, spawn } = require("child_process");
const PORT = process.env.PORT || 5000;

function killPort(port) {
  try {
    if (process.platform === "win32") {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf-8" }).trim();
      const pids = new Set();
      for (const line of out.split("\n")) {
        if (!line.includes("LISTENING")) continue;
        const pid = line.trim().split(/\s+/).pop();
        if (pid && pid !== "0") pids.add(pid);
      }
      for (const pid of pids) {
        console.log(`[start] Killing stale process PID ${pid} on port ${port}`);
        execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
      }
    } else {
      execSync(`fuser -k ${port}/tcp`, { stdio: "ignore" });
    }
  } catch {
    // No process on that port -- fine
  }
}

killPort(PORT);

const proc = spawn(process.execPath, [require("path").join(__dirname, "index.js")], {
  stdio: "inherit",
  env: process.env,
});

proc.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT",  () => proc.kill("SIGINT"));
process.on("SIGTERM", () => proc.kill("SIGTERM"));
