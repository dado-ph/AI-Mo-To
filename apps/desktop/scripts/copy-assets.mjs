import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const preloadSource = resolve(appRoot, "src", "preload.cjs");
const preloadDestination = resolve(appRoot, "dist", "preload.cjs");
const agentSkills = resolve(appRoot, "agent-skills");
const packagedAgentSkills = resolve(appRoot, "resources", "agent-skills");

const tokensSource = resolve(appRoot, "..", "..", "packages", "ui-primitives", "src", "tokens.css");
const tokensDestination = resolve(appRoot, "dist", "tokens.css");

const xtermCssSource = resolve(appRoot, "node_modules", "@xterm", "xterm", "css", "xterm.css");
const xtermCssDestination = resolve(appRoot, "dist", "xterm.css");

await mkdir(resolve(appRoot, "dist"), { recursive: true });
await cp(preloadSource, preloadDestination);
await cp(tokensSource, tokensDestination);
try { await cp(xtermCssSource, xtermCssDestination); } catch {}
await mkdir(dirname(packagedAgentSkills), { recursive: true });
await cp(agentSkills, packagedAgentSkills, { recursive: true });
