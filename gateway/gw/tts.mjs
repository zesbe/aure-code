import fs from "node:fs";
import path from "node:path";
import { CFG, L3, log } from "./config.mjs";
import { NEXT, readBody, sendJson } from "./http.mjs";

// ── 朗读用 ElevenLabs（可选）────────────────────────────────────────────
// 系统自带的朗读太机械：设置里填了 ElevenLabs 的 API Key，回复就改由网关去 ElevenLabs 合成，界面拿到 mp3 播放。
//   · Key 只存在网关这边（ccapp-tts.json，0600），界面只看得到「填了没有」和末 4 位，任何接口都不回 Key 原文；
//   · 只连 api.elevenlabs.io（写死，不收界面给的地址）；
//   · 失败（没网、额度用完、Key 错）时界面退回系统朗读。
// 路由：GET /api/tts/config · POST /api/tts/config {apiKey?, voiceId?, model?, enabled?, clearKey?}
//       GET /api/tts/voices · POST /api/tts {text} → audio/mpeg

const FILE = path.join(CFG.home, "ccapp-tts.json");
const API = "https://api.elevenlabs.io";
const MODELS = ["eleven_flash_v2_5", "eleven_multilingual_v2", "eleven_turbo_v2_5", "eleven_v3"];
const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";   // Rachel：多语种模型下各语言都能念
const TEXT_MAX = 5000;

function load() {
  try { const j = JSON.parse(fs.readFileSync(FILE, "utf8")); return j && typeof j === "object" ? j : {}; } catch { return {}; }
}
function save(c) {
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(c, null, 1) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, FILE);
  try { fs.chmodSync(FILE, 0o600); } catch {}
}
/** 给界面看的：不带 Key */
export function ttsPublic(c = load()) {
  return {
    provider: "elevenlabs",
    hasKey: !!c.apiKey,
    keyTail: c.apiKey ? String(c.apiKey).slice(-4) : "",
    enabled: !!c.apiKey && c.enabled !== false,
    voiceId: c.voiceId || DEFAULT_VOICE,
    voiceName: c.voiceName || "",
    model: MODELS.includes(c.model) ? c.model : MODELS[0],
    models: MODELS,
  };
}

async function el(pathq, init = {}, key) {
  const r = await fetch(API + pathq, {
    ...init,
    headers: { "xi-api-key": key, ...(init.headers || {}) },
    signal: init.signal || AbortSignal.timeout(30000),
  });
  return r;
}
/** ElevenLabs 的报错转成一句人话 */
async function elError(r) {
  let detail = "";
  try { const j = await r.json(); detail = j?.detail?.message || j?.detail?.status || (typeof j?.detail === "string" ? j.detail : "") || j?.message || ""; } catch {}
  if (r.status === 401) return L3("ElevenLabs 的 API Key 不对或已失效", "The ElevenLabs API key is wrong or revoked", "Kunci API ElevenLabs salah atau sudah dicabut");
  if (r.status === 402 || /quota|credit/i.test(detail)) return L3("ElevenLabs 额度用完了", "ElevenLabs credits are used up", "Kredit ElevenLabs sudah habis");
  if (r.status === 429) return L3("ElevenLabs 请求太频繁，稍后再试", "ElevenLabs rate limit; try again shortly", "Terlalu banyak permintaan ke ElevenLabs; coba lagi sebentar lagi");
  return `ElevenLabs HTTP ${r.status}${detail ? ": " + String(detail).slice(0, 200) : ""}`;
}

