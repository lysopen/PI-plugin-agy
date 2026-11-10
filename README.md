# Antigravity ACP for PI-Desktop

本版仅适用于 PI-Desktop，通过本机官方 `agy acp` 接入 Antigravity 模型。登录态由官方 CLI 管理。

## PI-Desktop

**[下载 PI-Desktop 安装包（0.1.2）](https://github.com/lysopen/PI-plugin-agy/releases/download/pi-desktop-v0.1.2/lysopen.agy-0.1.2.piplug)** · 需要 [PI-Desktop](https://github.com/vastsa/pi-desktop) 0.22.0 或更高版本，并已在同一台电脑上安装、登录官方 [Antigravity CLI（`agy`）](https://antigravity.google/docs/cli/acp/)。

1. **安装并启用插件。** 打开 **插件 → ⋯ → 安装插件包**，选择下载的 `.piplug` 文件（无需解压）。确认权限后安装，并确保 **Antigravity ACP** 已启用。
2. **添加模型服务。** 打开 **设置 → 模型 → AI 服务 → 添加服务 → 自定义端点**，按下方填写。模型列表加载后，勾选要用的模型并保存。
   - 名称：`Antigravity ACP`
   - 接口地址：`http://127.0.0.1:17956/v1`
   - 接口格式：**OpenAI Chat Completions**
   - API 密钥：留空
3. **在聊天中调用。** 回到聊天，在输入框的模型下拉框里选择刚保存的模型（例如 `gemini-3.8-flash`），发送一条消息。

**从 0.1.1 升级：** 用同一个「安装插件包」入口导入 0.1.2。已添加的模型服务和模型可以直接沿用。

高级设置和源码打包见 [PI-Desktop 插件说明](./pi-desktop/README.md)。协议说明见 [Agent Client Protocol](https://agentclientprotocol.com/get-started/introduction)。

## 致谢

感谢原 DSH 插件作者 **lili-luo**。本版移植自其开源项目 [dsh-plugin-bundle](https://github.com/lili-luo/dsh-plugin-bundle)。

本项目在 [LINUX DO](https://linux.do) 社区进行开源推广，感谢社区佬友的交流、反馈与建议。
