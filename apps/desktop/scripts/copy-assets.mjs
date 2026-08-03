import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const source = resolve(appRoot, "src", "renderer.html");
const destination = resolve(appRoot, "dist", "renderer.html");
const preloadSource = resolve(appRoot, "src", "preload.cjs");
const preloadDestination = resolve(appRoot, "dist", "preload.cjs");
const builtInModules = resolve(appRoot, "..", "..", "modules");
const packagedModules = resolve(appRoot, "resources", "modules");
const agentSkills = resolve(appRoot, "agent-skills");
const packagedAgentSkills = resolve(appRoot, "resources", "agent-skills");

const tokensSource = resolve(appRoot, "..", "..", "packages", "ui-primitives", "src", "tokens.css");
const tokensDestination = resolve(appRoot, "dist", "tokens.css");

const xtermCssSource = resolve(appRoot, "node_modules", "@xterm", "xterm", "css", "xterm.css");
const xtermCssDestination = resolve(appRoot, "dist", "xterm.css");

import { build } from "esbuild";

await mkdir(dirname(destination), { recursive: true });
await cp(source, destination);
await cp(preloadSource, preloadDestination);
await cp(tokensSource, tokensDestination);
try { await cp(xtermCssSource, xtermCssDestination); } catch {}
await mkdir(dirname(packagedModules), { recursive: true });
await cp(builtInModules, packagedModules, { recursive: true });
await mkdir(dirname(packagedAgentSkills), { recursive: true });
await cp(agentSkills, packagedAgentSkills, { recursive: true });

await build({
  entryPoints: [resolve(appRoot, "src", "renderer.ts")],
  bundle: true,
  outfile: resolve(appRoot, "dist", "renderer.js"),
  format: "esm"
});
