# habit-tracker-multi-agent

| What | Where |
| --- | --- |
| How to run the agents | [docs/INSTRUCTIONS.md](docs/INSTRUCTIONS.md) |
| Spec of the first feature | [specs/001-goals/spec.md](specs/001-goals/spec.md) |
| Agents (instructions and permissions) | [agents/](agents/) |
| Runner | [scripts/agent.mjs](scripts/agent.mjs) |
| App | [app/](app/) ([app/README.md](app/README.md)) |

In short:

Use `--runner opencode` to run the agents with [OpenCode v2](https://opencode.ai/docs/)
and its configured model. Without this option, the runner uses Claude Code.

```bash
node scripts/agent.mjs explore --runner opencode --dry-run
node scripts/agent.mjs explore --runner opencode
```

The example below is the original Claude Code workflow for SPEC-001, which is
already implemented on `main`. For a fresh cycle, see SPEC-002 in the [run
instructions](docs/INSTRUCTIONS.md#start-a-new-cycle-with-opencode).

```bash
node scripts/agent.mjs explore                 # agent explores the existing app
git checkout -b feature/spec-001-goals
node scripts/agent.mjs tester                  # spec → acceptance tests (locked)
node scripts/agent.mjs implementer --budget 10 # code until the tests are green
node scripts/agent.mjs verifier                # clicks through the UI scenarios (Playwright MCP)
node scripts/agent.mjs metrics                 # time, tokens, cost, results
```

Run the app in Docker: `cd app && docker compose up --build -d`
