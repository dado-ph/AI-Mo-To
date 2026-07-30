import { describe, expect, it } from "vitest";
import { encodeFrame, FrameDecoder, FrameError } from "../src/index.js";

describe("framed JSON-RPC codec", () => {
  it("decodes a frame split across chunks", () => {
    const encoded = encodeFrame({ jsonrpc: "2.0", id: "1", result: "ok" });
    const decoder = new FrameDecoder();
    expect(decoder.push(encoded.subarray(0, 8))).toEqual([]);
    expect(decoder.push(encoded.subarray(8))).toEqual([
      { jsonrpc: "2.0", id: "1", result: "ok" }
    ]);
  });

  it("decodes coalesced frames", () => {
    const decoder = new FrameDecoder();
    expect(
      decoder.push(Buffer.concat([encodeFrame({ id: "1" }), encodeFrame({ id: "2" })]))
    ).toEqual([{ id: "1" }, { id: "2" }]);
  });

  it("rejects unframed stdout and invalid JSON", () => {
    expect(() =>
      new FrameDecoder().push(Buffer.from("hello\r\n\r\n"))
    ).toThrow(FrameError);
    expect(() =>
      new FrameDecoder().push(Buffer.from("Content-Length: 1\r\n\r\n{"))
    ).toThrow("valid JSON");
  });

  it("rejects oversized frames", () => {
    expect(() =>
      new FrameDecoder(2).push(Buffer.from("Content-Length: 3\r\n\r\n{} "))
    ).toThrow("configured limit");
  });
});
