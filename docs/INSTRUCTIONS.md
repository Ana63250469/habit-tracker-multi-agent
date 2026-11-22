# How to run the multi-agent process

**You** write the spec. Then you start three agents **by hand**, one after another.
After each step you look at the result and decide whether to continue (level S4).

```
spec.md ──► TESTER ──► (review) ──► IMPLEMENTER ──► (review) ──► VERIFIER ──► (review) ──► PR
              │                          ▲                            │
              └─ questions about the spec └────── failure report ──────┘
```

Every run saves its evidence in `runs/` and appends a metrics row to `runs/metrics.csv`.

---

## 0. One-time setup (≈ 10 min)

1. **Node.js 20+** and **Google Chrome**. Playwright MCP uses Chrome by default.
2. **Claude Code CLI:**
   ```bash
   npm install -g @anthropic-ai/claude-code
   claude            # run once and log in, then quit with /exit
   ```
3. **App:**
   ```bash
   cd app
   npm install
   cp .env.example .env          # only if .env does not exist yet
   cd ..
   ```
4. **Check.** Everything must be green or say "OK":
   ```bash
   npm --prefix app/server test                         # 2 harness tests: passed
   node scripts/agent.mjs explore --dry-run             # "Dry run OK ... app start/stop work"
   ```

> **Do not run** your own `npm run dev` while agents are running. For the verifier, the runner
> starts the app itself with a separate test database, then stops it.

---

## 1. Explore the existing app (AS-IS). Recommended, ≈ 5 min

```bash
node scripts/agent.mjs explore
```
A browser opens and the agent clicks through the app by itself. This also checks that Playwright MCP works.
The result is `runs/explore/<run>/report.md` with screenshots. You can use it for the AS-IS part of the report.

---

## 2. Cycle for SPEC-001 (goals)

```bash
git checkout -b feature/spec-001-goals
```

### Step 1: Tester
```bash
node scripts/agent.mjs tester
```
- **`RESULT: SPEC_QUESTIONS`**: the agent found gaps in the spec.
  1. Read `runs/001-goals/<run>/questions.md`.
  2. Fix `specs/001-goals/spec.md` and commit the fix.
  3. Repeat step 1.

  Each such round counts as one *spec iteration*.
- **`RESULT: TESTS_WRITTEN`**: the runner shows how many tests were written. They are all expected to **fail**, because the feature does not exist yet.
  - The tests are now **locked** with a checksum.
  - Skim `report.md` and `app/server/tests/acceptance/001-goals.test.ts`.

### Step 2: Implementer
```bash
node scripts/agent.mjs implementer --budget 10
```
This step takes the longest (10–30 min). Afterwards the runner checks:
- `protected_tests: unchanged`: the agent did not modify the tests. If it did, the runner rejects the run.
- `tests_passed / tests_failed`: all server tests.
- `build: ok`: the TypeScript and Vite build.

If something fails, read `report.md` and repeat step 2. Or fix the spec and start again from step 1.

### Step 3: Verifier
```bash
node scripts/agent.mjs verifier
```
The runner starts the app with test data. The agent runs scenarios UI1–UI9 in the browser.
The result is `runs/001-goals/<run>/report.md`, `verification.json` and `screenshots/`.

- **`RESULT: ALL_PASS`**: continue with step 4.
- **`RESULT: FAILURES n`**: start a new cycle and give the verifier's report to the implementer:
  ```bash
  node scripts/agent.mjs implementer --feedback runs/001-goals/<verifier-run>/report.md
  node scripts/agent.mjs verifier
  ```

### Step 4: Review and PR (human)
```bash
node scripts/agent.mjs metrics          # table of all runs: time, tokens, cost, results
git push -u origin feature/spec-001-goals
gh pr create --title "SPEC-001: Habit goals" --body "Evidence: runs/001-goals/ (tests, verifier report, screenshots, metrics)"
```
You accept the change based on **evidence**, not by reading all the code:
- the tests are green;
- the locked tests are unchanged;
- the verifier returned ALL_PASS with screenshots;
- the build is OK.

---

## 3. Comparison (AS-IS vs. TO-BE), for the report

Let **a single agent** implement the same spec, without the tester and the verifier. Then evaluate it with the same tests:
```bash
git checkout main
git checkout -b baseline/spec-001-goals
node scripts/agent.mjs baseline --tests-from feature/spec-001-goals --budget 10
node scripts/agent.mjs verifier          # same UI scenarios
node scripts/agent.mjs metrics
```
The metrics table shows both variants side by side: `agent = baseline` vs. `tester + implementer + verifier`.

---

## What is recorded

`runs/metrics.csv` stays local and is not committed. Each run also commits its own `metrics.json`.
`node scripts/agent.mjs metrics` merges both.

| Column | Meaning |
| --- | --- |
| `agent`, `attempt` | which agent, and which attempt for this spec |
| `duration_s`, `turns` | how long the agent ran and how many steps it took |
| `input/output/cache_*_tokens`, `total_tokens`, `cost_usd` | token usage and cost |
| `agent_result` | what the agent reported (e.g. `TESTS_WRITTEN`, `FAILURES 2`) |
| `tests_passed/failed`, `build`, `protected_tests` | checks run by the **runner** (code, not the agent) |
| `ui_pass/ui_fail` | verifier results |

From these columns you get:
- the number of **spec iterations** (tester runs);
- the number of **full cycles** (implementer runs);
- **tokens per agent**;
- the **success rate**.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `Ports 5173/3000 are in use` | Stop your own `npm run dev`. |
| `EPERM` during `prisma generate` | On Windows, stop all Node processes running the app. |
| The verifier does not open a browser | Install Chrome or run `npx playwright install chrome`. |
| The agent runs out of budget | Raise it, e.g. `--budget 15`. |
| `You are on 'main'` | `git checkout -b feature/spec-001-goals` |
