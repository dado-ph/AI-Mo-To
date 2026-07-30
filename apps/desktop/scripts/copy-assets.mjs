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

await mkdir(dirname(destination), { recursive: true });
await cp(source, destination);
await cp(preloadSource, preloadDestination);
await mkdir(dirname(packagedModules), { recursive: true });
await cp(builtInModules, packagedModules, { recursive: true });
await mkdir(dirname(packagedAgentSkills), { recursive: true });
await cp(agentSkills, packagedAgentSkills, { recursive: true });
