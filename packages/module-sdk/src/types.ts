export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string;
  method: "module.initialize" | "module.invoke" | "module.shutdown";
  params: JsonValue;
}

export interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: string;
  result: JsonValue;
}

export interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: string | null;
  error: { code: number; message: string; data?: JsonValue };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

export interface InitializeParams {
  protocolVersion: "1.0.0";
  moduleId: string;
}

export interface InvokeParams {
  context_ref: string;
  command: string;
  input: JsonValue;
}

export type NativePrimitive =
  | "form"
  | "list"
  | "table"
  | "detail"
  | "timeline"
  | "action-bar"
  | "tabs"
  | "drawer"
  | "status-badge"
  | "file-picker"
  | "text"
  | "field"
  | "action";

export interface NativeViewNode {
  type: NativePrimitive;
  id?: string;
  label?: string;
  bind?: string;
  command?: string;
  props?: Record<string, JsonValue>;
  children?: NativeViewNode[];
}

export interface NativeViewDeclaration {
  schemaVersion: "1.0.0";
  id: string;
  kind: "form" | "list" | "table" | "detail" | "timeline";
  title: string;
  root: NativeViewNode;
}

export interface ModuleHandler {
  initialize(params: InitializeParams): Promise<JsonValue> | JsonValue;
  invoke(params: InvokeParams): Promise<JsonValue> | JsonValue;
  shutdown?(): Promise<void> | void;
}
