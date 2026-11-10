# Antigravity ACP for PI-Desktop

本版仅适用于 PI-Desktop，通过本机官方 `agy acp` 接入 Antigravity 模型。登录态由官方 CLI 管理。

## PI-Desktop

**[下载 PI-Desktop 安装包（0.1.2）](https://github.com/lysopen/PI-plugin-agy/releases/download/pi-desktop-v0.1.2/lysopen.agy-0.1.2.piplug)** · 需要 [PI-Desktop](https://github.com/vastsa/pi-desktop) 0.22.0 或更高版本，并已在同一台电脑上安装、登录官方 [Antigravity CLI（`agy`）](https://antigravity.google/docs/cli/acp/)。

1. 在 PI-Desktop 左侧打开 **插件**，点右上角 **⋯ → 安装插件包**，选择下载的 `.piplug` 文件，审核权限后安装。无需解压。
2. 在 PI-Desktop **0.22.0** 上首次安装后，把 **Antigravity ACP** 关闭再开启一次，让宿主登记插件声明的 5 个模型。
3. 回到聊天输入框的模型下拉框，搜索并选中 `gemini-3.8-flash`，发一条短消息试用。插件还提供 Gemini 4 Argon、Claude Opus 5.5、Claude Sonnet 5.5 和 GPT-OSS 120B。

### 已装 0.1.1，或遇到空回复

用同一个「安装插件包」入口导入 0.1.2。该版本修复了 0.1.1 丢失模型正文、触发 `EMPTY_MODEL_RESPONSE` 的问题。**已经添加过自定义端点的用户，保留原服务和模型即可**，不用重新添加或填写 API Key。

### 仍然找不到模型？手动添加本机端点

保持插件开启，进入 **设置 → 模型 → AI 服务 → 添加服务 → 自定义端点**。名称填 `Antigravity ACP`，基础地址填 `http://127.0.0.1:17956/v1`，接口格式选 **OpenAI Chat Completions**，**API Key 留空**。等模型列表加载后勾选所需模型并保存，再回聊天切换。

高级设置和源码打包见 [PI-Desktop 插件说明](./pi-desktop/README.md)。协议说明见 [Agent Client Protocol](https://agentclientprotocol.com/get-started/introduction)。

## 致谢

感谢原 DSH 插件作者 **lili-luo**。本版移植自其开源项目 [dsh-plugin-bundle](https://github.com/lili-luo/dsh-plugin-bundle)。

本项目在 [LINUX DO](https://linux.do) 社区进行开源推广，感谢社区佬友的交流、反馈与建议。
