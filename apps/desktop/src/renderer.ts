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
    views: workspace.layout.views.map((entry) => ({ id: entry.id, title: entry.viewId, moduleId: entry.moduleId, viewId: entry.viewId, description: `View from ${entry.moduleId}`, emptyState: "No items yet." } as any)),
    authority: {
      label: badge.label,
      tone: badge.tone
    },
    generatedViews: []
  };
}

export async function loadScreen(api: DesktopApi, workspace: NonNullable<DesktopScreen["workspace"]>): Promise<DesktopScreen> {
  const generatedViews = (await Promise.all(workspace.modules.map((m) => api.listModuleViews(workspace.root, m.moduleId))))
    .flat();
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

export function initTerminalBridge(api: DesktopApi, workspaceRoot?: string): void {
  const drawer = element<HTMLElement>("#terminal-drawer");
  const toggleBtn = element<HTMLElement>("#terminal-toggle");
  const view = element<HTMLElement>("#terminal-view");

  toggleBtn.addEventListener("click", () => {
    drawer.classList.toggle("collapsed");
    toggleBtn.textContent = drawer.classList.contains("collapsed") ? "▲ Expand" : "▼ Minimize";
  });

  if (workspaceRoot && !activeTerminalSessionId) {
    api.createTerminal(workspaceRoot).then((res) => {
      activeTerminalSessionId = res.sessionId;
      const line = document.createElement("p");
      line.className = "term-line";
      line.innerHTML = `<span class="term-prompt">PTY Session Active [${res.sessionId}]</span> Rooted in ${workspaceRoot}`;
      view.append(line);
    }).catch(() => {});

    api.onTerminalData((data) => {
      if (data.chunk) {
        const line = document.createElement("span");
        line.textContent = data.chunk;
        view.append(line);
        view.scrollTop = view.scrollHeight;
      }
    });
  }
}

export function renderScreen(screen: DesktopScreen): void {
  const status = element<HTMLElement>("#status");
  const workspaceName = element<HTMLElement>("#workspace-name");
  const authorityLabel = element<HTMLElement>("#authority-label");
  const viewsContainer = element<HTMLElement>("#views");
  const nav = element<HTMLElement>("#module-nav");

  viewsContainer.replaceChildren();
  nav.replaceChildren();

  if (screen.workspace) {
    workspaceName.textContent = screen.workspace.name;
    status.textContent = `Revision ${screen.workspace.revision} · ${screen.workspace.modules.length} installed modules · Healthy`;
    
    const overview = document.createElement("button");
    overview.className = "nav-item active";
    overview.textContent = "⌂ Overview";
    nav.append(overview);

    for (const view of screen.generatedViews) {
      const button = document.createElement("button");
      button.className = "nav-item";
      button.dataset.moduleId = view.moduleId;
      button.dataset.viewId = view.id;
      button.textContent = `✓ ${view.title}`;
      button.addEventListener("click", () => {
        nav.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
        button.classList.add("active");
        element<HTMLElement>("#page-heading").textContent = view.title;
        viewsContainer.replaceChildren();
        viewsContainer.classList.toggle("app-active", view.kind === "app");
        if (view.kind === "app" && view.entryUrl) {
          const frame = document.createElement("iframe");
          frame.className = "app-frame";
          frame.title = view.title;
          frame.src = view.entryUrl;
          frame.setAttribute("sandbox", "allow-scripts allow-forms allow-modals allow-same-origin");
          viewsContainer.append(frame);
        } else {
          const card = document.createElement("article");
          card.className = "view-card";
          const heading = document.createElement("h2");
          heading.textContent = view.title;
          const detail = document.createElement("p");
          detail.textContent = `View from ${view.moduleId}`;
          card.append(heading, detail);
          viewsContainer.append(card);
        }
      });
      nav.append(button);
    }
  } else {
    workspaceName.textContent = "AI-Mo-To";
    status.textContent = "No workspace open.";
  }

  if (screen.authority) {
    authorityLabel.textContent = screen.authority.label;
  }

  for (const view of screen.generatedViews) {
    const card = document.createElement("article");
    card.className = "view-card";

    const h2 = document.createElement("h2");
    h2.textContent = view.title;

    const p = document.createElement("p");
    p.textContent = `View from ${view.moduleId}`;

    card.append(h2, p);
    viewsContainer.append(card);
  }
}

if (typeof window !== "undefined") {
  const api = (window as unknown as { aimoto?: DesktopApi }).aimoto;
  const init = async () => {
    const status = document.querySelector("#status");
    if (!api) {
      if (status) status.textContent = "Error: AI-Mo-To preload bridge is unavailable.";
      return;
    }
    try {
      const screen = await openDefaultWorkspace(api);
      renderScreen(screen);
      initTerminalBridge(api, screen.workspace?.root);
    } catch (error) {
      if (status) status.textContent = `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
