import type { DesktopApi, DesktopScreen } from "./contracts.js";

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

export function initPillTerminalOverlay(api: DesktopApi, workspaceRoot?: string): void {
  const pill = element<HTMLElement>("#terminal-pill");
  const maxBtn = element<HTMLElement>("#btn-term-max");
  const minBtn = element<HTMLElement>("#btn-term-min");
  const pillBody = element<HTMLElement>("#pill-body");
  const pillOutput = element<HTMLElement>("#pill-output");
  const pillForm = element<HTMLFormElement>("#pill-form");
  const pillInput = element<HTMLInputElement>("#pill-input");

  maxBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    pill.classList.add("maximized");
    pillInput.focus();
  });

  minBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    pill.classList.remove("maximized");
  });

  pillBody.addEventListener("click", () => {
    pillInput.focus();
  });

  pillForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const command = pillInput.value;
    if (activeTerminalSessionId) {
      const line = document.createElement("div");
      line.style.color = "#71d7a5";
      line.style.fontWeight = "bold";
      line.textContent = `$ ${command}`;
      pillOutput.append(line);
      api.writeTerminal(activeTerminalSessionId, `${command}\r\n`);
      pillInput.value = "";
      pillBody.scrollTop = pillBody.scrollHeight;
    }
  });

  if (!activeTerminalSessionId) {
    const rootPath = workspaceRoot || "default";
    api.createTerminal(rootPath).then((res) => {
      activeTerminalSessionId = res.sessionId;
      const p = document.createElement("p");
      p.style.margin = "0 0 6px 0";
      p.innerHTML = `<strong style="color:#71d7a5">&gt;_ PTY Active [${res.sessionId}]</strong> Rooted in ${rootPath}`;
      pillOutput.append(p);
    }).catch(() => {});

    api.onTerminalData((data) => {
      if (data.chunk) {
        const span = document.createElement("span");
        span.textContent = data.chunk;
        pillOutput.append(span);
        pillBody.scrollTop = pillBody.scrollHeight;
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
