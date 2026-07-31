import type { InstalledModuleView, WorkspaceInspection } from "@ai-mo-to/engine";
import { authorityBadge, nativeViewModel, type NativeBadge, type NativeViewModel } from "@ai-mo-to/ui-primitives";

export interface DesktopApi {
  /** Opens the local workspace that AI-Mo-To prepares during first launch. */
  openDefaultWorkspace(): Promise<WorkspaceInspection>;
  selectWorkspace(): Promise<WorkspaceInspection | undefined>;
  inspectWorkspace(root: string): Promise<WorkspaceInspection>;
  listRecords(root: string, moduleId: BuiltInModuleId): Promise<readonly DesktopRecord[]>;
  executeCommand(input: DesktopCommandInput): Promise<DesktopRecord | { removed: true; recordId: string }>;
  listModuleViews(root: string, moduleId: string): Promise<readonly InstalledModuleView[]>;
  listHabitRecords(root: string, collectionId: HabitCollectionId): Promise<readonly DesktopRecord[]>;
  executeHabitCommand(input: { root: string; command: "create-habit" | "log-completion"; input: Record<string, unknown> }): Promise<DesktopRecord>;
  requestOutcome(root: string, request: string): Promise<DesktopOutcomeProposalResult>;
  applyProposal(root: string, proposalId: string, digest: string): Promise<WorkspaceInspection>;
}

export interface DesktopOutcomeProposalResult {
  request: string;
  plan: { displayName: string; userOutcomes: string[] };
  proposal: { proposalId: string; changeSetDigest: string };
}

export type BuiltInModuleId = "aimoto.files" | "aimoto.tasks" | "aimoto.research";
export type HabitCollectionId = "habit" | "habit-entry";
export interface DesktopRecord {
  recordId: string;
  version: number;
  data: Record<string, unknown>;
}
export interface DesktopCommandInput {
  root: string;
  moduleId: BuiltInModuleId;
  command: string;
  input: Record<string, unknown>;
}

export interface DesktopScreen {
  workspace?: WorkspaceInspection;
  views: NativeViewModel[];
  authority?: NativeBadge;
  records: { files: readonly DesktopRecord[]; tasks: readonly DesktopRecord[]; research?: readonly DesktopRecord[] };
  generatedViews: readonly InstalledModuleView[];
  habitRecords: { habits: readonly DesktopRecord[]; entries: readonly DesktopRecord[] };
}

export const desktopViews: NativeViewModel[] = [
  nativeViewModel(
    { id: "files", title: "Files", emptyState: "No files yet. Ask your AI to add or organize material here." },
    "Workspace knowledge stays local and visible.",
    { icon: "folder", actions: [{ id: "explain-files", label: "What belongs here?", kind: "secondary" }], columns: [{ id: "name", label: "Name" }, { id: "updated", label: "Updated" }] }
  ),
  nativeViewModel(
    { id: "tasks", title: "Tasks", emptyState: "No tasks yet. Tell your AI what outcome you want." },
    "Work remains concrete, inspectable, and under your control.",
    { icon: "check", actions: [{ id: "explain-tasks", label: "Try an example", kind: "primary" }], columns: [{ id: "task", label: "Task" }, { id: "status", label: "Status" }] }
  ),
  nativeViewModel(
    { id: "research", title: "Research Swipe", emptyState: "No research paper excerpts loaded yet. Enter a query above to start swiping!" },
    "Swipe right (or click ✓) to approve paper excerpts into workspace state.",
    { icon: "sparkles", actions: [{ id: "search-papers", label: "Find Research Papers", kind: "primary" }], columns: [{ id: "title", label: "Title" }, { id: "status", label: "Status" }] }
  )
];

export function screenFor(workspace?: WorkspaceInspection): DesktopScreen {
  const records = { files: [], tasks: [], research: [] };
  const generated = { generatedViews: [], habitRecords: { habits: [], entries: [] } };
  return workspace ? { workspace, views: desktopViews, authority: authorityBadge(workspace.authorityMode), records, ...generated } : { views: desktopViews, records, ...generated };
}
