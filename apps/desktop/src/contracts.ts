import type { InstalledModuleView, WorkspaceInspection } from "@ai-mo-to/engine";
import { authorityBadge, nativeViewModel, type NativeBadge, type NativeViewModel } from "@ai-mo-to/ui-primitives";

export interface DesktopApi {
  /** Opens the local workspace that AI-Mo-To prepares during first launch. */
  openDefaultWorkspace(): Promise<WorkspaceInspection>;
  selectWorkspace(): Promise<WorkspaceInspection | undefined>;
  inspectWorkspace(root: string): Promise<WorkspaceInspection>;
  listAllWorkspaces(): Promise<WorkspaceInspection[]>;
  openWorkspaceFolder(root: string): Promise<void>;
  createWorkspace(name: string, rootPath?: string): Promise<WorkspaceInspection>;
  renameWorkspace(root: string, newName: string): Promise<WorkspaceInspection>;
  deleteWorkspace(root: string): Promise<void>;
  listSnapshots(root: string): Promise<readonly unknown[]>;
  restoreSnapshot(root: string, snapshotId: string): Promise<WorkspaceInspection>;
  listRecords(root: string, moduleId: string, collectionId?: string): Promise<readonly DesktopRecord[]>;
  executeCommand(input: DesktopCommandInput): Promise<DesktopRecord | { removed: true; recordId: string }>;
  listModuleViews(root: string, moduleId: string): Promise<readonly InstalledModuleView[]>;
  requestOutcome(root: string, request: string): Promise<DesktopOutcomeProposalResult>;
  applyProposal(root: string, proposalId: string, digest: string): Promise<WorkspaceInspection>;
  createTerminal(root?: string): Promise<{ sessionId: string }>;
  writeTerminal(sessionId: string, data: string): Promise<void>;
  onTerminalData(listener: (data: { sessionId: string; chunk: string }) => void): void;
  resizeTerminal(sessionId: string, cols: number, rows: number): Promise<void>;
}

export interface DesktopOutcomeProposalResult {
  request: string;
  plan: { displayName: string; userOutcomes: string[] };
  proposal: { proposalId: string; changeSetDigest: string };
}

export interface DesktopRecord {
  recordId: string;
  version: number;
  data: Record<string, unknown>;
}

export interface DesktopCommandInput {
  root: string;
  moduleId: string;
  command: string;
  input: Record<string, unknown>;
}

export interface DesktopScreen {
  workspace?: WorkspaceInspection;
  views: NativeViewModel[];
  authority?: NativeBadge;
  generatedViews: readonly InstalledModuleView[];
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
  )
];

export function screenFor(workspace?: WorkspaceInspection): DesktopScreen {
  return workspace ? { workspace, views: desktopViews, authority: authorityBadge(workspace.authorityMode), generatedViews: [] } : { views: desktopViews, generatedViews: [] };
}
