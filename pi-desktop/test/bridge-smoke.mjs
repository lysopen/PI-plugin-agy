import assert from "node:assert/strict";
import { completeWithRuntime, modelsForDesktop, toDshOptions } from "../agent-extension.mjs";
import { createBridgeServer } from "../main.cjs";
import { AcpTurn, pumpStep } from "../runtime/conversation.js";

let seen;
const runtime = {
  async *stream(options) {
    seen = options;
    const turn = new AcpTurn("bridge-test");
    turn.events.push({ kind: "thought", text: "checking" });
    turn.events.push({ kind: "text", text: "bridge" });
    turn.events.push({ kind: "text", text: "-ok" });
    turn.events.push({ kind: "done", result: {
      stopReason: "end_turn",
      usage: { inputTokens: 11, outputTokens: 5, totalTokens: 16 },
    } });
    yield* pumpStep(turn, { recordUsage() {} }, options.signal);
  },
};

const bridge = createBridgeServer({
  runtime,
  models: modelsForDesktop(),
  toOptions: toDshOptions,
  complete: completeWithRuntime,
  port: 0,
});
await bridge.start();
const port = bridge.address().port;
try {
  const modelsResponse = await fetch(`http://127.0.0.1:${port}/v1/models`);
  assert.equal(modelsResponse.status, 200);
  const models = await modelsResponse.json();
  assert.equal(models.data.length, 5);
  assert.equal(models.data[0].id, "gemini-4-argon");

  const completionResponse = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", "session_id": "desktop-session-1" },
    body: JSON.stringify({
      model: "gemini-4-argon",
      messages: [
        { role: "system", content: "be concise" },
        { role: "user", content: "hello" },
      ],
      tools: [{ type: "function", function: { name: "Read", description: "read", parameters: { type: "object" } } }],
    }),
  });
  assert.equal(completionResponse.status, 200);
  const completion = await completionResponse.json();
  assert.equal(completion.choices[0].message.content, "bridge-ok");
  assert.equal(completion.choices[0].message.reasoning_content, "checking");
  assert.equal(completion.usage.total_tokens, 16);
  assert.equal(seen.sessionId, "desktop-session-1");
  assert.equal(seen.system, "be concise");
  assert.equal(seen.messages[0].role, "user");
  assert.equal(seen.tools[0].name, "Read");

  const streamResponse = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "gemini-4-argon",
      stream: true,
      stream_options: { include_usage: true },
      messages: [{ role: "user", content: "hello" }],
    }),
  });
  assert.equal(streamResponse.status, 200);
  const streamText = await streamResponse.text();
  const events = streamText.trim().split("\n\n").map((line) => line.slice("data: ".length));
  assert.equal(events.pop(), "[DONE]");
  const chunks = events.map((event) => JSON.parse(event));
  const deltas = chunks.flatMap((chunk) => chunk.choices.map((choice) => choice.delta));
  assert.equal(deltas.map((delta) => delta.content ?? "").join(""), "bridge-ok");
  assert.equal(deltas.map((delta) => delta.reasoning_content ?? "").join(""), "checking");
  assert.equal(chunks.at(-2).choices[0].finish_reason, "stop");
  assert.equal(chunks.at(-1).usage.total_tokens, 16);
} finally {
  await bridge.stop();
}

console.log("bridge smoke test passed");
