import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createSourceLoader } from "./vite-source-loader.mjs";

const source = await createSourceLoader();
const { analyzeMerge, applyMergePlan } = await source.load("merge.ts");
const { createEmptyState } = await source.load("domain.ts");
after(() => source.close());

function task(id, title, createdAt = 100) {
  return { id, title, notes: "", descriptionMarkdown: "", priority: "low", dueDate: "", tag: "", status: "active", folderId: null, order: 0, resolvedAt: null, pendingResolution: null, rescheduleHistory: [], statusHistory: [], createdAt, updatedAt: createdAt };
}

function snapshot({ tasks = [], folders = [], workLogs = [], attachments = [], blobs = new Map(), metadata } = {}) {
  const value = { state: { ...createEmptyState(), tasks, folders }, workLogs, attachments, attachmentBlobs: blobs };
  if (metadata) value.metadata = metadata;
  return value;
}

test("merge adds a new task while preserving current preferences", () => {
  const current = snapshot();
  current.state.preferences.theme = "dark";
  const incoming = snapshot({ tasks: [task("task-new", "Imported")] });
  incoming.state.preferences.theme = "light";
  const plan = analyzeMerge(current, incoming);
  assert.equal(plan.summary.added, 1);
  const result = applyMergePlan(plan);
  assert.deepEqual(result.workspace.state.tasks.map((item) => item.id), ["task-new"]);
  assert.equal(result.workspace.state.preferences.theme, "dark");
});

test("reapplying an identical snapshot is idempotent", () => {
  const current = snapshot({ tasks: [task("task-1", "Same")] });
  const plan = analyzeMerge(current, snapshot({ tasks: [task("task-1", "Same")] }));
  assert.equal(plan.summary.unchanged, 1);
  const result = applyMergePlan(plan);
  assert.equal(result.applied, 0);
  assert.equal(result.workspace.state.tasks.length, 1);
});

test("matching timestamps and titles with different ids are only suspected duplicates", () => {
  const current = snapshot({ tasks: [task("task-current", "Same title", 200)] });
  const incoming = snapshot({ tasks: [task("task-imported", " same title ", 200)] });
  const plan = analyzeMerge(current, incoming);
  assert.equal(plan.summary.suspectedDuplicates, 1);
  const result = applyMergePlan(plan);
  assert.deepEqual(result.workspace.state.tasks.map((item) => item.id), ["task-current"]);
});

test("same id with different content is a conflict without a revision proof", () => {
  const current = snapshot({ tasks: [task("task-1", "Current")] });
  const incoming = snapshot({ tasks: [task("task-1", "Imported")] });
  const plan = analyzeMerge(current, incoming);
  assert.equal(plan.summary.conflicts, 1);
  assert.equal(applyMergePlan(plan).workspace.state.tasks[0].title, "Current");
});

test("a direct entity revision is classified as a safe update", () => {
  const currentTask = task("task-1", "Current");
  const incomingTask = task("task-1", "Imported");
  const revision = (revisionId, parentRevisionId, contentHash) => ({ revisionId, parentRevisionId, contentHash, createdAt: 100, updatedAt: 101 });
  const metadata = (entityRevisions) => ({ schemaVersion: 6, workspaceId: "workspace", snapshotId: crypto.randomUUID(), parentSnapshotId: null, exportedAt: new Date(0).toISOString(), contentSummary: { tasks: 1, folders: 0, workLogs: 0, attachments: 0, attachmentBytes: 0 }, entityRevisions, tombstones: [] });
  const current = snapshot({ tasks: [currentTask], metadata: metadata({ "task:task-1": revision("r1", null, "one") }) });
  const incoming = snapshot({ tasks: [incomingTask], metadata: metadata({ "task:task-1": revision("r2", "r1", "two") }) });
  const plan = analyzeMerge(current, incoming);
  assert.equal(plan.summary.updated, 1);
  assert.equal(applyMergePlan(plan).workspace.state.tasks[0].title, "Imported");
});

test("attachments with different ids and the same content hash are deduplicated", () => {
  const base = task("task-1", "Task");
  const attachment = (id, name) => ({ id, taskId: "task-1", name, type: "text/plain", size: 3, lastModified: 100, kind: "text", createdAt: 100, contentHash: "sha256:same" });
  const current = snapshot({ tasks: [base], attachments: [attachment("a-current", "current.txt")], blobs: new Map([["a-current", new Blob(["abc"]) ]]) });
  const incoming = snapshot({ tasks: [base], attachments: [attachment("a-import", "imported.txt")], blobs: new Map([["a-import", new Blob(["abc"]) ]]) });
  const plan = analyzeMerge(current, incoming);
  assert.equal(plan.summary.unchanged, 2);
  assert.equal(applyMergePlan(plan).workspace.attachments.length, 1);
});

