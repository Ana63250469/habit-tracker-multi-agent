#!/usr/bin/env node
// Runner for ONE agent run (no orchestrator: a human starts each step and reviews the result).
//
//   node scripts/agent.mjs <explore|tester|implementer|verifier|baseline> [options]
//   node scripts/agent.mjs metrics
//
// Options:
//   --spec <dir>          spec folder (default: specs/001-goals)
//   --model <name>        Claude model alias or id (default: Claude Code default)
//   --budget <usd>        max spend for this run (default: 5)
//   --no-commit           do not commit the result
//   --tests-from <branch> (baseline only) bring acceptance tests from this branch and run them
//   --feedback <file>     (implementer) add e.g. a verifier report to the prompt for the next cycle
//   --dry-run             prepare everything (and start/stop the app for browser agents) but do not call Claude
//
// What it does: builds the prompt (agents/<name>.md + run context), runs `claude -p` headless with the

// (tests, build, checksum of protected tests), appends a row to runs/metrics.csv and commits.

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = path.join(ROOT, "app");
const SERVER = path.join(APP, "server");
const IS_WIN = process.platform === "win32";
const AGENTS = ["explore", "tester", "implementer", "verifier", "baseline"];
const PROTECTED_DIRS = ["app/server/tests/acceptance", "app/server/tests/support"];
const METRICS = path.join(ROOT, "runs", "metrics.csv");
const METRIC_COLUMNS = [
  "run_id", "date", "spec", "agent", "attempt", "model", "duration_s", "turns",
  "input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens", "total_tokens",
  "cost_usd", "agent_result", "tests_passed", "tests_failed", "build", "protected_tests", "ui_pass", "ui_fail",
];

// ---------- small helpers ----------
const log = (msg = "") => console.log(msg);
const die = (msg) => { console.error(`\n✖ ${msg}\n`); process.exit(1); };
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

function sh(cmd, opts = {}) {
  const r = spawnSync(cmd, { shell: true, cwd: ROOT, encoding: "utf8", ...opts });
  return { ok: r.status === 0, out: (r.stdout || "") + (r.stderr || "") };
}

function parseArgs(argv) {
  const args = { _: [], spec: "specs/001-goals", budget: "5", commit: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--no-commit") args.commit = false;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a.startsWith("--")) args[a.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = argv[++i];
    else args._.push(a);
  }
  return args;
}

function checksum(dirs) {
  const hash = createHash("sha256");
  const files = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      e.isDirectory() ? walk(p) : files.push(p);
    }
  };
  dirs.forEach((d) => walk(path.join(ROOT, d)));
  files.sort().forEach((f) => hash.update(rel(f)).update(fs.readFileSync(f)));
  return { hash: hash.digest("hex"), count: files.length };
}

function runVitest(target, outFile) {
  const r = sh(`npx vitest run ${target} --reporter=json --outputFile="${outFile}"`, { cwd: SERVER });
  if (!fs.existsSync(outFile)) return { passed: 0, failed: 0, total: 0, error: r.out.slice(-2000) };
  const j = JSON.parse(fs.readFileSync(outFile, "utf8"));
  return { passed: j.numPassedTests, failed: j.numFailedTests, total: j.numTotalTests };
}

function currentBranch() {
  return sh("git rev-parse --abbrev-ref HEAD").out.trim();
}

function csvRow(obj) {
  return METRIC_COLUMNS.map((c) => {
    const v = obj[c] ?? "";
    return /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v;
  }).join(",");
}

