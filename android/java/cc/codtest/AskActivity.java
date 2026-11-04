package cc.codtest;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.text.style.BackgroundColorSpan;
import android.text.style.ForegroundColorSpan;
import android.text.style.LeadingMarginSpan;
import android.text.style.QuoteSpan;
import android.text.style.RelativeSizeSpan;
import android.text.style.StyleSpan;
import android.text.style.TypefaceSpan;
import android.text.style.UnderlineSpan;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.nio.charset.StandardCharsets;

/**
 * 「问 Aure」：别的应用里选中一段文字，系统的文字菜单里点「Tanya Aure」（ACTION_PROCESS_TEXT），
 * 就在那个应用上面弹出一个底部面板 —— 不跳走、不用复制粘贴。
 *
 *   · 一打开就按文字猜一个动作直接开始（像代码 → 解释代码，很长 → 总结，其余用上次选的），换一个动作就停掉重来；
 *   · 回答经网关 /api/ask 流式过来，边收边按简单的 Markdown 排版（见 gateway/gw/ask.mjs，那一轮不给任何工具）；
 *   · 下面能接着问（同一个会话）；「替换原文」把回答写回原来的输入框（来源应用允许改的时候才有）；
 *     「在 Aure 里继续」打开主界面里的这个会话。
 *   · 网关没起来就先拉起服务等它；工具包还没装好就让用户先去打开应用。
 * 面板关掉 = 连接断开，网关那边会把还在跑的那一轮停掉，不白花额度。
 */
public final class AskActivity extends Activity {
    private static final String[] ACTIONS = { "explain", "translate", "summarize", "rewrite", "reply", "code", "fixcode" };
    private static final String[] LABELS = { "解释", "翻译", "总结", "润色", "写回复", "解释代码", "修代码" };
    private static final String[] ICONS = { "✨", "🌐", "📝", "✍️", "💬", "🧑‍💻", "🛠️" };
    private static final int TEXT_MAX = 60000;
    /** 磁贴 / 桌面快捷方式：拿剪贴板里的文字（WhatsApp 这类不给系统文字菜单的应用，先复制再问） */
    static final String ACTION_CLIP = "cc.codtest.ASK_CLIPBOARD";

    private final Handler ui = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;
    private boolean dark, readOnly;
    private int cBg, cCard, cField, cLine, cFg, cDim, cHint, cAccent;
    private String text = "", app;
    /** 等窗口拿到焦点再读剪贴板（安卓 10 起，没焦点的应用读不到）；autoRun：读到了就直接开始（只有自己的磁贴带口令时） */
    private boolean waitClip, autoRun = true;
    private TextView srcView, metaView;
    private View chipScroll;

    private FrameLayout root;
    private LinearLayout sheet, turns, chipRow, actRow;
    private ScrollView scroll;
    private TextView status, btnStop, btnReplace, btnCopy, btnShare, btnOpen, btnRetry;
    private EditText input;
    private final TextView[] chips = new TextView[ACTIONS.length];

