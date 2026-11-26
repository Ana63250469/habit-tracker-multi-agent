import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";

const IS_WIN = process.platform === "win32";
const AGENT_ID = "habit-tracker-runner";
const MAX_CONTINUATIONS = 2;
const BROWSER_TOOLS = [
  "navigate", "snapshot", "click", "type", "fill_form", "select_option",
  "handle_dialog", "take_screenshot", "console_messages", "resize", "evaluate",
  "wait_for", "press_key", "hover", "navigate_back",
];

export function openCodeConfig({ agent, specFile, specId, runPath, playwrightArgs }) {
  const permissions = [];
  const rule = (action, resource, effect = "allow") => permissions.push({ action, resource, effect });
  rule("*", "*", "deny");
  rule("edit", `${runPath}/*`);
  rule("read", `${runPath}/*`);

  if (agent === "verifier") rule("read", specFile);
  if (playwrightArgs) {
    for (const tool of BROWSER_TOOLS) rule(`playwright_browser_${tool}`, "*");
  } else {
    for (const action of ["read", "glob", "grep"]) rule(action, "*");
    for (const secret of [".env", ".env.*", "*/.env", "*/.env.*"]) rule("read", secret, "deny");
    for (const command of [
      "npm --prefix app/server test *",
      "npm --prefix app/server run test:acceptance *",
      "git status *", "git diff *", "git log *",
    ]) rule("shell", command);

    if (agent === "tester") {
      rule("edit", `app/server/tests/acceptance/${specId}.test.ts`);
    } else {
      rule("edit", "app/*");
      for (const protectedPath of [
        "app/.env*", "app/*/.env*", "app/Dockerfile", "app/docker-compose.yml",
        "app/server/prisma/migrations/*", "app/server/tests/support/*",
      ]) rule("edit", protectedPath, "deny");
      if (agent === "implementer") rule("edit", "app/server/tests/acceptance/*", "deny");
      for (const command of [
        "npm --prefix app run build *",
        "npm --prefix app run db:generate --workspace=server",
        "npm --prefix app run db:migrate --workspace=server",
        "npm --prefix app/server run db:generate",
        "npm --prefix app/server run db:migrate -- --name *",
        "npx prisma generate *",
      ]) rule("shell", command);
    }
  }

  const settings = {
    snapshots: false,
    instructions: ["CLAUDE.md"],
    agents: { [AGENT_ID]: { mode: "primary", permissions } },
  };
  const playwright = playwrightArgs && {
    type: "local",
    command: [...(IS_WIN ? ["cmd.exe", "/d", "/c"] : []), "npx", ...playwrightArgs],
    codemode: false,
  };
  return { settings, playwright };
}

function spawnOpenCode(args, cwd, env) {
  const options = { cwd, env, stdio: ["pipe", "pipe", "inherit"] };
  // The Windows npm shim needs cmd.exe. The prompt and config travel outside the command line.
  return IS_WIN
    ? spawn(["opencode", ...args].join(" "), { ...options, shell: true })
    : spawn("opencode", args, options);
}

async function startBrowserServer(root, env, config) {
  const password = randomBytes(32).toString("hex");
  env.OPENCODE_PASSWORD = password;
  // The stdio lease shuts down the private server when this runner closes its stdin.
  const server = spawnOpenCode(["serve", "--stdio", "--port", "0"], root, env);
  const closed = new Promise((resolve) => server.once("close", resolve));
  const ready = createInterface({ input: server.stdout, crlfDelay: Infinity });
  let spawnError;
  server.on("error", (error) => { spawnError = error; });
  const stop = async () => {
    server.stdin.end();
    await closed;
  };
  server.stdin.on("error", () => {}); // The server may exit before the stdin lease closes.
  try {
    const [line] = await Promise.race([
      once(ready, "line", { signal: AbortSignal.timeout(15000) }),
      closed.then(() => []),
    ]);
    if (!line) throw spawnError ?? new Error("OpenCode exited before its private server was ready.");
    const url = new URL(JSON.parse(line).url);
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port) {
      throw new Error("OpenCode did not provide a local private server URL.");
    }
    const headers = {
      authorization: `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`,
      "content-type": "application/json",
      "x-opencode-directory": encodeURIComponent(root),
    };
    const request = async (route, options) => {
      const response = await fetch(new URL(route, url), {
        headers, signal: AbortSignal.timeout(45000), ...options,
      });
      if (!response.ok) throw new Error(`OpenCode Playwright setup failed (${response.status}): ${await response.text()}`);
      return response;
    };
    // OpenCode 2.4.2 can read MCP config without registering the server. Add it explicitly.
    const route = "/api/experimental/mcp/playwright";
    await request(route, { method: "PUT", body: JSON.stringify({ config }) });
    await request(`${route}/connect`, { method: "POST" });
    const { data } = await (await request("/api/mcp")).json();
    const status = data.find((item) => item.name === "playwright")?.status;
    if (status?.status !== "connected") throw new Error(`Playwright did not connect: ${status?.error ?? "unknown error"}`);
    return { url: url.origin, stop };
  } catch (error) {
    await stop();
    throw error;
  } finally {
    ready.close();
  }
}

