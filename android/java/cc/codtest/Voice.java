package cc.codtest;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * 语音：听写（系统的 SpeechRecognizer）和朗读（系统的 TextToSpeech），给界面的麦克风键、「语音对话」、回复底下的「朗读」用。
 * WebView 里没有 webkitSpeechRecognition，只能在外壳这层做，结果经 sink 推给页面（ccapp-voice 事件，JSON）：
 *   听：ready / level{rms} / partial{text} / processing / final{text} / error{code}
 *   读：tts_start{id} / tts_done{id} / tts_error{id, code}
 * 全部在主线程调（SpeechRecognizer 只认创建它的那个线程）。应用退到后台就停：后台拿不到麦克风，也别在没人看时出声。
 */
final class Voice {
    interface Sink { void emit(JSONObject ev); }
    static final int REQ_MIC = 12;

    private final Activity act;
    private final Sink sink;
    private final Handler h = new Handler(Looper.getMainLooper());
    private SpeechRecognizer sr;
    private boolean listening;
    private String pendingLang;
    private long lastLevel;

    private TextToSpeech tts;
    private boolean ttsReady, ttsFailed;
    private final List<Runnable> ttsWait = new ArrayList<>();
    private String speakingId;
    /** 用户在设置里挑的系统声音（TextToSpeech.Voice 的 name）；空 = 自动挑最好的 */
    private String prefVoice;

    Voice(Activity a, Sink s) {
        act = a; sink = s;
        prefVoice = a.getSharedPreferences("ui", Activity.MODE_PRIVATE).getString("tts_voice", "");
    }

    boolean available() {
        try { return SpeechRecognizer.isRecognitionAvailable(act); } catch (Exception e) { return false; }
    }

    // ── 听写 ──────────────────────────────────────────────────────
    void listen(String lang) {
        stopSpeaking(false);                 // 别把自己念的话听进去
        if (act.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            pendingLang = lang;
            act.requestPermissions(new String[]{ Manifest.permission.RECORD_AUDIO }, REQ_MIC);
            return;
        }
        startNow(lang);
    }

    void onPermission(boolean granted) {
        String l = pendingLang;
        pendingLang = null;
        if (granted && l != null) startNow(l);
        else if (!granted) emit("error", "code", "perm");
    }

