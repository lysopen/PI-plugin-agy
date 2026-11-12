import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { quotaForDesktop } from "../agent-extension.mjs";

const require = createRequire(import.meta.url);
const { onRendererCall, setRuntimeForTests } = require("../main.cjs");

const snapshots = {
  default: {
    status: "ok",
    updatedAt: "2026-11-12T12:00:00.000Z",
    subscriptionTier: "PRO",
    subscriptionName: "Pro",
    groups: [
      {
        kind: "gemini",
        name: "Gemini",
        buckets: [
          {
            id: "gemini-weekly",
            name: "Weekly",
            window: "7d",
            remainingFraction: 0.73,
            resetTime: "2026-11-14T12:00:00.000Z",
          },
        ],
      },
    ],
  },
};

function fakeRuntime({ slow = false } = {}) {
  return {
    accounts() {
      return [
        {
          id: "default",
          label: "本机账号",
          email: "user@example.com",
          system: true,
          enabled: true,
          state: "idle",
          root: "C:\\should-not-leak",
          env: { TOKEN: "should-not-leak" },
        },
        {
          id: "acc-1",
          label: "备用账号",
          enabled: true,
          state: "ready",
        },
      ];
    },
    async quotaFor(id) {
      if (slow && id === "acc-1") await new Promise((resolve) => setTimeout(resolve, 2_000));
      return snapshots[id] ?? { status: "error", error: "not signed in", groups: [] };
    },
  };
}

const answer = await quotaForDesktop(fakeRuntime());
assert.equal(answer.status, "partial");
assert.equal(answer.accounts.length, 2);
assert.equal(answer.accounts[0].email, "user@example.com");
assert.equal(answer.accounts[0].quota.groups[0].buckets[0].remainingFraction, 0.73);
assert.equal("root" in answer.accounts[0], false);
assert.equal("env" in answer.accounts[0], false);
assert.equal(JSON.stringify(answer).includes("should-not-leak"), false);

const started = Date.now();
const partial = await quotaForDesktop(fakeRuntime({ slow: true }), { timeoutMs: 250 });
assert.ok(Date.now() - started < 1_000);
assert.equal(partial.accounts[1].quota.error, "quota refresh timed out");

setRuntimeForTests(fakeRuntime());
const rendererAnswer = await onRendererCall("agy.quota", { force: false });
assert.equal(rendererAnswer.accounts[0].quota.subscriptionTier, "PRO");
await assert.rejects(
  () => onRendererCall("not-allowed", {}),
  (error) => error?.code === "AGY_UNKNOWN_RENDERER_METHOD",
);

console.log("quota smoke test passed");
