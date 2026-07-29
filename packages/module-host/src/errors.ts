export type ModuleHostErrorCode =
  | "HostNotRunning"
  | "HostProtocolError"
  | "HostExited"
  | "HostTimeout";

export class ModuleHostError extends Error {
  constructor(
    readonly code: ModuleHostErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ModuleHostError";
  }
}
