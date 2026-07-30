import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

console.log("=== ADW 1: Module Contract & Capability Compliance Scanner ===");

const modulesDir = join(process.cwd(), "modules");
if (!existsSync(modulesDir)) {
  console.log("No modules directory found.");
  process.exit(0);
}

const moduleFolders = readdirSync(modulesDir, { withFileTypes: true })
  .filter((dir) => dir.isDirectory())
  .map((dir) => dir.name);

let errorsFound = 0;

for (const folder of moduleFolders) {
  const manifestPath = join(modulesDir, folder, "module.json");
  if (!existsSync(manifestPath)) {
    console.error(`[FAIL] ${folder}: Missing module.json manifest.`);
    errorsFound++;
    continue;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  console.log(`Checking module '${manifest.moduleId}' (${manifest.name})...`);

  // Verify declared capabilities
  if (!Array.isArray(manifest.capabilities)) {
    console.error(`[FAIL] ${folder}: Manifest missing 'capabilities' array.`);
    errorsFound++;
  } else {
    console.log(`  Declared capabilities: ${manifest.capabilities.join(", ") || "none"}`);
  }

  // Verify commands have schema references if input is expected
  if (Array.isArray(manifest.commands)) {
    for (const cmd of manifest.commands) {
      if (cmd.inputSchema) {
        const schemaPath = join(modulesDir, folder, cmd.inputSchema);
        if (!existsSync(schemaPath)) {
          console.error(`[FAIL] ${folder}: Command '${cmd.id}' references missing schema '${cmd.inputSchema}'.`);
          errorsFound++;
        }
      }
    }
  }
}

if (errorsFound > 0) {
  console.error(`\n[ADW 1 GATE FAILED] ${errorsFound} module contract violations detected.`);
  process.exit(1);
} else {
  console.log("\n[ADW 1 GATE PASSED] All module contracts and capabilities compliant.");
  process.exit(0);
}
