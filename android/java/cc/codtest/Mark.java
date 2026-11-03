package cc.codtest;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PathMeasure;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.view.View;

/**
 * Aure Code 的标识：夜空底的圆角方块，一颗白色四角星，下面两道极光（绿 → 青 → 紫），跟启动图标、网页首屏的标识同形。
 *
 * 动画：两道极光从左往右划出来（约 0.8 秒），星星随后弹出；之后一直等着的话，星星慢慢闪烁（表示还在忙）。
 * finish() 让星星回到全亮、整个标识收一点再淡出，结束后回调 —— 交给网页之前用。
 * 全部在 onDraw 里按时间算，不用 Animator，postInvalidateOnAnimation 驱动；看不见（GONE、窗口在后台）时系统不会调 onDraw，也就不耗电。
 */
final class Mark extends View {
    // 48 单位见方的设计稿（和启动图标同一个图形），方块圆角 11
    private static final float RADIUS = 11f;
    private static final int SKY_TOP = 0xFF0B1226, SKY_BOTTOM = 0xFF2A1B5E;
    private static final int[] AURORA = { 0xFF34D399, 0xFF22D3EE, 0xFFA78BFA };
    private final Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG), glow = new Paint(Paint.ANTI_ALIAS_FLAG),
            band = new Paint(Paint.ANTI_ALIAS_FLAG), star = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF box = new RectF();
    private final Path band1 = new Path(), band2 = new Path(), starPath = new Path(), part = new Path();
    private final PathMeasure m1, m2;
    private Shader shader;
    private int shaderKey;
    private long t0 = -1, fin = -1;
    private Runnable onDone;
    private boolean loop = true;

    /** fg / dotColor 是旧标识（随外观换色的三道弧）的参数；新标识颜色固定，保留签名免得改所有调用处 */
    Mark(Context c, int fg, int dotColor) {
        super(c);
        band.setStyle(Paint.Style.STROKE);
        band.setStrokeCap(Paint.Cap.ROUND);
        band.setShader(new LinearGradient(6f, 0, 42f, 0, AURORA, null, Shader.TileMode.CLAMP));
        star.setStyle(Paint.Style.FILL);
        star.setColor(Color.WHITE);
        glow.setShader(new RadialGradient(24f, 17f, 13f, 0x8CC4B5FD, 0x00C4B5FD, Shader.TileMode.CLAMP));
        band1.moveTo(6f, 30.5f);
        band1.cubicTo(15f, 21f, 26f, 33f, 42f, 19.5f);
        band2.moveTo(6f, 36f);
        band2.cubicTo(14f, 27f, 25f, 39f, 42f, 26f);
        m1 = new PathMeasure(band1, false);
        m2 = new PathMeasure(band2, false);
        starPath.moveTo(24f, 7f);
        starPath.quadTo(25.5f, 15.5f, 34f, 17f);
        starPath.quadTo(25.5f, 18.5f, 24f, 27f);
        starPath.quadTo(22.5f, 18.5f, 14f, 17f);
        starPath.quadTo(22.5f, 15.5f, 24f, 7f);
        starPath.close();
    }

    /** 当前外观下的强调点颜色（其他地方还在用） */
    static int dotColor(Context c, boolean night) {
        String skin = c.getSharedPreferences("ui", Context.MODE_PRIVATE).getString("skin", "native");
        boolean own = !c.getSharedPreferences("ui", Context.MODE_PRIVATE).getString(night ? "accent_dark" : "accent_light", "").isEmpty();
        if ("zhuyue".equals(skin) && !own) return Color.parseColor(night ? "#3a8ef6" : "#2b80f7");
        return BrowserPane.pal(c, night, "accent");
    }

    /** 只画一遍进场就停（星星不闪） */
    Mark once() { loop = false; return this; }

    /** 收尾：星星回到全亮，收缩淡出，完了调 done（主线程） */
    void finish(Runnable done) {
        if (fin >= 0) return;
        onDone = done;
        fin = now();
        postInvalidateOnAnimation();
    }

    private static long now() { return android.os.SystemClock.uptimeMillis(); }
    private static float clamp(float x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
    private static float ease(float x) { x = clamp(x); float y = 1 - x; return 1 - y * y * y; }
    /** 弹出：略冲过头再回到 1 */
    private static float pop(float x) { x = clamp(x); float y = x - 1; return 1 + 2.2f * y * y * y + 1.2f * y * y; }

    private void drawBand(Canvas c, PathMeasure m, float k, float width, int alpha) {
        if (k <= 0.01f) return;      // k = 0 时不画（圆头线帽会留下一个点）
        part.reset();
        m.getSegment(0, m.getLength() * k, part, true);
        band.setStrokeWidth(width);
        band.setAlpha(alpha);
        c.drawPath(part, band);
    }

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

        // 底：夜空渐变圆角方块（渐变只在尺寸变了时重建）
        int key = getWidth() * 31 + getHeight();
        if (shader == null || key != shaderKey) {
            shader = new LinearGradient(0, oy, 0, oy + 48f * s, SKY_TOP, SKY_BOTTOM, Shader.TileMode.CLAMP);
            shaderKey = key;
        }
        bg.setShader(shader);
        bg.setAlpha(alphaAll);
        box.set(ox, oy, ox + 48f * s, oy + 48f * s);
        c.drawRoundRect(box, RADIUS * s, RADIUS * s, bg);

        // 图形按 48 单位的设计稿坐标画
        c.save();
        c.translate(ox, oy);
        c.scale(s, s);
        // 极光：上面那道先划，下面那道晚 0.15 秒、淡一些
        float k1 = fin >= 0 ? 1 : ease(t / 700f), k2 = fin >= 0 ? 1 : ease((t - 150) / 700f);
        drawBand(c, m2, k2, 3.4f, (int) (alphaAll * 0.55f));
        drawBand(c, m1, k1, 3.6f, alphaAll);
        // 星星：极光划到一半时弹出；一直等着时慢慢闪（1.4 秒一个来回，最暗留四成，光晕跟着呼吸），收尾时回到全亮
        float u = fin >= 0 ? 1 : clamp((t - 450) / 380f);
        if (u > 0) {
            float twinkle = 1;
            if (loop && fin < 0 && t > 1000) twinkle = 0.4f + 0.6f * (0.5f + 0.5f * (float) Math.cos((t - 1000) / 1400f * 2 * Math.PI));
            glow.setAlpha((int) (alphaAll * u * twinkle));
            c.drawCircle(24f, 17f, 13f, glow);
            float z = fin >= 0 ? 1 : pop(u);
            c.save();
            c.scale(z, z, 24f, 17f);
            star.setAlpha((int) (alphaAll * Math.min(1f, u * 1.6f) * (0.55f + 0.45f * twinkle)));
            c.drawPath(starPath, star);
            c.restore();
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
