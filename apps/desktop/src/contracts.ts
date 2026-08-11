import type { ImplementationBrief, WorkspaceInspection } from "@ai-mo-to/engine";
import type { WorkspaceActionResult } from "./workspace-actions.js";

export interface DesktopWorkspaceVersion {
  schemaVersion: 1;
  versionId: string;
  workspaceId: string;
  revision: number;
  createdAt: string;
  message: string;
  parentVersionId: string | null;
  fileManifestDigest: string;
}

export interface WorkspacePresentation {
  thumbnailUrl?: string;
  entryUrl?: string;
}

export interface DesktopApi {
  /** Opens the local workspace that AI-Mo-To prepares during first launch. */
  openDefaultWorkspace(): Promise<WorkspaceInspection>;
  selectWorkspace(): Promise<WorkspaceInspection | undefined>;
  inspectWorkspace(root: string): Promise<WorkspaceInspection>;
  listAllWorkspaces(): Promise<WorkspaceInspection[]>;
  getWorkspacePresentation(root: string): Promise<WorkspacePresentation>;
  openWorkspaceFolder(root: string): Promise<void>;
  createWorkspace(name: string, rootPath?: string): Promise<WorkspaceInspection>;
  renameWorkspace(root: string, newName: string): Promise<WorkspaceInspection>;
  deleteWorkspace(root: string): Promise<void>;
  requestImplementation(root: string, request: string): Promise<ImplementationBrief>;
  listWorkspaceVersions(root: string): Promise<readonly DesktopWorkspaceVersion[]>;
  restoreWorkspaceVersion(root: string, versionId: string): Promise<DesktopWorkspaceVersion>;
  invokeWorkspaceAction(root: string, action: string, input: Record<string, unknown>): Promise<WorkspaceActionResult>;
  createTerminal(root?: string): Promise<{ sessionId: string }>;
  writeTerminal(sessionId: string, data: string): Promise<void>;
  closeTerminal(sessionId: string): Promise<void>;
  onTerminalData(listener: (data: { sessionId: string; chunk: string }) => void): () => void;
  resizeTerminal(sessionId: string, cols: number, rows: number): Promise<void>;
}