// Metrics come from two sources, merged by run_id:
// - runs/metrics.csv: local, git-ignored, survives branch switches (feature vs. baseline);
// - runs/**/metrics.json: committed with each run, so teammates see the runs of the current branch.
function readMetrics() {
  const rows = new Map();
  if (fs.existsSync(METRICS)) {
    const [head, ...lines] = fs.readFileSync(METRICS, "utf8").trim().split(/\r?\n/);
    const cols = head.split(",");
    for (const l of lines) {
      const r = Object.fromEntries(l.split(",").map((v, i) => [cols[i], v]));
      rows.set(r.run_id, r);
    }
  }
  const runsDir = path.join(ROOT, "runs");
  if (fs.existsSync(runsDir)) {
    for (const group of fs.readdirSync(runsDir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
      for (const run of fs.readdirSync(path.join(runsDir, group.name))) {
        const f = path.join(runsDir, group.name, run, "metrics.json");
        if (fs.existsSync(f)) {
          const r = JSON.parse(fs.readFileSync(f, "utf8"));
          rows.set(r.run_id, Object.fromEntries(METRIC_COLUMNS.map((c) => [c, String(r[c] ?? "")])));
        }
      }
    }
  }
  return [...rows.values()].sort((a, b) => a.run_id.localeCompare(b.run_id));
}

// ---------- app lifecycle (verifier / explore) ----------
async function isUp(url) {
  try { return (await fetch(url)).ok; } catch { return false; }
}

async function startApp(runDir) {
  if ((await isUp("http://localhost:5173")) || (await isUp("http://localhost:3000/api/health")))
    die("Ports 5173/3000 are in use. Stop your own `npm run dev` first; the runner starts the app with test data.");

  const env = { ...process.env, DATABASE_URL: "file:./e2e.db" };
  log("• Preparing e2e database (migrate, generate, seed)…");
  for (const cmd of ["npx prisma migrate deploy", "npx prisma generate", "npx tsx tests/support/seed-e2e.ts"]) {
    const r = sh(cmd, { cwd: SERVER, env });
    if (!r.ok) die(`'${cmd}' failed:\n${r.out}`);
  }

  log("• Starting app (npm run dev)…");
  const out = fs.openSync(path.join(runDir, "app.log"), "w");
  const child = spawn("npm run dev", { cwd: APP, env, shell: true, stdio: ["ignore", out, out], detached: !IS_WIN });
  const stop = () => {
    if (IS_WIN) spawnSync(`taskkill /pid ${child.pid} /T /F`, { shell: true, stdio: "ignore" });
    else try { process.kill(-child.pid, "SIGTERM"); } catch {}
  };
  process.on("exit", stop);

  for (let i = 0; i < 90; i++) {
    if ((await isUp("http://localhost:5173")) && (await isUp("http://localhost:3000/api/health"))) {
      log("• App is up at http://localhost:5173");
      return stop;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  stop();
  die(`App did not start in 90 s. See ${rel(path.join(runDir, "app.log"))}`);
}

// ---------- claude ----------
function runClaude({ prompt, settings, mcpConfig, model, budget, runDir }) {
  return new Promise((resolve) => {
    const args = [
      "-p", "--output-format", "stream-json", "--verbose",
      "--settings", settings, "--mcp-config", mcpConfig, "--strict-mcp-config",
      "--max-budget-usd", budget,
    ];
    if (model) args.push("--model", model);

    const trace = fs.createWriteStream(path.join(runDir, "transcript.jsonl"));
    const child = spawn("claude", args, { cwd: ROOT, shell: IS_WIN, stdio: ["pipe", "pipe", "inherit"] });
    child.stdin.end(prompt);

    let buf = "";
    let result = null;
    const started = Date.now();
    child.stdout.on("data", (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        trace.write(line + "\n");
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === "assistant") {
          for (const c of ev.message?.content ?? []) {
            const t = `${Math.round((Date.now() - started) / 1000)}s`.padStart(5);
            if (c.type === "tool_use") log(`  ${t}  ⚙ ${c.name} ${summarizeInput(c.input)}`);
            else if (c.type === "text" && c.text.trim()) log(`  ${t}  💬 ${c.text.trim().split("\n")[0].slice(0, 110)}`);
          }
        } else if (ev.type === "result") result = ev;
      }
    });
    child.on("error", (e) => die(`Could not start 'claude': ${e.message}. Is Claude Code CLI installed?`));
    child.on("close", () => { trace.end(); resolve(result); });
  });
}

function summarizeInput(input = {}) {
  const v = input.command ?? input.file_path ?? input.path ?? input.pattern ?? input.url ?? input.element ?? "";
  return String(v).replace(/\s+/g, " ").slice(0, 90);
}

// ---------- commands ----------
function printMetrics() {
  const rows = readMetrics();
  if (!rows.length) return log("No runs yet (runs/metrics.csv is empty).");
  console.table(rows.map((r) => ({
    run: r.run_id, agent: r.agent, try: r.attempt, min: (r.duration_s / 60).toFixed(1), turns: r.turns,
    tokens: r.total_tokens, usd: r.cost_usd, result: r.agent_result,
    tests: r.tests_passed !== "" ? `${r.tests_passed}✓ ${r.tests_failed}✗` : "", build: r.build,
    ui: r.ui_pass !== "" ? `${r.ui_pass}✓ ${r.ui_fail}✗` : "",
  })));
  const bySpec = {};
  for (const r of rows) {
    const s = (bySpec[r.spec] ??= { runs: 0, tokens: 0, usd: 0, minutes: 0 });
    s.runs++; s.tokens += +r.total_tokens || 0; s.usd += +r.cost_usd || 0; s.minutes += (+r.duration_s || 0) / 60;
  }
  log("Totals per spec:");
  console.table(Object.fromEntries(Object.entries(bySpec).map(([k, s]) =>
    [k, { runs: s.runs, tokens: s.tokens, usd: s.usd.toFixed(2), minutes: s.minutes.toFixed(1) }])));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const agent = args._[0];
  if (agent === "metrics") return printMetrics();
  if (!AGENTS.includes(agent)) {
    log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 14).join("\n").replace(/^\/\/ ?/gm, ""));
    process.exit(agent ? 1 : 0);
  }

  // --- preflight ---
  if (!sh("claude --version").ok && args.dryRun) log("⚠ Claude Code CLI not found (needed for real runs).");
  else if (!sh("claude --version").ok) die("Claude Code CLI not found. Install: npm install -g @anthropic-ai/claude-code");
  const specDir = args.spec.replace(/\\/g, "/").replace(/\/$/, "");
  const specId = path.basename(specDir);
  const specFile = `${specDir}/spec.md`;
  if (agent !== "explore" && !fs.existsSync(path.join(ROOT, specFile))) die(`Spec not found: ${specFile}`);

  const branch = currentBranch();
  if (["tester", "implementer"].includes(agent) && branch === "main")
    die(`You are on 'main'. First run:  git checkout -b feature/spec-${specId}`);
  if (agent === "baseline" && !branch.startsWith("baseline/"))
    die(`Baseline must run on its own branch from main:  git checkout main && git checkout -b baseline/spec-${specId}`);

  const sumFile = path.join(ROOT, "runs", specId, "acceptance.sha256");
  if (agent === "implementer") {
    if (!fs.existsSync(sumFile)) die("No protected acceptance tests yet. Run the tester first.");
    if (checksum(PROTECTED_DIRS).hash !== fs.readFileSync(sumFile, "utf8").trim())
      die("Protected tests changed since the tester run. Re-run the tester (or restore the files).");
  }

  // --- run folder ---
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const group = agent === "explore" ? "explore" : specId;
  const runId = `${stamp}_${agent}`;
  const runDir = path.join(ROOT, "runs", group, runId);
  fs.mkdirSync(runDir, { recursive: true });
  const attempt = readMetrics().filter((r) => r.spec === group && r.agent === agent).length + 1;

  const usesBrowser = agent === "verifier" || agent === "explore";
  const mcp = usesBrowser
    ? { mcpServers: { playwright: { command: "npx", args: ["-y", "@playwright/mcp@0.0.84", "--isolated",
        "--output-dir", rel(path.join(runDir, "screenshots")), "--viewport-size", "1280,800"] } } }
    : { mcpServers: {} };
  const mcpConfig = path.join(runDir, "mcp.json");
  fs.writeFileSync(mcpConfig, JSON.stringify(mcp, null, 2));

  const prompt = [
    fs.readFileSync(path.join(ROOT, "agents", `${agent}.md`), "utf8"),
    "\n## Run context",
    agent !== "explore" ? `- Spec: \`${specFile}\` (spec id: \`${specId}\`)` : "",
    `- Run directory (write your report and outputs here): \`${rel(runDir)}/\``,
    usesBrowser ? `- Screenshots are saved by Playwright MCP into \`${rel(runDir)}/screenshots/\`` : "",
    `- Git branch: \`${branch}\``,
    args.feedback
      ? `\n## Feedback from the previous cycle (fix these problems)\n\n${fs.readFileSync(path.resolve(args.feedback), "utf8")}`
      : "",
    "\nStart now.",
  ].filter(Boolean).join("\n");
  fs.writeFileSync(path.join(runDir, "prompt.md"), prompt);

  log(`\n▶ ${agent.toUpperCase()} · spec ${group} · attempt ${attempt} · run ${runId}`);
  log(`  Trace: ${rel(runDir)}/transcript.jsonl\n`);

  const stopApp = usesBrowser ? await startApp(runDir) : null;
  if (args.dryRun) {
    if (stopApp) stopApp();
    fs.rmSync(runDir, { recursive: true, force: true });
    log("✔ Dry run OK: prompt, permissions, MCP config" + (usesBrowser ? " and app start/stop" : "") + " work.\n");
    log(prompt);
    return;
  }
  const result = await runClaude({
    prompt, settings: path.join(ROOT, "agents", "settings", `${agent}.json`),
    mcpConfig, model: args.model, budget: args.budget, runDir,
  });
  if (stopApp) stopApp();
  if (!result) die(`Claude produced no result. See ${rel(runDir)}/transcript.jsonl`);
  fs.writeFileSync(path.join(runDir, "claude-result.json"), JSON.stringify(result, null, 2));

  const agentResult = (String(result.result ?? "").match(/RESULT:\s*([A-Z_]+(?: \d+)?)/) ?? [])[1]
    ?? (result.is_error ? `ERROR_${result.subtype}` : "NO_RESULT_LINE");

  // --- deterministic checks (the code decides, not the agent) ---
  log("\n• Running checks…");
  const checks = {};
  if (agent === "tester" && agentResult === "TESTS_WRITTEN") {
    const sum = checksum(PROTECTED_DIRS);
    fs.writeFileSync(sumFile, sum.hash + "\n");
    checks.protected_tests = `locked (${sum.count} files)`;
    const t = runVitest("tests/acceptance", path.join(runDir, "tests.json"));
    Object.assign(checks, { tests_passed: t.passed, tests_failed: t.failed });
    checks.note = t.total === 0 ? "⚠ no tests found" : t.passed > 0 ? "⚠ some tests already pass before implementation; review them"
      : "OK: all acceptance tests fail before implementation (expected)";
  }
  if (agent === "implementer" || agent === "baseline") {
    if (agent === "baseline" && args.testsFrom) {
      const r = sh(`git checkout ${args.testsFrom} -- app/server/tests/acceptance`);
      if (!r.ok) log(`  ⚠ could not bring tests from ${args.testsFrom}: ${r.out}`);
    }
    if (agent === "implementer") {
      const same = checksum(PROTECTED_DIRS).hash === fs.readFileSync(sumFile, "utf8").trim();
      checks.protected_tests = same ? "unchanged" : "CHANGED (run rejected)";
    }
    sh("npx prisma generate", { cwd: SERVER });
    const t = runVitest("", path.join(runDir, "tests.json"));
    Object.assign(checks, { tests_passed: t.passed, tests_failed: t.failed });
    const b = sh("npm run build", { cwd: APP });
    fs.writeFileSync(path.join(runDir, "build.log"), b.out);
    checks.build = b.ok ? "ok" : "FAILED";
  }
  if (agent === "verifier") {
    const f = path.join(runDir, "verification.json");
    if (fs.existsSync(f)) {
      try {
        const v = JSON.parse(fs.readFileSync(f, "utf8"));
        checks.ui_pass = v.filter((s) => s.status === "PASS").length;
        checks.ui_fail = v.filter((s) => s.status !== "PASS").length;
      } catch { checks.note = "⚠ verification.json is not valid JSON"; }
    } else checks.note = "⚠ verifier did not write verification.json";
  }
  fs.writeFileSync(path.join(runDir, "checks.json"), JSON.stringify(checks, null, 2));

  // --- metrics ---
  const u = result.usage ?? {};
  const row = {
    run_id: runId, date: new Date().toISOString(), spec: group, agent, attempt,
    model: Object.keys(result.modelUsage ?? {}).join("+") || args.model || "default",
    duration_s: Math.round((result.duration_ms ?? 0) / 1000), turns: result.num_turns,
    input_tokens: u.input_tokens ?? 0, output_tokens: u.output_tokens ?? 0,
    cache_read_tokens: u.cache_read_input_tokens ?? 0, cache_write_tokens: u.cache_creation_input_tokens ?? 0,
    cost_usd: (result.total_cost_usd ?? 0).toFixed(4), agent_result: agentResult, ...checks,
  };
  row.total_tokens = row.input_tokens + row.output_tokens + row.cache_read_tokens + row.cache_write_tokens;
  if (!fs.existsSync(METRICS)) fs.writeFileSync(METRICS, METRIC_COLUMNS.join(",") + "\n");
  fs.appendFileSync(METRICS, csvRow(row) + "\n");
  fs.writeFileSync(path.join(runDir, "metrics.json"), JSON.stringify(row, null, 2));

  // --- commit (evidence + changes) ---
  const rejected = checks.protected_tests?.startsWith("CHANGED");
  if (args.commit && branch !== "main" && !rejected) {
    sh("git add -A app runs");
    const c = sh(`git commit -q -m "${agent}(${group}): ${agentResult} [run ${runId}]"`);
    log(c.ok ? "• Committed." : "• Nothing to commit.");
  } else if (args.commit && branch === "main") {
    log("• On main: run evidence left uncommitted.");
  }

  // --- summary for the human ---
  log("\n──────── SUMMARY ────────");
  log(`Agent result : ${agentResult}`);
  log(`Duration     : ${(row.duration_s / 60).toFixed(1)} min, ${row.turns} turns`);
  log(`Tokens / cost: ${row.total_tokens} tokens, $${row.cost_usd}`);
  for (const [k, v] of Object.entries(checks)) log(`${k.padEnd(13)}: ${v}`);
  log(`Report       : ${rel(runDir)}/report.md`);
  log("─────────────────────────");
  log(nextStep(agent, agentResult, checks, specDir));
}

