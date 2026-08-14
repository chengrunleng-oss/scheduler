// 测试反馈文档校验器：结构、可复现性、ID 一致性与登记表生命周期检查。
// 纳入 npm run verify（npm run validate:feedback）。零运行时依赖。
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const feedbackDir = join(root, "docs", "feedback");
const rootDocPath = join(root, "TEST_FEEDBACK.json");

const COMMIT_RE = /^[0-9a-f]{7,40}$/;
const FINDING_RE = /^TEST-V\d{2}-\d{3}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const OVERALL_STATUSES = ["passed", "partially_conforms", "changes_required", "needs_revision", "passed_with_manual_verification_pending"];
const GATE_STATUSES = ["passed", "blocked", "pending"];
const CRITERION_STATUSES = ["met", "pending"];
const SEVERITIES = ["P0", "P1", "P2"];
const REGISTRY_STATUSES = ["open", "fixed", "verified", "closed"];
const REGISTRY_EVENTS = ["opened", "fixed", "verified", "closed", "reopened", "noted"];

const errors = [];

function fail(message) {
  errors.push(message);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${path}: 无法解析 JSON: ${error.message}`);
    return undefined;
  }
}

function checkString(value, path, label) {
  if (typeof value !== "string" || value.trim() === "") fail(`${path}: ${label} 必须是非空字符串`);
}

function asArray(value, path, label) {
  if (!Array.isArray(value)) {
    fail(`${path}: ${label} 必须是数组`);
    return [];
  }
  return value;
}

function validateFinding(value, path, { lenientEvidence = false } = {}) {
  if (!value || typeof value !== "object") return fail(`${path}: finding 必须是对象`);
  checkString(value.id, path, "id");
  if (typeof value.id === "string" && !FINDING_RE.test(value.id)) fail(`${path}: finding id ${value.id} 不符合 TEST-Vxx-xxx 格式`);
  if (!SEVERITIES.includes(value.severity)) fail(`${path}: ${value.id ?? "?"} severity 必须是 P0/P1/P2`);
  checkString(value.title, path, "title");
  if (Array.isArray(value.evidence)) {
    // 正常
  } else if (lenientEvidence && typeof value.evidence === "string") {
    // format 16 及以下历史快照允许单字符串 evidence（如 TEST-V08-007），保持快照原样。
  } else {
    fail(`${path}: evidence 必须是数组`);
  }
  checkString(value.required_action, path, "required_action");
}

function validateRoundDoc(doc, path, { reproducible = false, crossCheck = null } = {}) {
  if (!doc) return;
  if (doc.document_type !== "scheduler_test_feedback") fail(`${path}: document_type 必须是 scheduler_test_feedback`);
  if (!Number.isInteger(doc.format_version) || doc.format_version < 1) fail(`${path}: format_version 必须是正整数`);
  if (typeof doc.test_date === "string" && !DATE_RE.test(doc.test_date)) fail(`${path}: test_date 必须是 YYYY-MM-DD`);
  checkString(doc.target_branch, path, "target_branch");
  if (reproducible) {
    if (typeof doc.source_revision !== "string" || !COMMIT_RE.test(doc.source_revision)) {
      fail(`${path}: source_revision 必须是纯提交哈希（可复现性规则），当前为 ${JSON.stringify(doc.source_revision)}`);
    }
  } else {
    checkString(doc.source_revision, path, "source_revision");
  }
  checkString(doc.target_release, path, "target_release");
  if (!OVERALL_STATUSES.includes(doc.overall_result?.status)) fail(`${path}: overall_result.status 必须是 ${OVERALL_STATUSES.join("/")}`);

  for (const finding of asArray(doc.open_findings, path, "open_findings")) validateFinding(finding, `${path}#open_findings`, { lenientEvidence: doc.format_version < 17 });
  for (const finding of asArray(doc.pending_verification ?? [], path, "pending_verification")) validateFinding(finding, `${path}#pending_verification`, { lenientEvidence: doc.format_version < 17 });
  for (const finding of asArray(doc.resolved_findings ?? [], path, "resolved_findings")) validateFinding(finding, `${path}#resolved_findings`, { lenientEvidence: doc.format_version < 17 });

  if (doc.format_version >= 17) {
    const history = asArray(doc.format_history, path, "format_history");
    if (history.length === 0) fail(`${path}: format_version >= 17 必须提供非空 format_history`);
    if (history.length > 0 && history[history.length - 1]?.version !== doc.format_version) {
      fail(`${path}: format_history 最后一项 version 必须等于当前 format_version`);
    }
    const gate = doc.release_gate;
    if (!gate || !GATE_STATUSES.includes(gate.status)) fail(`${path}: release_gate.status 必须是 ${GATE_STATUSES.join("/")}`);
    for (const criterion of asArray(gate?.exit_criteria, path, "release_gate.exit_criteria")) {
      checkString(criterion.description, path, "exit criterion description");
      if (!CRITERION_STATUSES.includes(criterion.status)) fail(`${path}: exit criterion status 必须是 ${CRITERION_STATUSES.join("/")}`);
    }
    checkString(doc.registry, path, "registry 引用");
  }

  if (crossCheck) {
    const all = [
      ...asArray(doc.open_findings, path, "open_findings"),
      ...asArray(doc.pending_verification ?? [], path, "pending_verification"),
      ...asArray(doc.resolved_findings ?? [], path, "resolved_findings"),
    ];
    for (const finding of all) {
      if (finding?.id && !crossCheck.has(finding.id)) fail(`${path}: finding ${finding.id} 未在 docs/feedback/registry.json 中登记`);
    }
  }
}

