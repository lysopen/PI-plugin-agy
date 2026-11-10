# dsh-plugin-bundle

基于 DeepSeek Harness（DSH）的插件组合包。每个目录可以用 `path:` 单独安装。

| 目录 | 内容 |
|---|---|
| [`dsh-llm-antigravity-acp`](./dsh-llm-antigravity-acp) | 用本机官方 `agy acp` 把 Antigravity 接成 DSH 一级模型。登录态留在官方进程里，插件不保存钥匙，也不把请求转到别的网关。 |
| [`agy-context-unlock`](./agy-context-unlock) | 可选的本地解锁脚本。把官方客户端默认的 256K 上下文放到约 1M。它会改写本机 `agy` 二进制，不随插件一起安装。 |
| [`pi-desktop`](./pi-desktop) | PI-Desktop 受信任 Agent Extension 版本：复用 ACP、多账号、额度/故障转移、会话恢复和 MCP 工具挂起逻辑。 |

安装插件：

```sh
dsh plugin --profile web add "git+https://github.com/lili-luo/dsh-plugin-bundle.git#main&path:/dsh-llm-antigravity-acp"
```

## PI-Desktop

`pi-desktop/` 是面向 [PI-Desktop](https://github.com/vastsa/pi-desktop) 的独立插件包，不会改动上面的 DSH 插件。桌面端通过本机 OpenAI Chat Completions Bridge 调用官方 `agy acp`，提供 Gemini、Claude 和 GPT-OSS 模型。

在 PI-Desktop 的插件页导入 `lysopen.agy-0.1.2.piplug`。已经配置过自定义端点的用户直接更新插件即可。PI-Desktop 0.22.0 首次安装后，请在插件页将 **Antigravity ACP** 关闭再开启一次，模型就会出现在聊天的模型列表。

也可以手动接入：在 **设置 → 模型 → AI 服务 → 添加服务 → 自定义端点** 填入 `http://127.0.0.1:17956/v1`，选 **OpenAI Chat Completions**，API Key 留空，勾选模型并保存。

在 PI-Desktop 的插件开发工具中检查或打包：

```powershell
pnpm pi-plugin check .\pi-desktop
pnpm pi-plugin pack .\pi-desktop
```

运行前需要本机已安装并登录官方 `agy` CLI；环境变量、账号池、上下文窗口和可见模型配置见 [`pi-desktop/README.md`](./pi-desktop/README.md)。

协议说明：[Agent Client Protocol](https://agentclientprotocol.com/get-started/introduction)。`agy acp` 的产品说明：[Antigravity CLI ACP](https://antigravity.google/docs/cli/acp/)。

## 社区

本项目在 [LINUX DO](https://linux.do) 社区进行开源推广，感谢社区佬友的交流、反馈与建议。
