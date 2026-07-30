/** Small, framework-free view models shared by native desktop surfaces. */
export interface NativeView {
  id: string;
  title: string;
  emptyState: string;
}

export interface NativeViewModel extends NativeView {
  description: string;
  icon?: string;
  actions?: NativeAction[];
  columns?: NativeTableColumn[];
}

export interface NativeAction {
  id: string;
  label: string;
  kind: "primary" | "secondary";
}

export interface NativeTableColumn {
  id: string;
  label: string;
}

export interface NativeBadge {
  label: string;
  tone: "neutral" | "positive" | "caution";
}

export function nativeViewModel(
  view: NativeView,
  description: string,
  options: Pick<NativeViewModel, "icon" | "actions" | "columns"> = {}
): NativeViewModel {
  return { ...view, description, ...options };
}

/** Keeps authority language consistent wherever a workspace is shown. */
export function authorityBadge(mode: "observe" | "suggest" | "assist" | "execute" | "build"): NativeBadge {
  const labels = {
    observe: "Observe only",
    suggest: "Suggest changes",
    assist: "Assist with approval",
    execute: "Execute approved work",
    build: "Build workspace tools"
  } as const;
  return { label: labels[mode], tone: mode === "observe" ? "neutral" : mode === "suggest" ? "positive" : "caution" };
}