    // 当前这一轮：代号变了就说明被换掉了，旧线程收到的东西一律丢掉
    private volatile int gen;
    private volatile HttpURLConnection conn;
    private String action, sid, answer = "";
    private TextView answerView;
    private boolean running;
    private long lastRender;
    private final Runnable render = this::renderNow;
    private int dots;
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (!running || status.getTag() == null) return;
            dots = (dots + 1) % 4;
            status.setText(status.getTag() + "   ".substring(0, 3 - dots) + "...".substring(0, dots));
            ui.postDelayed(this, 420);
        }
    };

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        Tr.init(this);
        prefs = getSharedPreferences("ask", MODE_PRIVATE);
        CharSequence cs = getIntent().getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT);
        if (cs == null) cs = getIntent().getCharSequenceExtra(Intent.EXTRA_TEXT);
        text = cs == null ? "" : cs.toString().trim();
        readOnly = getIntent().getBooleanExtra(Intent.EXTRA_PROCESS_TEXT_READONLY, false);
        if (!Intent.ACTION_PROCESS_TEXT.equals(getIntent().getAction())) readOnly = true;
        app = callerLabel();
        if (text.isEmpty()) {
            // 没递文字进来（磁贴、快捷方式，或者分享了个空的）：改读剪贴板。
            // 这个 Activity 是导出的，谁都能用这个 action 叫起它：只有带了我们自己口令的（磁贴）才一读到就开问，其余的等用户点一个动作
            waitClip = true;
            String k = getIntent().getStringExtra(MainActivity.IK);
            autoRun = k != null && java.security.MessageDigest.isEqual(k.getBytes(), MainActivity.intentKey(this).getBytes());
        }
        if (text.length() > TEXT_MAX) {
            text = text.substring(0, TEXT_MAX);
            Toast.makeText(this, Tr.f("文字太长，只取前 {0} 字", TEXT_MAX), Toast.LENGTH_LONG).show();
        }
        dark = BrowserPane.night(this);
        cBg = BrowserPane.pal(this, dark, "bg"); cCard = BrowserPane.pal(this, dark, "card"); cField = BrowserPane.pal(this, dark, "field");
        cLine = BrowserPane.pal(this, dark, "line"); cFg = BrowserPane.pal(this, dark, "fg"); cDim = BrowserPane.pal(this, dark, "dim");
        cHint = BrowserPane.pal(this, dark, "hint"); cAccent = BrowserPane.pal(this, dark, "accent");
        setupWindow();
        build();
        setContentView(root);
        sheet.setTranslationY(dp(600));
        sheet.animate().translationY(0).setDuration(240).setInterpolator(new android.view.animation.DecelerateInterpolator(2f)).start();
        if (waitClip) { showSource(false); setStatus(Tr.t("正在读取复制的文字…")); }
        else start(suggest(), null);
    }

    @Override public void onWindowFocusChanged(boolean has) {
        super.onWindowFocusChanged(has);
        if (!has || !waitClip) return;
        waitClip = false;
        String clip = "";
        try {
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            ClipData d = cm == null ? null : cm.getPrimaryClip();
            if (d != null && d.getItemCount() > 0) { CharSequence c = d.getItemAt(0).coerceToText(this); if (c != null) clip = c.toString().trim(); }
        } catch (Exception ignored) {}
        setStatus(null);
        if (clip.isEmpty()) { noClip(); return; }
        if (clip.length() > TEXT_MAX) clip = clip.substring(0, TEXT_MAX);
        text = clip;
        app = Tr.t("剪贴板");
        srcView.setText(text);
        metaView.setText(Tr.f("来自「{0}」", app) + "  ·  " + Tr.f("{0} 字", text.length()));
        showSource(true);
        if (autoRun) start(suggest(), null);
        else setStatus(Tr.t("选一个动作开始"));
    }

    private void showSource(boolean on) {
        int v = on ? View.VISIBLE : View.GONE;
        srcView.setVisibility(v); metaView.setVisibility(v); chipScroll.setVisibility(v);
    }

    /** 剪贴板是空的：说清楚怎么复制（WhatsApp 的做法），也可以直接在下面打字提问 */
    private void noClip() {
        turns.removeAllViews();
        TextView m = label(Tr.t("还没有复制的文字。先复制要问的内容（WhatsApp：长按消息 → 复制），再打开「问 Aure」；也可以直接在下面输入问题。"), 15, cFg, false);
        m.setLineSpacing(dp(3), 1f);
        turns.addView(m);
        input.requestFocus();
        showActions(false);
    }

    // ── 窗口：透明、压暗背后的应用，面板贴底；键盘和导航栏让面板往上让 ─────────────────
    private void setupWindow() {
        getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
        getWindow().setDimAmount(dark ? 0.6f : 0.42f);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE | WindowManager.LayoutParams.SOFT_INPUT_STATE_HIDDEN);
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
    }

    private void build() {
        root = new FrameLayout(this);
        root.setOnClickListener(v -> close());            // 点面板外面 = 关
        sheet = new LinearLayout(this);
        sheet.setOrientation(LinearLayout.VERTICAL);
        sheet.setClickable(true);                          // 别让点面板里面也算成点外面
        GradientDrawable sb = new GradientDrawable();
        sb.setColor(cCard);
        float r = dp(26);
        sb.setCornerRadii(new float[] { r, r, r, r, 0, 0, 0, 0 });
        sb.setStroke(dp(1), withAlpha(cLine, 0x99));
        sheet.setBackground(sb);
        sheet.setElevation(dp(16));
        sheet.setPadding(dp(18), dp(8), dp(18), dp(12));
        FrameLayout.LayoutParams slp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        root.addView(sheet, slp);

        // 拖动条：往下拖一截就关
        View handle = new View(this);
        GradientDrawable hb = new GradientDrawable();
        hb.setColor(withAlpha(cHint, 0x88)); hb.setCornerRadius(dp(3));
        handle.setBackground(hb);
        LinearLayout.LayoutParams hlp = new LinearLayout.LayoutParams(dp(40), dp(5));
        hlp.gravity = Gravity.CENTER_HORIZONTAL; hlp.bottomMargin = dp(10);
        sheet.addView(handle, hlp);

        // 标题行：星星标识 + 「问 Aure」 + 关闭
        LinearLayout head = new LinearLayout(this);
        head.setGravity(Gravity.CENTER_VERTICAL);
        head.setOnTouchListener(new DragToClose());
        handle.setOnTouchListener(new DragToClose());
        head.addView(new Mark(this, cFg, cAccent).once(), new LinearLayout.LayoutParams(dp(28), dp(28)));
        TextView title = label(Tr.t("问 Aure"), 17, cFg, true);
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        tlp.leftMargin = dp(10);
        head.addView(title, tlp);
        TextView x = label("✕", 17, cDim, false);
        x.setPadding(dp(12), dp(6), dp(4), dp(6));
        x.setContentDescription(Tr.t("关闭"));
        x.setOnClickListener(v -> close());
        head.addView(x);
        sheet.addView(head);

        // 选中的文字：默认三行，点一下展开
        TextView src = label(text, 14, cDim, false);
        srcView = src;
        src.setMaxLines(3);
        src.setEllipsize(TextUtils.TruncateAt.END);
        src.setLineSpacing(dp(2), 1f);
        src.setBackground(round(cField, dp(14)));
        src.setPadding(dp(14), dp(10), dp(14), dp(10));
        src.setOnClickListener(v -> {
            boolean open = src.getMaxLines() <= 3;
            src.setMaxLines(open ? 14 : 3);
            src.setEllipsize(open ? null : TextUtils.TruncateAt.END);
            if (open) src.setMovementMethod(new android.text.method.ScrollingMovementMethod());
        });
        LinearLayout.LayoutParams srcLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        srcLp.topMargin = dp(12);
        sheet.addView(src, srcLp);
        String meta = (app != null ? Tr.f("来自「{0}」", app) + "  ·  " : "") + Tr.f("{0} 字", text.length());
        TextView metaV = label(meta, 12, cHint, false);
        metaView = metaV;
        LinearLayout.LayoutParams mlp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        mlp.topMargin = dp(5); mlp.leftMargin = dp(4);
        sheet.addView(metaV, mlp);

        // 动作：横着一排，可滑
        HorizontalScrollView hs = new HorizontalScrollView(this);
        hs.setHorizontalScrollBarEnabled(false);
        hs.setClipToPadding(false);
        chipRow = new LinearLayout(this);
        for (int i = 0; i < ACTIONS.length; i++) {
            final String a = ACTIONS[i];
            TextView c = label(ICONS[i] + "  " + Tr.t(LABELS[i]), 14, cFg, false);
            c.setPadding(dp(14), dp(8), dp(14), dp(8));
            c.setOnClickListener(v -> {
                v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
                prefs.edit().putString("last", a).apply();
                start(a, null);
            });
            LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            clp.rightMargin = dp(8);
            chipRow.addView(c, clp);
            chips[i] = c;
        }
        hs.addView(chipRow);
        chipScroll = hs;
        LinearLayout.LayoutParams hsLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        hsLp.topMargin = dp(12);
        sheet.addView(hs, hsLp);

        // 回答区：可滚动，高度随内容，最多占屏幕一半多一点
        scroll = new ScrollView(this) {
            @Override protected void onMeasure(int w, int h) {
                int max = (int) (getResources().getDisplayMetrics().heightPixels * 0.5f);
                super.onMeasure(w, MeasureSpec.makeMeasureSpec(max, MeasureSpec.AT_MOST));
            }
        };
        scroll.setFillViewport(false);
        scroll.setVerticalScrollBarEnabled(false);
        turns = new LinearLayout(this);
        turns.setOrientation(LinearLayout.VERTICAL);
        turns.setPadding(0, dp(4), 0, dp(4));
        scroll.addView(turns);
        LinearLayout.LayoutParams scLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        scLp.topMargin = dp(10);
        sheet.addView(scroll, scLp);

        status = label("", 13, cHint, false);
        status.setPadding(dp(2), dp(4), 0, dp(2));
        sheet.addView(status);

        // 操作：复制 / 替换原文 / 分享 / 在 Aure 里继续 / 重来 / 停止
        HorizontalScrollView as = new HorizontalScrollView(this);
        as.setHorizontalScrollBarEnabled(false);
        actRow = new LinearLayout(this);
        actRow.setGravity(Gravity.CENTER_VERTICAL);
        btnStop = button("■  " + Tr.t("停止"), v -> stop());
        btnCopy = button("⧉  " + Tr.t("复制"), v -> copy());
        btnReplace = button("↩  " + Tr.t("替换原文"), v -> replace());
        btnShare = button("↗  " + Tr.t("分享"), v -> share());
        btnOpen = button("✦  " + Tr.t("在 Aure 里继续"), v -> openInApp());
        btnRetry = button("↻  " + Tr.t("重新生成"), v -> start(action, null));
        for (TextView t : new TextView[] { btnStop, btnCopy, btnReplace, btnShare, btnOpen, btnRetry }) {
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.rightMargin = dp(6);
            actRow.addView(t, lp);
        }
        as.addView(actRow);
        LinearLayout.LayoutParams asLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        asLp.topMargin = dp(4);
        sheet.addView(as, asLp);

        // 接着问
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setBackground(round(cField, dp(24)));
        row.setPadding(dp(16), dp(2), dp(4), dp(2));
        input = new EditText(this);
        input.setBackground(null);
        input.setHint(Tr.t("接着问…"));
        input.setHintTextColor(cHint);
        input.setTextColor(cFg);
        input.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        input.setMaxLines(4);
        input.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE | android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        input.setImeOptions(EditorInfo.IME_ACTION_SEND);
        input.setOnEditorActionListener((v, id, ev) -> {
            if (id == EditorInfo.IME_ACTION_SEND || (ev != null && ev.getKeyCode() == KeyEvent.KEYCODE_ENTER && ev.getAction() == KeyEvent.ACTION_DOWN)) { send(); return true; }
            return false;
        });
        row.addView(input, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        TextView go = label("➤", 17, Color.WHITE, true);
        go.setGravity(Gravity.CENTER);
        go.setBackground(oval(cAccent));
        go.setContentDescription(Tr.t("发送"));
        go.setAlpha(0.45f);
        go.setOnClickListener(v -> send());
        input.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void afterTextChanged(Editable s) { go.setAlpha(s.toString().trim().isEmpty() ? 0.45f : 1f); }
        });
        row.addView(go, new LinearLayout.LayoutParams(dp(40), dp(40)));
        LinearLayout.LayoutParams rlp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        rlp.topMargin = dp(8);
        sheet.addView(row, rlp);

        // 系统栏、键盘：面板底边让出来，顶上留一截别顶到状态栏
        final int padB = dp(12);
        root.setOnApplyWindowInsetsListener((v, ins) -> {
            int bottom, top;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets ime = ins.getInsets(WindowInsets.Type.ime()), bars = ins.getInsets(WindowInsets.Type.systemBars());
                bottom = Math.max(ime.bottom, bars.bottom); top = bars.top;
            } else { bottom = ins.getSystemWindowInsetBottom(); top = ins.getSystemWindowInsetTop(); }
            sheet.setPadding(dp(18), dp(8), dp(18), padB + bottom);
            ((FrameLayout.LayoutParams) sheet.getLayoutParams()).topMargin = top + dp(24);
            sheet.requestLayout();
            return ins;
        });
        showActions(false);
    }

    // ── 猜一个动作：像代码 → 解释代码；就几个词 → 解释；很长 → 总结；其余用上次选的 ─────────
    private String suggest() {
        String t = text;
        int words = t.split("\\s+").length;
        int sym = 0;
        for (int i = 0; i < t.length(); i++) if ("{};()=<>[]".indexOf(t.charAt(i)) >= 0) sym++;
        boolean code = t.contains("\n") && (sym > t.length() * 0.035f
            || t.matches("(?s).*(\\bfunction\\b|\\bdef \\w+\\(|\\bclass \\w+|\\bimport \\w|\\bpublic \\w|\\bconst \\w+ =|\\blet \\w+ =|#include|=>|\\breturn\\b).*"));
        if (code) return "code";
        if (words <= 3) return "explain";
        if (words > 160) return "summarize";
        String last = prefs.getString("last", "explain");
        for (String a : ACTIONS) if (a.equals(last)) return last;
        return "explain";
    }

    // ── 起一轮：a 是动作；question 不为空就是接着问（有会话号）或者直接提问 ───────────────
    private void start(String a, String question) {
        cancel();
        final int my = ++gen;
        final boolean follow = question != null && sid != null;
        if (!follow) {
            action = a;
            sid = null;
            turns.removeAllViews();
            for (int i = 0; i < ACTIONS.length; i++) styleChip(chips[i], ACTIONS[i].equals(a) && question == null);
        }
        if (question != null) addQuestion(question);
        answer = "";
        answerView = label("", 15, cFg, false);
        answerView.setLineSpacing(dp(3), 1f);
        answerView.setTextIsSelectable(true);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(turns.getChildCount() == 0 ? 2 : 10);
        turns.addView(answerView, lp);
        running = true;
        setStatus(Tr.t("Aure 正在想…"));
        showActions(false);
        final JSONObject body = new JSONObject();
        try {
            if (follow) { body.put("sessionId", sid); body.put("question", question); body.put("action", "ask"); }
            else { body.put("text", text); body.put("action", question != null ? "ask" : a); if (question != null) body.put("question", question); }
            if (app != null) body.put("app", app);
        } catch (Exception ignored) {}
        new Thread(() -> run(my, body), "ask").start();
    }

    private void run(int my, JSONObject body) {
        try {
            if (!Env.proveGateway()) {
                if (!new Env(this).devkitReady()) { post(my, this::needSetup); return; }
                post(my, () -> setStatus(Tr.t("正在启动 Aure…")));
                GatewayService.start(this);
                long t0 = System.currentTimeMillis();
                while (!Env.proveGateway()) {
                    if (my != gen) return;
                    if (System.currentTimeMillis() - t0 > 60000) { post(my, () -> fail(Tr.t("网关没在规定时间内启动，稍后再试。"))); return; }
                    Thread.sleep(500);
                }
                post(my, () -> setStatus(Tr.t("Aure 正在想…")));
            }
            byte[] data = body.toString().getBytes(StandardCharsets.UTF_8);
            HttpURLConnection c = Env.gateway("POST", "/api/ask", data);
            conn = c;
            c.setDoOutput(true);
            c.setConnectTimeout(4000);
            c.setReadTimeout(90000);                       // 网关每 10 秒一行心跳
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            c.setRequestProperty("X-CC-Lang", Tr.lang());
            c.setFixedLengthStreamingMode(data.length);
            try (OutputStream o = c.getOutputStream()) { o.write(data); }
            int code = c.getResponseCode();
            if (code != 200) {
                String msg = "HTTP " + code;
                try (InputStream es = c.getErrorStream()) {
                    if (es != null) { JSONObject j = new JSONObject(readAll(es)); msg = j.optString("message", j.optString("error", msg)); }
                } catch (Exception ignored) {}
                final String m = msg;
                post(my, () -> fail(m));
                return;
            }
            try (BufferedReader br = new BufferedReader(new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8))) {
                for (String line; (line = br.readLine()) != null; ) {
                    if (my != gen) return;
                    if (line.isEmpty()) continue;
                    final JSONObject ev = new JSONObject(line);
                    post(my, () -> onEvent(ev));
                    if ("end".equals(ev.optString("t"))) break;
                }
            }
            post(my, () -> { if (running) finishTurn(false); });
        } catch (Exception e) {
            if (my != gen) return;
            final String m = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            post(my, () -> fail(Tr.f("连不上 Aure 的网关：{0}", m)));
        } finally {
            HttpURLConnection c = conn;
            if (c != null && my == gen) conn = null;
        }
    }

    private void onEvent(JSONObject ev) {
        switch (ev.optString("t")) {
            case "queued": setStatus(Tr.t("在排队，前面还有别的任务…")); break;
            case "start": case "think": setStatus(Tr.t("Aure 正在想…")); break;
            case "sid": sid = ev.optString("sid", sid); break;
            case "d":
                answer += ev.optString("s");
                if (status.getTag() != null) setStatus(null);
                scheduleRender();
                break;
            case "err": fail(ev.optString("m")); break;
            case "end":
                if (!ev.optString("sid").isEmpty()) sid = ev.optString("sid");
                if (answer.isEmpty() && !ev.optString("text").isEmpty()) answer = ev.optString("text");
                finishTurn(ev.optBoolean("aborted"));
                break;
            default: break;
        }
    }

    private void finishTurn(boolean aborted) {
        running = false;
        renderNow();
        if (aborted) setStatus(Tr.t("已停止"));
        else if (answer.trim().isEmpty()) setStatus(Tr.t("没有回答"));
        else setStatus(null);
        showActions(true);
    }

    private void fail(String msg) {
        running = false;
        if (answerView != null && answer.isEmpty()) turns.removeView(answerView);
        renderNow();
        setStatus(null);
        TextView e = label(Tr.f("出错了：{0}", msg), 14, Color.parseColor(dark ? "#f2a69b" : "#b3261e"), false);
        e.setBackground(round(withAlpha(Color.parseColor("#e5484d"), dark ? 0x22 : 0x14), dp(12)));
        e.setPadding(dp(12), dp(10), dp(12), dp(10));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(8);
        turns.addView(e, lp);
        showActions(true);
        scrollEnd();
    }

    private void needSetup() {
        running = false;
        turns.removeAllViews();
        setStatus(null);
        TextView m = label(Tr.t("Aure Code 还没装好：先打开应用完成首次设置。"), 15, cFg, false);
        turns.addView(m);
        TextView open = button(Tr.t("打开 Aure Code"), v -> {
            startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            finish();
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(10);
        turns.addView(open, lp);
        actRow.setVisibility(View.GONE);
    }

    private void addQuestion(String q) {
        TextView t = label(q, 14, cFg, false);
        t.setBackground(round(withAlpha(cAccent, dark ? 0x33 : 0x1f), dp(16)));
        t.setPadding(dp(14), dp(8), dp(14), dp(8));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.gravity = Gravity.END; lp.topMargin = dp(14); lp.leftMargin = dp(40);
        turns.addView(t, lp);
    }

    private void send() {
        String q = input.getText().toString().trim();
        if (q.isEmpty()) return;
        input.setText("");
        InputMethodManager im = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        if (im != null) im.hideSoftInputFromWindow(input.getWindowToken(), 0);
        start(action, q);
    }

    private void stop() {
        if (!running) return;
        cancel();
        finishTurn(true);
    }

    /** 断开当前连接（网关见连接断了就停那一轮），并让旧线程的输出作废 */
    private void cancel() {
        gen++;
        final HttpURLConnection c = conn;
        conn = null;
        if (c != null) new Thread(c::disconnect, "ask-cancel").start();
        ui.removeCallbacks(render);
        running = false;
    }

    // ── 结果的去处 ─────────────────────────────────────────────────────
    private String plain() { return md(answer).toString().trim(); }

    private void copy() {
        ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (cm == null || answer.isEmpty()) return;
        cm.setPrimaryClip(ClipData.newPlainText("Aure", plain()));
        if (Build.VERSION.SDK_INT < 33) Toast.makeText(this, Tr.t("已复制"), Toast.LENGTH_SHORT).show();   // 13+ 系统自己会提示
    }

    private void replace() {
        if (readOnly || answer.isEmpty()) return;
        setResult(RESULT_OK, new Intent().putExtra(Intent.EXTRA_PROCESS_TEXT, plain()));
        finish();
    }

    private void share() {
        if (answer.isEmpty()) return;
        Intent s = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, plain());
        startActivity(Intent.createChooser(s, Tr.t("分享")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    }

    private void openInApp() {
        if (sid == null) return;
        Intent i = MainActivity.internal(this, Notify.ACTION_OPEN).putExtra("session", sid)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(i);
        finish();
    }

    private void close() {
        cancel();
        sheet.animate().translationY(sheet.getHeight() + dp(40)).setDuration(180).withEndAction(this::finish).start();
    }

    @Override public void onBackPressed() { close(); }
    @Override protected void onDestroy() { cancel(); ui.removeCallbacksAndMessages(null); super.onDestroy(); }
    @Override public void finish() { super.finish(); overridePendingTransition(0, 0); }

    // ── 显示 ────────────────────────────────────────────────────────
    private void showActions(boolean done) {
        boolean has = done && !answer.trim().isEmpty();
        btnStop.setVisibility(running ? View.VISIBLE : View.GONE);
        btnCopy.setVisibility(has ? View.VISIBLE : View.GONE);
        btnReplace.setVisibility(has && !readOnly ? View.VISIBLE : View.GONE);
        btnShare.setVisibility(has ? View.VISIBLE : View.GONE);
        btnOpen.setVisibility(done && sid != null ? View.VISIBLE : View.GONE);
        btnRetry.setVisibility(done && action != null ? View.VISIBLE : View.GONE);
        // 「替换原文」最常用（改写、翻译后）：放最前，用强调色
        if (has && !readOnly) styleAction(btnReplace, true);
    }

    private void setStatus(String s) {
        ui.removeCallbacks(tick);
        if (s != null && running) s = s.replaceAll("[….]+$", "");   // 省略号由下面的动画自己画
        status.setTag(s);
        status.setText(s == null ? "" : s);
        status.setVisibility(s == null ? View.GONE : View.VISIBLE);
        if (s != null && running) { dots = 0; ui.postDelayed(tick, 420); }
    }

    private void scheduleRender() {
        long now = System.currentTimeMillis();
        ui.removeCallbacks(render);
        if (now - lastRender > 70) renderNow(); else ui.postDelayed(render, 70);
    }

    private void renderNow() {
        lastRender = System.currentTimeMillis();
        if (answerView == null) return;
        boolean atEnd = scroll.getChildCount() == 0 || scroll.getScrollY() + scroll.getHeight() >= turns.getHeight() - dp(48);
        answerView.setText(md(answer + (running && !answer.isEmpty() ? " ▍" : "")));
        if (atEnd) scrollEnd();
    }

    private void scrollEnd() { scroll.post(() -> scroll.smoothScrollTo(0, turns.getHeight())); }

    private void styleChip(TextView c, boolean on) {
        c.setBackground(on ? round(cAccent, dp(18)) : stroke(cLine, dp(18)));
        c.setTextColor(on ? Color.WHITE : cFg);
        c.setTypeface(Typeface.DEFAULT, on ? Typeface.BOLD : Typeface.NORMAL);
    }

    private TextView button(String s, View.OnClickListener l) {
        TextView t = label(s, 13, cFg, false);
        t.setPadding(dp(12), dp(7), dp(12), dp(7));
        styleAction(t, false);
        t.setOnClickListener(v -> { v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP); l.onClick(v); });
        return t;
    }

    private void styleAction(TextView t, boolean primary) {
        t.setBackground(primary ? round(withAlpha(cAccent, dark ? 0x40 : 0x26), dp(16)) : round(cField, dp(16)));
        t.setTextColor(primary ? cAccent : cFg);
    }

    // ── 极简 Markdown：标题、粗体、斜体、行内代码、代码块、列表、引用、链接（只留文字）──────────
    private CharSequence md(String src) {
        SpannableStringBuilder sb = new SpannableStringBuilder();
        String[] lines = src.split("\n", -1);
        boolean inCode = false;
        int codeStart = 0;
        int codeBg = withAlpha(cFg, dark ? 0x1c : 0x10);
        for (String line : lines) {
            String tl = line.trim();
            if (tl.startsWith("```")) {
                if (!inCode) { inCode = true; codeStart = sb.length(); }
                else { inCode = false; codeSpan(sb, codeStart, sb.length(), codeBg); }
                continue;
            }
            if (inCode) { sb.append(line).append('\n'); continue; }
            java.util.regex.Matcher m;
            int s0 = sb.length();
            if ((m = java.util.regex.Pattern.compile("^(#{1,6})\\s+(.*)$").matcher(tl)).matches()) {
                inline(sb, m.group(2), codeBg);
                sb.setSpan(new StyleSpan(Typeface.BOLD), s0, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                sb.setSpan(new RelativeSizeSpan(m.group(1).length() <= 2 ? 1.14f : 1.05f), s0, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            } else if ((m = java.util.regex.Pattern.compile("^(\\s*)[-*•+]\\s+(.*)$").matcher(line)).matches()) {
                int lvl = Math.min(3, m.group(1).replace("\t", "  ").length() / 2);
                sb.append("•  ");
                inline(sb, m.group(2), codeBg);
                sb.setSpan(new LeadingMarginSpan.Standard(dp(6 + 16 * lvl), dp(20 + 16 * lvl)), s0, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            } else if ((m = java.util.regex.Pattern.compile("^(\\s*)(\\d+)[.)]\\s+(.*)$").matcher(line)).matches()) {
                int lvl = Math.min(3, m.group(1).length() / 2);
                sb.append(m.group(2)).append(".  ");
                inline(sb, m.group(3), codeBg);
                sb.setSpan(new LeadingMarginSpan.Standard(dp(4 + 16 * lvl), dp(22 + 16 * lvl)), s0, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            } else if (tl.startsWith(">")) {
                inline(sb, tl.replaceFirst("^>\\s?", ""), codeBg);
                sb.setSpan(new QuoteSpan(cAccent), s0, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                sb.setSpan(new ForegroundColorSpan(cDim), s0, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            } else if (tl.matches("^(-{3,}|\\*{3,}|_{3,})$")) {
                sb.append("────────");
                sb.setSpan(new ForegroundColorSpan(cLine), s0, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            } else {
                inline(sb, line, codeBg);
            }
            sb.append('\n');
        }
        if (inCode) codeSpan(sb, codeStart, sb.length(), codeBg);       // 还在流式输出、代码块没收尾
        while (sb.length() > 0 && sb.charAt(sb.length() - 1) == '\n') sb.delete(sb.length() - 1, sb.length());
        return sb;
    }

    private void codeSpan(SpannableStringBuilder sb, int a, int b, int bg) {
        if (b <= a) return;
        sb.setSpan(new TypefaceSpan("monospace"), a, b, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        sb.setSpan(new BackgroundColorSpan(bg), a, b, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        sb.setSpan(new RelativeSizeSpan(0.9f), a, b, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
    }

    private void inline(SpannableStringBuilder sb, String s, int codeBg) {
        int n = s.length();
        for (int i = 0; i < n; ) {
            char ch = s.charAt(i);
            if (ch == '*' && i + 1 < n && s.charAt(i + 1) == '*') {
                int j = s.indexOf("**", i + 2);
                if (j > i + 2) { int a = sb.length(); sb.append(s, i + 2, j); sb.setSpan(new StyleSpan(Typeface.BOLD), a, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE); i = j + 2; continue; }
            } else if (ch == '`') {
                int j = s.indexOf('`', i + 1);
                if (j > i + 1) { int a = sb.length(); sb.append(s, i + 1, j); codeSpan(sb, a, sb.length(), codeBg); i = j + 1; continue; }
            } else if (ch == '*' && i + 1 < n && s.charAt(i + 1) != ' ') {
                int j = s.indexOf('*', i + 1);
                if (j > i + 1 && s.charAt(j - 1) != ' ') { int a = sb.length(); sb.append(s, i + 1, j); sb.setSpan(new StyleSpan(Typeface.ITALIC), a, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE); i = j + 1; continue; }
            } else if (ch == '[') {
                int k = s.indexOf("](", i + 1), e = k > 0 ? s.indexOf(')', k + 2) : -1;
                if (k > i + 1 && e > k) {
                    int a = sb.length(); sb.append(s, i + 1, k);
                    sb.setSpan(new UnderlineSpan(), a, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                    sb.setSpan(new ForegroundColorSpan(cAccent), a, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                    i = e + 1; continue;
                }
            }
            sb.append(ch);
            i++;
        }
    }

    // ── 小工具 ───────────────────────────────────────────────────────
    /** 往下拖标题栏一段就关；拖得不够就弹回去 */
    private final class DragToClose implements View.OnTouchListener {
        private float y0;
        private boolean drag;
        @Override public boolean onTouch(View v, MotionEvent e) {
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN: y0 = e.getRawY(); drag = false; return true;
                case MotionEvent.ACTION_MOVE: {
                    float dy = e.getRawY() - y0;
                    if (dy > dp(6)) drag = true;
                    if (drag) sheet.setTranslationY(Math.max(0, dy));
                    return true;
                }
                case MotionEvent.ACTION_UP: case MotionEvent.ACTION_CANCEL:
                    if (drag && sheet.getTranslationY() > dp(110)) close();
                    else sheet.animate().translationY(0).setDuration(160).start();
                    return true;
                default: return false;
            }
        }
    }

    private void post(int my, Runnable r) { ui.post(() -> { if (my == gen && !isFinishing()) r.run(); }); }

    private String callerLabel() {
        try {
            String pkg = getCallingPackage();
            if (pkg == null && getReferrer() != null && "android-app".equals(getReferrer().getScheme())) pkg = getReferrer().getHost();
            if (pkg == null || pkg.equals(getPackageName())) return null;
            android.content.pm.PackageManager pm = getPackageManager();
            return String.valueOf(pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)));
        } catch (Exception e) { return null; }
    }

    private static String readAll(InputStream in) throws java.io.IOException {
        java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
        byte[] b = new byte[8192];
        for (int k; (k = in.read(b)) > 0 && bo.size() < (1 << 20); ) bo.write(b, 0, k);
        return new String(bo.toByteArray(), StandardCharsets.UTF_8);
    }

    private TextView label(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }
    private GradientDrawable round(int color, int radius) { GradientDrawable g = new GradientDrawable(); g.setColor(color); g.setCornerRadius(radius); return g; }
    private GradientDrawable stroke(int color, int radius) { GradientDrawable g = new GradientDrawable(); g.setColor(Color.TRANSPARENT); g.setStroke(dp(1), color); g.setCornerRadius(radius); return g; }
    private GradientDrawable oval(int color) { GradientDrawable g = new GradientDrawable(); g.setShape(GradientDrawable.OVAL); g.setColor(color); return g; }
    private static int withAlpha(int c, int a) { return (c & 0x00ffffff) | (a << 24); }
    private int dp(float v) { return Math.round(v * getResources().getDisplayMetrics().density); }
}
