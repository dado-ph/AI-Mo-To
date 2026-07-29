/** Small, framework-free view models shared by native desktop surfaces. */
export interface NativeView {
  id: string;
  title: string;
  emptyState: string;
}

export interface NativeViewModel extends NativeView {
  description: string;
}

export function nativeViewModel(view: NativeView, description: string): NativeViewModel {
  return { ...view, description };
}