    private void startNow(String lang) {
        if (!available()) { emit("error", "code", "unavailable"); return; }
        try {
            if (listening && sr != null) sr.cancel();
            if (sr == null) {
                sr = SpeechRecognizer.createSpeechRecognizer(act);
                sr.setRecognitionListener(listener);
            }
            Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, lang)
                .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, act.getPackageName())
                // 说完停多久算一句结束：太短会把思考时的停顿切断，太长等得人着急
                .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1800L)
                .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L);
            listening = true;
            sr.startListening(i);
        } catch (Exception e) {
            listening = false;
            emit("error", "code", "client");
        }
    }

    /** 说完了：按已经听到的出结果 */
    void stop() { if (sr != null && listening) try { sr.stopListening(); } catch (Exception ignored) {} }

    /** 不要了：什么结果都不出 */
    void cancel() {
        pendingLang = null;
        if (sr != null && listening) try { sr.cancel(); } catch (Exception ignored) {}
        listening = false;
    }

    private final RecognitionListener listener = new RecognitionListener() {
        @Override public void onReadyForSpeech(Bundle b) { emit("ready", null, null); }
        @Override public void onBeginningOfSpeech() {}
        @Override public void onRmsChanged(float rms) {
            long now = System.currentTimeMillis();
            if (now - lastLevel < 70) return;
            lastLevel = now;
            try { JSONObject o = new JSONObject().put("type", "level").put("rms", rms); sink.emit(o); } catch (Exception ignored) {}
        }
        @Override public void onBufferReceived(byte[] b) {}
        @Override public void onEndOfSpeech() { emit("processing", null, null); }
        @Override public void onError(int code) {
            listening = false;
            String c;
            switch (code) {
                case SpeechRecognizer.ERROR_NO_MATCH: case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: c = "silence"; break;
                case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: c = "perm"; break;
                case SpeechRecognizer.ERROR_NETWORK: case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: c = "network"; break;
                case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: c = "busy"; break;
                case SpeechRecognizer.ERROR_AUDIO: c = "audio"; break;
                default: c = code == 12 || code == 13 ? "lang" : "client";     // 12/13：这个语言不支持 / 没下载（安卓 12+）
            }
            // 忙：上一次还没放手，换一个新的识别器重来一次
            if ("busy".equals(c) && sr != null) { try { sr.destroy(); } catch (Exception ignored) {} sr = null; }
            emit("error", "code", c);
        }
        @Override public void onResults(Bundle b) { listening = false; emit("final", "text", best(b)); }
        @Override public void onPartialResults(Bundle b) { String t = best(b); if (!t.isEmpty()) emit("partial", "text", t); }
        @Override public void onEvent(int type, Bundle b) {}
    };

    private static String best(Bundle b) {
        ArrayList<String> r = b == null ? null : b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return r == null || r.isEmpty() || r.get(0) == null ? "" : r.get(0).trim();
    }

    // ── 朗读 ──────────────────────────────────────────────────────
    /** text 是已经去掉 Markdown 的纯文字；id 由页面给，结束时原样带回 */
    void speak(String text, String lang, float rate, String id) {
        if (text == null || text.trim().isEmpty()) return;
        withTts(() -> speakNow(text, lang, rate, id), () -> emitTts("tts_error", id, "engine"));
    }

    /** 引擎好了就跑 go，起不来跑 fail */
    private void withTts(Runnable go, Runnable fail) {
        if (ttsReady) { go.run(); return; }
        if (ttsFailed) { fail.run(); return; }
        ttsWait.add(() -> { if (ttsReady) go.run(); else fail.run(); });
        if (tts == null) {
            tts = new TextToSpeech(act.getApplicationContext(), status -> h.post(() -> {
                ttsReady = status == TextToSpeech.SUCCESS;
                ttsFailed = !ttsReady;
                List<Runnable> w = new ArrayList<>(ttsWait);
                ttsWait.clear();
                for (Runnable r : w) r.run();
            }));
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String u) { if (u.endsWith("#0")) h.post(() -> emitTts("tts_start", base(u), null)); }
                @Override public void onDone(String u) {
                    if (u.endsWith("#end")) h.post(() -> { if (base(u).equals(speakingId)) speakingId = null; emitTts("tts_done", base(u), null); });
                }
                @Override public void onError(String u) { h.post(() -> { speakingId = null; emitTts("tts_error", base(u), "speak"); }); }
                @Override public void onStop(String u, boolean interrupted) {}
            });
        }
    }

    private static String base(String u) { int i = u.lastIndexOf('#'); return i > 0 ? u.substring(0, i) : u; }

    private void speakNow(String text, String lang, float rate, String id) {
        try {
            Locale loc = Locale.forLanguageTag(lang == null || lang.isEmpty() ? "id-ID" : lang);
            int ok = tts.setLanguage(loc);
            if (ok == TextToSpeech.LANG_MISSING_DATA || ok == TextToSpeech.LANG_NOT_SUPPORTED) { emitTts("tts_error", id, "lang"); return; }
            // setLanguage 只给这个语言的默认声音（常常是最机械的那个）：换成挑过的
            android.speech.tts.Voice v = pick(loc);
            if (v != null) try { tts.setVoice(v); } catch (Exception ignored) {}
            tts.setPitch(1f);
            tts.setSpeechRate(rate > 0.3f && rate < 3f ? rate : 1f);
            speakingId = id;
            // 引擎一次收的字数有上限（多数约 4000）：按句子切成几段排队念，最后一段的 id 带 #end，念完它才算念完
            int max = Math.min(3000, Math.max(500, TextToSpeech.getMaxSpeechInputLength() - 100));
            List<String> parts = split(text, max);
            for (int i = 0; i < parts.size(); i++) {
                String uid = id + (i == parts.size() - 1 ? "#end" : "#" + i);
                if (i == 0 && parts.size() == 1) {
                    // 只有一段：#0 和 #end 是同一段 —— 开始事件单独补
                    h.post(() -> emitTts("tts_start", id, null));
                }
                tts.speak(parts.get(i), i == 0 ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD, null, uid);
            }
        } catch (Exception e) { emitTts("tts_error", id, "speak"); }
    }

    /** 这个语言最像真人的声音：设置里挑过的优先；不然按质量 → 联网时优先「网络」声音 → 已装好的 → 延迟低 */
    private android.speech.tts.Voice pick(Locale loc) {
        java.util.Set<android.speech.tts.Voice> all;
        try { all = tts.getVoices(); } catch (Exception e) { return null; }
        if (all == null || all.isEmpty()) return null;
        String lang = loc.getLanguage();
        boolean online = online();
        android.speech.tts.Voice best = null;
        int bestScore = Integer.MIN_VALUE;
        for (android.speech.tts.Voice v : all) {
            if (v.getLocale() == null || !normLang(v.getLocale().getLanguage()).equals(normLang(lang))) continue;
            boolean missing = v.getFeatures() != null && v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED);
            if (!prefVoice.isEmpty() && v.getName().equals(prefVoice) && (!v.isNetworkConnectionRequired() || online)) return v;
            if (missing && !v.isNetworkConnectionRequired()) continue;
            if (v.isNetworkConnectionRequired() && !online) continue;
            int score = v.getQuality() * 10 + (v.isNetworkConnectionRequired() ? 5 : 0) - v.getLatency()
                + (loc.getCountry().isEmpty() || loc.getCountry().equalsIgnoreCase(v.getLocale().getCountry()) ? 3 : 0);
            if (score > bestScore) { bestScore = score; best = v; }
        }
        return best;
    }
    private static String normLang(String l) { return "in".equals(l) ? "id" : l; }   // 旧代码 in = 印尼语
    private boolean online() {
        try {
            android.net.ConnectivityManager cm = act.getSystemService(android.net.ConnectivityManager.class);
            android.net.NetworkCapabilities nc = cm.getNetworkCapabilities(cm.getActiveNetwork());
            return nc != null && nc.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_VALIDATED);
        } catch (Exception e) { return false; }
    }

    /** 设置页要声音列表：推 tts_voices {list:[{name, label, quality, network, installed}], current} */
    void listVoices(String lang) {
        withTts(() -> {
            try {
                Locale loc = Locale.forLanguageTag(lang == null || lang.isEmpty() ? "id-ID" : lang);
                JSONArray arr = new JSONArray();
                List<android.speech.tts.Voice> vs = new ArrayList<>();
                for (android.speech.tts.Voice v : tts.getVoices())
                    if (v.getLocale() != null && normLang(v.getLocale().getLanguage()).equals(normLang(loc.getLanguage()))) vs.add(v);
                java.util.Collections.sort(vs, (a, b) -> a.getQuality() != b.getQuality() ? b.getQuality() - a.getQuality() : a.getName().compareTo(b.getName()));
                for (android.speech.tts.Voice v : vs) {
                    boolean missing = v.getFeatures() != null && v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED);
                    arr.put(new JSONObject().put("name", v.getName()).put("quality", v.getQuality())
                        .put("network", v.isNetworkConnectionRequired()).put("installed", !missing)
                        .put("country", v.getLocale().getCountry()));
                }
                android.speech.tts.Voice auto = pick(loc);
                sink.emit(new JSONObject().put("type", "tts_voices").put("list", arr).put("current", prefVoice)
                    .put("auto", auto == null ? "" : auto.getName()).put("engine", tts.getDefaultEngine()));
            } catch (Exception e) { emit("tts_voices_error", "code", "list"); }
        }, () -> emit("tts_voices_error", "code", "engine"));
    }

    void setVoice(String name) {
        prefVoice = name == null ? "" : name;
        act.getSharedPreferences("ui", Activity.MODE_PRIVATE).edit().putString("tts_voice", prefVoice).apply();
    }

    private static List<String> split(String s, int max) {
        List<String> out = new ArrayList<>();
        String rest = s.trim();
        while (rest.length() > max) {
            int cut = -1;
            for (String sep : new String[]{ "\n\n", ". ", "! ", "? ", "。", "\n", ", ", " " }) {
                int k = rest.lastIndexOf(sep, max);
                if (k > max / 3) { cut = k + sep.length(); break; }
            }
            if (cut <= 0) cut = max;
            out.add(rest.substring(0, cut).trim());
            rest = rest.substring(cut).trim();
        }
        if (!rest.isEmpty()) out.add(rest);
        return out;
    }

    /** 停止朗读；notify：要不要告诉页面（页面自己点的停止不用回） */
    void stopSpeaking(boolean notify) {
        String id = speakingId;
        speakingId = null;
        ttsWait.clear();
        if (tts != null && ttsReady) try { tts.stop(); } catch (Exception ignored) {}
        if (notify && id != null) emitTts("tts_done", id, null);
    }

    /** 退到后台：都停，并告诉页面（语音对话就此退出） */
    void pause() {
        boolean was = listening || speakingId != null;
        cancel();
        stopSpeaking(true);
        if (was) emit("paused", null, null);
    }

    void destroy() {
        cancel();
        if (sr != null) try { sr.destroy(); } catch (Exception ignored) {}
        sr = null;
        if (tts != null) try { tts.shutdown(); } catch (Exception ignored) {}
        tts = null; ttsReady = false;
    }

    private void emit(String type, String k, String v) {
        try { JSONObject o = new JSONObject().put("type", type); if (k != null) o.put(k, v); sink.emit(o); } catch (Exception ignored) {}
    }
    private void emitTts(String type, String id, String code) {
        try { JSONObject o = new JSONObject().put("type", type).put("id", id == null ? "" : id); if (code != null) o.put("code", code); sink.emit(o); } catch (Exception ignored) {}
    }
}