export async function runOpenCode({ prompt, config, model, root, runDir, log, summarizeInput }) {
  const env = { ...process.env, OPENCODE_CONFIG_CONTENT: JSON.stringify(config.settings) };
  const browser = config.playwright ? await startBrowserServer(root, env, config.playwright) : null;
  const args = ["run", "--format", "json", "--archived", "--agent", AGENT_ID];
  if (browser) args.push("--server", browser.url);
  else args.push("--standalone");
  if (model) args.push("--model", model);
  try {
    const start = (session) => spawnOpenCode(session ? [...args, "--session", session] : args, root, env);
    return await streamOpenCode(start, { prompt, runDir, log, summarizeInput });
  } finally {
    if (browser) await browser.stop();
  }
}

async function streamOpenCode(start, { prompt, runDir, log, summarizeInput }) {
  const started = Date.now();
  const trace = createWriteStream(path.join(runDir, "transcript.jsonl"));
  const traceFinished = finished(trace);
  const reported = {};
  const stepsWithMetric = {};
  let steps = 0;
  let text = [];
  let error;
  let session;
  const addMetric = (key, value) => {
    if (!Number.isFinite(value)) return;
    reported[key] = (reported[key] ?? 0) + value;
    stepsWithMetric[key] = (stepsWithMetric[key] ?? 0) + 1;
  };

  const runAttempt = async (child, message) => {
    text = [];
    child.on("error", (cause) => { error = cause.message; });
    child.stdin.on("error", (cause) => { if (cause.code !== "EPIPE") error = cause.message; });
    const closed = new Promise((resolve) => child.once("close", resolve));
    child.stdin.end(message);
    for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
      trace.write(`${line}\n`);
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      if (/^ses_[a-zA-Z0-9]+$/.test(event.sessionID)) session = event.sessionID;
      const part = event.part;
      const time = `${Math.round((Date.now() - started) / 1000)}s`.padStart(5);
      if (event.type === "step_start") {
        text = [];
      } else if (event.type === "text" && typeof part?.text === "string") {
        text.push(part.text);
        log(`  ${time}  💬 ${part.text.trim().split("\n")[0].slice(0, 110)}`);
      } else if (event.type === "tool_use" && part?.tool) {
        log(`  ${time}  ⚙ ${part.tool} ${summarizeInput(part.state?.input)}`);
      } else if (event.type === "step_finish" && part) {
        steps++;
        addMetric("input_tokens", part.tokens?.input);
        addMetric("output_tokens", part.tokens?.output);
        addMetric("reasoning_tokens", part.tokens?.reasoning);
        addMetric("cache_read_input_tokens", part.tokens?.cache?.read);
        addMetric("cache_creation_input_tokens", part.tokens?.cache?.write);
        addMetric("cost", part.cost);
      } else if (event.type === "error") {
        error = event.error?.message ?? "OpenCode reported an error.";
      } else if (event.type === "retry") {
        log(`  ${time}  OpenCode retrying: ${event.error?.message ?? "provider error"}`);
      }
    }
    const code = await closed;
    if (code !== 0) error ??= `OpenCode exited unsuccessfully (${code ?? "signal"}).`;
  };
  try {
    await runAttempt(start(), prompt);
    for (let attempt = 1; !error && !text.join("").trim() && session && attempt <= MAX_CONTINUATIONS; attempt++) {
      log(`  OpenCode stopped without a final response; continuing the same session (${attempt}/${MAX_CONTINUATIONS}).`);
      await runAttempt(start(session),
        "Continue from the last completed action in this session. Keep the current browser and test data. " +
        "Check the current screen if needed before making changes so you do not repeat a successful action. " +
        "Complete the remaining work and write the required reports before returning the RESULT line.");
    }
  } finally {
    trace.end();
    await traceFinished;
  }

  const { cost, reasoning_tokens, ...usage } = Object.fromEntries(
    Object.entries(reported).filter(([key]) => stepsWithMetric[key] === steps)
  );
  const result = text.join("\n").trim();
  if (!result) error ??= "OpenCode produced no final response.";
  if (error) log(`  OpenCode: ${error}`);
  return {
    result,
    is_error: Boolean(error),
    ...(error ? { error, subtype: "OPENCODE" } : {}),
    duration_ms: Date.now() - started,
    num_turns: steps || undefined,
    usage,
    reasoning_tokens,
    total_cost_usd: cost,
  };
}
