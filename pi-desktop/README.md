# Antigravity ACP for PI-Desktop

This package ports the `PI-plugin-agy` Antigravity provider to PI-Desktop's trusted Agent Extension API.

## What it provides

- A native PI-Desktop Agent provider named **Antigravity ACP**.
- The official local `agy acp` process over ACP v1.
- The existing ACP session, model selection, account pool, quota/failover, history replay, and MCP tool handoff logic from the DSH plugin.
- Tool calls returned to PI-Desktop as normal `toolCall` blocks, so the host executes them and the next provider request resumes the parked ACP turn.

The first PI-Desktop port intentionally does not copy the DSH settings card or remote service surface. Configure the runtime with environment variables before starting PI-Desktop:

| Variable | Meaning |
|---|---|
| `PI_AGY_COMMAND` | Absolute path to `agy`; empty uses the normal local search. |
| `PI_AGY_HOME` | ACP data directory; default is `%USERPROFILE%\\.pi-desktop\\agy`. |
| `PI_AGY_ACCOUNTS` | Optional JSON array using the original account profile shape. |
| `PI_AGY_VISIBLE_MODELS` | Optional comma-separated model ids. |
| `PI_AGY_DEFAULT_EFFORT` | `low`, `medium`, or `high`. |
| `PI_AGY_CONTEXT_WINDOW` | Declared context window; default `256000`, use `1048576` only after the local unlock is active. |
| `PI_AGY_AUTO_PATCH` | `true`/`false`; whether to run the existing context-unlock preflight. |

The plugin requires a locally installed and signed-in official `agy` CLI. Granting `agent.extension` is required because the ACP transport is a long-lived local process rather than a one-shot HTTP request.

## Source layout

`runtime/` is the checked-in JavaScript build of the reusable ACP runtime from `dsh-llm-antigravity-acp/lib`, with only the DSH type/runtime imports replaced by `runtime/dsh-compat.js`. The original DSH plugin remains untouched and is still the source of the runtime behaviour.

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
