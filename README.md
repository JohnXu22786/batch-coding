# OpenCode Batch

Batch code editing dispatcher for OpenCode.

## 唯一入口

| 文件 | 用途 |
|------|------|
| `run_oc.ps1` | 以当前登录用户身份启动 opencode（从 SYSTEM 切换身份） |

调用格式：
```
terminal(
  command="powershell -ExecutionPolicy Bypass -File ""D:\path\to\run_oc.ps1"" -instruction ""<完整指令>""",
  background=true,
  timeout=86400
)
```

- `background=true` — 不阻塞，后台执行
- `timeout=86400` — 24 小时超时
- 通知由 opencode QQ notifier 插件完成，无需 Hermes 额外通知

## 前置条件

- `npm install -g opencode-ai`（opencode 全局可用）
- Windows 环境，Hermes Gateway 以 SYSTEM 运行
- 用户已登录到桌面（session 1）

## 配置

QQ Bot 通知、API key 等敏感信息在 `.env`（已 gitignore），不提交到仓库。

## 目录结构

```
.opencode/
├── agent/           — OpenCode 规则文件（batch、coding、reviewer）
├── plugins/         — 插件（qq-notifier 等）
├── mcp/             — MCP 服务器配置
└── skills/          — OpenCode 技能
run_oc.ps1           — 唯一入口脚本
opencode.json        — 项目级 opencode 配置
project-opencode.json— 项目级 opencode 配置
```
