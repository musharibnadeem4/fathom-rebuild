#!/usr/bin/env node
// Captures prompt/response pairs into .agent-logs/ for the 8x assignment.
// Wired via .claude/settings.json to SessionStart, PostModelSwitch,
// UserPromptSubmit, and Stop hooks. Reads one JSON payload from stdin.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function readStdin() {
  const data = fs.readFileSync(0, "utf8");
  return JSON.parse(data);
}

function nowIso() {
  return new Date().toISOString();
}

function gitIdentity(cwd) {
  try {
    const email = execFileSync("git", ["config", "user.email"], { cwd, encoding: "utf8" }).trim();
    if (email) return email;
  } catch (e) {}
  return "unknown";
}

function loadState(statePath) {
  if (fs.existsSync(statePath)) {
    try {
      return JSON.parse(fs.readFileSync(statePath, "utf8"));
    } catch (e) {}
  }
  return {};
}

function saveState(statePath, state) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

// Reads the session transcript (JSONL) and returns the most recent known
// model name. Checks two shapes:
//  - an assistant turn, e.g. message.model === "claude-sonnet-5"
//  - a "model" attachment written at prompt time, e.g.
//    attachment.type === "model", attachment.identity.modelId === "..."
// The attachment shows up before any assistant message exists, so it's what
// makes the model resolvable on the very first prompt of a session.
function modelFromTranscript(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;
  try {
    const lines = fs.readFileSync(transcriptPath, "utf8").trim().split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i]) continue;
      let entry;
      try {
        entry = JSON.parse(lines[i]);
      } catch (e) {
        continue;
      }
      const model = entry && entry.message && entry.message.model;
      if (model) return model;
      const attachmentModel =
        entry &&
        entry.attachment &&
        entry.attachment.type === "model" &&
        entry.attachment.identity &&
        entry.attachment.identity.modelId;
      if (attachmentModel) return attachmentModel;
    }
  } catch (e) {}
  return null;
}

// Reads the `model:` field out of an existing log file's frontmatter, in
// case this session's log already recorded one (e.g. from a prior exchange).
function modelFromLogFrontmatter(logPath) {
  if (!logPath || !fs.existsSync(logPath)) return null;
  try {
    const content = fs.readFileSync(logPath, "utf8");
    const match = content.match(/^model: (.+)$/m);
    if (match && match[1] && match[1] !== "unknown") return match[1].trim();
  } catch (e) {}
  return null;
}

// Best-effort model resolution: prefer an explicit field on the hook
// payload itself, then the transcript file, then the session's own log.
function resolveModel(input, logPath) {
  return (
    input.model ||
    input.to_model ||
    modelFromTranscript(input.transcript_path) ||
    modelFromLogFrontmatter(logPath) ||
    null
  );
}

function ensureLogFile(logPath, state, model, cwd) {
  if (fs.existsSync(logPath)) return;
  const date = state.firstPromptTime.slice(0, 10);
  const author = gitIdentity(cwd);
  const project = path.basename(cwd);
  const shortId = state.sessionId.slice(0, 8);
  const frontmatter =
    "---\n" +
    `session_id: ${state.sessionId}\n` +
    `date: ${date}\n` +
    `author: ${author}\n` +
    `model: ${model}\n` +
    "tool: claude-code\n" +
    `project: ${project}\n` +
    "total_exchanges: 0\n" +
    `first_prompt_time: ${state.firstPromptTime}\n` +
    `last_prompt_time: ${state.firstPromptTime}\n` +
    "---\n\n" +
    `# Session Log - ${date}\n\n` +
    `Session: \`${shortId}\` | Project: \`${project}\` | Author: \`${author}\`\n\n` +
    "---\n";
  fs.writeFileSync(logPath, frontmatter);
}

function updateFrontmatter(logPath, totalExchanges, lastPromptTime, model) {
  let content = fs.readFileSync(logPath, "utf8");
  content = content.replace(/^total_exchanges: .*$/m, `total_exchanges: ${totalExchanges}`);
  content = content.replace(/^last_prompt_time: .*$/m, `last_prompt_time: ${lastPromptTime}`);
  if (model) content = content.replace(/^model: .*$/m, `model: ${model}`);
  fs.writeFileSync(logPath, content);
}

// Retroactively fixes a PROMPT entry's "model: unknown" once Stop resolves
// the real model (UserPromptSubmit fires before the model is chosen, so the
// PROMPT entry is often written before it's knowable).
function patchPromptModel(logPath, num, model) {
  if (!model) return;
  let content = fs.readFileSync(logPath, "utf8");
  const re = new RegExp(
    `(\\[LOG_ENTRY type=PROMPT num=${num} session=[^\\]]+\\]\\ntimestamp: [^\\n]+\\nmodel: )unknown`
  );
  const patched = content.replace(re, `$1${model}`);
  if (patched !== content) fs.writeFileSync(logPath, patched);
}

function appendEntry(logPath, type, num, sessionId, timestamp, model, text) {
  const block =
    `\n\n[LOG_ENTRY type=${type} num=${num} session=${sessionId}]\n` +
    `timestamp: ${timestamp}\n` +
    `model: ${model}\n\n` +
    `${text}\n`;
  fs.appendFileSync(logPath, block);
}

function main() {
  let input;
  try {
    input = readStdin();
  } catch (e) {
    process.exit(0);
  }

  const event = input.hook_event_name;
  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const projectDir = process.env.CLAUDE_PROJECT_DIR || cwd;
  const sessionId = input.session_id;
  if (!sessionId) process.exit(0);

  const stateDir = path.join(projectDir, ".claude", "hooks", ".state");
  const logsDir = path.join(projectDir, ".agent-logs");
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });

  const statePath = path.join(stateDir, `${sessionId}.json`);
  const state = loadState(statePath);
  state.sessionId = sessionId;

  if (event === "SessionStart") {
    const model = resolveModel(input, state.logPath);
    if (model) state.model = model;
    saveState(statePath, state);
    return;
  }

  if (event === "PostModelSwitch") {
    const model = resolveModel(input, state.logPath);
    if (model) state.model = model;
    saveState(statePath, state);
    return;
  }

  if (event === "UserPromptSubmit") {
    const ts = nowIso();
    if (!state.logPath) {
      const stamp = ts.replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
      state.logPath = path.join(logsDir, `${stamp}_${sessionId}.md`);
      state.firstPromptTime = ts;
      state.num = 0;
    }
    state.num = (state.num || 0) + 1;
    state.lastPromptTime = ts;
    const model = resolveModel(input, state.logPath) || state.model || "unknown";
    state.model = model;

    ensureLogFile(state.logPath, state, model, cwd);
    appendEntry(state.logPath, "PROMPT", state.num, sessionId, ts, model, input.prompt || "");
    saveState(statePath, state);
    return;
  }

  if (event === "Stop") {
    if (!state.logPath || !state.num) return;
    const ts = nowIso();
    const model = resolveModel(input, state.logPath) || state.model || "unknown";
    state.model = model;
    if (model !== "unknown") patchPromptModel(state.logPath, state.num, model);
    appendEntry(state.logPath, "RESPONSE", state.num, sessionId, ts, model, input.last_assistant_message || "");
    updateFrontmatter(state.logPath, state.num, state.lastPromptTime || ts, model);
    saveState(statePath, state);
    return;
  }
}

main();
