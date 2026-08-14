import test, { after } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { createSourceLoader } from "./vite-source-loader.mjs";

const source = await createSourceLoader();
const { createBackupArchive, parseBackupPackage } = await source.load("backup.ts");
const { createEmptyState } = await source.load("domain.ts");
after(() => source.close());

function task() {
  return { id: "task-1", title: "Backup task", notes: "", descriptionMarkdown: "", priority: "low", dueDate: "", tag: "", status: "active", folderId: null, order: 0, resolvedAt: null, pendingResolution: null, rescheduleHistory: [], statusHistory: [], createdAt: 100, updatedAt: 100 };
}

test("backup export writes schema v6 identity, revision, and content summary", async () => {
  const state = { ...createEmptyState(), tasks: [task()] };
  const workspace = { state, workLogs: [], attachments: [], attachmentBlobs: new Map() };
  const backend = { available: true, exportSnapshot: async () => workspace };
  const archive = await createBackupArchive(state, backend);
  const zip = await JSZip.loadAsync(await archive.arrayBuffer());
  const manifest = JSON.parse(await zip.file("manifest.json").async("text"));
  assert.equal(manifest.schemaVersion, 6);
  assert.ok(manifest.workspaceId);
  assert.ok(manifest.snapshotId);
  assert.equal(manifest.contentSummary.tasks, 1);
  assert.equal(manifest.contentSummary.attachments, 0);
  assert.ok(manifest.entityRevisions["task:task-1"]);

  const input = Object.assign(new Uint8Array(await archive.arrayBuffer()), { name: "backup.zip", type: "application/zip" });
  const parsed = await parseBackupPackage(input);
  assert.equal(parsed.recovered, true);
  assert.equal(parsed.sourceVersion, 6);
  assert.equal(parsed.workspace.metadata.snapshotId, manifest.snapshotId);
});

test("schema v5 ZIP backups remain readable with conservative merge metadata", async () => {
  const state = { ...createEmptyState(), tasks: [task()] };
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify({ format: "task-workbench-backup", schemaVersion: 5, exportedAt: new Date(0).toISOString(), appState: state, workLogs: [], attachments: [] }));
  const blob = await zip.generateAsync({ type: "blob" });
  const input = Object.assign(new Uint8Array(await blob.arrayBuffer()), { name: "backup-v5.zip", type: "application/zip" });
  const parsed = await parseBackupPackage(input);
  assert.equal(parsed.recovered, true);
  assert.equal(parsed.sourceVersion, 5);
  assert.equal(parsed.workspace.metadata, undefined);
  assert.match(parsed.message, /保守合并/);
});
