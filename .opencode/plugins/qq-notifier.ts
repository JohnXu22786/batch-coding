/**
 * QQ Bot 任务完成通知插件
 *
 * 每次 OpenCode 完成任务后（session.idle），
 * 通过 QQ Bot 官方 API 主动发送通知消息。
 * 所有反馈走系统通知，不在 OpenCode TUI 内打印。
 *
 * 环境变量（项目 .env 或 ~/.hermes/.env）：
 *   QQ_APP_ID          你的 AppID
 *   QQ_CLIENT_SECRET   你的 Secret
 *   QQ_NOTIFY_TARGET   目标用户 openid 或群 openid（最长值）
 *   QQ_NOTIFY_TYPE     c2c=私聊, group=群聊（默认 c2c）
 */

import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { execSync } from "child_process";

type EventPayload = Record<string, unknown>;

const QQ_TOKEN_URL = "https://bots.qq.com/app/getAppAccessToken";
const QQ_API_BASE = "https://api.sgroup.qq.com";

interface QQConfig {
  appId: string;
  clientSecret: string;
  target: string;
  type: "c2c" | "group";
}

function systemNotify(title: string, body: string): void {
  // Windows SYSTEM 账户下无桌面会话，跳过系统通知
  if (process.platform === "win32") {
    try {
      // 检查是否能加载 WinForms — SYSTEM 下会抛异常
      require("System.Windows.Forms");
    } catch {
      return; // 无 UI 权限，跳过
    }
  }
  try {
    const t = title.replace(/\"/g, '\\"').replace(/'/g, "''");
    const b = body.replace(/\"/g, '\\"').replace(/'/g, "''");
    const plat = process.platform;

    if (plat === "darwin") {
      execSync(
        `osascript -e 'display notification "${b}" with title "${t}"'`,
        { timeout: 3000, windowsHide: true },
      );
    } else if (plat === "linux") {
      execSync(`notify-send "${t}" "${b}"`, {
        timeout: 3000,
        windowsHide: true,
      });
    } else if (plat === "win32") {
      execSync(
        `powershell -NoProfile -Command "` +
          `$n = New-Object System.Windows.Forms.NotifyIcon;` +
          `$n.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon((Get-Command powershell).Source);` +
          `$n.BalloonTipTitle = '${t}';` +
          `$n.BalloonTipText = '${b}';` +
          `$n.Visible = $true;` +
          `$n.ShowBalloonTip(5000);` +
          `Start-Sleep -Milliseconds 500;` +
          `$n.Dispose();` +
          `"`,
        { timeout: 5000, windowsHide: true },
      );
    }
  } catch {
    // 静默——系统通知只是辅助
  }
}

/** 从会话中提取助手的最后一条回复文本 */
async function getLastAssistantReply(
  client: PluginInput["client"],
  sessionID: string,
): Promise<string> {
  try {
    const result = await client.session.messages({
      path: { id: sessionID },
      query: { limit: 5 },
    }) as { data?: Array<Record<string, unknown>>; error?: unknown };
    if (!result.data || !Array.isArray(result.data)) return "";

    // 逆序遍历，找最后一条 assistant 消息
    for (let i = result.data.length - 1; i >= 0; i--) {
      const m = result.data[i];
      const info = m?.info as { role?: string } | undefined;
      if (info?.role === "assistant") {
        const parts = (m?.parts ?? []) as Array<{ type?: string; text?: string }>;
        const textParts = parts.filter(
          (p) => p.type === "text" && p.text,
        );
        if (textParts.length > 0) {
          return textParts.map((p) => p.text!).join("\n");
        }
      }
    }
  } catch {
    // 静默
  }
  return "";
}

/** 从指定路径读取 .env 文件 */
function loadEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  try {
    const text = readFileSync(filePath, "utf-8");
    const vars: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (key && val) vars[key] = val;
    }
    return vars;
  } catch {
    return {};
  }
}

function loadConfig(): QQConfig | null {
  const projectEnv = loadEnvFile(join(process.cwd(), ".env"));
  const hermesEnv = loadEnvFile(join(homedir(), ".hermes", ".env"));
  const merged = { ...hermesEnv, ...projectEnv };

  const appId = process.env.QQ_APP_ID || merged["QQ_APP_ID"] || "";
  const clientSecret = process.env.QQ_CLIENT_SECRET || merged["QQ_CLIENT_SECRET"] || "";
  const target = process.env.QQ_NOTIFY_TARGET || merged["QQ_NOTIFY_TARGET"] || "";
  const notifyType = process.env.QQ_NOTIFY_TYPE || merged["QQ_NOTIFY_TYPE"] || "c2c";
  const msgType = notifyType === "group" ? "group" : "c2c";

  if (!appId || !clientSecret || !target) return null;
  return { appId, clientSecret, target, type: msgType };
}

