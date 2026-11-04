package cc.codtest;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

/**
 * 快捷设置里的「Tanya Aure」磁贴。WhatsApp、微信这类应用的聊天气泡不走系统的文字选择菜单，
 * 「选中 → Tanya Aure」用不上；先长按复制，再下拉点这块磁贴，AskActivity 就拿剪贴板里的文字来问。
 * 锁屏时先解锁再打开（剪贴板里的东西不该在锁屏上露出来）。
 */
public final class AskTile extends TileService {
    @Override public void onStartListening() {
        Tile t = getQsTile();
        if (t == null) return;
        Tr.init(this);
        t.setState(Tile.STATE_INACTIVE);
        t.setLabel(Tr.t("问 Aure"));
        if (Build.VERSION.SDK_INT >= 29) t.setSubtitle(Tr.t("剪贴板里的文字"));
        t.updateTile();
    }

    @Override public void onClick() {
        if (isLocked()) unlockAndRun(this::open); else open();
    }

    private void open() {
        // 带上应用自己的口令：AskActivity 认出是自己的磁贴，读到剪贴板就直接开问（别的应用叫起它时得用户先点一个动作）
        Intent i = new Intent(this, AskActivity.class).setAction(AskActivity.ACTION_CLIP).putExtra(MainActivity.IK, MainActivity.intentKey(this))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        if (Build.VERSION.SDK_INT >= 34) {
            startActivityAndCollapse(PendingIntent.getActivity(this, 7, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        } else {
            startActivityAndCollapse(i);
        }
    }
}
