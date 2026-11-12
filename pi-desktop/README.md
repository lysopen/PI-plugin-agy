# Antigravity ACP for PI-Desktop

This package is for PI-Desktop only. It connects the official local `agy acp` process to PI-Desktop's native Provider list and trusted Agent Extension API.

## What it provides

- A loopback OpenAI-compatible bridge at `http://127.0.0.1:17956/v1` that provides five models to PI-Desktop.
- The official local `agy acp` process over ACP v1.
- ACP session handling, model selection, account pools, quota and failover, history replay, and MCP tool handoff.
- A compact **额度** control on the left side of the chat composer. Click it to see each configured account's plan, remaining windows, and reset time; **刷新** reads the latest values.
- Tool calls returned to PI-Desktop as normal `toolCall` blocks, so the host executes them and the next provider request resumes the parked ACP turn.

## Install, add a model service, and chat

Use PI-Desktop 0.22.0 or later and sign in to the official `agy` CLI on the same computer. See also the [Chinese quick start](../README.md#pi-desktop).

1. **Install and enable the plugin.** Download [`lysopen.agy-0.2.0.piplug`](https://github.com/lysopen/PI-plugin-agy/releases/download/pi-desktop-v0.2.0/lysopen.agy-0.2.0.piplug). Open **Plugins → ⋯ → Install Plugin Package** and select the file without unzipping it. Review the permissions and make sure **Antigravity ACP** is enabled.
2. **Add a model service.** Open **Settings → Models → AI Services → Add Service → Custom Endpoint**. Name it **Antigravity ACP**, set the endpoint to `http://127.0.0.1:17956/v1`, choose **OpenAI Chat Completions**, and leave the API key blank. When the model list loads, select the models you want and save.
3. **Send a message.** Return to chat, pick a saved model such as `gemini-3.8-flash`, and send a message.
4. **Check account quota.** In the chat composer, click **额度** on the left. The panel shows every configured account and its remaining windows. Use **刷新** when you want to bypass the local quota cache.

When upgrading from 0.1.1 or 0.1.2, import 0.2.0 through **Install Plugin Package**. Keep your existing model service and selections.

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
| `PI_AGY_QUOTA_TTL_MS` | Quota cache lifetime in milliseconds; default `120000` (2 minutes). |

The bridge listens on the fixed loopback port `17956`. Use that port in the custom endpoint.

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
