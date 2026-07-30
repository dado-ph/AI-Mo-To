# Module development

The module runtime is a library-level child-process protocol; it is not exposed
through the CLI or a desktop shell yet. A module process communicates on
standard input/output with one JSON value per `Content-Length` frame:

```
Content-Length: <UTF-8 JSON byte count>\r\n\r\n<JSON>
```

Use `encodeFrame` and `FrameDecoder` from `@ai-mo-to/module-sdk` rather than
hand-rolling framing. The decoder accepts only one `Content-Length` header,
limits headers to 1024 bytes, and defaults frames to 1 MiB.

## JSON-RPC methods

Requests use JSON-RPC 2.0 with a string ID. The supported methods are:

- `module.initialize` with `{ "protocolVersion": "1.0.0", "moduleId": "..." }`
- `module.invoke` with `{ "context_ref": "...", "command": "...", "input": <JSON value> }`
- `module.shutdown` with `{}`

A successful response is `{ "jsonrpc": "2.0", "id": "...", "result": ... }`.
A failure has `{ "error": { "code": number, "message": string, "data"?: ... } }`.
The host treats malformed responses, unknown IDs, and module RPC errors as host
protocol failures.

Implement `ModuleHandler.initialize`, `ModuleHandler.invoke`, and optionally
`shutdown`. Inputs and results must be JSON-compatible. Native view declarations
are descriptive data, with root primitives such as `form`, `list`, `table`,
`detail`, or `timeline`; they are not rendered by an application in this slice.

`ModuleHost` starts the entrypoint under Node, initializes it immediately,
terminates the child on protocol faults or timeout, and retains only the trailing
diagnostics buffer. Never write ordinary logs to stdout: it is reserved for
framed protocol responses; use stderr for diagnostics.
