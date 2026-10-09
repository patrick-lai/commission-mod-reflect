import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { docQuestion, pickDoc } from "../lib/reflect.mjs";

const here = new URL(".", import.meta.url);
const read = (name) => readFileSync(new URL(name, here), "utf8");
const lines = (name) => read(name).split("\n").filter(Boolean).map((line) => JSON.parse(line));
const Q = JSON.parse(read("questions.json"));
const FLOOR = 0.8;
const LABELS = new Set(["correction", "convention", "none"]);

function validate(cases, docs) {
  const ids = new Set();
  for (const item of cases) {
    if (ids.has(item.id) || !LABELS.has(item.label) || !["dev", "heldout"].includes(item.split) || typeof item.said !== "string") throw new Error(`bad case ${item.id}`);
    ids.add(item.id);
  }
  for (const item of docs) if (!Array.isArray(item.docs) || typeof item.expected !== "string") throw new Error(`bad doc case ${item.id}`);
}

function momentRequest(item) {
  const ask = (text) => `${text.replaceAll("{i}", "0")} ${Q.DATA}`;
  return {
    model: "jev",
    state: { moments: [{ said: item.said, before: item.before, source: "message", interrupted: item.interrupted, opening: false }], guidance: Q.GUIDANCE },
    questions: {
      m0_kind: { type: "choice", instructions: ask(Q.KIND), criteria: Q.KIND_CRITERIA },
      m0_own: { type: "choice", instructions: ask(Q.OWN), criteria: { yes: "The stated condition is supported by the supplied evidence.", no: "The stated condition is not supported by the supplied evidence." } },
    },
  };
}

function arms() {
  const list = [];
  const file = join(homedir(), ".commission/jev/local/server.json");
  if (existsSync(file)) {
    const server = JSON.parse(readFileSync(file, "utf8"));
    list.push({ name: "laya", url: `http://127.0.0.1:${server.port}/v1/systemone`, headers: { Authorization: `Bearer ${server.key}` }, model: null });
  }
  if (process.env.OPENROUTER_API_KEY) list.push({ name: "jev", url: "https://openrouter.ai/api/v1/systemone", headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` }, model: "typesafe/jev-1.13" });
  return list;
}

async function ask(arm, body) {
  const started = performance.now();
  try {
    const response = await fetch(arm.url, { method: "POST", headers: { "Content-Type": "application/json", ...arm.headers }, body: JSON.stringify(arm.model ? { ...body, model: arm.model } : body), signal: AbortSignal.timeout(30_000) });
    const json = await response.json();
    return { ms: performance.now() - started, answers: json.answers ?? {}, error: response.ok ? null : `HTTP ${response.status}` };
  } catch (error) {
    return { ms: performance.now() - started, answers: {}, error: String(error) };
  }
}

const sure = (answer) => (answer && answer.type === "choice" && typeof answer.confidence === "number" && answer.confidence >= FLOOR ? answer.choice : null);

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]) : null;
}

function score(rows) {
  const pos = (row) => row.label !== "none";
  const shown = rows.filter((row) => row.shown);
  const none = rows.filter((row) => !pos(row));
  const truePos = rows.filter(pos);
  return {
    cases: rows.length,
    precision: shown.length ? shown.filter(pos).length / shown.length : null,
    recall: truePos.length ? truePos.filter((row) => row.shown).length / truePos.length : null,
    quiet_on_none: none.length ? none.filter((row) => !row.shown).length / none.length : null,
    abstained: rows.filter((row) => row.kind === null).length,
    errors: rows.filter((row) => row.error).length,
    mean_ms: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.ms, 0) / rows.length) : null,
    p95_ms: percentile(rows.map((row) => row.ms), 0.95),
    missed: rows.filter((row) => row.shown !== pos(row)).map((row) => ({ id: row.id, label: row.label, kind: row.kind, confidence: row.confidence })),
  };
}

const cases = lines("cases.jsonl");
const docs = lines("doc-pick.jsonl");
validate(cases, docs);
if (process.argv.includes("--dry")) {
  console.log(`ok: ${cases.length} cases (${cases.filter((item) => item.split === "heldout").length} held out), ${docs.length} doc-pick cases`);
  process.exit(0);
}
const available = arms();
if (available.length === 0) {
  console.error("No arm available: start CommissionAI for local Laya, or set OPENROUTER_API_KEY.");
  process.exit(1);
}
const rows = Object.fromEntries(available.map((arm) => [arm.name, []]));
for (const item of cases) {
  for (const arm of available) {
    const result = await ask(arm, momentRequest(item));
    const own = sure(result.answers.m0_own);
    const kind = own === "yes" ? sure(result.answers.m0_kind) : null;
    rows[arm.name].push({ id: item.id, split: item.split, label: item.label, kind, confidence: result.answers.m0_kind?.confidence ?? null, shown: kind === "correction" || kind === "convention", ms: result.ms, error: result.error });
  }
}
const picks = Object.fromEntries(available.map((arm) => [arm.name, []]));
for (const item of docs) {
  const { offered, request } = docQuestion(item.docs, item.text);
  for (const arm of available) {
    if (offered.length === 0) {
      picks[arm.name].push({ id: item.id, chosen: "none", ok: item.expected === "none", ms: 0 });
      continue;
    }
    const questions = { doc: { type: "choice", ...request.questions.doc } };
    const result = await ask(arm, { model: "jev", state: request.state, questions });
    const choice = sure(result.answers.doc);
    const doc = pickDoc(offered, { answers: { doc: choice ? { choice } : null } });
    const chosen = doc ? doc.id : "none";
    picks[arm.name].push({ id: item.id, chosen, ok: chosen === item.expected, ms: result.ms, error: result.error });
  }
}
const report = { run_at: new Date().toISOString(), floor: FLOOR, arms: {} };
for (const arm of available) {
  const all = rows[arm.name];
  const picked = picks[arm.name];
  report.arms[arm.name] = {
    dev: score(all.filter((row) => row.split === "dev")),
    heldout: score(all.filter((row) => row.split === "heldout")),
    doc_pick: { cases: picked.length, accuracy: picked.filter((row) => row.ok).length / picked.length, missed: picked.filter((row) => !row.ok) },
  };
  const held = report.arms[arm.name].heldout;
  report.arms[arm.name].gate = held.precision !== null && held.precision >= 0.9 && held.quiet_on_none >= 0.9 ? "pass" : "fail";
}
const out = new URL(`results-${report.run_at.slice(0, 10)}.json`, here);
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
