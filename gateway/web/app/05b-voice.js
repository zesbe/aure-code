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
  function voiceSpeak(text, id, btn) {
    const s = speakable(text);
    if (!s) return false;
    voiceStopSpeak();
    VOICE.speakId = id;
    VOICE.actBtn = btn || null;
    if (btn) btn.classList.add("speaking");
    try { CCApp.speak(s, voiceLang(), 1.05, id); } catch (e) { VOICE.speakId = null; toast(e.message, true); return false; }
    return true;
  }
  function voiceStopSpeak() {
    if (VOICE.speakId) { try { CCApp.speakStop(); } catch {} }
    VOICE.speakId = null;
    if (VOICE.actBtn) VOICE.actBtn.classList.remove("speaking");
    VOICE.actBtn = null;
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
        if (ev.id && ev.id === VOICE.speakId) {
          VOICE.speakId = null;
          if (VOICE.actBtn) { VOICE.actBtn.classList.remove("speaking"); VOICE.actBtn = null; }
          if (VOICE.mode === "chat" && VOICE.phase === "speak") voiceListen();      // 念完了：接着听
        }
        break;
    }
  });

  // ── 麦克风键：放在发送键左边。点 = 听写，长按 = 语音对话 ──
  (function voiceMount() {
    let ok = false;
    try { ok = voiceHas() && CCApp.voiceOk(); } catch {}
    if (!ok) return;
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
