  // ── 语音（Aure Code）：麦克风听写、语音对话、朗读回复 ────────────────────────
  //  WebView 里没有 webkitSpeechRecognition / speechSynthesis 能用的，听和读都在外壳（android Voice.java）：
  //    CCApp.voiceListen(lang) / voiceStop() / voiceCancel()      → 事件 ready / level / partial / processing / final / error / paused
  //    CCApp.speak(text, lang, rate, id) / speakStop()            → 事件 tts_start / tts_done / tts_error
  //  两种用法：
  //    · 点麦克风 = 听写：说的话实时落进输入框，说完停下，自己看一眼再发；
  //    · 长按麦克风 = 语音对话：说完自动发送 → 回答读出来 → 接着听，一直到点「结束」。读的时候点圆圈可以打断接着说。
  //  回复底下多一个「朗读」键（消息按钮里可以藏）。
  const VOICE = { mode: null, phase: "", base: "", waitRun: false, speakId: null, silence: 0, ov: null, btn: null, actBtn: null };
  const voiceHas = () => !!(window.CCApp && typeof CCApp.voiceListen === "function" && typeof CCApp.voiceOk === "function");
  const VOICE_LANG = { id: "id-ID", en: "en-US", zh: "zh-CN", "zh-Hant": "zh-TW", ja: "ja-JP", ko: "ko-KR", es: "es-ES", fr: "fr-FR", ru: "ru-RU", ar: "ar-SA" };
  const voiceLang = () => VOICE_LANG[I18N.lang] || VOICE_LANG[String(I18N.lang).split("-")[0]] || "id-ID";
  const MIC_SVG = '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>';

  /** 回复的 Markdown → 念得出口的纯文字：代码块略过，链接只留文字，去掉标记符号和裸网址 */
  function speakable(md) {
    return String(md || "")
      .replace(/```[\s\S]*?(```|$)/g, " " + t("（代码略过）") + " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/^\s*[-*+•]\s+/gm, "")
      .replace(/^\s*>\s?/gm, "")
      .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, "")
      .replace(/\|/g, ", ")
      .replace(/(\*\*|__|\*|~~)/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, 20000);
  }

  // ── 浮层：输入栏上面一条，圆圈跟着音量动 ──
  function voiceOv() {
    if (VOICE.ov) return VOICE.ov;
    const el = document.createElement("div");
    el.id = "voice-ov";
    el.className = "hidden";
    el.setAttribute("role", "status");
    el.innerHTML = `<button type="button" class="vo-orb" aria-label=""><span class="vo-ring"></span><span class="vo-core">${MIC_SVG}</span></button>
      <div class="vo-mid"><div class="vo-phase"></div><div class="vo-text" dir="auto"></div></div>
      <div class="vo-acts"><button type="button" class="vo-chat"></button><button type="button" class="vo-end"></button></div>`;
    $("composer").insertBefore(el, $("composer-inner"));
    el.querySelector(".vo-orb").addEventListener("click", voiceOrbTap);
    el.querySelector(".vo-end").addEventListener("click", () => voiceEnd(true));
    el.querySelector(".vo-chat").addEventListener("click", () => {
      // 听写中途切成语音对话：已经说的保留，接着当一轮对话发
      if (VOICE.mode === "dictate") { VOICE.mode = "chat"; voicePaint(); }
      else if (VOICE.mode === "chat") voiceEnd(true);
    });
    return (VOICE.ov = el);
  }
  function voicePaint(text) {
    const el = voiceOv();
    const on = !!VOICE.mode;
    el.classList.toggle("hidden", !on);
    el.dataset.phase = VOICE.phase;
    el.dataset.mode = VOICE.mode || "";
    const P = { listen: t("正在听…"), proc: t("正在识别…"), wait: t("Claude 正在回答…"), speak: t("正在朗读…"), idle: t("点圆圈开始说话") };
    el.querySelector(".vo-phase").textContent = (VOICE.mode === "chat" ? "🎧 " + t("语音对话") + " · " : "") + (P[VOICE.phase] || "");
    if (text !== undefined) el.querySelector(".vo-text").textContent = text;
    const orb = el.querySelector(".vo-orb");
    orb.setAttribute("aria-label", VOICE.phase === "speak" ? t("点一下打断，接着说") : VOICE.phase === "listen" ? t("结束") : t("点圆圈开始说话"));
    el.querySelector(".vo-chat").textContent = VOICE.mode === "chat" ? "" : "🎧 " + t("语音对话");
    el.querySelector(".vo-chat").classList.toggle("hidden", VOICE.mode === "chat");
    el.querySelector(".vo-end").textContent = VOICE.mode === "chat" ? t("结束") : t("取消");
    if (VOICE.btn) VOICE.btn.classList.toggle("on", on);
    if (!on) el.style.removeProperty("--lv");
  }

  function voiceListen() {
    VOICE.phase = "listen";
    voicePaint("");
    try { CCApp.voiceListen(voiceLang()); } catch (e) { voiceEnd(false); toast(e.message, true); }
  }
  function voiceStart(mode) {
    if (!voiceHas()) return;
    if (VOICE.speakId) voiceStopSpeak();
    VOICE.mode = mode;
    VOICE.silence = 0;
    VOICE.waitRun = false;
    VOICE.base = mode === "dictate" ? inputEl.value : "";
    voiceListen();
  }
  /** 收起：user=true 是用户点的（要告诉外壳停） */
  function voiceEnd(user) {
    const was = VOICE.mode;
    VOICE.mode = null; VOICE.phase = ""; VOICE.waitRun = false;
    if (user && was) { try { CCApp.voiceCancel(); } catch {} voiceStopSpeak(); }
    voicePaint();
  }
  function voiceOrbTap() {
    if (VOICE.phase === "speak") { voiceStopSpeak(); voiceListen(); return; }      // 打断朗读，接着说
    if (VOICE.phase === "listen") { try { CCApp.voiceStop(); } catch {} return; }   // 说完了
    if (VOICE.phase === "idle" || !VOICE.phase) voiceListen();
  }

  const joinBase = (base, s) => (base && s ? base.replace(/\s*$/, "") + " " + s : base || s);
  function voiceFinal(text) {
    if (VOICE.mode === "dictate") {
      inputEl.value = joinBase(VOICE.base, text);
      autoGrow(); syncInterject();
      voiceEnd(false);
      return;
    }
    if (VOICE.mode !== "chat") return;
    if (!text) return voiceSilent();
    VOICE.silence = 0;
    VOICE.phase = "wait";
    VOICE.waitRun = true;
    voicePaint(text);
    send(text);
  }
  function voiceSilent() {
    if (VOICE.mode === "chat" && ++VOICE.silence < 3) return voiceListen();     // 对话里停顿一下很正常：再听两次
    if (VOICE.mode === "chat") toast(t("一直没听到声音，语音对话已结束"));
    else toast(t("没听到声音"));
    voiceEnd(false);
  }
  const VOICE_ERR = {
    perm: "需要麦克风权限才能语音输入", unavailable: "这台设备没有可用的语音识别（装上或启用 Google 应用的语音输入）",
    network: "语音识别要联网，网络不通", lang: "语音识别不支持这个语言",
  };

  // ── 朗读 ──
  //  有 ElevenLabs（设置 → 设备与权限 → 朗读声音）就经网关 /api/tts 合成 mp3 播（念下一段时预取再下一段）；
  //  没有、或者出错，退回外壳的系统朗读（CCApp.speak）。两条路结束都走 voiceSpeakEnded。
  const EL = { cfg: null, audio: null, ac: null, url: "", warned: false };
  async function elLoad() { try { EL.cfg = await api("/api/tts/config"); } catch { EL.cfg = null; } return EL.cfg; }
  const elOn = () => !!(EL.cfg && EL.cfg.enabled);
  /** 按句子切段：第一段短一点，先响起来 */
  function elChunks(s) {
    const out = []; let rest = s;
    while (rest) {
      const max = out.length ? 1400 : 320;
      if (rest.length <= max) { out.push(rest); break; }
      let cut = -1;
      for (const sep of ["\n\n", ". ", "! ", "? ", "。", "\n", ", ", " "]) { const k = rest.lastIndexOf(sep, max); if (k > max / 3) { cut = k + sep.length; break; } }
      if (cut <= 0) cut = max;
      out.push(rest.slice(0, cut).trim()); rest = rest.slice(cut).trim();
    }
    return out.filter(Boolean);
  }
  function elFetch(text, signal) {
    return fetch("/api/tts", { method: "POST", signal, headers: { "content-type": "application/json", "X-CC-Lang": I18N.lang },
      body: JSON.stringify({ text, lang: String(I18N.lang).slice(0, 2) }) })
      .then(async (r) => {
        if (!r.ok) { let m = "HTTP " + r.status; try { const j = await r.json(); m = j.message || j.error || m; } catch {} throw new Error(m); }
        return r.blob();
      });
  }
  async function elSpeak(s, id) {
    const ac = new AbortController(); EL.ac = ac;
    const parts = elChunks(s);
    let next = elFetch(parts[0], ac.signal);
    for (let i = 0; i < parts.length; i++) {
      let blob;
      try { blob = await next; }
      catch (e) {
        if (ac.signal.aborted || VOICE.speakId !== id) return;
        // 第一段就失败：整段改用系统朗读；中途失败：剩下的用系统朗读接着念
        if (!EL.warned) { EL.warned = true; toast(t("ElevenLabs 朗读失败，改用系统朗读：{msg}", { msg: e.message }), true); }
        try { CCApp.speak(parts.slice(i).join(" "), voiceLang(), 1.05, id); } catch { voiceSpeakEnded(id, true); }
        return;
      }
      if (ac.signal.aborted || VOICE.speakId !== id) return;
      if (i + 1 < parts.length) next = elFetch(parts[i + 1], ac.signal);
      const url = URL.createObjectURL(blob);
      const a = new Audio(url);
      EL.audio = a; EL.url = url;
      const ok = await new Promise((done) => {
        a.onended = () => done(true);
        a.onerror = () => done(false);
        a.play().catch(() => done(false));
      });
      URL.revokeObjectURL(url);
      if (EL.audio === a) { EL.audio = null; EL.url = ""; }
      if (ac.signal.aborted || VOICE.speakId !== id) return;
      if (!ok) { toast(t("朗读出错了"), true); return voiceSpeakEnded(id, true); }
    }
    voiceSpeakEnded(id, false);
  }
  function elStop() {
    if (EL.ac) { try { EL.ac.abort(); } catch {} EL.ac = null; }
    if (EL.audio) { try { EL.audio.pause(); } catch {} EL.audio = null; }
    if (EL.url) { URL.revokeObjectURL(EL.url); EL.url = ""; }
  }

  function voiceSpeak(text, id, btn) {
    const s = speakable(text);
    if (!s) return false;
    voiceStopSpeak();
    VOICE.speakId = id;
    VOICE.actBtn = btn || null;
    if (btn) btn.classList.add("speaking");
    if (elOn()) { elSpeak(s, id); return true; }
    try { CCApp.speak(s, voiceLang(), 1.05, id); } catch (e) { VOICE.speakId = null; toast(e.message, true); return false; }
    return true;
  }
  function voiceStopSpeak() {
    elStop();
    if (VOICE.speakId) { try { CCApp.speakStop(); } catch {} }
    VOICE.speakId = null;
    if (VOICE.actBtn) VOICE.actBtn.classList.remove("speaking");
    VOICE.actBtn = null;
  }
  /** 念完 / 念不下去：语音对话里接着听 */
  function voiceSpeakEnded(id) {
    if (!id || id !== VOICE.speakId) return;
    VOICE.speakId = null;
    if (VOICE.actBtn) { VOICE.actBtn.classList.remove("speaking"); VOICE.actBtn = null; }
    if (VOICE.mode === "chat" && VOICE.phase === "speak") voiceListen();
  }
  /** 回复底下的「朗读」键（03-perm-status.js 的 replyActs 调） */
  function voiceToggleRead(btn, text) {
    if (!voiceHas()) return;
    if (VOICE.actBtn === btn && VOICE.speakId) { voiceStopSpeak(); return; }
    voiceSpeak(text, "r" + Date.now().toString(36), btn);
  }

  /** 一轮结束（04-session-flow.js 的 onRunEnd 调）：语音对话在等回答，就把这一轮的回答念出来 */
  function voiceRunEnd(ev) {
    if (VOICE.mode !== "chat" || !VOICE.waitRun) return;
    const els = chatEl.querySelectorAll(`.msg.bot[data-run="${CSS.escape(ev.runId)}"] .txt`);
    if (!els.length) return;                // 不是当前会话的那一轮
    VOICE.waitRun = false;
    const text = [...els].map((e) => (typeof e._src === "function" ? e._src() : e.textContent)).join("\n\n");
    if (ev.aborted || ev.failed || !speakable(text)) return voiceListen();
    VOICE.phase = "speak";
    voicePaint(speakable(text).slice(0, 160) + (speakable(text).length > 160 ? "…" : ""));
    if (!voiceSpeak(text, "c" + Date.now().toString(36))) voiceListen();
  }

  window.addEventListener("ccapp-voice", (e) => {
    let ev; try { ev = JSON.parse(e.detail?.value || "{}"); } catch { return; }
    switch (ev.type) {
      case "ready": if (VOICE.mode) { VOICE.phase = "listen"; voicePaint(); } break;
      case "level": if (VOICE.ov && VOICE.phase === "listen") VOICE.ov.style.setProperty("--lv", String(Math.max(0, Math.min(1, (Number(ev.rms) + 2) / 12)))); break;
      case "partial":
        if (!VOICE.mode) break;
        voicePaint(ev.text);
        if (VOICE.mode === "dictate") { inputEl.value = joinBase(VOICE.base, ev.text); autoGrow(); }
        break;
      case "processing": if (VOICE.mode && VOICE.phase === "listen") { VOICE.phase = "proc"; voicePaint(); } break;
      case "final": voiceFinal(String(ev.text || "").trim()); break;
      case "error":
        if (!VOICE.mode) break;
        if (ev.code === "silence") voiceSilent();
        else if (ev.code === "busy") setTimeout(() => VOICE.mode && voiceListen(), 400);
        else { toast(t(VOICE_ERR[ev.code] || "语音识别出错了，再试一次"), true); voiceEnd(false); }
        break;
      case "paused": voiceStopSpeak(); voiceEnd(false); break;
      case "tts_start": break;
      case "tts_done":
      case "tts_error":
        if (ev.type === "tts_error") toast(t(ev.code === "lang" ? "这台设备没装这个语言的朗读语音：到 系统设置 → 文字转语音 里下载" : "朗读出错了"), true);
        voiceSpeakEnded(ev.id);           // 念完了：语音对话里接着听
        break;
    }
  });

  // ── 麦克风键：放在发送键左边。点 = 听写，长按 = 语音对话 ──
  (function voiceMount() {
    let ok = false;
    try { ok = voiceHas() && CCApp.voiceOk(); } catch {}
    if (!ok) return;
    elLoad();
    const b = document.createElement("button");
    b.id = "btn-mic";
    b.className = "mini-btn";
    b.type = "button";
    b.setAttribute("aria-label", t("语音输入"));
    b.title = t("长按麦克风进入语音对话：说完自动发送，回答会读给你听");
    b.innerHTML = MIC_SVG;
    $("composer-inner").insertBefore(b, $("btn-interject") || $("btn-send"));
    VOICE.btn = b;
    let timer = 0, long = false;
    b.addEventListener("pointerdown", () => { long = false; clearTimeout(timer); timer = setTimeout(() => { long = true; try { navigator.vibrate?.(18); } catch {} voiceStart("chat"); }, 480); });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, () => clearTimeout(timer));
    b.addEventListener("contextmenu", (e) => e.preventDefault());
    b.addEventListener("click", (e) => {
      e.preventDefault();
      if (long) { long = false; return; }
      if (VOICE.mode) return voiceEnd(true);
      voiceStart("dictate");
      // 第一次用：顺便说一下长按能语音对话
      try { if (!localStorage.getItem("cc.voiceTip")) { localStorage.setItem("cc.voiceTip", "1"); setTimeout(() => toast(t("长按麦克风进入语音对话：说完自动发送，回答会读给你听")), 1800); } } catch {}
    });
  })();

  // ── 设置 → 设备与权限 → 朗读声音（ElevenLabs）：Key 只交给网关，界面只看末 4 位 ──
  (function ttsSettingsMount() {
    if (!voiceHas()) return;
    const cat = document.querySelector('.set-cat[data-cat="device"]');
    if (!cat) return;
    const box = document.createElement("div");
    box.className = "sblock";
    box.id = "tts-field";
    cat.appendChild(box);
    let voices = null;
    const post = (body) => api("/api/tts/config", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    function paint() {
      const c = EL.cfg || { hasKey: false, models: [] };
      const MN = { eleven_flash_v2_5: t("Flash v2.5（最快，省额度）"), eleven_multilingual_v2: t("Multilingual v2（最自然）"), eleven_turbo_v2_5: "Turbo v2.5", eleven_v3: t("v3（最有感情，较慢）") };
      box.innerHTML = `<div class="srow head"><div class="sl"><b>${esc(t("朗读声音"))}</b>
          <p>${esc(t("系统朗读听起来很机械：填上 ElevenLabs 的 API Key，回复和语音对话就用 ElevenLabs 的真人声音念。Key 只存在本机网关里。"))}</p></div>
          ${c.hasKey ? `<div class="sc"><input type="checkbox" class="sw" id="tts-on" ${c.enabled ? "checked" : ""}></div>` : ""}</div>
        <div class="prov-state">${c.hasKey ? esc(t("已连接 ElevenLabs（Key 末 4 位 {k}）", { k: c.keyTail })) : esc(t("现在用的是系统朗读"))}</div>
        ${c.hasKey ? `
        <div class="srow sub"><div class="sl"><p>${esc(t("声音"))}</p></div><div class="sc"><select id="tts-voice"><option value="${esc(c.voiceId)}">${esc(c.voiceName || t("加载中…"))}</option></select></div></div>
        <div class="srow sub"><div class="sl"><p>${esc(t("模型"))}</p></div><div class="sc"><select id="tts-model">${c.models.map((m) => `<option value="${m}" ${m === c.model ? "selected" : ""}>${esc(MN[m] || m)}</option>`).join("")}</select></div></div>
        <div class="row-actions"><button class="btn sm" id="tts-test">${esc(t("试听"))}</button><button class="btn sm" id="tts-del">${esc(t("删除 Key"))}</button></div>`
        : `<div class="sinline"><input id="tts-key" type="password" autocomplete="off" spellcheck="false" placeholder="${esc(t("粘贴 ElevenLabs API Key"))}"><button class="btn sm" id="tts-save">${esc(t("保存"))}</button></div>
        <div class="row-actions"><button class="btn sm" id="tts-get">${esc(t("去 ElevenLabs 拿 Key"))}</button></div>
        <p class="prov-state">${esc(t("在 ElevenLabs 网站：头像 → API Keys → Create API Key，至少勾上 Text to Speech 和 Voices（读取），复制后粘贴到这里。"))}</p>`}`;
      if (c.hasKey) loadVoices();
    }
    async function loadVoices() {
      const sel = box.querySelector("#tts-voice"); if (!sel) return;
      try {
        if (!voices) voices = (await api("/api/tts/voices")).voices || [];
        const cur = EL.cfg.voiceId;
        if (voices.length && !voices.some((v) => v.id === cur)) voices.unshift({ id: cur, name: EL.cfg.voiceName || cur, desc: "" });
        sel.innerHTML = voices.map((v) => `<option value="${esc(v.id)}" ${v.id === cur ? "selected" : ""}>${esc(v.name + (v.desc ? " — " + v.desc : ""))}</option>`).join("");
      } catch (e) { toast(e.message, true); }
    }
    box.addEventListener("click", async (e) => {
      const id = e.target.closest("button")?.id;
      if (id === "tts-get") { const u = "https://elevenlabs.io/app/settings/api-keys"; if (window.CCApp && CCApp.openUrl) CCApp.openUrl(u); else window.open(u, "_blank"); }
      if (id === "tts-save") {
        const k = box.querySelector("#tts-key").value.trim(); if (!k) return;
        const b = e.target; b.disabled = true; b.textContent = t("验证中…");
        try { EL.cfg = await post({ apiKey: k }); EL.warned = false; voices = null; toast(t("已连接 ElevenLabs")); paint(); }
        catch (err) { toast(err.message, true); b.disabled = false; b.textContent = t("保存"); }
      }
      if (id === "tts-del") {
        if (!confirm(t("删除 ElevenLabs 的 Key？之后改用系统朗读。"))) return;
        try { EL.cfg = await post({ clearKey: true }); voices = null; paint(); } catch (err) { toast(err.message, true); }
      }
      if (id === "tts-test") voiceSpeak(t("你好！我是 Aure。以后我的回答就用这个声音读给你听。"), "t" + Date.now().toString(36), e.target);
    });
    box.addEventListener("change", async (e) => {
      try {
        if (e.target.id === "tts-on") EL.cfg = await post({ enabled: e.target.checked });
        if (e.target.id === "tts-model") EL.cfg = await post({ model: e.target.value });
        if (e.target.id === "tts-voice") { const o = e.target.selectedOptions[0]; EL.cfg = await post({ voiceId: e.target.value, voiceName: (o?.textContent || "").split(" — ")[0] }); }
        EL.warned = false;
      } catch (err) { toast(err.message, true); }
    });
    elLoad().then(paint);
  })();
