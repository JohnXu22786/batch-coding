# OpenCode Batch

项目说明和工具文件。

## 文件

| 文件 | 用途 |
|------|------|
| `run_oc.bat` | opencode 执行器，调用 `opencode run --format json` |
| `launch_oc.vbs` | VBS 脚本，用 `WScript.Shell.Run` 隐藏窗口启动 `run_oc.bat` |
| `PsExec64.exe` | 辅助工具，用于在用户会话中启动进程 |
| `.opencode/plugins/qq-notifier.ts` | QQ Bot 通知插件，任务完成时发通知（英文消息） |
| `.opencode/agent/` | OpenCode 规则文件 |
| `.env` | 项目环境变量 |

## 改动记录

### 2026-06-20
- `qq-notifier.ts`: 通知消息改英文 `"✅ OpenCode Task Complete"`
- `run_oc.bat`: 使用 opencode.exe 完整路径，输出到本目录
- `launch_oc.vbs`: 引用 Batch 目录下的 `run_oc.bat`
