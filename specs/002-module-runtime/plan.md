# Module Runtime Implementation Plan

## Design

`@ai-mo-to/module-sdk` defines the handler-facing JSON-RPC messages, native view
declarations, module contract helpers, and a strict incremental frame codec.
`@ai-mo-to/module-host` owns child-process startup, initialization, request
correlation, deadlines, bounded diagnostics, and termination.

The wire format is:

```text
Content-Length: <UTF-8 byte count>\r\n
\r\n
<one JSON-RPC object>
```

The host sends `module.initialize` before accepting invocations and
`module.invoke` for commands. The module receives an opaque context reference;
it never receives an engine authority object or raw system resource.

## Work phases

1. Specify the SDK and host contracts with focused tests.
2. Implement strict incremental framing and SDK lifecycle helpers.
3. Implement supervised host lifecycle and stable failures.
4. Add Files and Tasks as declarative built-in modules.
5. Run targeted type checks and tests without changing workspace configuration.

## Integration boundaries

- `packages/protocol` remains the source of truth for static manifest
  validation.
- The engine will later mint and resolve `context_ref` values and broker
  effects.
- The desktop renderer will later consume native view declarations.
- Workspace composition will later pin the built-in module versions/digests.

