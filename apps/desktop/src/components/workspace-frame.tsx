import { useEffect, useRef } from "react";

import type { WorkspaceInspection } from "@ai-mo-to/engine";
import type { WorkspacePresentation } from "../contracts.js";

type ActionRequest = {
  channel: "aimoto.workspace-action";
  requestId: string;
  action: string;
  input: Record<string, unknown>;
};

function isActionRequest(value: unknown): value is ActionRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.channel === "aimoto.workspace-action"
    && typeof candidate.requestId === "string"
    && /^[a-zA-Z0-9_-]{1,64}$/.test(candidate.requestId)
    && typeof candidate.action === "string"
    && /^[a-z][a-z0-9.-]{2,63}$/.test(candidate.action)
    && Boolean(candidate.input)
    && typeof candidate.input === "object"
    && !Array.isArray(candidate.input);
}

/** Keeps generated workspace code inside an iframe and forwards only named action requests. */
export function WorkspaceFrame({ workspace, presentation }: { workspace: WorkspaceInspection; presentation: WorkspacePresentation }) {
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      const contentWindow = frame.current?.contentWindow;
      const request = event.data;
      if (!contentWindow || event.source !== contentWindow || !isActionRequest(request)) return;
      void window.aimoto.invokeWorkspaceAction(workspace.root, request.action, request.input)
        .then((result) => contentWindow.postMessage({ channel: "aimoto.workspace-action-result", requestId: request.requestId, result }, "*"));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [workspace.root]);

  return presentation.entryUrl
    ? <iframe ref={frame} title={workspace.name} src={presentation.entryUrl} className="h-full w-full border-0 bg-white" />
    : null;
}