function nextStep(agent, res, checks, specDir) {
  const s = specDir === "specs/001-goals" ? "" : ` --spec ${specDir}`;
  if (agent === "explore") return "Next: read the report and screenshots. Then: git checkout -b feature/spec-001-goals && node scripts/agent.mjs tester";
  if (agent === "tester") return res === "SPEC_QUESTIONS"
    ? "Next (human): answer questions.md by improving the spec, then re-run the tester."
    : `Next (human): skim the tests and report. If OK: node scripts/agent.mjs implementer${s}`;
  if (agent === "implementer") {
    if (checks.protected_tests?.startsWith("CHANGED")) return "Run rejected: protected tests were modified. Restore them (git checkout -- app/server/tests) and re-run.";
    if (checks.tests_failed > 0 || checks.build !== "ok") return `Next (human): read report.md. Re-run the implementer, or fix the spec if it is unclear.`;
    return `Next: node scripts/agent.mjs verifier${s}`;
  }
  if (agent === "verifier") return checks.ui_fail > 0
    ? "Next (human): read report.md + screenshots. Decide: fix the spec (new cycle) or re-run the implementer with the report."
    : "All checks passed. Next (human): review evidence, push the branch and open a PR (see docs/NAVODILA.md).";
  return "Baseline done. Compare its metrics with the multi-agent runs: node scripts/agent.mjs metrics";
}

main().catch((e) => die(e.stack || String(e)));
