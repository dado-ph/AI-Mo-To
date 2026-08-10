import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { RecordStoreError, WorkspaceStore } from "../src/index.js";

const opened: WorkspaceStore[] = [];
function open(path: string): WorkspaceStore {
  const store = new WorkspaceStore(path);
  store.initialize();
  opened.push(store);
  return store;
}

afterEach(() => { while (opened.length) opened.pop()!.close(); });

describe("household records", () => {
  it("keeps files and tasks across restart while rejecting stale or invalid writes", async () => {
    const database = join(await mkdtemp(join(tmpdir(), "aimoto-records-")), "state.sqlite");
    const at = "2026-07-29T09:00:00.000Z";
    const taskValidator = (task: Record<string, unknown>) => {
      if (typeof task.title !== "string" || !task.title.trim() || !["open", "in-progress", "done"].includes(String(task.status))) {
        throw new RecordStoreError("ValidationFailed", "A task needs a title and recognised status.");
      }
    };
    const first = open(database);
    first.createRecord({ moduleId: "app.documents", collectionId: "document", recordId: "document-lease", now: at, data: {
      fileId: "file-lease", name: "Lease renewal.pdf", relativePath: "house/Lease renewal.pdf", kind: "file", size: 48219, updatedAt: at
    }});
    const draft = first.createRecord({ moduleId: "app.documents", collectionId: "document", recordId: "document-draft", now: at, data: {
      fileId: "file-draft", name: "old note.txt", relativePath: "house/old note.txt", kind: "file", size: 12, updatedAt: at
    }});
    first.deleteRecord({ moduleId: draft.moduleId, collectionId: draft.collectionId, recordId: draft.recordId, expectedVersion: draft.version, now: at });
    const task = first.createRecord({ moduleId: "app.household", collectionId: "item", recordId: "item-call-landlord", now: at, validate: taskValidator, data: {
      taskId: "task-call-landlord", title: "Call landlord about the lease", status: "open", dueAt: "2026-08-01T09:00:00.000Z", createdAt: at, updatedAt: at, version: 0
    }});
    const completed = first.updateRecord({ moduleId: task.moduleId, collectionId: task.collectionId, recordId: task.recordId, expectedVersion: task.version, now: "2026-07-29T10:00:00.000Z", validate: taskValidator, data: { ...task.data, status: "done", updatedAt: "2026-07-29T10:00:00.000Z", version: 1 } });
    expect(completed.version).toBe(2);
    expect(() => first.updateRecord({ moduleId: task.moduleId, collectionId: task.collectionId, recordId: task.recordId, expectedVersion: 1, now: at, validate: taskValidator, data: { ...task.data, status: "in-progress" } })).toThrow(/changed before/);
    expect(() => first.createRecord({ moduleId: "app.household", collectionId: "item", recordId: "bad", now: at, validate: taskValidator, data: { title: "", status: "waiting" } })).toThrow(/needs a title/);
    first.close(); opened.pop();

    const restarted = open(database);
    expect(restarted.listRecords("app.documents", "document")).toHaveLength(1);
    expect(restarted.getRecord("app.household", "item", task.recordId)?.data.status).toBe("done");
    expect(restarted.getRecord("app.household", "item", task.recordId)?.version).toBe(2);
  });
});
