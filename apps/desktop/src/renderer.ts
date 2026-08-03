import type { DesktopApi, DesktopScreen } from "./contracts.js";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

function authorityBadge(mode: string): { label: string; tone: "positive" | "neutral" | "caution" } {
  if (mode === "build") return { label: "Build mode", tone: "caution" };
  if (mode === "suggest") return { label: "Suggest mode", tone: "positive" };
  return { label: `${mode} mode`, tone: "neutral" };
}

const rendererViews: DesktopScreen["views"] = [];

function screenFor(workspace?: NonNullable<DesktopScreen["workspace"]>): DesktopScreen {
  if (!workspace) return { views: rendererViews, generatedViews: [] };

  const badge = authorityBadge(workspace.authorityMode);
  return {
    workspace,
    views: workspace.layout.views.map((entry) => ({
      id: entry.id, title: entry.viewId, moduleId: entry.moduleId, viewId: entry.viewId, description: `View from ${entry.moduleId}`, emptyState: "No items yet."
    } as any)),
    authority: {
      label: badge.label,
      tone: badge.tone
    },
    generatedViews: []
  };
}

export async function loadScreen(api: DesktopApi, workspace: NonNullable<DesktopScreen["workspace"]>): Promise<DesktopScreen> {
  const generatedViews = (await Promise.all(workspace.modules.map((m) => api.listModuleViews(workspace.root, m.moduleId)))).flat();
  return { ...screenFor(workspace), generatedViews };
}

export async function openWorkspace(api: DesktopApi): Promise<DesktopScreen> {
  const workspace = await api.selectWorkspace();
  return workspace ? loadScreen(api, workspace) : screenFor();
}

export async function openDefaultWorkspace(api: DesktopApi): Promise<DesktopScreen> {
  return loadScreen(api, await api.openDefaultWorkspace());
}

