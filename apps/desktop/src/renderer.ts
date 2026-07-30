import type { DesktopApi, DesktopScreen } from "./contracts.js";
import { authorityBadge, type NativeViewModel } from "@ai-mo-to/ui-primitives";

const rendererViews: DesktopScreen["views"] = [
  {
    id: "files",
    title: "Files",
    emptyState: "No files yet. Ask your AI to add or organize material here.",
    description: "Workspace knowledge stays local and visible.",
    icon: "folder",
    actions: [{ id: "explain-files", label: "What belongs here?", kind: "secondary" }],
    columns: [{ id: "name", label: "Name" }, { id: "updated", label: "Updated" }]
  },
  {
    id: "tasks",
    title: "Tasks",
    emptyState: "No tasks yet. Tell your AI what outcome you want.",
    description: "Work remains concrete, inspectable, and under your control.",
    icon: "check",
    actions: [{ id: "explain-tasks", label: "Try an example", kind: "primary" }],
    columns: [{ id: "task", label: "Task" }, { id: "status", label: "Status" }]
  }
];

function screenFor(workspace?: NonNullable<DesktopScreen["workspace"]>): DesktopScreen {
  const records = { files: [], tasks: [] };
  const generated = { generatedViews: [], habitRecords: { habits: [], entries: [] } };
  if (!workspace) return { views: rendererViews, records, ...generated };

  const badge = authorityBadge(workspace.authorityMode);
  return {
    workspace,
    views: rendererViews,
    authority: {
      label: badge.label,
      tone: badge.tone
    },
    records,
    ...generated
  };
}

export async function loadScreen(api: DesktopApi, workspace: NonNullable<DesktopScreen["workspace"]>): Promise<DesktopScreen> {
  const hasHabits = workspace.modules.some((module) => module.moduleId === "local.habit-tracker");
  const [files, tasks, generatedViews, habits, entries] = await Promise.all([
    api.listRecords(workspace.root, "aimoto.files"),
    api.listRecords(workspace.root, "aimoto.tasks"),
    hasHabits ? api.listModuleViews(workspace.root, "local.habit-tracker") : [],
    hasHabits ? api.listHabitRecords(workspace.root, "habit") : [],
    hasHabits ? api.listHabitRecords(workspace.root, "habit-entry") : []
  ]);
  return { ...screenFor(workspace), records: { files, tasks }, generatedViews, habitRecords: { habits, entries } };
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

export function renderScreen(screen: DesktopScreen): void {
  const status = element<HTMLElement>("#status");
  const workspaceName = element<HTMLElement>("#workspace-name");
  const workspacePath = element<HTMLElement>("#workspace-path");
  const authorityLabel = element<HTMLElement>("#authority-label");
  const viewsContainer = element<HTMLElement>("#views");

  viewsContainer.replaceChildren();

  if (screen.workspace) {
    workspaceName.textContent = screen.workspace.name;
    workspacePath.textContent = screen.workspace.root;
    status.textContent = `Revision ${screen.workspace.revision} · ${screen.workspace.modules.length} trusted modules · Healthy`;
  } else {
    workspaceName.textContent = "AI-Mo-To";
    workspacePath.textContent = "Choose a workspace";
    status.textContent = "No workspace open.";
  }

  if (screen.authority) {
    authorityLabel.textContent = screen.authority.label;
  }

  for (const view of screen.views) {
    const card = document.createElement("article");
    card.className = "view-card";

    const h2 = document.createElement("h2");
    h2.textContent = view.title;

    const p = document.createElement("p");
    p.textContent = (view as NativeViewModel).description ?? view.emptyState;

    card.append(h2, p);
    viewsContainer.append(card);
  }
}
