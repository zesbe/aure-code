import { log, L3 } from "./config.mjs";
import { SETTINGS, saveSettings } from "./settings-store.mjs";
import { PROVIDER, providerById } from "./providers.mjs";
import { effortLevelsOf, fetchModels, normEffort } from "./models.mjs";
import { effectiveAutoCompact } from "./stream.mjs";
import { effectiveModel, setSessModel } from "./sessmodel.mjs";

// ── /model 与 /effort：由网关本地处理 ─────────────────────────────────
// 为什么不让 claude 自己处理：它自带的 /model 只改「当前会话」，
// 而 GUI 每次调用都是新进程 —— 下一条消息就忘了。所以由网关记：
// 0.3.16 起：在会话里打 → 只改这个会话（sid）；新会话里打（还没会话号）→ 改全局默认。
export async function handleLocalCommand(name, arg, reply, sid) {
  // 清单、档位、校验都按这个会话真跑的那家：钉的 → 项目默认 → 全局（和 run.mjs、/api/models 同一套，#78）
  const now = effectiveModel(sid);
  const P = providerById(now.provider) || PROVIDER;
  const models = await fetchModels(false, P);   // 只是读清单：走 10 分钟缓存，项目那家清单地址慢时别每次干等
  const curId = now.model, curEff = now.effort;
  // 只认同名的：指定的型号不在清单里就当不知道窗口，别借默认或第一项的（#82）；没指定才按那家默认 / 第一项
  const want = curId || P.defaultModel;
  const cur = want ? models.find((m) => m.id === want) : models[0];
  const commit = (patch) => {
    if (sid) return setSessModel(sid, patch);
    if (patch.model !== undefined) SETTINGS.model = patch.model || null;
    if (patch.effort !== undefined) SETTINGS.effort = patch.effort || null;
    saveSettings();
  };
  const scope = sid ? L3("（只改这个会话）", " (this session only)", " (hanya sesi ini)") : L3("（改的是全局默认）", " (global default)", " (bawaan global)");

  // ── /autocompact ──
  // 交给 claude 自己处理的话：它写进 ~/.claude/settings.json，但我们下发的 CLAUDE_CODE_AUTO_COMPACT_WINDOW
  // 优先级更高（它会说 "env is set and takes precedence"），界面上的压缩线也要切一次模型才刷新。
  // 所以由网关接住：存进设置（和设置页那一栏是同一个值），下一轮起生效，前端收到 run_end 就刷新刻度。
  if (name === "autocompact") {
    const win = Number(cur && cur.context_window) || 0;
    const fmt = (n) => (n >= 1e6 ? +(n / 1e6).toFixed(2) + "M" : Math.round(n / 1000) + "k");
    if (!arg) {
      const v = effectiveAutoCompact();
      return reply(
        L3(
          `自动压缩线：**${v ? fmt(v) + " tokens" : "默认（由 claude 按模型窗口决定）"}**${win ? `　（当前模型窗口 ${fmt(win)}）` : ""}\n\n` +
          "用法：`/autocompact 400k`、`/autocompact 1m`；恢复默认：`/autocompact off`。设置页「自动压缩」一栏是同一个值。",
          `Auto-compact threshold: **${v ? fmt(v) + " tokens" : "default (claude decides from the model window)"}**${win ? ` (current model window ${fmt(win)})` : ""}\n\n` +
          "Usage: `/autocompact 400k`, `/autocompact 1m`; reset: `/autocompact off`. The \"Auto-compact\" field in Settings is the same value.",
          `Batas padat otomatis: **${v ? fmt(v) + " token" : "bawaan (claude menentukan dari jendela model)"}**${win ? ` (jendela model saat ini ${fmt(win)})` : ""}\n\n` +
          "Pemakaian: `/autocompact 400k`, `/autocompact 1m`; kembali ke bawaan: `/autocompact off`. Kolom \"Padat otomatis\" di Setelan adalah nilai yang sama."),
        "autocompact"
      );
    }
    const a = arg.trim().toLowerCase();
    let n = null;
    if (!/^(off|default|reset|auto|0)$/.test(a)) {
      const m = a.match(/^(\d+(?:\.\d+)?)\s*([km]?)$/);
      if (!m) return reply(L3(`看不懂 \`${arg.trim()}\`。写成 \`400k\`、\`1m\` 或纯数字；恢复默认用 \`off\`。`, `Can't read \`${arg.trim()}\`. Write \`400k\`, \`1m\` or a plain number; use \`off\` to reset.`, `Tidak dipahami: \`${arg.trim()}\`. Tulis \`400k\`, \`1m\`, atau angka biasa; pakai \`off\` untuk kembali ke bawaan.`), "autocompact");
      n = Math.round(Number(m[1]) * (m[2] === "m" ? 1e6 : m[2] === "k" ? 1e3 : 1));
      if (n < 10000) return reply(L3(`${fmt(n)} 太小了，压缩线至少 10k。`, `${fmt(n)} is too small; the threshold must be at least 10k.`, `${fmt(n)} terlalu kecil; batasnya minimal 10k.`), "autocompact");
    }
    SETTINGS.autoCompactWindow = n;
    saveSettings();
    log(`⌘ /autocompact → ${n || "(默认)"}`);
    return reply(
      (n ? L3(`自动压缩线已设为 **${fmt(n)} tokens**，下一轮起生效。`, `Auto-compact threshold set to **${fmt(n)} tokens**, effective from the next turn.`, `Batas padat otomatis diatur ke **${fmt(n)} token**, berlaku mulai giliran berikutnya.`)
         : L3("自动压缩线已恢复默认（由 claude 按模型窗口决定），下一轮起生效。", "Auto-compact threshold reset to default (claude decides from the model window), effective from the next turn.", "Batas padat otomatis kembali ke bawaan (claude menentukan dari jendela model), berlaku mulai giliran berikutnya.")) +
      (n && win && n > win ? L3(`\n\n> **注意**：比当前模型的窗口（${fmt(win)}）还大，实际会先撞上窗口上限。`, `\n\n> **Note**: larger than the current model window (${fmt(win)}); the window limit will be hit first.`, `\n\n> **Catatan**: lebih besar dari jendela model saat ini (${fmt(win)}); batas jendela akan tercapai lebih dulu.`) : ""),
      "autocompact"
    );
  }

  // ── /model ──
  if (name === "model" || name === "models") {
    if (!arg) {
      // 原生厂商（claude 自己认识模型）：不列清单，也不劝你手选
      if (!models.length) {
        return reply(
          L3(`当前厂商：**${P.label || P.id}**（claude 原生）\n\n` +
          `> 该厂商由 claude 自己决定模型，未提供可切换的模型清单 —— \`/model\` 在此不适用。\n` +
          `> 若要指定，可直接写进 \`ccapp-providers.json\` 的 \`defaultModel\`。`,
          `Current provider: **${P.label || P.id}** (claude native)\n\n` +
          `> claude picks the model for this provider and there is no model list to switch — \`/model\` does not apply here.\n` +
          `> To pin one, set \`defaultModel\` in \`ccapp-providers.json\`.`,
          `Penyedia saat ini: **${P.label || P.id}** (bawaan claude)\n\n` +
          `> Model untuk penyedia ini dipilih oleh claude sendiri dan tidak ada daftar model untuk diganti — \`/model\` tidak berlaku di sini.\n` +
          `> Untuk menetapkannya, isi \`defaultModel\` di \`ccapp-providers.json\`.`),
          "model"
        );
      }
      const lines = models.map((m) => {
        const on = m.id === curId ? "**▸** " : "　　";
        const img = (m.input_modalities || []).includes("image") ? L3(" · 支持图片", " · images", " · gambar") : "";
        const eff = (m.effort?.supported_levels || []).join(" / ");
        return `${on}\`${m.id}\` — ${m.name || ""}\n　　${L3("上下文", "context", "konteks")} ${Math.round((m.context_window || 0) / 1024)}k${img} · effort ${eff}`;
      }).join("\n\n");
      return reply(
        L3(`当前厂商：**${P.label || P.id}**\n` +
        `当前模型：**${curId || "(由 claude 决定)"}**　（effort **${curEff || "默认"}**）\n\n` +
        `可用模型：\n\n${lines}\n\n` +
        `用法：\`/model <id>\`　切换思考强度：\`/effort\`\n\n`,
        `Current provider: **${P.label || P.id}**\n` +
        `Current model: **${curId || "(claude decides)"}** (effort **${curEff || "default"}**)\n\n` +
        `Available models:\n\n${lines}\n\n` +
        `Usage: \`/model <id>\`  change thinking effort: \`/effort\`\n\n`,
        `Penyedia saat ini: **${P.label || P.id}**\n` +
        `Model saat ini: **${curId || "(ditentukan claude)"}** (effort **${curEff || "bawaan"}**)\n\n` +
        `Model yang tersedia:\n\n${lines}\n\n` +
        `Pemakaian: \`/model <id>\`  ganti tingkat berpikir: \`/effort\`\n\n`) +
        (P.nativeModels
          ? L3(`> 模型名由 claude 自己解析，写错会直接报错。`, `> claude resolves the model name itself; a typo fails with an error.`, `> Nama model diurai oleh claude sendiri; salah ketik langsung memunculkan galat.`)
          : L3(`> 第三方厂商对不认识的名字**可能静默回落**，所以这里挡一道，免得你以为切成功了。`, `> Third-party providers **may silently fall back** on unknown names, so this check stops you from thinking the switch worked.`, `> Penyedia pihak ketiga **bisa diam-diam beralih** ke model lain untuk nama yang tidak dikenal, jadi pemeriksaan ini mencegah Anda mengira penggantian berhasil.`)),
        "model"
      );
    }
    const t = arg.toLowerCase().trim();
    const target = models.find((m) => m.id.toLowerCase() === t)
      || models.find((m) => (m.name || "").toLowerCase() === t)
      || models.find((m) => m.id.toLowerCase().includes(t));
    if (!target) {
      if (!models.length) {
        return reply(
          L3(`当前厂商（**${P.label || P.id}**）未提供模型清单，\`/model\` 不适用。\n` +
          `> 原生厂商由 claude 自己决定模型；要指定就改 \`ccapp-providers.json\` 的 \`defaultModel\`。`,
          `The current provider (**${P.label || P.id}**) has no model list, so \`/model\` does not apply.\n` +
          `> For native providers claude picks the model; to pin one, change \`defaultModel\` in \`ccapp-providers.json\`.`,
          `Penyedia saat ini (**${P.label || P.id}**) tidak punya daftar model, jadi \`/model\` tidak berlaku.\n` +
          `> Untuk penyedia bawaan, model dipilih oleh claude; untuk menetapkannya, ubah \`defaultModel\` di \`ccapp-providers.json\`.`),
          "model"
        );
      }
      return reply(
        L3(`没有模型 \`${arg}\`。\n\n可用：${models.map((m) => "`" + m.id + "`").join("、")}\n\n` +
        `（${P.label || P.id} 收到不认识的名字可能静默回落，所以这里挡住，免得你以为切成功了）`,
        `No model \`${arg}\`.\n\nAvailable: ${models.map((m) => "`" + m.id + "`").join(", ")}\n\n` +
        `(${P.label || P.id} may silently fall back on unknown names, so this is blocked to keep you from thinking the switch worked)`,
        `Tidak ada model \`${arg}\`.\n\nTersedia: ${models.map((m) => "`" + m.id + "`").join(", ")}\n\n` +
        `(${P.label || P.id} bisa diam-diam beralih untuk nama yang tidak dikenal, jadi ini dicegah agar Anda tidak mengira penggantian berhasil)`),
        "model"
      );
    }
    const eff = normEffort(target, curEff, P);
    const effChanged = eff !== curEff;
    commit({ model: target.id, effort: eff || "" });
    return reply(
      L3(`已切换到 **${target.id}**${target.name ? "（" + target.name + "）" : ""}\n\n` +
      `- 上下文窗口：${Math.round((target.context_window || 0) / 1024)}k\n` +
      `- 输入模态：${(target.input_modalities || []).join(" / ")}\n` +
      `- effort 档位：${(target.effort?.supported_levels || []).join(" / ")}\n` +
      (effChanged ? `- **注意**：原 effort 该模型不支持，已调为 \`${eff}\`\n` : "") +
      `\n下一条消息生效${scope}。`,
      `Switched to **${target.id}**${target.name ? " (" + target.name + ")" : ""}\n\n` +
      `- Context window: ${Math.round((target.context_window || 0) / 1024)}k\n` +
      `- Input modalities: ${(target.input_modalities || []).join(" / ")}\n` +
      `- Effort levels: ${(target.effort?.supported_levels || []).join(" / ")}\n` +
      (effChanged ? `- **Note**: this model does not support the previous effort; set to \`${eff}\`\n` : "") +
      `\nTakes effect from the next message${scope}.`,
      `Beralih ke **${target.id}**${target.name ? " (" + target.name + ")" : ""}\n\n` +
      `- Jendela konteks: ${Math.round((target.context_window || 0) / 1024)}k\n` +
      `- Modalitas masukan: ${(target.input_modalities || []).join(" / ")}\n` +
      `- Tingkat effort: ${(target.effort?.supported_levels || []).join(" / ")}\n` +
      (effChanged ? `- **Catatan**: model ini tidak mendukung effort sebelumnya; diatur ke \`${eff}\`\n` : "") +
      `\nBerlaku mulai pesan berikutnya${scope}.`),
      "model"
    );
  }

  // ── /effort ──
  if (name === "effort") {
    const levels = effortLevelsOf(cur, P);
    const dflt = cur && cur.effort && cur.effort.default_level;
    if (!arg) {
      const lines = levels.map((l) =>
        `${l === curEff ? "**▸** " : "　　"}\`${l}\`` + (l === dflt ? L3("　（模型默认）", " (model default)", " (bawaan model)") : "")).join("\n");
      return reply(
        L3(`当前模型 **${curId || "默认"}** 的思考强度：**${curEff || "(未设置)"}**\n\n${lines}\n\n` +
        `用法：\`/effort <level>\`\n\n` +
        `> 档位越高思考越久、通常质量越好。实测首字延迟：\`low\` ≈ 0.9s，\`max\` ≈ 2.3s。`,
        `Thinking effort for **${curId || "default"}**: **${curEff || "(not set)"}**\n\n${lines}\n\n` +
        `Usage: \`/effort <level>\`\n\n` +
        `> Higher levels think longer and usually do better. Measured time to first token: \`low\` ≈ 0.9s, \`max\` ≈ 2.3s.`,
        `Tingkat berpikir model **${curId || "bawaan"}**: **${curEff || "(belum diatur)"}**\n\n${lines}\n\n` +
        `Pemakaian: \`/effort <level>\`\n\n` +
        `> Makin tinggi tingkatnya, makin lama berpikir dan biasanya makin bagus. Jeda token pertama terukur: \`low\` ≈ 0,9 dtk, \`max\` ≈ 2,3 dtk.`),
        "effort"
      );
    }
    const t = arg.toLowerCase().trim();
    if (levels.includes(t)) {
      commit({ effort: t });
      return reply(L3(`思考强度已设为 **${t}**（模型 ${curId || "默认"}）。\n\n下一条消息生效${scope}。`, `Thinking effort set to **${t}** (model ${curId || "default"}).\n\nTakes effect from the next message${scope}.`, `Tingkat berpikir diatur ke **${t}** (model ${curId || "bawaan"}).\n\nBerlaku mulai pesan berikutnya${scope}.`), "effort");
    }
    // claude 认 low/medium/high/xhigh/max，DeepSeek 只有 low/high/max，做个就近映射
    const alias = { medium: "high", xhigh: "max", highest: "max", lowest: "low", normal: "high" }[t];
    if (alias && levels.includes(alias)) {
      commit({ effort: alias });
      const lv = levels.map((l) => "`" + l + "`");
      return reply(L3(`\`${arg}\` 不是 ${curId} 的档位，已就近设为 **${alias}**。\n\n该模型支持：${lv.join("、")}`,
        `\`${arg}\` is not a level of ${curId}; set to the nearest, **${alias}**.\n\nThis model supports: ${lv.join(", ")}`,
        `\`${arg}\` bukan tingkat untuk ${curId}; diatur ke yang terdekat, **${alias}**.\n\nModel ini mendukung: ${lv.join(", ")}`), "effort");
    }
    const lv = levels.map((l) => "`" + l + "`");
    return reply(L3(`\`${arg}\` 不是有效档位。**${curId || "默认模型"}** 支持：${lv.join("、")}`,
      `\`${arg}\` is not a valid level. **${curId || "The default model"}** supports: ${lv.join(", ")}`,
      `\`${arg}\` bukan tingkat yang valid. **${curId || "Model bawaan"}** mendukung: ${lv.join(", ")}`), "effort");
  }

  return reply(L3(`未知命令 /${name}`, `Unknown command /${name}`, `Perintah tidak dikenal /${name}`), name);
}
