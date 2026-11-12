"use strict";

/**
 * Host-owned Provider bridge for PI-Desktop.
 *
 * The manifest declaration makes Antigravity visible in PI-Desktop's native
 * provider/model picker. This small loopback server is the wire adapter that
 * turns PI-Desktop's OpenAI Chat Completions requests back into the reusable
 * ACP runtime used by the Agent Extension.
 */
const http = require("node:http");

const HOST = "127.0.0.1";
const PORT = 17956;
const SERVICE_ID = "antigravity-bridge";
const MAX_BODY_BYTES = 16 * 1024 * 1024;

let adapterPromise;
let runtime;
let bridge;

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  res.end(body);
}

function errorBody(message, type = "invalid_request_error") {
  return { error: { message: String(message), type } };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("request body too large"), { code: "PAYLOAD_TOO_LARGE" }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function textContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content == null ? "" : String(content);
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (!part || typeof part !== "object") return "";
    if (part.type === "text" || part.type === "input_text") return String(part.text ?? "");
    if (part.type === "image_url" || part.type === "input_image") return "[image input unavailable]";
    return typeof part.text === "string" ? part.text : "";
  }).filter(Boolean).join("\n");
}

function piContent(content) {
  if (typeof content === "string") return content ? [{ type: "text", text: content }] : [];
  if (!Array.isArray(content)) {
    const text = textContent(content);
    return text ? [{ type: "text", text }] : [];
  }
  const blocks = [];
  for (const part of content) {
    if (typeof part === "string") {
      if (part) blocks.push({ type: "text", text: part });
      continue;
    }
    if (!part || typeof part !== "object") continue;
    if (part.type === "text" || part.type === "input_text") {
      if (typeof part.text === "string" && part.text.length > 0) blocks.push({ type: "text", text: part.text });
      continue;
    }
    if (part.type === "image_url" || part.type === "input_image") {
      blocks.push({ type: "text", text: "[image input unavailable]" });
    }
  }
  return blocks;
}