test("deletion tombstones preserve current data by default and can be explicitly applied", () => {
  const current = snapshot({ tasks: [task("task-1", "Current")] });
  const incoming = snapshot({ metadata: { schemaVersion: 6, workspaceId: "workspace", snapshotId: "snapshot", parentSnapshotId: null, exportedAt: new Date(0).toISOString(), contentSummary: { tasks: 0, folders: 0, workLogs: 0, attachments: 0, attachmentBytes: 0 }, entityRevisions: {}, tombstones: [{ deletionId: "delete-1", entityType: "task", entityId: "task-1", deletedAt: 300 }] } });
  const plan = analyzeMerge(current, incoming);
  assert.equal(plan.summary.deletions, 1);
  assert.equal(applyMergePlan(plan).workspace.state.tasks.length, 1);
  assert.equal(applyMergePlan(plan, { "delete:task:task-1": "use-imported" }).workspace.state.tasks.length, 0);
});

test("worklog conflicts can keep both records with an imported conflict identity", () => {
  const base = task("task-1", "Task");
  const worklog = (content) => ({ id: "task-1::2026-08-14", taskId: "task-1", workDate: "2026-08-14", contentMarkdown: content, progressPercent: 50, createdAt: 100, updatedAt: 200 });
  const plan = analyzeMerge(
    snapshot({ tasks: [base], workLogs: [worklog("current")] }),
    snapshot({ tasks: [base], workLogs: [worklog("incoming")] }),
  );
  const item = plan.items.find((entry) => entry.entityType === "worklog");
  assert.ok(item.allowedDecisions.includes("keep-both"));
  const result = applyMergePlan(plan, { [item.key]: "keep-both" });
  assert.equal(result.workspace.workLogs.length, 2);
  assert.equal(result.workspace.workLogs.find((entry) => entry.id !== "task-1::2026-08-14").conflictOrigin, "imported");
});

test("task reschedule and status histories merge by stable event id", () => {
  const current = task("task-1", "Task");
  current.rescheduleHistory = [{ eventId: "event-a", fromDate: "", toDate: "2026-08-15", changedAt: 200, reason: "A", source: "quick" }];
  current.statusHistory = [{ eventId: "status-a", fromStatus: "active", toStatus: "completed", changedAt: 210, source: "resolution" }];
  const imported = structuredClone(current);
  imported.rescheduleHistory = [{ eventId: "event-b", fromDate: "2026-08-15", toDate: "2026-08-16", changedAt: 300, reason: "B", source: "detail" }];
  imported.statusHistory = [{ eventId: "status-b", fromStatus: "completed", toStatus: "active", changedAt: 310, source: "restore" }];
  const plan = analyzeMerge(snapshot({ tasks: [current] }), snapshot({ tasks: [imported] }));
  assert.equal(plan.summary.updated, 1);
  const merged = applyMergePlan(plan).workspace.state.tasks[0];
  assert.deepEqual(merged.rescheduleHistory.map((entry) => entry.eventId), ["event-a", "event-b"]);
  assert.deepEqual(merged.statusHistory.map((entry) => entry.eventId), ["status-a", "status-b"]);
  const repeated = applyMergePlan(analyzeMerge(snapshot({ tasks: [merged] }), snapshot({ tasks: [imported] }))).workspace.state.tasks[0];
  assert.equal(repeated.rescheduleHistory.length, 2);
  assert.equal(repeated.statusHistory.length, 2);
});

test("different content under the same task event id remains a conflict", () => {
  const current = task("task-1", "Task");
  const imported = task("task-1", "Task");
  current.rescheduleHistory = [{ eventId: "event-a", fromDate: "", toDate: "2026-08-15", changedAt: 200, reason: "current", source: "quick" }];
  imported.rescheduleHistory = [{ ...current.rescheduleHistory[0], reason: "incoming" }];
  const plan = analyzeMerge(snapshot({ tasks: [current] }), snapshot({ tasks: [imported] }));
  assert.equal(plan.summary.conflicts, 1);
  assert.equal(applyMergePlan(plan).workspace.state.tasks[0].rescheduleHistory[0].reason, "current");
});
