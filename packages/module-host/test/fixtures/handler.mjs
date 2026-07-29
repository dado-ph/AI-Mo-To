import { Buffer } from "node:buffer";

let buffered = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  buffered = Buffer.concat([buffered, chunk]);
  while (true) {
    const boundary = buffered.indexOf("\r\n\r\n");
    if (boundary < 0) return;
    const match = /^Content-Length: ([0-9]+)$/.exec(
      buffered.subarray(0, boundary).toString("ascii")
    );
    if (!match) process.exit(2);
    const length = Number(match[1]);
    const start = boundary + 4;
    if (buffered.length < start + length) return;
    const request = JSON.parse(buffered.subarray(start, start + length));
    buffered = buffered.subarray(start + length);

    if (request.method === "module.invoke" && request.params.command === "hang") {
      continue;
    }
    if (request.method === "module.invoke" && request.params.command === "crash") {
      process.exit(7);
    }
    if (request.method === "module.invoke" && request.params.command === "diagnose") {
      process.stderr.write("x".repeat(256));
    }
    const result =
      request.method === "module.invoke"
        ? { context_ref: request.params.context_ref, input: request.params.input }
        : { ready: true };
    const body = Buffer.from(
      JSON.stringify({ jsonrpc: "2.0", id: request.id, result })
    );
    process.stdout.write(
      Buffer.concat([
        Buffer.from(`Content-Length: ${body.length}\r\n\r\n`),
        body
      ])
    );
    if (request.method === "module.shutdown") process.exit(0);
  }
});
