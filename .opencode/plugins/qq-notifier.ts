/**
 * QQ Bot notification plugin for OpenCode
 *
 * Sends QQ Bot messages for:
 * - session.idle (task completion)
 * - session.error (errors)
 * - question tool call (explicit question)
 * - plan_exit tool call (plan ready for review)
 *
 * Env vars (project .env or ~/.hermes/.env):
 *   QQ_APP_ID          Your AppID
 *   QQ_CLIENT_SECRET   Your Secret
 *   QQ_NOTIFY_TARGET   Target user openid or group openid
 *   QQ_NOTIFY_TYPE     c2c=private, group=group chat (default c2c)
 */
import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const QQ_TOKEN_URL = "https://bots.qq.com/app/getAppAccessToken";
const QQ_API_BASE = "https://api.sgroup.qq.com";

interface QQConfig {
  appId: string;
  clientSecret: string;
  target: string;
  type: "c2c" | "group";
}

/** Extract the last assistant text reply from a session */
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
    // silent
  }
  return "";
}

/** Load env vars from a .env file */
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

  if (!appId || !clientSecret || !target) return null;
  return { appId, clientSecret, target, type: notifyType === "group" ? "group" : "c2c" };
}

async function getAccessToken(config: QQConfig): Promise<string> {
  const resp = await fetch(QQ_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appId: String(config.appId), clientSecret: config.clientSecret }),
  });
  if (!resp.ok) throw new Error(`QQ token HTTP ${resp.status}`);
  const data = (await resp.json()) as Record<string, unknown>;
  if (data.code) throw new Error(`QQ API error: code=${data.code} msg=${data.message || ""}`);
  if (!data.access_token) throw new Error("QQ token: no access_token in response");
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
    const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
    return resp.ok || /^2\d\d$/.test(resp.status.toString());
  };

  const userUrl = `${QQ_API_BASE}/v2/users/${config.target}/messages`;
  const groupUrl = `${QQ_API_BASE}/v2/groups/${config.target}/messages`;
  const primaryUrl = config.type === "group" ? groupUrl : userUrl;
  const fallbackUrl = config.type === "group" ? userUrl : groupUrl;

  const message = body ? `${header}\n\n${body}` : header;

  // Try markdown first
  const mdOk = await trySend(primaryUrl, {
    msg_type: 2,
    markdown: { content: message },
  });
  if (mdOk) return;

  // Fallback to text
  const textOk = await trySend(primaryUrl, {
    content: message.slice(0, 4000),
    msg_type: 0,
  });
  if (textOk) return;

  // Fallback to other endpoint type
  const fbOk = await trySend(fallbackUrl, {
    content: message.slice(0, 4000),
    msg_type: 0,
  });
  if (!fbOk) throw new Error("QQ send failed");
}

const plugin: Plugin = async (_ctx) => {
  const config = loadConfig();
  if (!config) return {};

  const { client } = _ctx;
  const subagentSessions = new Set<string>();
  const forwardedContent = new Map<string, string>();
  const projectPath = process.cwd();

  const now = () =>
    new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" });

  const baseHeader = (icon: string, title: string) =>
    `${icon} ${title}\n${"─".repeat(20)}\n📁 ${projectPath}\n🕐 ${now()}`;

  return {
    event: async ({ event }) => {
      const evt = event as any;
      const sessionId = evt.properties?.sessionID || "";

      // Track subagent sessions
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

      // === Forward errors ===
      if (event.type === "session.error") {
        if (!sessionId || subagentSessions.has(sessionId)) return;
        try {
          const errInfo = evt.properties?.error as Record<string, unknown> | undefined;
          const errName = typeof errInfo?.name === "string" ? errInfo.name : "UnknownError";
          const errMsg = typeof errInfo?.message === "string" ? errInfo.message : "";
          if (errName === "MessageAbortedError") return;
          const body = errMsg
            ? `🔗 ${sessionId}\n\n⚠️ ${errName}\n${errMsg}`
            : `🔗 ${sessionId}\n\n⚠️ ${errName}`;
          await sendQQMessage(config!, baseHeader("❌", "OpenCode Error"), body);
        } catch {
          // silent
        }
        return;
      }

      // === Forward idle (task completion) ===
      if (event.type === "session.idle") {
        if (!sessionId || subagentSessions.has(sessionId)) return;

        try {
          const snippet = await getLastAssistantReply(client, sessionId);
          if (!snippet) return;

          // Deduplicate
          const last = forwardedContent.get(sessionId);
          if (snippet === last) return;
          forwardedContent.set(sessionId, snippet);

          await sendQQMessage(
            config!,
            baseHeader("✅", "OpenCode Task Complete"),
            `🔗 ${sessionId}\n\n💬 ${snippet.slice(0, 3500)}`,
          );
        } catch {
          // silent
        }
        return;
      }
    },

    "tool.execute.before": async (input) => {
      if (!subagentSessions.has((input as any).sessionID)) {
        if ((input as any).tool === "question") {
          await sendQQMessage(config!, baseHeader("❓", "OpenCode Question"), "The assistant has a question for you.").catch(() => {});
        }
        if ((input as any).tool === "plan_exit") {
          await sendQQMessage(
            config!,
            baseHeader("📋", "OpenCode Plan Ready"),
            "The assistant has finished planning and is ready for review.",
          ).catch(() => {});
        }
      }
    },
  };
};

export default plugin;
