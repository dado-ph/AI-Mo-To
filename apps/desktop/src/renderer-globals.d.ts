import type { DesktopApi } from "./contracts.js";

declare global {
  interface Window { aimoto: DesktopApi; }
}

export {};
