import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const QQ_TOKEN_URL = "https://bots.qq.com/app/getAppAccessToken";
const QQ_API_BASE = "https://api.sgroup.qq.com";

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  try {
    const text = readFileSync(filePath, "utf-8");
    const vars = {};
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

export function loadQQConfig() {
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

async function getQQAccessToken(config) {
  const resp = await fetch(QQ_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appId: String(config.appId), clientSecret: config.clientSecret }),
  });
  if (!resp.ok) throw new Error(`QQ token HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.code) throw new Error(`QQ API error: code=${data.code} msg=${data.message || ""}`);
  if (!data.access_token) throw new Error("QQ token: no access_token in response");
  return data.access_token;
}

async function sendQQMessage(config, header, body) {
  const token = await getQQAccessToken(config);
  const headers = {
    Authorization: `QQBot ${token}`,
    "Content-Type": "application/json",
  };

  const trySend = async (url, payload) => {
    const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
    return resp.ok || /^2\d\d$/.test(resp.status.toString());
  };

  const userUrl = `${QQ_API_BASE}/v2/users/${config.target}/messages`;
  const groupUrl = `${QQ_API_BASE}/v2/groups/${config.target}/messages`;
  const primaryUrl = config.type === "group" ? groupUrl : userUrl;
  const fallbackUrl = config.type === "group" ? userUrl : groupUrl;

  const message = body ? `${header}\n\n${body}` : header;

  const mdOk = await trySend(primaryUrl, { msg_type: 2, markdown: { content: message } });
  if (mdOk) return;

  const textOk = await trySend(primaryUrl, { content: message, msg_type: 0 });
  if (textOk) return;

  const fbOk = await trySend(fallbackUrl, { content: message, msg_type: 0 });
  if (fbOk) return;

  let remaining = message;
  const chunks = [];
  while (remaining.length > 0) {
    const end = remaining.lastIndexOf("\n", 3990) > 0 ? remaining.lastIndexOf("\n", 3990) : 3990;
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end).trimStart();
  }
  for (let i = 0; i < chunks.length; i++) {
    const prefix = chunks.length > 1 ? `(${i + 1}/${chunks.length}) ` : "";
    const ok = await trySend(primaryUrl, { content: prefix + chunks[i], msg_type: 0 });
    if (!ok) throw new Error(`QQ send failed at chunk ${i + 1}/${chunks.length}`);
  }
}

function extractTextSnippet(stdout) {
  const texts = [];
  for (const line of stdout.split('\n')) {
    try {
      const evt = JSON.parse(line);
      if (evt.type === "text" && evt.part?.type === "text" && evt.part.text) {
        texts.push(evt.part.text);
      }
    } catch (e) {}
  }
  return texts.join('\n').substring(0, 500);
}

function now() {
  return new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" });
}

function baseHeader(icon, title) {
  return `${icon} ${title}\n${"\u2500".repeat(20)}\n📁 ${process.cwd()}\n🕐 ${now()}`;
}

export async function notifyQQ({ ok, sessionId, stdout, stderr }) {
  const config = loadQQConfig();
  if (!config) return;
  try {
    if (ok) {
      const snippet = extractTextSnippet(stdout || "");
      const body = snippet
        ? `🔗 ${sessionId}\n\n💬 ${snippet}`
        : `🔗 ${sessionId}`;
      await sendQQMessage(config, baseHeader("✅", "OpenCode Task Complete"), body);
    } else {
      const errMsg = (stderr || stdout || "").substring(0, 500);
      await sendQQMessage(config, baseHeader("❌", "OpenCode Error"), `🔗 ${sessionId}\n\n⚠️ ${errMsg}`);
    }
  } catch (e) {
    // silent
  }
}
