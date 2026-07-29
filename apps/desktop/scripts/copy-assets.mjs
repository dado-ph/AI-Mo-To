import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const source = resolve(appRoot, "src", "renderer.html");
const destination = resolve(appRoot, "dist", "renderer.html");
const builtInModules = resolve(appRoot, "..", "..", "modules");
const packagedModules = resolve(appRoot, "resources", "modules");

await mkdir(dirname(destination), { recursive: true });
await cp(source, destination);
await mkdir(dirname(packagedModules), { recursive: true });
await cp(builtInModules, packagedModules, { recursive: true });
