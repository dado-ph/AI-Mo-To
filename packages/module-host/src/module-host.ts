import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  encodeFrame,
  FrameDecoder,
  FrameError,
  type InvokeParams,
  type JsonRpcResponse,
  type JsonValue
} from "@ai-mo-to/module-sdk";
import { ModuleHostError } from "./errors.js";

interface PendingRequest {
  resolve(value: JsonValue): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

export interface ModuleHostOptions {
  moduleId: string;
  entrypoint: string;
  nodeExecutable?: string;
  timeoutMs?: number;
  maximumFrameBytes?: number;
  maximumDiagnosticBytes?: number;
}

export class ModuleHost {
  readonly #options: Required<Omit<ModuleHostOptions, "nodeExecutable">> & {
    nodeExecutable: string;
  };
  readonly #pending = new Map<string, PendingRequest>();
  #child: ChildProcessWithoutNullStreams | undefined;
  #diagnostics = Buffer.alloc(0);
  #terminalError: ModuleHostError | undefined;

  constructor(options: ModuleHostOptions) {
    this.#options = {
      nodeExecutable: process.execPath,
      timeoutMs: 5_000,
      maximumFrameBytes: 1024 * 1024,
      maximumDiagnosticBytes: 64 * 1024,
      ...options
    };
  }

  get diagnostics(): string {
    return this.#diagnostics.toString("utf8");
  }

  get running(): boolean {
    return Boolean(this.#child && this.#child.exitCode === null && !this.#terminalError);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.#terminalError = undefined;
    const child = spawn(this.#options.nodeExecutable, [this.#options.entrypoint], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    this.#child = child;
    const decoder = new FrameDecoder(this.#options.maximumFrameBytes);

    child.stdout.on("data", (chunk: Buffer) => {
      try {
        for (const message of decoder.push(chunk)) {
          this.#receive(message);
        }
      } catch (error) {
        this.#fail(
          new ModuleHostError(
            "HostProtocolError",
            error instanceof FrameError ? error.message : "Invalid host response"
          )
        );
      }
    });
    child.stderr.on("data", (chunk: Buffer) => this.#captureDiagnostic(chunk));
    child.on("error", (error) =>
      this.#fail(new ModuleHostError("HostExited", error.message))
    );
    child.on("exit", (code, signal) => {
      if (!this.#terminalError) {
        this.#fail(
          new ModuleHostError(
            "HostExited",
            `Module host exited (code=${String(code)}, signal=${String(signal)})`
          ),
          false
        );
      }
    });

    await this.#request("module.initialize", {
      protocolVersion: "1.0.0",
      moduleId: this.#options.moduleId
    });
  }

  async invoke(params: InvokeParams): Promise<JsonValue> {
    return this.#request("module.invoke", {
      context_ref: params.context_ref,
      command: params.command,
      input: params.input
    });
  }

  async stop(): Promise<void> {
    const child = this.#child;
    if (!child) return;
    if (this.running) {
      try {
        await this.#request("module.shutdown", {});
      } catch {
        // Termination remains best-effort after a handler fault.
      }
    }
    if (child.exitCode === null) child.kill();
    this.#child = undefined;
  }

  async #request(method: string, params: JsonValue): Promise<JsonValue> {
    const child = this.#child;
    if (!child || child.exitCode !== null || this.#terminalError) {
      throw this.#terminalError ??
        new ModuleHostError("HostNotRunning", "Module host is not running");
    }
    const id = randomUUID();
    const response = new Promise<JsonValue>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        const error = new ModuleHostError(
          "HostTimeout",
          `${method} exceeded ${this.#options.timeoutMs}ms`
        );
        reject(error);
        this.#fail(error);
      }, this.#options.timeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
    });
    child.stdin.write(encodeFrame({ jsonrpc: "2.0", id, method, params }));
    return response;
  }

  #receive(value: unknown): void {
    if (!value || typeof value !== "object") {
      this.#fail(new ModuleHostError("HostProtocolError", "Response is not an object"));
      return;
    }
    const response = value as Partial<JsonRpcResponse>;
    if (response.jsonrpc !== "2.0" || typeof response.id !== "string") {
      this.#fail(new ModuleHostError("HostProtocolError", "Invalid JSON-RPC response"));
      return;
    }
    const pending = this.#pending.get(response.id);
    if (!pending) {
      this.#fail(new ModuleHostError("HostProtocolError", "Unknown response id"));
      return;
    }
    clearTimeout(pending.timer);
    this.#pending.delete(response.id);
    if ("error" in response && response.error) {
      pending.reject(
        new ModuleHostError("HostProtocolError", response.error.message)
      );
    } else if ("result" in response) {
      pending.resolve(response.result as JsonValue);
    } else {
      pending.reject(new ModuleHostError("HostProtocolError", "Missing result"));
    }
  }

  #captureDiagnostic(chunk: Buffer): void {
    const combined = Buffer.concat([this.#diagnostics, chunk]);
    this.#diagnostics =
      combined.byteLength <= this.#options.maximumDiagnosticBytes
        ? combined
        : combined.subarray(combined.byteLength - this.#options.maximumDiagnosticBytes);
  }

  #fail(error: ModuleHostError, terminate = true): void {
    if (this.#terminalError) return;
    this.#terminalError = error;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
    if (terminate && this.#child?.exitCode === null) this.#child.kill();
  }
}
