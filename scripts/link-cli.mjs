import { mkdir, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";

async function linkCli() {
  const cliDist = resolve(process.cwd(), "apps", "cli", "dist", "cli.js");

  if (platform() === "win32") {
    const windowsAppsDir = join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "Microsoft", "WindowsApps");
    await mkdir(windowsAppsDir, { recursive: true });
    const cmdFile = join(windowsAppsDir, "aimoto.cmd");
    const cmdContent = `@node "${cliDist}" %*\n`;
    await writeFile(cmdFile, cmdContent, "utf8");
    console.log(`[AI-Mo-To] Global aimoto command linked to: ${cliDist}`);
    console.log(`[AI-Mo-To] Shim updated at: ${cmdFile}`);
  } else {
    const binDir = join(homedir(), ".local", "bin");
    await mkdir(binDir, { recursive: true });
    const shFile = join(binDir, "aimoto");
    const shContent = `#!/usr/bin/env sh\nexec node "${cliDist}" "$@"\n`;
    await writeFile(shFile, shContent, { encoding: "utf8", mode: 0o755 });
    console.log(`[AI-Mo-To] Global aimoto command linked to: ${cliDist}`);
    console.log(`[AI-Mo-To] Binary updated at: ${shFile}`);
  }
}

linkCli().catch(console.error);