export async function routeTts(req, res, u, p) {
  if (!p.startsWith("/api/tts")) return NEXT;
  if (req.method === "GET" && p === "/api/tts/config") return sendJson(res, 200, ttsPublic());

  if (req.method === "POST" && p === "/api/tts/config") {
    let b; try { b = JSON.parse((await readBody(req)) || "{}"); } catch { return sendJson(res, 400, { error: "bad json" }); }
    const c = load();
    if (b.clearKey) { delete c.apiKey; }
    if (typeof b.apiKey === "string" && b.apiKey.trim()) {
      const k = b.apiKey.trim();
      if (!/^[A-Za-z0-9_-]{20,200}$/.test(k)) return sendJson(res, 400, { error: "bad key", message: L3("API Key 格式不对", "That doesn't look like an API key", "Format kunci API tidak valid") });
      // 存之前先验一下：拉一次声音列表
      try {
        const r = await el("/v1/voices", {}, k);
        if (!r.ok) return sendJson(res, 400, { error: "verify", message: await elError(r) });
      } catch (e) { return sendJson(res, 502, { error: "net", message: L3("连不上 ElevenLabs：", "Can't reach ElevenLabs: ", "Tidak bisa terhubung ke ElevenLabs: ") + e.message }); }
      c.apiKey = k;
      if (c.enabled === undefined) c.enabled = true;
      log("[tts] 已保存 ElevenLabs Key（…" + k.slice(-4) + "）");
    }
    if (typeof b.voiceId === "string" && /^[A-Za-z0-9]{8,64}$/.test(b.voiceId)) { c.voiceId = b.voiceId; c.voiceName = String(b.voiceName || "").slice(0, 80); }
    if (typeof b.model === "string" && MODELS.includes(b.model)) c.model = b.model;
    if (typeof b.enabled === "boolean") c.enabled = b.enabled;
    save(c);
    return sendJson(res, 200, ttsPublic(c));
  }

  if (req.method === "GET" && p === "/api/tts/voices") {
    const c = load();
    if (!c.apiKey) return sendJson(res, 400, { error: "no_key", message: L3("还没填 ElevenLabs 的 API Key", "No ElevenLabs API key yet", "Kunci API ElevenLabs belum diisi") });
    try {
      const r = await el("/v1/voices", {}, c.apiKey);
      if (!r.ok) return sendJson(res, 502, { error: "el", message: await elError(r) });
      const j = await r.json();
      const voices = (j.voices || []).slice(0, 300).map((v) => ({
        id: v.voice_id, name: String(v.name || "").slice(0, 80), category: v.category || "",
        desc: [v.labels?.gender, v.labels?.accent, v.labels?.age, v.labels?.descriptive || v.labels?.description, v.labels?.language].filter(Boolean).join(" · ").slice(0, 120),
        preview: /^https:\/\//.test(v.preview_url || "") ? v.preview_url : "",
      }));
      return sendJson(res, 200, { voices });
    } catch (e) { return sendJson(res, 502, { error: "net", message: e.message }); }
  }

  if (req.method === "POST" && p === "/api/tts") {
    let b; try { b = JSON.parse((await readBody(req)) || "{}"); } catch { return sendJson(res, 400, { error: "bad json" }); }
    const c = load(), pub = ttsPublic(c);
    if (!pub.enabled) return sendJson(res, 409, { error: "off" });
    const text = String(b.text || "").trim().slice(0, TEXT_MAX);
    if (!text) return sendJson(res, 400, { error: "empty" });
    const lang = typeof b.lang === "string" && /^[a-z]{2}$/.test(b.lang) ? b.lang : null;
    const ac = new AbortController();
    res.on("close", () => { if (!res.writableEnded) ac.abort(); });     // 界面不要了（停止、换了一条）：别继续耗额度
    let r;
    try {
      const body = { text, model_id: pub.model, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true } };
      // flash / turbo 2.5 认 language_code（把语言钉住，短句不会被认成别的语言）
      if (lang && /_v2_5$/.test(pub.model)) body.language_code = lang;
      r = await el(`/v1/text-to-speech/${encodeURIComponent(pub.voiceId)}/stream?output_format=mp3_44100_128`, {
        method: "POST", headers: { "content-type": "application/json", accept: "audio/mpeg" }, body: JSON.stringify(body), signal: ac.signal,
      }, c.apiKey);
    } catch (e) {
      if (ac.signal.aborted) return;
      return sendJson(res, 502, { error: "net", message: L3("连不上 ElevenLabs：", "Can't reach ElevenLabs: ", "Tidak bisa terhubung ke ElevenLabs: ") + e.message });
    }
    if (!r.ok) return sendJson(res, 502, { error: "el", message: await elError(r) });
    res.writeHead(200, { "content-type": "audio/mpeg", "cache-control": "no-store" });
    try {
      for await (const chunk of r.body) { if (!res.write(chunk)) await new Promise((ok) => res.once("drain", ok)); }
      res.end();
    } catch { try { res.destroy(); } catch {} }
    return;
  }
  return NEXT;
}
