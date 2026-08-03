# Module Development & Architecture

AI-Mo-To modules are self-contained, file-native tools created by AI agents under human governance.

---

## 🏛️ 3-Tier Boundary Model

1. **Tier 1 (Core Host Platform)**: The immutable platform engine and safety harness (`@ai-mo-to/engine`, `@ai-mo-to/module-host`).
2. **Tier 2 (Staging Lab)**: The build directory where AI agents author React components, CSS tokens, Python/Node scripts, and `module.json` manifests.
3. **Tier 3 (User Workspace)**: The human-governed workspace directory (`Documents/AI-Mo-To/Workspaces/`). Installed modules execute here against actual user files (`.md`, `.pdf`, `.csv`, code) under explicit human capability approval.

---

## 📁 File-Native Data & Polyglot Execution

- **File-Native State**: Instead of locking data away in binary database tables, modules operate on human-readable files (`.md`, `.csv`, `.json`). Humans can inspect and edit their files directly using any editor.
- **Polyglot Execution**: Modules can combine React UI view components with background Python or Node.js scripts executed safely through the AI-Mo-To capability harness.

---

## 🔌 Protocol & Framing

The module process communicates on standard input/output with one JSON value per `Content-Length` frame:

```
Content-Length: <UTF-8 JSON byte count>\r\n\r\n<JSON>
```

Use `encodeFrame` and `FrameDecoder` from `@ai-mo-to/module-sdk` rather than hand-rolling framing. The decoder accepts only one `Content-Length` header, limits headers to 1024 bytes, and defaults frames to 1 MiB.

### JSON-RPC Methods

Requests use JSON-RPC 2.0 with a string ID. The supported methods are:
- `module.initialize` with `{ "protocolVersion": "1.0.0", "moduleId": "..." }`
- `module.invoke` with `{ "context_ref": "...", "command": "...", "input": <JSON value> }`
- `module.shutdown` with `{}`

`ModuleHost` starts the entrypoint under Node, initializes it immediately, terminates the child on protocol faults or timeout, and retains only the trailing diagnostics buffer. Never write ordinary logs to stdout: it is reserved for framed protocol responses; use stderr for diagnostics.
