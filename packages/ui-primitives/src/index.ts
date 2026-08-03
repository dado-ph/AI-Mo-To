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

/** Open design token palette contract populated dynamically by AI code generators */
export interface ThemePalette {
  background: string;
  foreground: string;
  card: string;
  cardForeground?: string;
  primary: string;
  primaryForeground?: string;
  secondary?: string;
  muted?: string;
  accent?: string;
  border?: string;
  radius?: string;
  [customToken: string]: string | undefined;
}

/** Shadcn-inspired UI Component Primitives contract declarations for AI-generated views */
export interface ButtonPrimitive {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  label: string;
  disabled?: boolean;
}

export interface CardPrimitive {
  title?: string;
  description?: string;
  content: string;
  footer?: string;
}

export interface DialogPrimitive {
  title: string;
  description?: string;
  isOpen: boolean;
}

export interface InputPrimitive {
  type?: "text" | "number" | "password" | "email";
  placeholder?: string;
  value?: string;
  label?: string;
}

export interface TablePrimitive {
  columns: Array<{ key: string; header: string }>;
  data: Record<string, unknown>[];
}

export interface TabsPrimitive {
  defaultValue: string;
  tabs: Array<{ value: string; label: string; content: string }>;
}