async function getAccessToken(config: QQConfig): Promise<string> {
  const resp = await fetch(QQ_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appId: String(config.appId),
      clientSecret: config.clientSecret,
    }),
  });
  if (!resp.ok) {
    throw new Error(`QQ token HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as Record<string, unknown>;
  if (data.code) {
    throw new Error(`QQ API 错误: code=${data.code} msg=${data.message || ""}`);
  }
  if (!data.access_token) {
    throw new Error("QQ token: 响应无 access_token");
  }
  return data.access_token as string;
}

async function sendQQMessage(
  config: QQConfig,
  header: string,
  body?: string,
): Promise<void> {
  const token = await getAccessToken(config);
  const headers = {
    Authorization: `QQBot ${token}`,
    "Content-Type": "application/json",
  };

  const trySend = async (
    url: string,
    payload: Record<string, unknown>,
  ): Promise<boolean> => {
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    return resp.ok || /^2\d\d$/.test(resp.status.toString());
  };

  const userUrl = `${QQ_API_BASE}/v2/users/${config.target}/messages`;
  const groupUrl = `${QQ_API_BASE}/v2/groups/${config.target}/messages`;
  const primaryUrl = config.type === "group" ? groupUrl : userUrl;
  const fallbackUrl = config.type === "group" ? userUrl : groupUrl;

  const message = body ? `${header}\n\n${body}` : header;

  const mdOk = await trySend(primaryUrl, {
    msg_type: 2,
    markdown: { content: message },
  });
  if (mdOk) return;

  const textOk = await trySend(primaryUrl, {
    content: message.slice(0, 4000),
    msg_type: 0,
  });
  if (textOk) return;

  const fbOk = await trySend(fallbackUrl, {
    content: message.slice(0, 4000),
    msg_type: 0,
  });
  if (!fbOk) throw new Error("QQ 发送失败");
}

const plugin: Plugin = async (_ctx) => {
  const config = loadConfig();

  if (!config) {
    systemNotify("OpenCode QQ 通知", "未配置 QQ_APP_ID / QQ_CLIENT_SECRET / QQ_NOTIFY_TARGET");
    return {};
  }

  const { client } = _ctx;
  const subagentSessions = new Set<string>();
  const forwardedContent = new Map<string, string>();
  const projectPath = process.cwd();

  const now = () =>
    new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

  const baseHeader = (icon: string, title: string) =>
    `${icon} ${title}\n━━━━━━━━━━━━━━━━━━\n📁 ${projectPath}\n🕐 ${now()}`;

  return {
    event: async ({ event }) => {
      const evt = event as any;
      const sessionId = evt.properties?.sessionID || "";

      if (event.type === "session.created" || event.type === "session.updated") {
        const parentId = evt.properties?.info?.parentID;
        if (parentId && sessionId) {
          subagentSessions.add(sessionId);
        }
        return;
      }

      if (event.type === "session.deleted") {
        if (sessionId) {
          subagentSessions.delete(sessionId);
          forwardedContent.delete(sessionId);
        }
        return;
      }

      // Forward new assistant replies on idle
      if (event.type === "session.idle") {
        if (!sessionId || subagentSessions.has(sessionId)) return;

        try {
          const snippet = await getLastAssistantReply(client, sessionId);
          if (!snippet) return;

          const last = forwardedContent.get(sessionId);
          if (snippet === last) return;
          forwardedContent.set(sessionId, snippet);

          await sendQQMessage(
            config!,
            baseHeader("✅", "OpenCode Task Complete"),
            `🔗 ${sessionId}\n\n💬 ${snippet}`,
          );
        } catch (err) {
          systemNotify("OpenCode QQ 通知 - 失败", String(err).slice(0, 120));
        }
        return;
      }

      // Forward errors
      if (event.type === "session.error") {
        if (!sessionId || subagentSessions.has(sessionId)) return;

        try {
          const errInfo = evt.properties?.error as EventPayload | undefined;
          const errName =
            typeof errInfo?.name === "string" ? errInfo.name : "UnknownError";
          const errMsg =
            typeof errInfo?.message === "string" ? errInfo.message : "";

          // Skip user cancellation silently
          if (errName === "MessageAbortedError") return;

          const body = errMsg
            ? `🔗 ${sessionId}\n\n⚠️ ${errName}\n${errMsg}`
            : `🔗 ${sessionId}\n\n⚠️ ${errName}`;

          await sendQQMessage(config!, baseHeader("❌", "OpenCode Error"), body);
        } catch (err) {
          systemNotify("OpenCode QQ 通知 - 失败", String(err).slice(0, 120));
        }
        return;
      }
    },

    "tool.execute.before": async (input) => {
      if (!subagentSessions.has((input as any).sessionID)) {
        if ((input as any).tool === "question") {
          const q = (input as any).input?.question;
          const body = q
            ? `💬 ${q}`
            : "The assistant has a question for you.";
          await sendQQMessage(config!, baseHeader("❓", "OpenCode Question"), body).catch(
            (err) => systemNotify("OpenCode QQ 通知 - 失败", String(err).slice(0, 120)),
          );
        }
        if ((input as any).tool === "plan_exit") {
          await sendQQMessage(
            config!,
            baseHeader("📋", "OpenCode Plan Ready"),
            "The assistant has finished planning and is ready for review.",
          ).catch((err) =>
            systemNotify("OpenCode QQ 通知 - 失败", String(err).slice(0, 120)),
          );
        }
      }
    },
  };
};

export default plugin;
