# Antigravity ACP for PI-Desktop

This package ports the `PI-plugin-agy` Antigravity provider to PI-Desktop's native Provider list and trusted Agent Extension API.

## What it provides

- A native PI-Desktop Provider row named **Antigravity ACP**, with five selectable models.
- A loopback OpenAI-compatible bridge at `http://127.0.0.1:17956/v1`.
- The official local `agy acp` process over ACP v1.
- The existing ACP session, model selection, account pool, quota/failover, history replay, and MCP tool handoff logic from the DSH plugin.
- Tool calls returned to PI-Desktop as normal `toolCall` blocks, so the host executes them and the next provider request resumes the parked ACP turn.

## Install and select a model

Import the `lysopen.agy-0.1.2.piplug` package from PI-Desktop's Plugins page. This version fixes empty replies in 0.1.1 by forwarding text and reasoning from the ACP runtime in both streaming and non-streaming replies.

If you already added the custom endpoint, keep it and select the same model after the update. For a new installation on PI-Desktop 0.22.0, turn **Antigravity ACP** off and back on once in the Plugins page after import. This registers the plugin's five models in the chat model picker.

To connect manually, open **Settings → Models → AI Services → Add Service → Custom Endpoint**. Name it **Antigravity ACP**, use `http://127.0.0.1:17956/v1` with **OpenAI Chat Completions**, leave the API key empty, and select the models you want to save.

The local official CLI owns authentication. To customize the runtime, set the following environment variables before starting PI-Desktop:

| Variable | Meaning |
|---|---|
| `PI_AGY_COMMAND` | Absolute path to `agy`; empty uses the normal local search. |
| `PI_AGY_HOME` | ACP data directory; default is `%USERPROFILE%\\.pi-desktop\\agy`. |
| `PI_AGY_ACCOUNTS` | Optional JSON array using the original account profile shape. |
| `PI_AGY_VISIBLE_MODELS` | Optional comma-separated model ids. |
| `PI_AGY_DEFAULT_EFFORT` | `low`, `medium`, or `high`. |
| `PI_AGY_CONTEXT_WINDOW` | Declared context window; default `256000`, use `1048576` only after the local unlock is active. |
| `PI_AGY_AUTO_PATCH` | `true`/`false`; whether to run the existing context-unlock preflight. |

The fixed loopback port is `17956`. PI-Desktop reaches the bridge through the declared Provider base URL; do not change the port in only one place.

The plugin requires a locally installed and signed-in official `agy` CLI. Granting `agent.extension` is required because the ACP transport is a long-lived local process rather than a one-shot HTTP request.

## Source layout

`runtime/` is the checked-in JavaScript build of the reusable ACP runtime from `dsh-llm-antigravity-acp/lib`, with only the DSH type/runtime imports replaced by `runtime/dsh-compat.js`. `agent-extension.mjs` adapts that runtime to the Agent Extension contract; `main.cjs` adapts it to PI-Desktop's native OpenAI-compatible Provider contract. The original DSH plugin remains untouched and is still the source of the runtime behaviour.

## Local checks

```powershell
node --check .\\agent-extension.mjs
node --check .\\main.cjs
node --input-type=module -e "import('./agent-extension.mjs').then(m => console.log(m.MODEL_CATALOG.length))"
npm test
```

Package this directory with the PI-Desktop plugin devkit after installing the reference repository's workspace dependencies:

```powershell
pnpm pi-plugin check .\\pi-desktop
pnpm pi-plugin pack .\\pi-desktop
```
