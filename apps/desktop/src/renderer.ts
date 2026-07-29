import type { DesktopApi, DesktopScreen } from "./contracts.js";
import { screenFor } from "./contracts.js";

export async function openWorkspace(api: DesktopApi): Promise<DesktopScreen> {
  return screenFor(await api.selectWorkspace());
}