function parseToolArguments(value) {
  if (value && typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function openAiMessageToPi(message, index) {
  const role = String(message?.role ?? "user");
  if (role === "tool") {
    return {
      id: String(message?.id ?? `tool-${index}`),
      role: "toolResult",
      toolCallId: String(message?.tool_call_id ?? message?.toolCallId ?? ""),
      toolName: String(message?.name ?? ""),
      content: piContent(message?.content),
      isError: message?.is_error === true || message?.isError === true,
    };
  }
  const content = piContent(message?.content);
  if (role === "assistant") {
    for (const call of Array.isArray(message?.tool_calls) ? message.tool_calls : []) {
      const fn = call?.function ?? {};
      content.push({
        type: "toolCall",
        id: String(call?.id ?? `call-${index}`),
        name: String(fn.name ?? call?.name ?? ""),
        arguments: parseToolArguments(fn.arguments ?? call?.arguments),
      });
    }
  }
  return {
    id: String(message?.id ?? `${role}-${index}`),
    role: ["system", "developer", "user", "assistant"].includes(role) ? role : "user",
    content,
  };
}

function openAiToolToPi(tool) {
  const fn = tool?.function ?? tool ?? {};
  const name = String(fn.name ?? "").trim();
  if (!name) return undefined;
  return {
    name,
    description: String(fn.description ?? ""),
    inputSchema: fn.parameters && typeof fn.parameters === "object"
      ? fn.parameters
      : { type: "object", properties: {} },
  };
}

function requestContext(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const system = [];
  const remaining = [];
  for (const [index, message] of messages.entries()) {
    const converted = openAiMessageToPi(message, index);
    if (converted.role === "system") {
      const text = textContent(message?.content);
      if (text) system.push(text);
    } else {
      remaining.push(converted);
    }
  }
  const tools = (Array.isArray(body?.tools) ? body.tools : [])
    .map(openAiToolToPi)
    .filter(Boolean);
  return {
    systemPrompt: system.join("\n\n"),
    messages: remaining,
    tools,
  };
}

function header(req, names) {
  for (const name of names) {
    const value = req.headers[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function requestOptions(body, req, signal) {
  const metadata = body?.metadata && typeof body.metadata === "object" ? body.metadata : {};
  const sessionId = header(req, ["session_id", "x-session-affinity", "x-client-request-id"])
    ?? (typeof body?.prompt_cache_key === "string" ? body.prompt_cache_key : undefined)
    ?? (typeof metadata.session_id === "string" ? metadata.session_id : undefined)
    ?? (typeof body?.user === "string" ? `openai-user:${body.user}` : undefined);
  const requested = body?.reasoning_effort ?? body?.reasoningEffort;
  const reasoning = /^(low|medium|high)$/i.test(String(requested ?? ""))
    ? String(requested).toLowerCase()
    : undefined;
  return {
    sessionId,
    purpose: typeof metadata.pi_purpose === "string" && metadata.pi_purpose.trim()
      ? metadata.pi_purpose.trim()
      : "main",
    reasoning,
    signal,
  };
}

function responseId() {
  return `chatcmpl-agy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function usageOf(value) {
  const input = Math.max(0, Math.round(Number(value?.input ?? 0)));
  const output = Math.max(0, Math.round(Number(value?.output ?? 0)));
  return {
    prompt_tokens: input,
    completion_tokens: output,
    total_tokens: Math.max(0, Math.round(Number(value?.totalTokens ?? input + output))),
  };
}

function resultMessage(result) {
  const message = { role: "assistant", content: null };
  const toolCalls = [];
  const text = [];
  const reasoning = [];
  for (const block of Array.isArray(result?.content) ? result.content : []) {
    if (block?.type === "text" && typeof block.text === "string") text.push(block.text);
    else if (block?.type === "thinking" && typeof block.thinking === "string") reasoning.push(block.thinking);
    else if (block?.type === "toolCall") {
      toolCalls.push({
        id: String(block.id ?? `call-${toolCalls.length}`),
        type: "function",
        function: {
          name: String(block.name ?? ""),
          arguments: JSON.stringify(block.arguments ?? {}),
        },
      });
    }
  }
  if (text.length > 0) message.content = text.join("");
  if (reasoning.length > 0) message.reasoning_content = reasoning.join("");
  if (toolCalls.length > 0) message.tool_calls = toolCalls;
  return message;
}

function finishReason(result) {
  switch (result?.stopReason) {
    case "toolUse": return "tool_calls";
    case "length": return "length";
    case "aborted": return "stop";
    case "error": return "stop";
    default: return "stop";
  }
}

function writeSse(res, value) {
  return new Promise((resolve) => {
    const ok = res.write(`data: ${typeof value === "string" ? value : JSON.stringify(value)}\n\n`);
    if (ok) {
      resolve();
      return;
    }
    res.once("drain", resolve);
  });
}

function createBridgeServer({ runtime: suppliedRuntime, models, toOptions, complete, port = PORT, host = HOST, log = () => {} }) {
  if (!suppliedRuntime || typeof suppliedRuntime.stream !== "function") throw new Error("runtime.stream is required");
  if (!Array.isArray(models) || typeof toOptions !== "function" || typeof complete !== "function") {
    throw new Error("bridge adapter is incomplete");
  }
  const modelMap = new Map(models.map((model) => [String(model.id), model]));
  let server;

  async function handleModels(_req, res) {
    const data = models.map((model) => ({
      id: model.id,
      object: "model",
      created: 0,
      owned_by: "antigravity",
      name: model.name,
      context_window: model.contextWindow,
    }));
    json(res, 200, { object: "list", data });
  }

  async function handleCompletion(req, res) {
    let body;
    try {
      const raw = await readBody(req);
      body = raw.trim() ? JSON.parse(raw) : {};
    } catch (error) {
      const status = error?.code === "PAYLOAD_TOO_LARGE" ? 413 : 400;
      json(res, status, errorBody(status === 413 ? "request body too large" : "invalid JSON"));
      return;
    }
    const model = modelMap.get(String(body?.model ?? ""));
    if (!model) {
      json(res, 400, errorBody(`unknown model: ${String(body?.model ?? "")}`));
      return;
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    req.once("aborted", abort);
    res.once("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    const context = requestContext(body);
    const options = requestOptions(body, req, controller.signal);
    const runtimeOptions = toOptions(model, context, options);
    log(`chat/completions model=${model.id} stream=${body?.stream === true}`);
    if (body?.stream === true) {
      await streamCompletion(res, suppliedRuntime, runtimeOptions, model, responseId(), body?.stream_options?.include_usage === true);
      return;
    }
    try {
      const result = await complete(suppliedRuntime, model, context, options);
      json(res, 200, {
        id: responseId(),
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: model.id,
        choices: [{
          index: 0,
          message: resultMessage(result),
          finish_reason: finishReason(result),
        }],
        usage: usageOf(result?.usage),
      });
    } catch (error) {
      json(res, 502, errorBody(error?.message ?? error, "server_error"));
    }
  }

  async function streamCompletion(res, activeRuntime, options, model, id, includeUsage) {
    let started = false;
    let sentRole = false;
    let finished = false;
    let finish = "stop";
    const toolStates = new Map();
    let usage;
    const start = () => {
      if (started) return;
      started = true;
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-store",
        connection: "keep-alive",
      });
    };
    const emit = async (delta, reason = null) => {
      start();
      await writeSse(res, {
        id,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: model.id,
        choices: [{ index: 0, delta, finish_reason: reason }],
      });
    };
    try {
      for await (const chunk of activeRuntime.stream(options)) {
        if (chunk?.type === "usage") {
          usage = usageOf({
            input: chunk.usage?.inputTokens,
            output: chunk.usage?.outputTokens,
            totalTokens: chunk.usage?.totalTokens,
          });
          continue;
        }
        if (chunk?.type === "text-delta" && chunk.text) {
          const delta = sentRole ? { content: chunk.text } : { role: "assistant", content: chunk.text };
          sentRole = true;
          await emit(delta);
        } else if (chunk?.type === "reasoning-delta" && chunk.text) {
          const delta = sentRole ? { reasoning_content: chunk.text } : { role: "assistant", reasoning_content: chunk.text };
          sentRole = true;
          await emit(delta);
        } else if (chunk?.type === "tool-call-delta") {
          let state = toolStates.get(chunk.index);
          if (!state) {
            state = { index: toolStates.size, sentId: false, sentName: false };
            toolStates.set(chunk.index, state);
          }
          const fn = {};
          if (!state.sentName && chunk.name) {
            fn.name = String(chunk.name);
            state.sentName = true;
          }
          if (chunk.argumentsDelta !== undefined) fn.arguments = String(chunk.argumentsDelta);
          const tool = { index: state.index, type: "function", function: fn };
          if (!state.sentId && chunk.id) {
            tool.id = String(chunk.id);
            state.sentId = true;
          }
          await emit(sentRole ? { tool_calls: [tool] } : { role: "assistant", tool_calls: [tool] });
          sentRole = true;
        } else if (chunk?.type === "finish") {
          finish = chunk.reason?.kind === "tool-calls"
            ? "tool_calls"
            : chunk.reason?.kind === "max-tokens"
              ? "length"
              : "stop";
          finished = true;
        }
      }
      if (!sentRole) await emit({ role: "assistant" });
      await emit({}, finished ? finish : "stop");
      if (includeUsage && usage) {
        start();
        await writeSse(res, {
          id,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: model.id,
          choices: [],
          usage,
        });
      }
      await writeSse(res, "[DONE]");
      res.end();
    } catch (error) {
      if (!started) {
        json(res, 502, errorBody(error?.message ?? error, "server_error"));
        return;
      }
      await writeSse(res, { error: errorBody(error?.message ?? error, "server_error").error });
      await writeSse(res, "[DONE]");
      res.end();
    }
  }

  async function handler(req, res) {
    const path = String(req.url ?? "").split("?", 1)[0];
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization" });
      res.end();
      return;
    }
    if (req.method === "GET" && (path === "/healthz" || path === "/v1/health")) {
      json(res, 200, { ok: true, provider: "antigravity" });
      return;
    }
    if (req.method === "GET" && (path === "/v1/models" || path === "/models")) {
      await handleModels(req, res);
      return;
    }
    if (req.method === "POST" && (path === "/v1/chat/completions" || path === "/chat/completions")) {
      await handleCompletion(req, res);
      return;
    }
    json(res, 404, errorBody("not found", "invalid_request_error"));
  }

  return {
    start() {
      if (server?.listening) return Promise.resolve(server.address());
      server = http.createServer((req, res) => {
        void handler(req, res).catch((error) => {
          if (!res.headersSent) json(res, 500, errorBody(error?.message ?? error, "server_error"));
          else res.destroy(error);
        });
      });
      return new Promise((resolve, reject) => {
        const onError = (error) => {
          server?.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          server?.off("error", onError);
          resolve(server.address());
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, host);
      });
    },
    stop() {
      if (!server) return Promise.resolve();
      const active = server;
      server = undefined;
      return new Promise((resolve) => active.close(() => resolve()));
    },
    address() {
      return server?.address() ?? null;
    },
  };
}

async function loadAdapter() {
  adapterPromise ??= import("./agent-extension.mjs");
  return adapterPromise;
}

async function ensureRuntime() {
  const adapter = await loadAdapter();
  runtime ??= adapter.createRuntime();
  return { adapter, runtime };
}

async function startBridge(log = () => {}) {
  if (bridge) return bridge.address();
  const { adapter, runtime: activeRuntime } = await ensureRuntime();
  bridge = createBridgeServer({
    runtime: activeRuntime,
    models: adapter.modelsForDesktop(),
    toOptions: adapter.toDshOptions,
    complete: adapter.completeWithRuntime,
    log,
  });
  try {
    const address = await bridge.start();
    log(`Antigravity OpenAI bridge listening on http://${HOST}:${PORT}/v1`);
    return address;
  } catch (error) {
    bridge = undefined;
    throw error;
  }
}

async function onRendererCall(method, args) {
  if (method !== "agy.quota") {
    throw Object.assign(new Error(`unknown renderer method: ${String(method)}`), {
      code: "AGY_UNKNOWN_RENDERER_METHOD",
    });
  }
  const { adapter, runtime: activeRuntime } = await ensureRuntime();
  const force = Boolean(args && typeof args === "object" && args.force === true);
  return adapter.quotaForDesktop(activeRuntime, { force, timeoutMs: 1_500 });
}

function setRuntimeForTests(nextRuntime) {
  runtime = nextRuntime;
}

async function stopBridge() {
  await bridge?.stop();
  bridge = undefined;
  await runtime?.dispose?.();
  runtime = undefined;
}

async function onLoad() {
  const pi = globalThis.pi;
  if (pi?.services?.register) {
    pi.services.register({
      id: SERVICE_ID,
      start: ({ log }) => startBridge((message) => log(message)),
      stop: () => stopBridge(),
    });
    return;
  }
  await startBridge((message) => console.info(`[agy] ${message}`));
}

async function onUnload() {
  const pi = globalThis.pi;
  try {
    await pi?.services?.unregister?.(SERVICE_ID);
  } finally {
    await stopBridge();
  }
}

module.exports = {
  onLoad,
  onUnload,
  onRendererCall,
  setRuntimeForTests,
  createBridgeServer,
  requestContext,
  openAiMessageToPi,
};
