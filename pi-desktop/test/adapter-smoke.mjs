import assert from "node:assert/strict";
import register, { completeWithRuntime } from "../agent-extension.mjs";

const events = new Map();
let agent;
register({
  registerAgent(value) {
    agent = value;
  },
  on(name, handler) {
    events.set(name, handler);
  },
});

assert.equal(agent?.id, "antigravity");
assert.equal(agent?.models.length, 5);
assert.equal(typeof agent?.complete, "function");
assert.equal(typeof events.get("session_shutdown"), "function");

let seen;
const runtime = {
  async *stream(options) {
    seen = options;
    yield { type: "usage", usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 } };
    yield { type: "block-start", index: 0, blockType: "text" };
    yield { type: "text-delta", index: 0, text: "hel" };
    yield { type: "text-delta", index: 0, text: "lo" };
    yield { type: "block-start", index: 1, blockType: "reasoning" };
    yield { type: "reasoning-delta", index: 1, text: "think" };
    yield { type: "block-start", index: 2, blockType: "tool-call" };
    yield {
      type: "tool-call-delta",
      index: 2,
      id: "call-1",
      name: "Read",
      argumentsDelta: JSON.stringify({ path: "a.txt" }),
    };
    yield { type: "finish", reason: { kind: "tool-calls" } };
  },
};

const result = await completeWithRuntime(
  runtime,
  agent.models[0],
  {
    systemPrompt: "sys",
    messages: [{ role: "user", content: "hi" }],
    tools: [{ name: "Read", description: "read", inputSchema: { type: "object" } }],
  },
  { sessionId: "s1", reasoning: "high" },
);

assert.equal(seen.provider, "antigravity");
assert.equal(seen.model, agent.models[0].id);
assert.equal(seen.sessionId, "s1");
assert.equal(seen.messages[0].role, "user");
assert.equal(seen.tools[0].name, "Read");
assert.deepEqual(result.content.map((block) => block.type), ["text", "thinking", "toolCall"]);
assert.equal(result.content[0].text, "hello");
assert.equal(result.content[1].thinking, "think");
assert.deepEqual(result.content[2].arguments, { path: "a.txt" });
assert.equal(result.stopReason, "toolUse");
assert.equal(result.usage.input, 12);
assert.equal(result.usage.output, 7);

console.log("adapter smoke test passed");
