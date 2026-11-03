package cc.codtest;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PathMeasure;
import android.graphics.RectF;
import android.graphics.Shader;
import android.view.View;

/**
 * Aure Code 的标识：极光渐变（紫 → 青）的圆角方块，里面一个白色的终端提示符 ">_"，跟启动图标、网页首屏的标识同形。
 *
 * 动画：">" 先写出来（约 0.7 秒），随后 "_" 光标淡入；之后一直等着的话，光标慢慢闪烁（表示还在忙）。
 * finish() 让 ">" 和光标回到全亮、整个标识收一点再淡出，结束后回调 —— 交给网页之前用。
 * 全部在 onDraw 里按时间算，不用 Animator，postInvalidateOnAnimation 驱动；看不见（GONE、窗口在后台）时系统不会调 onDraw，也就不耗电。
 */
final class Mark extends View {
    // 48 单位见方的设计稿（和启动图标同一个图形）：">" 三个点，"_" 从 (30.9, 33.4) 到 (35.6, 33.4)，线宽 4.3，方块圆角 9
    private static final float STROKE = 4.3f, RADIUS = 9f;
    private static final int TOP = 0xFF6D28D9, BOTTOM = 0xFF0EA5E9;
    private final Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG), pen = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF box = new RectF();
    private final Path chev = new Path(), part = new Path();
    private final PathMeasure measure;
    private Shader shader;
    private int shaderKey;
    private long t0 = -1, fin = -1;
    private Runnable onDone;
    private boolean loop = true;

    /** fg / dotColor 是旧标识（随外观换色的三道弧）的参数；新标识颜色固定，保留签名免得改所有调用处 */
    Mark(Context c, int fg, int dotColor) {
        super(c);
        pen.setStyle(Paint.Style.STROKE);
        pen.setStrokeCap(Paint.Cap.ROUND);
        pen.setStrokeJoin(Paint.Join.ROUND);
        pen.setStrokeWidth(STROKE);
        pen.setColor(Color.WHITE);
        chev.moveTo(17.4f, 14.6f);
        chev.lineTo(27.75f, 24f);
        chev.lineTo(17.4f, 33.4f);
        measure = new PathMeasure(chev, false);
    }

    /** 当前外观下的强调点颜色（其他地方还在用） */
    static int dotColor(Context c, boolean night) {
        String skin = c.getSharedPreferences("ui", Context.MODE_PRIVATE).getString("skin", "native");
        boolean own = !c.getSharedPreferences("ui", Context.MODE_PRIVATE).getString(night ? "accent_dark" : "accent_light", "").isEmpty();
        if ("zhuyue".equals(skin) && !own) return Color.parseColor(night ? "#3a8ef6" : "#2b80f7");
        return BrowserPane.pal(c, night, "accent");
    }

    /** 只画一遍进场就停（光标不闪） */
    Mark once() { loop = false; return this; }

    /** 收尾：">" 和光标回到全亮，收缩淡出，完了调 done（主线程） */
    void finish(Runnable done) {
        if (fin >= 0) return;
        onDone = done;
        fin = now();
        postInvalidateOnAnimation();
    }

    private static long now() { return android.os.SystemClock.uptimeMillis(); }
    private static float clamp(float x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
    private static float ease(float x) { x = clamp(x); float y = 1 - x; return 1 - y * y * y; }

    @Override protected void onDraw(Canvas c) {
        long n = now();
        if (t0 < 0) t0 = n;
        float t = n - t0;
        float s = Math.min(getWidth(), getHeight()) / 48f;
        float cx = getWidth() / 2f, cy = getHeight() / 2f;
        float ox = cx - 24f * s, oy = cy - 24f * s;
        float out = fin < 0 ? 0 : clamp((n - fin) / 260f);
        int alphaAll = (int) (255 * (1 - out));
        c.save();
        float sc = 1 - 0.12f * ease(out);
        c.scale(sc, sc, cx, cy);

        // 底：极光渐变圆角方块（渐变只在尺寸变了时重建）
        int key = getWidth() * 31 + getHeight();
        if (shader == null || key != shaderKey) {
            shader = new LinearGradient(0, oy, 0, oy + 48f * s, TOP, BOTTOM, Shader.TileMode.CLAMP);
            shaderKey = key;
        }
        bg.setShader(shader);
        bg.setAlpha(alphaAll);
        box.set(ox, oy, ox + 48f * s, oy + 48f * s);
        c.drawRoundRect(box, RADIUS * s, RADIUS * s, bg);

        // 字形按 48 单位的设计稿坐标画
        c.save();
        c.translate(ox, oy);
        c.scale(s, s);
        // ">"：从上端起笔写到下端。k = 0 时不画（圆头线帽会留下一个点）
        float k = fin >= 0 ? 1 : ease(t / 700f);
        if (k > 0.01f) {
            part.reset();
            measure.getSegment(0, measure.getLength() * k, part, true);
            pen.setAlpha(alphaAll);
            c.drawPath(part, pen);
        }
        // "_"：">" 写完后淡入；一直等着时慢慢闪（1.1 秒一个来回，最暗留三成），收尾时回到全亮
        float u = fin >= 0 ? 1 : ease((t - 600) / 200f);
        if (u > 0) {
            float blink = 1;
            if (loop && fin < 0 && t > 900) blink = 0.3f + 0.7f * (0.5f + 0.5f * (float) Math.cos((t - 900) / 1100f * 2 * Math.PI));
            pen.setAlpha((int) (alphaAll * u * blink));
            c.drawLine(30.9f, 33.4f, 35.6f, 33.4f, pen);
        }
        c.restore();
        c.restore();

        if (fin >= 0 && out >= 1) {
            Runnable r = onDone; onDone = null;
            if (r != null) r.run();
            return;
        }
        if (loop || fin >= 0 || t < 1200) postInvalidateOnAnimation();
    }
}
