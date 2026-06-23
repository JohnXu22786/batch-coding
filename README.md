# OpenCode Batch

Batch code editing dispatcher for OpenCode.

## Entrypoint

| File | Purpose |
|------|---------|
| `run_oc.ps1` | Launches opencode as the logged-in user (elevates from SYSTEM session) |

## Prerequisites

- `npm install -g opencode-ai` (opencode available on PATH)
- Windows environment, Hermes Gateway running as SYSTEM
- User must be logged into their desktop

## Parameters

| Param | Required | Description |
|-------|----------|-------------|
| `-instruction` | **Yes** | The full instruction to pass to opencode |
| `-sessionId` | No | OpenCode session ID to resume. Omit to start a new session. |
| `-projectDir` | No | Project directory for opencode to work in. Defaults to the script's own directory (`$PSCommandPath`). |
| `-agent` | No | OpenCode agent type to use. Available: `coding` (default project agent), `batch`, `reviewer`, `release`. Omit to use the project's default agent. |

### About `-sessionId`

- **With** `-sessionId "ses_xxx"`: resumes an existing OpenCode conversation.
- **Without** `-sessionId`: starts a brand new session.
- **If unclear which the user wants: ask, don't guess.**

### About `-projectDir`

- **With** `-projectDir "D:\path\to\project"`: opencode works on that project directory.
- **Without** `-projectDir`: opencode uses the directory where `run_oc.ps1` lives.
- This lets you keep `run_oc.ps1` in a central location (e.g. a tools repo) and point it at any project.

### About `-agent`

- **With** `-agent "<name>"`: uses the specified agent (e.g. `coding`, `batch`, `reviewer`). Agents are defined in the project's `opencode.json`.
- **Without** `-agent`: uses the project's `default_agent` setting.
- Run `opencode agent list` in the project directory to see available agents.

## Usage

**Start a new session (default = script-relative dir):**
```
terminal(
  command="powershell -ExecutionPolicy Bypass -File ""<path>\run_oc.ps1"" -instruction ""<instruction>""",
  background=true,
  timeout=86400
)
```

**Resume an existing session with a custom project dir:**
```
terminal(
  command="powershell -ExecutionPolicy Bypass -File ""<path>\run_oc.ps1"" -instruction ""<instruction>"" -sessionId ""ses_xxx"" -projectDir ""D:\other\project""",
  background=true,
  timeout=86400
)
```

**Use a specific agent (e.g. batch dispatcher):**
```
terminal(
  command="powershell -ExecutionPolicy Bypass -File ""<path>\run_oc.ps1"" -instruction ""<instruction>"" -agent batch",
  background=true,
  timeout=86400
)
```

**Combine agent + project dir + session resume:**
```
terminal(
  command="powershell -ExecutionPolicy Bypass -File ""<path>\run_oc.ps1"" -instruction ""<instruction>"" -agent coding -sessionId ""ses_xxx"" -projectDir ""D:\other\project""",
  background=true,
  timeout=86400
)
```

### Common options

- `background=true` — non-blocking, runs in background
- `timeout=86400` — 24-hour timeout for long batch jobs
- Notifications: `qq-notifier` plugin for TUI sessions, `batch-prompt` MCP with `notify.js` for `opencode run` sessions

### Hermes Agent workflow

When calling from Hermes Agent:

1. **Batch tasks** (using this repo's `run_oc.ps1`): use the path to this repo directly.
2. **Non-batch tasks**: ask the user for the `run_oc.ps1` path — never assume a location.
3. **If unsure whether it's batch or not: ask first.**

## Configuration

QQ Bot credentials, API keys etc. go in `.env` (gitignored). Not committed to the repo.

## Directory structure

```
.opencode/
├── agent/           — OpenCode rules (batch, coding, reviewer)
├── plugins/         — Plugins (qq-notifier for TUI)
├── mcp/             — MCP servers (batch-prompt, qq-notify, test-checklist)
└── skills/          — OpenCode skills
run_oc.ps1           — Entrypoint script
opencode.json        — Project-level opencode config
project-opencode.json— Project-level opencode config
```