function validateRegistry(doc, path) {
  if (!doc) return;
  if (doc.document_type !== "scheduler_findings_registry") fail(`${path}: document_type 必须是 scheduler_findings_registry`);
  if (doc.format_version !== 1) fail(`${path}: 目前仅支持 registry format_version 1`);

  const ids = new Set();
  for (const finding of asArray(doc.findings, path, "findings")) {
    if (!finding || typeof finding !== "object") { fail(`${path}: 登记项必须是对象`); continue; }
    checkString(finding.id, path, "finding id");
    if (typeof finding.id === "string" && !FINDING_RE.test(finding.id)) fail(`${path}: 登记项 id ${finding.id} 不符合 TEST-Vxx-xxx 格式`);
    if (ids.has(finding.id)) fail(`${path}: 登记项 id 重复: ${finding.id}`);
    if (finding.id) ids.add(finding.id);
    if (!SEVERITIES.includes(finding.severity)) fail(`${path}: ${finding.id} severity 无效`);
    if (!["defect", "manual-verification", "process"].includes(finding.kind)) fail(`${path}: ${finding.id} kind 必须是 defect/manual-verification/process`);
    if (!REGISTRY_STATUSES.includes(finding.status)) fail(`${path}: ${finding.id} status 必须是 ${REGISTRY_STATUSES.join("/")}`);
    const history = asArray(finding.history, path, `${finding.id}.history`);
    if (history.length === 0) fail(`${path}: ${finding.id} 缺少 history`);
    for (const event of history) {
      if (!REGISTRY_EVENTS.includes(event?.event)) fail(`${path}: ${finding.id} history 事件必须是 ${REGISTRY_EVENTS.join("/")}`);
    }
    const lastEvent = history[history.length - 1]?.event;
    if (["fixed", "verified", "closed"].includes(finding.status)) {
      if (lastEvent !== finding.status) fail(`${path}: ${finding.id} status=${finding.status} 与最后一条 history 事件 ${lastEvent} 不一致`);
      if (typeof finding.fix_commit !== "string" || finding.fix_commit.trim() === "") fail(`${path}: ${finding.id} 已关闭但缺少 fix_commit`);
      if (!Array.isArray(finding.verified_by) || finding.verified_by.length === 0) fail(`${path}: ${finding.id} 已关闭但缺少 verified_by`);
    } else if (finding.status === "open" && !["opened", "noted", "reopened"].includes(lastEvent)) {
      fail(`${path}: ${finding.id} status=open 与最后一条 history 事件 ${lastEvent} 不一致`);
    }
  }

  for (const round of asArray(doc.rounds, path, "rounds")) {
    checkString(round.snapshot, path, "round.snapshot");
    if (round.snapshot?.startsWith("docs/")) {
      if (!existsSync(join(root, round.snapshot))) fail(`${path}: 快照文件不存在: ${round.snapshot}`);
    } else if (!round.snapshot?.startsWith("git:")) {
      fail(`${path}: round.snapshot 必须是 docs/ 路径或 git: 引用: ${round.snapshot}`);
    }
    if (typeof round.test_date === "string" && !DATE_RE.test(round.test_date)) fail(`${path}: round.test_date 必须是 YYYY-MM-DD`);
  }

  const gate = doc.release_gate;
  if (!gate || !GATE_STATUSES.includes(gate.status)) fail(`${path}: release_gate.status 必须是 ${GATE_STATUSES.join("/")}`);
  for (const criterion of asArray(gate?.exit_criteria, path, "release_gate.exit_criteria")) {
    checkString(criterion.description, path, "exit criterion description");
    if (!CRITERION_STATUSES.includes(criterion.status)) fail(`${path}: exit criterion status 必须是 ${CRITERION_STATUSES.join("/")}`);
    for (const id of asArray(criterion.finding_ids, path, "exit criterion finding_ids")) {
      if (!ids.has(id)) fail(`${path}: exit criterion 引用未登记的 finding: ${id}`);
    }
  }
}

const registry = readJson(join(feedbackDir, "registry.json"));
const registryIds = new Set((registry?.findings ?? []).map((finding) => finding?.id).filter(Boolean));
validateRoundDoc(readJson(rootDocPath), "TEST_FEEDBACK.json", { reproducible: true, crossCheck: registryIds });
validateRegistry(registry, "docs/feedback/registry.json");

if (existsSync(feedbackDir)) {
  for (const entry of readdirSync(feedbackDir).sort()) {
    if (!entry.endsWith(".json") || entry === "registry.json") continue;
    const file = join(feedbackDir, entry);
    if (!statSync(file).isFile()) continue;
    validateRoundDoc(readJson(file), `docs/feedback/${entry}`, { reproducible: false });
  }
}

if (errors.length > 0) {
  console.error(`测试反馈文档校验失败，共 ${errors.length} 项：`);
  for (const message of errors) console.error(`  - ${message}`);
  process.exit(1);
}
console.log("测试反馈文档校验通过：TEST_FEEDBACK.json、docs/feedback/registry.json 与全部归档快照结构一致。");
