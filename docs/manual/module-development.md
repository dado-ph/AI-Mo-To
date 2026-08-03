# Module development

An AI-Mo-To module is a local feature installed into a workspace after validation and explicit approval. A module declares its views, records, commands, events, capabilities, and migrations in `module.json`.

Build modules in the generated-app staging repository. Do not write directly into `.aimoto` or alter the AI-Mo-To product repository. AI-Mo-To validates the module and installs the reviewed bundle into the workspace only after `apply` succeeds.

## Module process protocol

Module processes use JSON-RPC 2.0 over standard input and output. Each JSON value is framed like this:

```text
Content-Length: <UTF-8 JSON byte count>\r\n\r\n<JSON>
```

Use `encodeFrame` and `FrameDecoder` from `@ai-mo-to/module-sdk`; do not hand-roll framing. Standard output is reserved for framed protocol responses, so write diagnostics to standard error.

Supported methods are:

- `module.initialize` with `{ "protocolVersion": "1.0.0", "moduleId": "..." }`
- `module.invoke` with `{ "context_ref": "...", "command": "...", "input": <JSON value> }`
- `module.shutdown` with `{}`

`ModuleHost` starts Node entrypoints, initializes them, and ends the child process when it encounters a protocol fault or timeout. Capability and authority checks apply to engine-mediated module calls; they are not an operating-system sandbox.

See [Protocol](protocol.md) for the proposal and approval contracts.
