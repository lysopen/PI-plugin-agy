# Antigravity ACP for PI-Desktop

This package is for PI-Desktop only. It connects the official local `agy acp` process to PI-Desktop's native Provider list and trusted Agent Extension API.

## What it provides

- A native PI-Desktop Provider row named **Antigravity ACP**, with five selectable models.
- A loopback OpenAI-compatible bridge at `http://127.0.0.1:17956/v1`.
- The official local `agy acp` process over ACP v1.
- ACP session handling, model selection, account pools, quota and failover, history replay, and MCP tool handoff.
- Tool calls returned to PI-Desktop as normal `toolCall` blocks, so the host executes them and the next provider request resumes the parked ACP turn.

## Install and select a model

Download [`lysopen.agy-0.1.2.piplug`](https://github.com/lysopen/PI-plugin-agy/releases/download/pi-desktop-v0.1.2/lysopen.agy-0.1.2.piplug). On PI-Desktop 0.22.0 or later, open **Plugins → ⋯ → Install Plugin Package** and select the file without unzipping it. Version 0.1.2 fixes the empty replies reported by 0.1.1. See the [Chinese quick start](../README.md#pi-desktop) for troubleshooting.

If you already added the custom endpoint, keep it and select the same model after the update. For a new installation on PI-Desktop 0.22.0, turn **Antigravity ACP** off and back on once in the Plugins page after import. This registers the plugin's five models in the chat model picker. Select `gemini-3.8-flash` and send a short message to try it.

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

`runtime/` contains the reusable ACP runtime built from `dsh-llm-antigravity-acp/lib`, with the original host imports replaced by `runtime/dsh-compat.js`. `agent-extension.mjs` adapts that runtime to the Agent Extension contract; `main.cjs` adapts it to PI-Desktop's native OpenAI-compatible Provider contract.

## Local checks

```powershell
node --check .\\agent-extension.mjs
node --check .\\main.cjs
node --input-type=module -e "import('./agent-extension.mjs').then(m => console.log(m.MODEL_CATALOG.length))"
npm test
```

To package from source, check out this repository and [PI-Desktop](https://github.com/vastsa/pi-desktop) as sibling directories named `PI-plugin-agy` and `pi-desktop`. Run these commands from the PI-Desktop checkout:

```powershell
pnpm install
pnpm --filter "@pi-desktop/plugin-devkit..." build
pnpm pi-plugin check ../PI-plugin-agy/pi-desktop
pnpm pi-plugin pack ../PI-plugin-agy/pi-desktop
```

The package is written to `PI-plugin-agy/pi-desktop/dist/`.

## Credits

Thanks to **lili-luo**, author of the original DSH plugin: [dsh-plugin-bundle](https://github.com/lili-luo/dsh-plugin-bundle).
