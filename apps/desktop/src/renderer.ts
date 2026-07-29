import type { DesktopApi, DesktopScreen } from "./contracts.js";
import { screenFor } from "./contracts.js";

export async function openWorkspace(api: DesktopApi): Promise<DesktopScreen> {
  return screenFor(await api.selectWorkspace());
}

function element<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing renderer element: ${selector}`);
  return found;
}

function render(screen: DesktopScreen): void {
  const status = element<HTMLElement>("#status");
  const workspace = element<HTMLElement>("#workspace");
  const views = element<HTMLElement>("#views");
  workspace.replaceChildren();
  views.replaceChildren();
  if (screen.workspace) {
    workspace.hidden = false;
    const title = document.createElement("strong");
    title.textContent = `${screen.workspace.name} · revision ${screen.workspace.revision}`;
    const root = document.createElement("p");
    root.textContent = screen.workspace.root;
    workspace.append(title, root);
    status.textContent = `Opened ${screen.workspace.modules.length} trusted modules.`;
  } else {
    workspace.hidden = true;
    status.textContent = "Choose a workspace created with AI-Mo-To.";
  }
  for (const view of screen.views) {
    const card = document.createElement("article");
    const title = document.createElement("h2"); title.textContent = view.title;
    const description = document.createElement("p"); description.textContent = view.description;
    const empty = document.createElement("p"); empty.className = "empty"; empty.textContent = view.emptyState;
    card.append(title, description, empty);
    views.append(card);
  }
}

export function startRenderer(api: DesktopApi): void {
  const button = element<HTMLButtonElement>("#open-workspace");
  const status = element<HTMLElement>("#status");
  render(screenFor());
  button.addEventListener("click", async () => {
    button.disabled = true;
    status.classList.remove("error");
    status.textContent = "Opening workspace chooser…";
    try {
      render(await openWorkspace(api));
    } catch (error) {
      status.classList.add("error");
      status.textContent = error instanceof Error ? error.message : "Unable to open that workspace.";
    } finally {
      button.disabled = false;
    }
  });
}

if (typeof window !== "undefined" && window.aimoto) startRenderer(window.aimoto);
