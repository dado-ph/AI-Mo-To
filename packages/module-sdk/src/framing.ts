const HEADER_END = Buffer.from("\r\n\r\n");
const CONTENT_LENGTH = /^Content-Length: ([0-9]+)$/i;

export class FrameError extends Error {
  readonly code = "InvalidFrame";
}

export function encodeFrame(value: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(value), "utf8");
  return Buffer.concat([
    Buffer.from(`Content-Length: ${body.byteLength}\r\n\r\n`, "ascii"),
    body
  ]);
}

export class FrameDecoder {
  readonly #maximumBytes: number;
  #buffer = Buffer.alloc(0);

  constructor(maximumBytes = 1024 * 1024) {
    this.#maximumBytes = maximumBytes;
  }

  push(chunk: Uint8Array): unknown[] {
    this.#buffer = Buffer.concat([this.#buffer, Buffer.from(chunk)]);
    const messages: unknown[] = [];

    while (this.#buffer.byteLength > 0) {
      const boundary = this.#buffer.indexOf(HEADER_END);
      if (boundary < 0) {
        if (this.#buffer.byteLength > 1024) {
          throw new FrameError("Frame header exceeds 1024 bytes");
        }
        break;
      }

      const header = this.#buffer.subarray(0, boundary).toString("ascii");
      const lines = header.split("\r\n");
      if (lines.length !== 1) {
        throw new FrameError("Only Content-Length is permitted");
      }
      const match = CONTENT_LENGTH.exec(lines[0] ?? "");
      if (!match) {
        throw new FrameError("Missing or invalid Content-Length");
      }
      const length = Number(match[1]);
      if (!Number.isSafeInteger(length) || length > this.#maximumBytes) {
        throw new FrameError("Frame body exceeds the configured limit");
      }

      const bodyStart = boundary + HEADER_END.byteLength;
      if (this.#buffer.byteLength < bodyStart + length) break;
      const body = this.#buffer.subarray(bodyStart, bodyStart + length);
      this.#buffer = this.#buffer.subarray(bodyStart + length);
      try {
        messages.push(JSON.parse(body.toString("utf8")));
      } catch {
        throw new FrameError("Frame body is not valid JSON");
      }
    }

    return messages;
  }
}
