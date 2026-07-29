import type { WorkspaceInspection } from "@ai-mo-to/engine";
import { nativeViewModel, type NativeViewModel } from "@ai-mo-to/ui-primitives";

export interface DesktopApi {
  selectWorkspace(): Promise<WorkspaceInspection | undefined>;
  inspectWorkspace(root: string): Promise<WorkspaceInspection>;
}

export interface DesktopScreen {
  workspace?: WorkspaceInspection;
  views: NativeViewModel[];
}

export const desktopViews: NativeViewModel[] = [
  nativeViewModel({ id: "files", title: "Files", emptyState: "No files are available yet." }, "Browse files stored in this workspace."),
  nativeViewModel({ id: "tasks", title: "Tasks", emptyState: "No tasks are available yet." }, "Review tasks provided by installed modules.")
];

export function screenFor(workspace?: WorkspaceInspection): DesktopScreen {
  return workspace ? { workspace, views: desktopViews } : { views: desktopViews };
}
