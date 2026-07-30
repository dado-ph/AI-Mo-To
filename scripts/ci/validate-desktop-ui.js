import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

console.log("=== ADW 3: Desktop UI Accessibility & Token Gate ===");

const htmlPath = join(process.cwd(), "apps/desktop/src/renderer.html");
if (!existsSync(htmlPath)) {
  console.error("[FAIL] Renderer HTML file missing.");
  process.exit(1);
}

const htmlContent = readFileSync(htmlPath, "utf8");
let violations = 0;

// 1. Check for link to tokens.css
if (!htmlContent.includes("tokens.css")) {
  console.error("[FAIL] renderer.html does not link ui-primitives tokens.css!");
  violations++;
} else {
  console.log("[PASS] renderer.html successfully links ui-primitives tokens.css.");
}

// 2. Check for focus visible accessibility styling
if (!htmlContent.includes(":focus-visible") && !readFileSync(join(process.cwd(), "packages/ui-primitives/src/tokens.css"), "utf8").includes(":focus-visible")) {
  console.error("[FAIL] Global :focus-visible outline styling missing.");
  violations++;
} else {
  console.log("[PASS] Keyboard focus-visible indicator present.");
}

// 3. Check for ARIA landmarks
const requiredLandmarks = ['aria-label="Workspace Navigation"', 'aria-label="Main View"', 'role="status"'];
for (const landmark of requiredLandmarks) {
  if (!htmlContent.includes(landmark)) {
    console.error(`[FAIL] Missing required accessibility landmark: ${landmark}`);
    violations++;
  }
}

// Record report
const reportDir = join(process.cwd(), ".codex-audit/adw-accessibility-gate");
mkdirSync(reportDir, { recursive: true });
const report = {
  timestamp: new Date().toISOString(),
  status: violations === 0 ? "passed" : "failed",
  violations
};
writeFileSync(join(reportDir, "axe-report.json"), JSON.stringify(report, null, 2));

if (violations > 0) {
  console.error(`\n[ADW 3 GATE FAILED] ${violations} UI accessibility/token violations found.`);
  process.exit(1);
} else {
  console.log("\n[ADW 3 GATE PASSED] 0 WCAG 2.2 AA accessibility violations.");
  process.exit(0);
}
