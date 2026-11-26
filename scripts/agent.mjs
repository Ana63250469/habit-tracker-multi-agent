#!/usr/bin/env node
// Runner for ONE agent run (no orchestrator: a human starts each step and reviews the result).
//
//   node scripts/agent.mjs <explore|tester|implementer|verifier|baseline> [options]
//   node scripts/agent.mjs metrics
//
// Options:
//   --spec <dir>          spec folder (default: specs/001-goals)
//   --runner <name>       claude (default) or opencode (OpenCode v2)
//   --model <name>        model for the selected runner (defaults to its configured model)
//   --budget <usd>        Claude Code only: max spend for this run (default: 5)
//   --no-commit           do not commit the result
//   --tests-from <branch> (baseline only) bring acceptance tests from this branch and run them
//   --feedback <file>     (implementer) add e.g. a verifier report to the prompt for the next cycle
//   --dry-run             prepare everything (and start/stop the app for browser agents) without calling a model
//
// Builds the prompt, runs one agent, then checks and records the result.

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openCodeConfig, runOpenCode } from "./opencode.mjs";

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
  "runner",
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
  const args = { _: [], spec: "specs/001-goals", runner: "claude", commit: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--no-commit") args.commit = false;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a.startsWith("--")) {
      if (!argv[i + 1] || argv[i + 1].startsWith("--")) die(`${a} requires a value.`);
      args[a.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = argv[++i];
    } else args._.push(a);
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
  fs.rmSync(outFile, { force: true });

  const r = sh(
    `npx vitest run ${target} --reporter=json --outputFile="${outFile}"`,
    { cwd: SERVER }
  );

  const broken = message => ({
    passed: 0,
    failed: 0,
    total: 0,
    skipped: 0,
    valid: false,
    ok: false,
    error: message
  });

  if (!fs.existsSync(outFile)) {
    return broken("Vitest did not produce a test report.");
  }

  try {
    const j = JSON.parse(fs.readFileSync(outFile, "utf8"));

    const counts = [
      j.numPassedTests,
      j.numFailedTests,
      j.numTotalTests,
      j.numPendingTests,
      j.numTodoTests
    ];

    if (!counts.every(n => Number.isInteger(n) && n >= 0)) {
      return broken("Vitest report has invalid test counts.");
    }

    const passed = j.numPassedTests;
    const failed = j.numFailedTests;
    const total = j.numTotalTests;
    const skipped = j.numPendingTests + j.numTodoTests;

    if (total === 0) {
      return broken("No tests ran.");
    }

    if (passed + failed + skipped !== total) {
      return broken("Vitest report has inconsistent test counts.");
    }

    if (
      !Array.isArray(j.testResults) ||
      j.testResults.length === 0 ||
      (j.numRuntimeErrorTestSuites ?? 0) > 0 ||
      j.testResults.some(suite =>
        !suite ||
        !Array.isArray(suite.assertionResults) ||
        (
          suite.status === "failed" &&
          !suite.assertionResults.some(test => test.status === "failed")
        )
      )
    ) {
      return broken("A test suite could not run correctly.");
    }

    if (!r.ok && failed === 0) {
      return broken("Vitest exited unsuccessfully.");
    }

    return {
      passed,
      failed,
      total,
      skipped,
      valid: true,
      ok: r.ok && j.success === true &&
        failed === 0 && skipped === 0
    };
  } catch {
    return broken("Vitest report could not be read or parsed.");
  }
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

function appendMetrics(row) {
  const header = METRIC_COLUMNS.join(",");
  const oldHeader = METRIC_COLUMNS.slice(0, -1).join(",");
  if (!fs.existsSync(METRICS)) fs.writeFileSync(METRICS, `${header}\n`);
  else {
    const csv = fs.readFileSync(METRICS, "utf8");
    if (csv.split(/\r?\n/, 1)[0] === oldHeader) {
      fs.writeFileSync(METRICS, header + csv.slice(oldHeader.length));
    }
  }
  fs.appendFileSync(METRICS, `${csvRow(row)}\n`);
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
  fs.closeSync(out);
  const stop = () => {
    process.off("exit", stop);
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
    // On Windows `claude` is a .cmd shim and needs a shell; pass one quoted command string
    // (passing an args array together with shell:true is deprecated in Node).
    const stdio = ["pipe", "pipe", "inherit"];
    const child = IS_WIN
      ? spawn(["claude", ...args.map((a) => `"${a}"`)].join(" "), { cwd: ROOT, shell: true, stdio })
      : spawn("claude", args, { cwd: ROOT, stdio });
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
    run: r.run_id, agent: r.agent, runner: r.runner || "claude", try: r.attempt,
    min: (r.duration_s / 60).toFixed(1), turns: r.turns || "n/a",
    tokens: r.total_tokens || "n/a", usd: r.cost_usd || "n/a", result: r.agent_result,
    tests: r.tests_passed !== "" ? `${r.tests_passed}✓ ${r.tests_failed}✗` : "", build: r.build,
    ui: r.ui_pass !== "" ? `${r.ui_pass}✓ ${r.ui_fail}✗` : "",
  })));
  const bySpec = {};
  for (const r of rows) {
    const s = (bySpec[r.spec] ??= { runs: 0, minutes: 0 });
    s.runs++;
    s.minutes += (+r.duration_s || 0) / 60;
    if (r.total_tokens) s.tokens = (s.tokens ?? 0) + Number(r.total_tokens);
    if (r.cost_usd) s.usd = (s.usd ?? 0) + Number(r.cost_usd);
  }
  log("Totals per spec (reported metrics only):");
  console.table(Object.fromEntries(Object.entries(bySpec).map(([k, s]) =>
    [k, { runs: s.runs, tokens: s.tokens ?? "n/a", usd: s.usd?.toFixed(2) ?? "n/a", minutes: s.minutes.toFixed(1) }])));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const agent = args._[0];
  if (agent === "metrics") return printMetrics();
  if (!AGENTS.includes(agent)) {
    log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 15).join("\n").replace(/^\/\/ ?/gm, ""));
    process.exit(agent ? 1 : 0);
  }

  // --- preflight ---
  const { runner } = args;
  if (runner !== "claude" && runner !== "opencode") die("Use --runner claude or --runner opencode.");
  if (runner === "opencode" && args.budget !== undefined)
    die("--budget is only supported by Claude Code. OpenCode has no per-run spending limit in this runner.");
  if (runner === "opencode" && args.model && !/^[\w.@+-]+\/[\w./:@+-]+(?:#[\w.@+-]+)?$/.test(args.model))
    die("Use an OpenCode model in provider/model or provider/model#variant format.");
  const cli = sh(`${runner} --version`);
  const cliReady = cli.ok && (runner !== "opencode" || /^(?:opencode )?v?2\./m.test(cli.out));
  if (!cliReady) {
    const message = runner === "claude"
      ? "Claude Code CLI not found. Install: npm install -g @anthropic-ai/claude-code"
      : "OpenCode v2 CLI is required. Install or upgrade it: https://opencode.ai/docs/";
    if (!args.dryRun) die(message);
    log(`⚠ ${message} (needed for real runs).`);
  }
  const specDir = path.posix.normalize(args.spec.replace(/\\/g, "/")).replace(/\/$/, "");
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
  const playwrightArgs = usesBrowser
    ? ["-y", "@playwright/mcp@0.0.84", "--isolated",
        "--output-dir", rel(path.join(runDir, "screenshots")), "--viewport-size", "1280,800"]
    : null;
  const mcpConfig = path.join(runDir, "mcp.json");
  const config = runner === "opencode"
    ? openCodeConfig({ agent, specFile, specId, runPath: rel(runDir), playwrightArgs })
    : null;
  if (!config) {
    const mcpServers = playwrightArgs ? { playwright: { command: "npx", args: playwrightArgs } } : {};
    fs.writeFileSync(mcpConfig, JSON.stringify({ mcpServers }, null, 2));
  }

  const prompt = [
    fs.readFileSync(path.join(ROOT, "agents", `${agent}.md`), "utf8"),
    "\n## Run context",
    agent !== "explore" ? `- Spec: \`${specFile}\` (spec id: \`${specId}\`)` : "",
    `- Run directory (write your report and outputs here): \`${rel(runDir)}/\``,
    usesBrowser ? `- Screenshots are saved by Playwright MCP into \`${rel(runDir)}/screenshots/\`` : "",
    `- Git branch: \`${branch}\``,
    runner === "opencode" && agent === "verifier"
      ? "- After each completed UI scenario, save its result in `verification.json` and update `report.md`. Keep the JSON valid and include only scenarios you have actually checked."
      : "",
    args.feedback
      ? `\n## Feedback from the previous cycle (fix these problems)\n\n${fs.readFileSync(path.resolve(args.feedback), "utf8")}`
      : "",
    "\nStart now.",
  ].filter(Boolean).join("\n");
  fs.writeFileSync(path.join(runDir, "prompt.md"), prompt);

  log(`\n▶ ${agent.toUpperCase()} · ${runner} · spec ${group} · attempt ${attempt} · run ${runId}`);
  log(`  Trace: ${rel(runDir)}/transcript.jsonl\n`);

  const stopApp = usesBrowser ? await startApp(runDir) : null;
  if (args.dryRun) {
    if (stopApp) stopApp();
    fs.rmSync(runDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    log("✔ Dry run OK: prompt and runner config prepared" + (usesBrowser ? "; app started and stopped" : "") + ".\n");
    log(prompt);
    return;
  }
  let result;
  try {
    result = config
      ? await runOpenCode({ prompt, config, model: args.model, root: ROOT, runDir, log, summarizeInput })
      : await runClaude({
          prompt, settings: path.join(ROOT, "agents", "settings", `${agent}.json`),
          mcpConfig, model: args.model, budget: args.budget ?? "5", runDir,
        });
  } finally {
    if (stopApp) stopApp();
  }
  if (!result) die(`${runner} produced no result. See ${rel(runDir)}/transcript.jsonl`);
  // Drop account/session identifiers before saving: they are not needed as evidence.
  const { session_id, uuid, credential_expires_at, ...publicResult } = result;
  fs.writeFileSync(path.join(runDir, `${runner}-result.json`), JSON.stringify(publicResult, null, 2));

  const agentResult = result.is_error
    ? `ERROR_${result.subtype}`
    : (String(result.result ?? "").match(/RESULT:\s*([A-Z_]+(?: \d+)?)/) ?? [])[1] ?? "NO_RESULT_LINE";

  // --- deterministic checks (the code decides, not the agent) ---
  log("\n• Running checks…");
  const checks = {
    agent_execution: result.is_error ? "FAILED" : "ok"
  };
  if (agent === "tester" && agentResult === "TESTS_WRITTEN") {
    const sum = checksum(PROTECTED_DIRS);
    fs.writeFileSync(sumFile, sum.hash + "\n");
    checks.protected_tests = `locked (${sum.count} files)`;
    const t = runVitest("tests/acceptance", path.join(runDir, "tests.json"));
    Object.assign(checks, {
      tests_passed: t.passed,
      tests_failed: t.failed,
      tests_skipped: t.skipped,
      test_execution: t.valid ? "ok" : "FAILED",
      tests: t.ok ? "ok" : "FAILED"
    });

    if (t.error) {
      checks.test_error = t.error;
    }
    checks.note = !t.valid
      ? `Test execution failed: ${t.error}`
      : t.skipped > 0
        ? "Some tests were skipped; review them."
        : t.passed > 0
          ? "Some tests already pass before implementation; review them."
          : "All acceptance tests failed before implementation; review that they failed because the feature is missing.";
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
    Object.assign(checks, {
      tests_passed: t.passed,
      tests_failed: t.failed,
      tests_skipped: t.skipped,
      test_execution: t.valid ? "ok" : "FAILED",
      tests: t.ok ? "ok" : "FAILED"
    });

    if (t.error) {
      checks.test_error = t.error;
    }
    const b = sh("npm run build", { cwd: APP });
    fs.writeFileSync(path.join(runDir, "build.log"), b.out);
    checks.build = b.ok ? "ok" : "FAILED";
  }

  if (agent === "verifier") {
    Object.assign(
      checks,
      checkVerification(
        runDir,
        path.join(ROOT, specFile),
        agentResult,
        result.is_error
      )
    );
  }
  fs.writeFileSync(path.join(runDir, "checks.json"), JSON.stringify(checks, null, 2));

  // --- metrics ---
  const u = result.usage ?? {};
  const unreportedTokens = runner === "claude" ? 0 : undefined;
  const row = {
    run_id: runId, date: new Date().toISOString(), spec: group, agent, attempt, runner,
    model: Object.keys(result.modelUsage ?? {}).join("+") || args.model || "default",
    duration_s: Math.round((result.duration_ms ?? 0) / 1000), turns: result.num_turns,
    input_tokens: u.input_tokens ?? unreportedTokens, output_tokens: u.output_tokens ?? unreportedTokens,
    cache_read_tokens: u.cache_read_input_tokens ?? unreportedTokens,
    cache_write_tokens: u.cache_creation_input_tokens ?? unreportedTokens,
    reasoning_tokens: result.reasoning_tokens,
    cost_usd: result.total_cost_usd?.toFixed(4), agent_result: agentResult, ...checks,
  };
  const tokenCounts = [row.input_tokens, row.output_tokens, row.cache_read_tokens, row.cache_write_tokens];
  if (runner === "opencode") tokenCounts.push(result.reasoning_tokens);
  if (tokenCounts.every(Number.isFinite)) row.total_tokens = tokenCounts.reduce((sum, count) => sum + count, 0);
  appendMetrics(row);
  fs.writeFileSync(path.join(runDir, "metrics.json"), JSON.stringify(row, null, 2));

  // --- commit (evidence + changes) ---
  const rejected = checks.protected_tests?.startsWith("CHANGED");

  let runStatus = "FAILED";

  if (checks.agent_execution !== "ok" || rejected) {
    runStatus = "FAILED";
  } else if (
    agentResult === "BLOCKED" ||
    agentResult === "SPEC_QUESTIONS"
  ) {
    runStatus = "BLOCKED";
  } else if (agent === "tester") {
    if (
      agentResult === "TESTS_WRITTEN" &&
      checks.test_execution === "ok" &&
      checks.tests_skipped === 0
    ) {
      runStatus = "PASSED";
    }
  } else if (agent === "implementer") {
    if (
      agentResult === "IMPLEMENTED" &&
      checks.protected_tests === "unchanged" &&
      checks.test_execution === "ok" &&
      checks.tests === "ok" &&
      checks.build === "ok"
    ) {
      runStatus = "PASSED";
    }
  } else if (agent === "verifier") {
    if (checks.verification === "ok") {
      runStatus = "PASSED";
    }
  } else {
    // Other roles have no complete outcome policy defined here.
    runStatus = "RECORDED";
  }

  log(`• Run status: ${runStatus}`);

  if (args.commit && branch !== "main" && !rejected) {
    const staged = sh("git add -A app runs");

    if (!staged.ok) {
      log(`• Could not stage changes:\n${staged.out}`);
    } else {
      const c = sh(
        `git commit -q -m "${agent}(${group}): ${runStatus} - ${agentResult} [run ${runId}]"`
      );

      log(
        c.ok
          ? `• Committed (${runStatus}).`
          : `• Commit not created. Check Git output:\n${c.out}`
      );
    }
  } else if (args.commit && rejected) {
    log("• Not committed: protected tests were changed.");
  } else if (args.commit && branch === "main") {
    log("• On main: run evidence left uncommitted.");
  }
  // --- summary for the human ---
  log("\n──────── SUMMARY ────────");
  log(`Agent result : ${agentResult}`);
  log(`Duration     : ${(row.duration_s / 60).toFixed(1)} min, ${row.turns ?? "n/a"} turns`);
  log(`Tokens / cost: ${row.total_tokens ?? "n/a"} tokens, ${row.cost_usd === undefined ? "n/a" : `$${row.cost_usd}`}`);
  for (const [k, v] of Object.entries(checks)) log(`${k.padEnd(13)}: ${v}`);
  log(`Report       : ${rel(runDir)}/report.md`);
  log("─────────────────────────");
  log(nextStep(agent, agentResult, checks, specDir, runner));
}

function checkVerification(
  runDir,
  specFile,
  agentResult,
  agentError = false
) {
  const checks = {
    ui_pass: 0,
    ui_fail: 0,
    verification: "FAILED"
  };

  try {
    const spec = fs.readFileSync(specFile, "utf8");

    const expected = [
      ...spec.matchAll(/^\s*\|\s*(UI\d+)\s*\|/gm)
    ].map(m => m[1]);

    if (
      !expected.length ||
      new Set(expected).size !== expected.length
    ) {
      throw new Error(
        "Spec must list unique UI scenario IDs in its scenarios table."
      );
    }

    const file = path.join(runDir, "verification.json");

    if (!fs.existsSync(file)) {
      throw new Error("verification.json is missing.");
    }

    const results = JSON.parse(fs.readFileSync(file, "utf8"));

    if (!Array.isArray(results)) {
      throw new Error(
        "verification.json must contain an array."
      );
    }

    const seen = new Set();

    for (const scenario of results) {
      if (
        !scenario ||
        typeof scenario !== "object" ||
        !expected.includes(scenario.id)
      ) {
        throw new Error(
          "Unexpected or missing UI scenario ID."
        );
      }

      if (seen.has(scenario.id)) {
        throw new Error(
          `Duplicate scenario: ${scenario.id}.`
        );
      }

      seen.add(scenario.id);

      if (!["PASS", "FAIL"].includes(scenario.status)) {
        throw new Error(
          `Invalid status for ${scenario.id}.`
        );
      }

      if (
        typeof scenario.screenshot !== "string" ||
        !/\.png$/i.test(scenario.screenshot)
      ) {
        throw new Error(
          `Missing screenshot reference for ${scenario.id}.`
        );
      }

      // Supports "UI1.png" or "screenshots/UI1.png".
      const name = scenario.screenshot;
      const root = fs.realpathSync(runDir);

      const candidates = [
        path.resolve(runDir, name),
        path.resolve(runDir, "screenshots", name)
      ];

      const exists = candidates.some(candidate => {
        try {
          const actual = fs.realpathSync(candidate);
          const relative = path.relative(root, actual);

          return (
            relative !== "" &&
            relative !== ".." &&
            !relative.startsWith(`..${path.sep}`) &&
            !path.isAbsolute(relative) &&
            fs.statSync(actual).isFile() &&
            fs.statSync(actual).size > 0
          );
        } catch {
          return false;
        }
      });

      if (!exists) {
        throw new Error(
          `Screenshot missing, empty or outside the run folder: ${scenario.id}.`
        );
      }

      if (scenario.status === "PASS") {
        checks.ui_pass++;
      } else {
        checks.ui_fail++;
      }
    }

    const missing = expected.filter(id => !seen.has(id));

    if (missing.length) {
      throw new Error(
        `Missing scenarios: ${missing.join(", ")}.`
      );
    }

    if (checks.ui_fail > 0) {
      throw new Error(
        `${checks.ui_fail} UI scenario(s) failed.`
      );
    }

    if (agentError || agentResult !== "ALL_PASS") {
      throw new Error(
        "Verifier did not finish successfully with RESULT: ALL_PASS."
      );
    }

    checks.verification = "ok";
  } catch (error) {
    checks.note =
      `Verification failed or incomplete: ${error.message}`;
  }

  return checks;
}

function nextStep(agent, res, checks, specDir, runner) {
  const s = (specDir === "specs/001-goals" ? "" : ` --spec ${specDir}`) +
    (runner === "claude" ? "" : ` --runner ${runner}`);
  if (agent === "explore") return res === "EXPLORED"
    ? `Next: read the report and screenshots. On the feature branch: node scripts/agent.mjs tester${s}`
    : "Exploration is incomplete. See transcript.jsonl and any screenshots in the run directory.";
  if (agent === "tester") {
    if (checks.agent_execution !== "ok") {
      return "Tester execution failed. Read the run outputs before continuing.";
    }

    if (res === "SPEC_QUESTIONS") {
      return "Next (human): answer questions.md by improving the spec, then re-run the tester.";
    }

    if (
      res !== "TESTS_WRITTEN" ||
      checks.test_execution !== "ok" ||
      checks.tests_skipped !== 0
    ) {
      return "Tester work is incomplete or testing could not complete. Read checks.json and report.md before continuing.";
    }

    return `Next (human): review the tests and report. If OK: node scripts/agent.mjs implementer${s}`;
  }
  if (agent === "implementer") {
    if (
      checks.agent_execution !== "ok" ||
      res !== "IMPLEMENTED"
    ) {
      return "Implementation failed, is blocked or is incomplete. Read the run outputs before continuing.";
    }
    if (checks.protected_tests?.startsWith("CHANGED")) return "Run rejected: protected tests were modified. Restore them (git checkout -- app/server/tests) and re-run.";
    if (
      checks.test_execution !== "ok" ||
      checks.tests !== "ok" ||
      checks.build !== "ok"
    ) {
      return "Next (human): read checks.json and report.md. Tests or build failed or could not complete. Resolve the problem before continuing.";
    }
    return `Next: node scripts/agent.mjs verifier${s}`;
  }
  if (agent === "verifier") {
    return checks.verification !== "ok"
      ? "Verification failed or incomplete. See checks.json, transcript.jsonl, and any report or screenshots in the run directory."
      : "All checks passed. Next (human): review evidence, push the branch and open a PR (see docs/INSTRUCTIONS.md).";}
  return "Baseline done. Compare its metrics with the multi-agent runs: node scripts/agent.mjs metrics";
}

main().catch((e) => die(e.stack || String(e)));
