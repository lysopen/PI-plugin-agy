/**
 * PI-Desktop trusted Agent Extension for the local official Antigravity CLI.
 *
 * The vendored ACP runtime still owns process/session/account/tool semantics;
 * this file is the thin adapter between PI's `pi-ai` contract and the DSH
 * provider request/stream shapes that runtime expects.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { AntigravityRuntime } from "./runtime/runtime.js";
import { FALLBACK_MODELS } from "./runtime/catalog.js";

export const MODEL_CATALOG = FALLBACK_MODELS.map(({ id, name }) => ({ id, name }));
const PROVIDER_ID = "antigravity";
const DEFAULT_CONTEXT_WINDOW = 256_000;
const DEFAULT_MAX_TOKENS = 8_192;

function envFlag(name, fallback) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return !/^(0|false|no|off)$/i.test(value.trim());
}

function envInt(name, fallback, min, max) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function parseAccounts() {
  const raw = process.env.PI_AGY_ACCOUNTS?.trim();
  if (!raw) {
    return [{
      id: "default",
      displayName: "",
      home: "",
      enabled: true,
      env: {},
      contextWindow: 0,
      system: true,
      visibleModels: [],
      priority: 1,
      weight: 1,
    }];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("PI_AGY_ACCOUNTS must be a JSON array");
    return parsed;
  } catch (error) {
    console.warn(`[agy] ignoring invalid PI_AGY_ACCOUNTS: ${error instanceof Error ? error.message : String(error)}`);
    return [{
      id: "default",
      displayName: "",
      home: "",
      enabled: true,
      env: {},
      contextWindow: 0,
      system: true,
      visibleModels: [],
      priority: 1,
      weight: 1,
    }];
  }
}

export function runtimeConfig() {
  const visibleModels = (process.env.PI_AGY_VISIBLE_MODELS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    provider: PROVIDER_ID,
    displayName: "Antigravity ACP",
    command: process.env.PI_AGY_COMMAND ?? "",
    home: process.env.PI_AGY_HOME?.trim() || join(homedir(), ".pi-desktop", "agy"),
    accounts: parseAccounts(),
    configVersion: 2,
    visibleModels,
    contextWindow: envInt("PI_AGY_CONTEXT_WINDOW", DEFAULT_CONTEXT_WINDOW, 32_000, 1_048_576),
    defaultEffort: /^(low|medium|high)$/i.test(process.env.PI_AGY_DEFAULT_EFFORT ?? "")
      ? process.env.PI_AGY_DEFAULT_EFFORT.toLowerCase()
      : "high",
    autoPatch: envFlag("PI_AGY_AUTO_PATCH", true),
    patchScript: process.env.PI_AGY_PATCH_SCRIPT ?? "",
    maxLiveSessions: envInt("PI_AGY_MAX_LIVE_SESSIONS", 16, 1, 64),
    idleSessionTtlMs: envInt("PI_AGY_IDLE_SESSION_TTL_MS", 1_800_000, 10_000, 86_400_000),
    parkSettleMs: envInt("PI_AGY_PARK_SETTLE_MS", 250, 0, 5_000),
    coldSwitchSettleMs: envInt("PI_AGY_COLD_SWITCH_SETTLE_MS", 80, 0, 2_000),
    keepAliveMs: envInt("PI_AGY_KEEPALIVE_MS", 15_000, 1_000, 120_000),
    relayAfterMs: envInt("PI_AGY_RELAY_AFTER_MS", 85_000, 5_000, 165_000),
    longDecodeContinuations: envInt("PI_AGY_LONG_DECODE_CONTINUATIONS", 3, 0, 16),
    warmup: false,
    quotaTtlMs: envInt("PI_AGY_QUOTA_TTL_MS", 120_000, 5_000, 3_600_000),
  };
}

function boundedTail() {
  let value = "";
  return {
    append(chunk) {
      value = (value + String(chunk)).slice(-64 * 1024);
    },
    read() {
      return value;
    },
  };
}

function spawnAcp(argv, cwd, env) {
  const child = spawn(argv[0], argv.slice(1), {
    cwd,
    env: { ...process.env, ...(env ?? {}) },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const stderr = boundedTail();
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk) => stderr.append(chunk));
  const exited = new Promise((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  return {
    stdin: child.stdin,
    stdout: child.stdout,
    exited,
    terminate: () => {
      if (!child.killed) child.kill();
    },
    stderrTail: () => stderr.read(),
  };
}

async function runCommand(argv, timeoutMs, env) {
  const child = spawn(argv[0], argv.slice(1), {
    cwd: homedir(),
    env: { ...process.env, ...(env ?? {}) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => { stdout += chunk; });
  child.stderr?.on("data", (chunk) => { stderr += chunk; });
  let killed = false;
  const timer = setTimeout(() => {
    killed = true;
    child.kill();
  }, timeoutMs);
  const result = await new Promise((resolve) => {
    child.once("exit", (code) => resolve({ code, stdout, stderr }));
  });
  clearTimeout(timer);
  return { ...result, code: killed ? (result.code ?? 1) : result.code };
}

function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block && typeof block === "object" && block.type === "text")
    .map((block) => String(block.text ?? ""))
    .join("");
}

function toDshBlocks(content) {
  if (typeof content === "string") return [{ type: "text", text: content }];
  if (!Array.isArray(content)) return [{ type: "text", text: String(content ?? "") }];
  const blocks = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    switch (block.type) {
      case "text":
        if (typeof block.text === "string" && block.text.length > 0) blocks.push({ type: "text", text: block.text });
        break;
      case "thinking":
        if (typeof block.thinking === "string" && block.thinking.length > 0) blocks.push({ type: "reasoning", text: block.thinking });
        break;
      case "image":
        blocks.push({
          type: "image",
          attachment: block.attachment ?? { attachmentId: "pi-image" },
          offloaded: block.offloaded === true,
        });
        break;
      case "toolCall":
        blocks.push({
          type: "tool-call",
          id: String(block.id ?? ""),
          name: String(block.name ?? ""),
          arguments: JSON.stringify(block.arguments ?? {}),
        });
        break;
      default:
        if (typeof block.text === "string") blocks.push({ type: "text", text: block.text });
    }
  }
  return blocks.length > 0 ? blocks : [{ type: "text", text: "" }];
}

function toDshMessage(message, index) {
  const role = message?.role;
  if (role === "toolResult") {
    return {
      id: String(message.id ?? `tool-${index}`),
      role: "tool",
      toolCallId: String(message.toolCallId ?? ""),
      toolName: String(message.toolName ?? ""),
      content: toDshBlocks(message.content),
      isError: message.isError === true,
    };
  }
  if (role === "assistant") {
    return {
      id: String(message.id ?? `assistant-${index}`),
      role: "assistant",
      content: toDshBlocks(message.content),
      source: { kind: "model", provider: PROVIDER_ID },
    };
  }
  if (role === "system" || role === "user" || role === "developer") {
    return {
      id: String(message.id ?? `${role}-${index}`),
      role,
      content: toDshBlocks(message.content),
      ...(message.source && typeof message.source === "object" ? { source: message.source } : {}),
    };
  }
  const fallback = textOf(message?.content ?? message?.summary ?? "");
  return {
    id: String(message?.id ?? `context-${index}`),
    role: "user",
    content: [{ type: "text", text: fallback }],
    source: { kind: "runtime-context" },
  };
}

function toDshTool(tool) {
  return {
    name: String(tool?.name ?? ""),
    description: String(tool?.description ?? ""),
    parameters: tool?.parameters ?? tool?.inputSchema ?? tool?.schema ?? { type: "object", properties: {} },
    ...(tool?.deferLoading === true ? { deferLoading: true } : {}),
  };
}

export function toDshOptions(model, context, options) {
  const system = typeof context?.systemPrompt === "string" ? context.systemPrompt : textOf(context?.systemPrompt ?? "");
  const messages = Array.isArray(context?.messages) ? context.messages.map(toDshMessage) : [];
  const tools = Array.isArray(context?.tools) ? context.tools.map(toDshTool).filter((tool) => tool.name.length > 0) : [];
  return {
    provider: PROVIDER_ID,
    model: String(model.id),
    system,
    messages,
    tools,
    reasoningEffort: typeof options?.reasoning === "string" ? options.reasoning : undefined,
    sessionId: typeof options?.sessionId === "string" ? options.sessionId : undefined,
    purpose: typeof options?.purpose === "string" ? options.purpose : "main",
    signal: options?.signal,
  };
}

function emptyUsage() {
  return { inputTokens: 0, outputTokens: 0, cachedReadTokens: 0, cachedWriteTokens: 0, thoughtTokens: 0, totalTokens: 0 };
}

function addUsage(target, value) {
  if (!value || typeof value !== "object") return;
  for (const key of ["inputTokens", "outputTokens", "cachedReadTokens", "cachedWriteTokens", "thoughtTokens", "totalTokens"]) {
    const amount = Number(value[key] ?? 0);
    if (Number.isFinite(amount)) target[key] += Math.max(0, amount);
  }
}

function toPiUsage(value) {
  const input = Math.round(value.inputTokens);
  const output = Math.round(value.outputTokens);
  const cacheRead = Math.round(value.cachedReadTokens);
  const cacheWrite = Math.round(value.cachedWriteTokens);
  const totalTokens = Math.round(value.totalTokens || input + output + cacheRead + cacheWrite);
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    totalTokens,
    ...(value.thoughtTokens > 0 ? { reasoning: Math.round(value.thoughtTokens) } : {}),
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function parseArguments(value) {
  if (value && typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function completeWithRuntime(runtime, model, context, options) {
  const usage = emptyUsage();
  const states = new Map();
  let finish = "stop";
  for await (const chunk of runtime.stream(toDshOptions(model, context, options))) {
    if (chunk.type === "usage") {
      addUsage(usage, chunk.usage);
      continue;
    }
    if (chunk.type === "block-start") {
      states.set(chunk.index, { type: chunk.blockType, text: "", id: "", name: "", arguments: "" });
      continue;
    }
    const state = states.get(chunk.index);
    if (chunk.type === "text-delta") {
      (state ?? states.set(chunk.index, { type: "text", text: "" }).get(chunk.index)).text += chunk.text;
    } else if (chunk.type === "reasoning-delta") {
      (state ?? states.set(chunk.index, { type: "reasoning", text: "" }).get(chunk.index)).text += chunk.text;
    } else if (chunk.type === "tool-call-delta") {
      const next = state ?? { type: "tool-call", text: "", id: "", name: "", arguments: "" };
      next.id = String(chunk.id ?? next.id);
      next.name = String(chunk.name ?? next.name);
      next.arguments += String(chunk.argumentsDelta ?? "");
      states.set(chunk.index, next);
    } else if (chunk.type === "block-end" && chunk.block?.type === "tool-call") {
      const next = state ?? { type: "tool-call", text: "", id: "", name: "", arguments: "" };
      next.id = String(chunk.block.id ?? next.id);
      next.name = String(chunk.block.name ?? next.name);
      next.arguments = String(chunk.block.arguments ?? next.arguments);
      states.set(chunk.index, next);
    } else if (chunk.type === "finish") {
      finish = chunk.reason?.kind === "tool-calls"
        ? "toolUse"
        : chunk.reason?.kind === "aborted"
          ? "aborted"
          : chunk.reason?.kind === "max-tokens"
            ? "length"
            : chunk.reason?.kind === "error"
              ? "error"
              : "stop";
    }
  }
  const content = [...states.entries()].sort(([a], [b]) => a - b).flatMap(([, state]) => {
    if (state.type === "reasoning" && state.text) return [{ type: "thinking", thinking: state.text }];
    if (state.type === "text" && state.text) return [{ type: "text", text: state.text }];
    if (state.type === "tool-call") return [{ type: "toolCall", id: state.id, name: state.name, arguments: parseArguments(state.arguments) }];
    return [];
  });
  return {
    role: "assistant",
    content: content.length > 0 ? content : [{ type: "text", text: "" }],
    api: model.api ?? "openai-completions",
    provider: model.provider ?? `extension-agent:${PROVIDER_ID}`,
    model: model.id,
    usage: toPiUsage(usage),
    stopReason: finish,
    timestamp: Date.now(),
  };
}

export function modelsForDesktop() {
  const contextWindow = envInt("PI_AGY_CONTEXT_WINDOW", DEFAULT_CONTEXT_WINDOW, 32_000, 1_048_576);
  return MODEL_CATALOG.map(({ id, name }) => ({
    id,
    name,
    api: "openai-completions",
    reasoning: true,
    thinkingLevels: id === "gpt-oss-120b-medium" ? ["medium"] : ["low", "medium", "high"],
    input: ["text"],
    contextWindow: id === "gpt-oss-120b-medium" ? 131_072 : contextWindow,
    maxTokens: DEFAULT_MAX_TOKENS,
  }));
}

export function createRuntime(overrides = {}) {
  return new AntigravityRuntime({
    config: overrides.config ?? runtimeConfig(),
    spawnAcp,
    runCommand,
    readImage: async () => undefined,
    canReadImages: () => false,
    log: {
      info: (message) => console.info(`[agy] ${message}`),
      warn: (message) => console.warn(`[agy] ${message}`),
    },
    onModelsChanged: () => {},
    ...overrides,
  });
}

export default function register(pi) {
  const runtime = createRuntime();

  pi.registerAgent({
    id: PROVIDER_ID,
    name: "Antigravity ACP",
    models: modelsForDesktop(),
    complete: (model, context, options) => completeWithRuntime(runtime, model, context, options),
  });

  pi.on("session_shutdown", () => {
    void runtime.dispose();
  });
}
