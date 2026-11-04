import "../gw/config.mjs"; // scripts/test.mjs 先隔离 HOME
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

// 朗读用 ElevenLabs：Key 只存网关、接口不回原文；合成请求带对声音 / 模型 / 语言，音频原样流回
const calls = [];
const KEY = "sk_" + "a".repeat(40);
const orig = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  const k = init.headers?.["xi-api-key"];
  if (!String(url).startsWith("https://api.elevenlabs.io/")) throw new Error("unexpected host " + url);
  if (k !== KEY) return new Response(JSON.stringify({ detail: { status: "invalid_api_key" } }), { status: 401 });
  if (String(url).endsWith("/v1/voices")) return new Response(JSON.stringify({ voices: [{ voice_id: "voiceAAAA1111", name: "Sari", category: "premade", labels: { gender: "female", accent: "indonesian" } }] }), { status: 200 });
  if (String(url).includes("/v1/text-to-speech/")) return new Response(new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3]), { status: 200, headers: { "content-type": "audio/mpeg" } });
  return new Response("nope", { status: 404 });
};
const { routeTts } = await import("../gw/tts.mjs");
const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (typeof (await routeTts(req, res, u, u.pathname)) === "symbol") { res.writeHead(404); res.end(); }
});
await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
after(() => { srv.close(); globalThis.fetch = orig; });
const base = `http://127.0.0.1:${srv.address().port}`;
const j = (p, body) => orig(base + p, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});

test("朗读 ElevenLabs：错的 Key 不存；对的 Key 存进 0600 文件，接口只给末 4 位", async () => {
  const bad = await j("/api/tts/config", { apiKey: "sk_" + "b".repeat(40) });
  assert.equal(bad.status, 400);
  assert.equal((await (await j("/api/tts/config")).json()).hasKey, false);
  const ok = await j("/api/tts/config", { apiKey: KEY });
  assert.equal(ok.status, 200);
  const c = await (await j("/api/tts/config")).json();
  assert.equal(c.hasKey, true); assert.equal(c.enabled, true); assert.equal(c.keyTail, "aaaa");
  assert.ok(!JSON.stringify(c).includes(KEY), "接口不许回 Key 原文");
  const f = path.join(process.env.CCAPP_HOME, "ccapp-tts.json");
  assert.equal(fs.statSync(f).mode & 0o777, 0o600);
});

test("朗读 ElevenLabs：声音列表、选声音、合成带上模型和语言", async () => {
  const v = await (await j("/api/tts/voices")).json();
  assert.equal(v.voices[0].name, "Sari");
  assert.ok(!JSON.stringify(v).includes(KEY));
  await j("/api/tts/config", { voiceId: "voiceAAAA1111", voiceName: "Sari", model: "eleven_flash_v2_5" });
  const r = await j("/api/tts", { text: "Halo, apa kabar?", lang: "id" });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "audio/mpeg");
  assert.deepEqual([...new Uint8Array(await r.arrayBuffer())], [0x49, 0x44, 0x33, 1, 2, 3]);
  const last = calls.at(-1);
  assert.match(last.url, /\/v1\/text-to-speech\/voiceAAAA1111\/stream/);
  const body = JSON.parse(last.init.body);
  assert.equal(body.model_id, "eleven_flash_v2_5"); assert.equal(body.language_code, "id"); assert.equal(body.text, "Halo, apa kabar?");
});

test("朗读 ElevenLabs：关掉 / 删 Key 后不再合成", async () => {
  await j("/api/tts/config", { enabled: false });
  assert.equal((await j("/api/tts", { text: "x" })).status, 409);
  await j("/api/tts/config", { enabled: true, clearKey: true });
  const c = await (await j("/api/tts/config")).json();
  assert.equal(c.hasKey, false); assert.equal(c.enabled, false);
});
