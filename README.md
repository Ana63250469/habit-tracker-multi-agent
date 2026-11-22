# habit-tracker-multi-agent

| What | Where |
| --- | --- |
| How to run the agents | [docs/INSTRUCTIONS.md](docs/INSTRUCTIONS.md) |
| Spec of the first feature | [specs/001-goals/spec.md](specs/001-goals/spec.md) |
| Agents (instructions and permissions) | [agents/](agents/) |
| Runner | [scripts/agent.mjs](scripts/agent.mjs) |
| App | [app/](app/) ([app/README.md](app/README.md)) |

In short:

```bash
node scripts/agent.mjs explore                 # agent explores the existing app
git checkout -b feature/spec-001-goals
node scripts/agent.mjs tester                  # spec → acceptance tests (locked)
node scripts/agent.mjs implementer --budget 10 # code until the tests are green
node scripts/agent.mjs verifier                # clicks through the UI scenarios (Playwright MCP)
node scripts/agent.mjs metrics                 # time, tokens, cost, results
```

Run the app in Docker: `cd app && docker compose up --build -d`