function element<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing renderer element: ${selector}`);
  return found;
}

let activeTerminalSessionId: string | undefined;
let xtermInstance: Terminal | undefined;
let fitAddonInstance: FitAddon | undefined;

export function initPillTerminalOverlay(api: DesktopApi, workspaceRoot?: string): void {
  const pill = element<HTMLElement>("#terminal-pill");
  const maxBtn = element<HTMLElement>("#btn-term-max");
  const minBtn = element<HTMLElement>("#btn-term-min");
  const xtermContainer = element<HTMLElement>("#xterm-container");

  if (!xtermInstance) {
    fitAddonInstance = new FitAddon();
    xtermInstance = new Terminal({
      theme: {
        background: "#0b0d11",
        foreground: "#f3f5f7",
        cursor: "#71d7a5",
        selectionBackground: "rgba(113, 215, 165, 0.3)",
        black: "#000000",
        red: "#e5484d",
        green: "#71d7a5",
        yellow: "#f5d00e",
        blue: "#3e63dd",
        magenta: "#ab4aba",
        cyan: "#12a594",
        white: "#eeeeee"
      },
      fontSize: 13,
      fontFamily: '"Cascadia Mono", Consolas, monospace',
      cursorBlink: true
    });
    xtermInstance.loadAddon(fitAddonInstance);
    xtermInstance.open(xtermContainer);
    try { fitAddonInstance.fit(); } catch {}
  }

  maxBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    pill.classList.add("maximized");
    setTimeout(() => { try { fitAddonInstance?.fit(); } catch {} }, 100);
    xtermInstance?.focus();
  });

  minBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    pill.classList.remove("maximized");
    setTimeout(() => { try { fitAddonInstance?.fit(); } catch {} }, 100);
  });

  if (!activeTerminalSessionId) {
    const rootPath = workspaceRoot || "default";
    api.createTerminal(rootPath).then((res) => {
      activeTerminalSessionId = res.sessionId;
    }).catch(() => {});

    api.onTerminalData((data) => {
      if (data.chunk && xtermInstance) {
        xtermInstance.write(data.chunk);
      }
    });

    xtermInstance.onData((data) => {
      if (activeTerminalSessionId) {
        api.writeTerminal(activeTerminalSessionId, data);
      }
    });
  }
}

export function renderScreen(screen: DesktopScreen, api: DesktopApi): void {
  const landingScreen = element<HTMLElement>("#landing-screen");
  const carouselScreen = element<HTMLElement>("#carousel-screen");
  const track = element<HTMLElement>("#carousel-track");
  const fsWorkspace = element<HTMLElement>("#fullscreen-workspace");
  const fsTitle = element<HTMLElement>("#fs-title");
  const fsAuthority = element<HTMLElement>("#fs-authority");
  const fsGrid = element<HTMLElement>("#fs-views-grid");

  if (!screen.workspace) {
    landingScreen.hidden = false;
    carouselScreen.hidden = true;
    fsWorkspace.hidden = true;
    return;
  }

  // Workspaces exist -> Show Big Carousel
  landingScreen.hidden = true;
  carouselScreen.hidden = false;
  fsWorkspace.hidden = true;

  track.replaceChildren();

  // Create Workspace Card for Carousel
  const card = document.createElement("div");
  card.className = "workspace-card";

  const mark = document.createElement("div");
  mark.className = "card-mark";
  mark.textContent = screen.workspace.name.charAt(0).toUpperCase() || "W";

  const title = document.createElement("h3");
  title.className = "card-title";
  title.textContent = screen.workspace.name;

  const path = document.createElement("p");
  path.className = "card-path";
  path.textContent = screen.workspace.root;

  const footer = document.createElement("div");
  footer.className = "card-footer";

  const badge = document.createElement("span");
  badge.className = "card-badge";
  badge.textContent = screen.authority?.label || "Observe mode";

  const rev = document.createElement("span");
  rev.style.color = "#8e9baa";
  rev.style.fontSize = "0.82rem";
  rev.textContent = `Rev ${screen.workspace.revision}`;

  footer.append(badge, rev);
  card.append(mark, title, path, footer);

  // CLICKING CAROUSEL CARD GOES FULLSCREEN
  card.addEventListener("click", () => {
    carouselScreen.hidden = true;
    fsWorkspace.hidden = false;
    fsTitle.textContent = screen.workspace!.name;
    fsAuthority.textContent = screen.authority?.label || "Observe mode";
    fsGrid.replaceChildren();

    for (const view of screen.generatedViews) {
      const vCard = document.createElement("div");
      vCard.style.background = "rgba(255, 255, 255, 0.04)";
      vCard.style.border = "1px solid rgba(255, 255, 255, 0.08)";
      vCard.style.borderRadius = "12px";
      vCard.style.padding = "20px";

      const h3 = document.createElement("h3");
      h3.style.margin = "0 0 8px 0";
      h3.textContent = view.title;

      const p = document.createElement("p");
      p.style.margin = "0";
      p.style.color = "#8e9baa";
      p.textContent = `Module: ${view.moduleId}`;

      vCard.append(h3, p);
      fsGrid.append(vCard);
    }
  });

  track.append(card);
}

if (typeof window !== "undefined") {
  const api = (window as unknown as { aimoto?: DesktopApi }).aimoto;
  const init = async () => {
    if (!api) return;

    // Guide Modal Handlers
    const guideModal = element<HTMLElement>("#guide-modal");
    element<HTMLElement>("#btn-open-guide").addEventListener("click", () => { guideModal.hidden = false; });
    element<HTMLElement>("#guide-close-btn").addEventListener("click", () => { guideModal.hidden = true; });

    // Back to Carousel Button
    element<HTMLElement>("#fs-back-btn").addEventListener("click", () => {
      element<HTMLElement>("#fullscreen-workspace").hidden = true;
      element<HTMLElement>("#carousel-screen").hidden = false;
    });

    // Workspace Open Handlers
    element("#btn-select-workspace").addEventListener("click", async () => {
      const s = await openWorkspace(api);
      renderScreen(s, api);
    });

    element("#btn-create-workspace").addEventListener("click", async () => {
      const s = await openDefaultWorkspace(api);
      renderScreen(s, api);
    });

    try {
      const screen = await openDefaultWorkspace(api);
      renderScreen(screen, api);
      initPillTerminalOverlay(api, screen.workspace?.root);
    } catch {
      renderScreen({ views: [], generatedViews: [] }, api);
      initPillTerminalOverlay(api);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
