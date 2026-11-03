// cc-mem —— 内存管家：重活之前清场，跑的时候压住「杀了又活」的后台应用。
// 经 priv（Shizuku，shell 身份）调 am / dumpsys；默认关闭，在 Aure Code 设置里打开。
//
// 保护谁（不碰）：
//   1. 安卓自己判为前台 / 可见 / 可感知 / 常驻的进程（分屏另一半、挂前台通知的代理、正在播放的音乐……）
//   2. 自动识别：桌面、输入法、无障碍服务、VPN、Shizuku、本应用、系统核心组件
//   3. 设置里的白名单
// 其余处于「服务 / 缓存」档的应用都可以停。
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const HOME = process.env.CCAPP_HOME || process.env.HOME || HERE;
const SETTINGS_FILE = path.join(HOME, "ccapp-settings.json");
const STATE_FILE = path.join(HOME, ".cc-mem-state.json");

const HELP = `Penggunaan:
  cc-mem status [--json]          neraca memori: berapa yang tersedia, siapa yang memakai, mana yang dilindungi, mana yang bisa dihentikan
  cc-mem clear [--hard] [--dry-run] [--json]
                                  hentikan aplikasi latar di luar daftar izin (bawaan stop-app, --hard memakai force-stop)
  cc-mem run [--] <perintah…>     untuk pekerjaan berat: bersihkan dulu (force-stop) + pemadatan memori sistem; selama perintah berjalan
                                  diperiksa tiap 2 detik, yang hidup lagi langsung dihentikan; laporan dicetak di akhir
  cc-mem protected                daftar aplikasi yang dilindungi beserta alasannya
  cc-mem tame <paket…>            batasi latar jangka panjang (untuk yang terus hidup lagi); cc-mem untame <paket…> mengembalikannya
  cc-mem tamed                    daftar aplikasi yang dibatasi
  cc-mem jobs [--per <MB>] [--explain]
                                  hitung jumlah paralel yang aman dari memori yang tersedia saat ini, hanya mencetak satu angka: make -j$(cc-mem jobs)
                                  --per perkiraan MB per tugas (bawaan 700, ukuran kompilasi C++; pekerjaan ringan 200–300)
Pengelola memori nonaktif secara bawaan: status / protected / jobs / clear --dry-run selalu bisa dipakai, sisanya harus diaktifkan dulu di Pengaturan.`;

// ── 基础 ──────────────────────────────────────────────────────────────
function privArgv() {
  // Aure Code：priv.mjs 和本文件同在 app/bin，直接用 node 跑（解包出来的文件不一定带可执行位）
  const sib = path.join(HERE, "priv.mjs");
  return fs.existsSync(sib) ? [process.execPath, sib] : ["priv"];   // 开发端：PATH 上的 priv
}
function priv(cmd, timeout = 30000) {
  // 两路合成一路再读：开发端的 rish 客户端会把输出随机拆到 stdout / stderr 两个管道，分开接收各得一半
  const r = spawnSync("/system/bin/sh", ["-c", `exec "$@" 2>&1`, "sh", ...privArgv(), `{ ${cmd}\n} 2>&1`], { encoding: "utf8", timeout, maxBuffer: 64 << 20 });
  if (r.error) throw new Error(`Pemanggilan priv gagal: ${r.error.message}`);
  // 125 连不上 Aure Code、126 Shizuku 没运行/没授权、127 起进程失败：都不能当成「没有输出」往下走，否则会显示「可停的应用 0 个」
  if (r.status >= 125 && r.status <= 127) throw new Error((r.stdout || "").replace(/^priv: /gm, "").trim() || "priv tidak tersedia (Shizuku belum berjalan atau belum diberi izin)");
  return { out: r.stdout || "", err: r.stdout || "", code: r.status };
}
const sh = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
const PKG_RE = /^[A-Za-z][\w]*(\.[\w]+)+$/;

function readJson(f, dflt) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return dflt; } }
function config() {
  const s = readJson(SETTINGS_FILE, {});
  const g = s.memGuard || {};
  return { enabled: !!g.enabled, whitelist: Array.isArray(g.whitelist) ? g.whitelist.filter((p) => PKG_RE.test(p)) : [] };
}

function meminfo() {
  const v = {};
  for (const l of fs.readFileSync("/proc/meminfo", "utf8").split("\n")) {
    const m = l.match(/^(\w+):\s+(\d+)/);
    if (m) v[m[1]] = Number(m[2]) * 1024;
  }
  return {
    total: v.MemTotal, available: v.MemAvailable, free: v.MemFree,
    anon: v.AnonPages, fileCache: (v.Cached || 0) + (v.Buffers || 0) - (v.Shmem || 0),
    swapUsed: (v.SwapTotal || 0) - (v.SwapFree || 0),
  };
}
const MB = (b) => `${Math.round(b / 1048576)}M`;
const GB = (b) => `${(b / 1073741824).toFixed(1)}G`;

// ── 进程与保护名单 ────────────────────────────────────────────────────
// dumpsys activity lru 的分档：这些档里的应用可以停（服务、缓存、上一个应用、备份、重量级）
const KILLABLE = /^(svc|svcb|cch.*|prev|bkup|hvy|psvc)$/;
const CLASS_NAME = { pers: "menetap", sys: "sistem", fg: "latar depan", vis: "terlihat", prcp: "terasa", prcl: "terasa", impf: "terasa", home: "launcher", svc: "layanan", svcb: "layanan", prev: "aplikasi sebelumnya", bkup: "cadangan", hvy: "berat" };
// 动了会出事的系统组件（多数本来就在常驻档，这里兜底）
const CORE = [/^android$/, /^android\./, /^com\.android\.(systemui|phone|providers\..*|networkstack.*|bluetooth|nfc|se|shell|server\..*|inputdevices|location\.fused|externalstorage|mtp|settings|permissioncontroller|packageinstaller|vending)$/,
  /^com\.google\.android\.(permissioncontroller|packageinstaller)$/,      // 权限弹窗、安装确认被停掉会打断用户（审查 10-29 第六份 低1）
  /^com\.google\.android\.(gms|gsf|ext\.services)$/, /^moe\.shizuku\.privileged\.api$/, /^cc\.codtest$/, /^cc\.codroid$/, /^li\.dsh\./];

/** 进程分档（lru）+ 每个进程加载了哪些包（processes）。
 *  后者要紧：停掉一个包，安卓会连带杀掉所有加载过它的进程 —— 停 WebView 包就把用 WebView 的应用全带走了，
 *  停联想日历连分屏服务一起死（实测）。所以「不停的进程」依赖的包也必须保护。 */
function processes() {
  const out = priv("echo @LRU; dumpsys activity lru; echo @PROC; dumpsys activity processes | grep -E '^ +\\*[A-Z]+\\* |packageList=|packageDependencies=|->[0-9]+:.* s[1-9]'", 60000).out;
  const [lru, proc = ""] = out.split("@PROC");
  const loaded = [];        // { pid, own: 所属的包, pkgs: 活着就离不开的包（自己的 + 依赖的 + 稳定连着的提供者） }
  let cur = null;
  for (const l of proc.split("\n")) {
    const h = l.match(/^\s+\*[A-Z]+\*.*ProcessRecord\{\w+ (\d+):/);
    if (h) { cur = { pid: Number(h[1]), own: [], pkgs: [] }; loaded.push(cur); continue; }
    const d = l.match(/package(List|Dependencies)=\{([^}]*)\}/);
    if (d && cur) {
      const ps = d[2].split(",").map((x) => x.trim()).filter(Boolean);
      cur.pkgs.push(...ps);
      if (d[1] === "List") cur.own.push(...ps);
    }
    // 稳定的 ContentProvider 连接：提供者进程一死，安卓连客户端一起杀
    const c = l.match(/^\s+- \w+\/([^/\s]+)\/\S*->\d+:\S+ s([1-9]\d*)\//);
    if (c && cur) cur.pkgs.push(c[1]);
  }
  // 一行进程都没读到：dumpsys 被拒或格式不认识。直接报错，别让界面说「0 个」
  if (!/^\s*#\s*\d+:/m.test(lru)) throw new Error("Daftar proses tidak terbaca (dumpsys activity lru): " + (lru.replace(/^@LRU\s*/, "").trim().slice(0, 200) || "tidak ada keluaran"));
  const list = [];
  for (const l of lru.split("\n")) {
    const m = l.match(/^\s*#\s*\d+:\s+(\S+).*?\s(\d+):([^\s/]+)\/(\S+)/);
    if (!m) continue;
    const [, cls, pid, proc, uid] = m;
    if (!/^u\d+a\d+$/.test(uid)) continue;            // 只管普通应用：系统 uid（1000 等）和隔离进程（…i93）不碰
    const own = (loaded.find((x) => x.pid === Number(pid)) || {}).own || [];
    // 进程名不一定是包名（实测 com.huawei.hwid.core 属于另一个包），以 packageList 为准
    const pkgs = own.length ? own : [proc.split(":")[0]];
    for (const pkg of pkgs) if (PKG_RE.test(pkg)) list.push({ cls, pid: Number(pid), proc, pkg, uid });
  }
  return { list, loaded };
}

function autoProtected() {
  const why = new Map();
  const add = (pkg, reason) => { if (pkg && PKG_RE.test(pkg) && !why.has(pkg)) why.set(pkg, reason); };
  // 一次 priv 拿全：桌面、输入法（默认与已启用）、无障碍、VPN 归属 uid
  const q = priv([
    "echo @HOME; cmd package resolve-activity --brief -c android.intent.category.HOME -a android.intent.action.MAIN | tail -1",
    "echo @IME; settings get secure default_input_method",
    "echo @A11Y; settings get secure enabled_accessibility_services",
    "echo @WEBVIEW; dumpsys webviewupdate | grep -oE 'Current WebView package \\(name, version\\): \\([^,]+'",
    "echo @VPN; dumpsys connectivity | grep -E 'Transports: VPN' | grep -oE 'OwnerUid: [0-9]+' | sort -u",
  ].join("; ")).out;
  let sec = "";
  const vpnUids = [];
  for (const l of q.split("\n")) {
    if (l.startsWith("@")) { sec = l.slice(1).trim(); continue; }
    const t = l.trim();
    if (!t || t === "null") continue;
    if (sec === "HOME") add(t.split("/")[0], "launcher");
    else if (sec === "IME") add(t.split("/")[0], "keyboard");
    else if (sec === "A11Y") for (const s of t.split(":")) add(s.split("/")[0], "layanan aksesibilitas");
    else if (sec === "WEBVIEW") add(t.replace(/.*\(/, ""), "penyedia WebView");
    else if (sec === "VPN") { const m = t.match(/(\d+)/); if (m) vpnUids.push(m[1]); }
  }
  if (vpnUids.length) {
    const pl = priv(vpnUids.map((u) => `pm list packages --uid ${u}`).join("; ")).out;
    for (const m of pl.matchAll(/package:(\S+)/g)) add(m[1], "VPN");
  }
  return why;
}

/** 当前每个应用该怎么处置：protect（附原因）或 stop */
function plan() {
  const cfg = config();
  const { list: procs, loaded } = processes();
  const auto = autoProtected();
  const byPkg = new Map();
  for (const p of procs) {
    const e = byPkg.get(p.pkg) || { pkg: p.pkg, procs: [], classes: new Set() };
    e.procs.push(p); e.classes.add(p.cls.replace(/\+.*$/, ""));
    byPkg.set(p.pkg, e);
  }
  const apps = [];
  for (const e of byPkg.values()) {
    let reason = null;
    if (cfg.whitelist.includes(e.pkg)) reason = "daftar izin";
    else if (auto.has(e.pkg)) reason = auto.get(e.pkg);
    else if (CORE.some((r) => r.test(e.pkg))) reason = "inti sistem";
    else {
      const keep = e.procs.find((p) => !KILLABLE.test(p.cls.replace(/\+.*$/, "")));
      if (keep) { const c = keep.cls.replace(/\+.*$/, ""); reason = CLASS_NAME[c] || c; }
    }
    apps.push({ pkg: e.pkg, pids: e.procs.map((p) => p.pid), classes: [...e.classes], protect: !!reason, reason });
  }
  // 依赖闭包：活下来的进程加载着的包都不能停；多保护一个包，就多一批进程活下来 —— 迭代到不再变化
  const procName = new Map(procs.map((p) => [p.pid, p.proc]));
  for (let changed = true; changed;) {
    changed = false;
    const doomed = new Set(apps.filter((a) => !a.protect).map((a) => a.pkg));
    for (const lp of loaded) {
      if (lp.own.some((p) => doomed.has(p))) continue;     // 它自己就属于要停的包
      for (const p of lp.pkgs) {
        if (!doomed.has(p)) continue;
        const a = apps.find((x) => x.pkg === p);
        a.protect = true; a.reason = `dibutuhkan oleh ${procName.get(lp.pid) || "pid " + lp.pid}`;
        doomed.delete(p); changed = true;
      }
    }
  }
  return { cfg, apps, auto };
}

/** 每个进程的 PSS（共享库按使用者均摊，加起来才不重复）。
 *  shell 身份读不到别人的 smaps_rollup，只能借 dumpsys meminfo 的汇总（约 2 秒） */
function pssByPid() {
  // 只要「Total PSS by process」那一段（特权命令白名单不收 sed，在这边截）
  const all = priv("dumpsys meminfo", 60000).out;
  const at = all.indexOf("Total PSS by process");
  const r = at < 0 ? "" : all.slice(at).split(/\n\s*\n/)[0];
  const m = {};
  for (const x of r.matchAll(/([\d,]+)K: \S+ \(pid (\d+)/g)) m[x[2]] = Number(x[1].replace(/,/g, "")) * 1024;
  return m;
}

function stopPkgs(pkgs, hard) {
  if (!pkgs.length) return;
  const verb = hard ? "am force-stop" : "am stop-app";
  priv(pkgs.map((p) => `${verb} ${sh(p)}`).join("; "), 60000);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function requireEnabled(cfg) {
  if (cfg.enabled) return;
  console.error("cc-mem: pengelola memori belum aktif. Aktifkan di Aure Code: Pengaturan → Pengelola memori, lalu coba lagi (status / protected / clear --dry-run tidak dibatasi).");
  process.exit(3);
}

// ── 命令 ──────────────────────────────────────────────────────────────
async function cmdStatus(json) {
  const mem = meminfo();
  const { cfg, apps } = plan();
  const pss = pssByPid();
  for (const a of apps) a.pss = a.pids.reduce((s, p) => s + (pss[p] || 0), 0);
  apps.sort((x, y) => y.pss - x.pss);
  if (json) return console.log(JSON.stringify({ enabled: cfg.enabled, whitelist: cfg.whitelist, mem, apps }, null, 1));
  console.log(`Pengelola memori: ${cfg.enabled ? "aktif" : "nonaktif (aktifkan di Pengaturan)"}`);
  console.log(`Total ${GB(mem.total)}  tersedia ${GB(mem.available)} (kosong ${GB(mem.free)} + cache yang bisa diambil kembali)  memori anonim proses ${GB(mem.anon)}  cache file ${GB(mem.fileCache)}  swap terpakai ${GB(mem.swapUsed)}`);
  const stop = apps.filter((a) => !a.protect), keep = apps.filter((a) => a.protect);
  console.log(`\nBisa dihentikan ${stop.length} aplikasi, total sekitar ${MB(stop.reduce((s, a) => s + a.pss, 0))}: `);
  for (const a of stop) console.log(`  ${MB(a.pss).padStart(6)}  ${a.pkg}`);
  console.log(`\nDilindungi ${keep.length} aplikasi:`);
  for (const a of keep) console.log(`  ${MB(a.pss).padStart(6)}  ${a.pkg}   (${a.reason})`);
}

async function cmdProtected() {
  const { cfg, auto } = plan();
  console.log("Dikenali otomatis:");
  for (const [p, r] of auto) console.log(`  ${p}   (${r})`);
  console.log("Daftar izin:" + (cfg.whitelist.length ? "\n  " + cfg.whitelist.join("\n  ") : "(kosong)"));
  console.log("Selain itu: proses yang oleh Android dianggap latar depan / terlihat / terasa / menetap, serta komponen inti sistem, tidak pernah disentuh.");
}

async function cmdClear(hard, dry, json) {
  const before = meminfo();
  const { cfg, apps } = plan();
  if (!dry) requireEnabled(cfg);
  const targets = apps.filter((a) => !a.protect).map((a) => a.pkg);
  if (!dry) { stopPkgs(targets, hard); await sleep(1500); }
  const after = meminfo();
  const res = { dryRun: dry, mode: hard ? "force-stop" : "stop-app", stopped: targets, availableBefore: before.available, availableAfter: after.available };
  if (json) return console.log(JSON.stringify(res));
  if (!targets.length) return console.log("Tidak ada aplikasi latar yang bisa dihentikan.");
  console.log(`${dry ? "(simulasi, tidak benar-benar dihentikan) akan " : ""}${hard ? "memaksa berhenti" : "menghentikan"} ${targets.length} aplikasi:${targets.join(", ")}`);
  if (!dry) console.log(`Memori tersedia ${GB(before.available)} → ${GB(after.available)}`);
}

async function cmdRun(argv) {
  if (argv[0] === "--") argv = argv.slice(1);
  if (!argv.length) { console.error(HELP); process.exit(2); }
  const { cfg, apps } = plan();
  requireEnabled(cfg);
  const start = meminfo();
  const first = apps.filter((a) => !a.protect).map((a) => a.pkg);
  stopPkgs(first, true);
  try { priv("am compact system", 20000); } catch {}
  await sleep(800);
  const ready = meminfo();
  console.error(`cc-mem: membersihkan ${first.length} aplikasi, memori tersedia ${GB(start.available)} → ${GB(ready.available)}; mulai menjalankan`);

  const revived = new Map();            // 包名 → 复活被压次数
  const tamedNow = new Set();
  let minAvail = ready.available, busy = false, done = false;
  const tick = setInterval(() => {
    const m = meminfo().available;
    if (m < minAvail) minAvail = m;
    if (busy || done) return;
    busy = true;
    try {
      const back = plan().apps.filter((a) => !a.protect).map((a) => a.pkg);
      if (back.length) {
        stopPkgs(back, true);
        for (const p of back) {
          const n = (revived.get(p) || 0) + 1;
          revived.set(p, n);
          // 学乖：一次重活里被压下 3 次还往回爬的，直接限制后台（cc-mem untame 可恢复）
          if (n === 3 && !tamedNow.has(p)) { tamedNow.add(p); try { tame(p); } catch {} }
        }
      }
    } catch {}
    busy = false;
  }, 2000);

  const child = spawn(argv[0], argv.slice(1), { stdio: "inherit" });
  for (const s of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(s, () => child.kill(s));
  const code = await new Promise((r) => {
    child.on("exit", (c, sig) => r(c ?? (sig ? 128 : 1)));
    child.on("error", (e) => { console.error(`cc-mem: gagal memulai: ${e.message}`); r(127); });
  });
  done = true; clearInterval(tick);
  const end = meminfo();
  const rv = [...revived].map(([p, n]) => `${p}×${n}`);
  console.error(`cc-mem: selesai (kode keluar ${code}). Memori tersedia: awal ${GB(ready.available)}, terendah ${GB(minAvail)}, akhir ${GB(end.available)}` +
    (rv.length ? `; selama berjalan menahan yang hidup lagi: ${rv.length} aplikasi:${rv.join(", ")}` : "; selama berjalan tidak ada aplikasi yang hidup lagi") +
    (tamedNow.size ? `; terus hidup lagi, latarnya sudah dibatasi: ${[...tamedNow].join(", ")} (pulihkan dengan cc-mem untame <paket>)` : ""));
  process.exit(code);
}

// 限制一个包的后台，记下原来的级别；返回 priv 结果
function tame(p) {
  const st = readJson(STATE_FILE, { tamed: {} });
  const prev = (priv(`am get-bg-restriction-level ${sh(p)}`).out.trim().split(/\s+/).pop()) || "adaptive_bucket";
  if (!(p in st.tamed)) st.tamed[p] = prev;
  const r = priv(`am set-bg-restriction-level ${sh(p)} restricted`);
  if (r.code === 0) fs.writeFileSync(STATE_FILE, JSON.stringify(st, null, 2), { mode: 0o600 });
  return { r, prev: st.tamed[p] };
}

function cmdTame(pkgs, undo) {
  const cfg = config();
  requireEnabled(cfg);
  const st = readJson(STATE_FILE, { tamed: {} });
  for (const p of pkgs) {
    if (!PKG_RE.test(p)) { console.error(`Lewati nama paket tidak valid: ${p}`); continue; }
    if (!undo) {
      if (CORE.some((r) => r.test(p))) { console.error(`Lewati inti sistem: ${p}`); continue; }
      const { r, prev } = tame(p);
      if (r.code === 0) st.tamed[p] = prev;
      console.log(r.code === 0 ? `Latar dibatasi: ${p} (sebelumnya ${prev})` : `Gagal: ${p} ${r.err.trim()}`);
    } else {
      const prev = st.tamed[p] || "adaptive_bucket";
      const r = priv(`am set-bg-restriction-level ${sh(p)} ${sh(prev)}`);
      if (r.code === 0) { delete st.tamed[p]; console.log(`Dipulihkan: ${p} → ${prev}`); }
      else console.log(`Gagal: ${p} ${r.err.trim()}`);
    }
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(st, null, 2), { mode: 0o600 });
}

// ── 并行数：留出系统和前台要用的，剩下的按每个任务的估计量分；不超过 CPU 核数 ──
function cmdJobs(argv) {
  const i = argv.indexOf("--per"), per = Math.max(50, Number(i >= 0 ? argv[i + 1] : 700) || 700) * 1048576;
  const m = meminfo(), cpus = Math.max(1, (os.availableParallelism ? os.availableParallelism() : os.cpus().length));
  const reserve = Math.max(1.5 * 1073741824, m.total * 0.12);   // 系统、输入法、WebView、Claude 本身
  const n = Math.max(1, Math.min(cpus, Math.floor((m.available - reserve) / per)));
  if (argv.includes("--explain")) {
    const g = (b) => (b / 1073741824).toFixed(1) + " GB";
    console.error(`Tersedia ${g(m.available)} − cadangan ${g(reserve)}, tiap tugas dihitung ${Math.round(per / 1048576)} MB → ${n} (CPU ${cpus} inti)` +
      (n === 1 && m.available - reserve < per ? ". Memori sempit: cek dulu siapa yang memakai dengan cc-mem status, atau jalankan satu thread" : ""));
  }
  console.log(n);
}

// ── 入口 ──────────────────────────────────────────────────────────────
const [cmd, ...rest] = process.argv.slice(2);
const flag = (f) => rest.includes(f);
try {
  if (!cmd || cmd === "-h" || cmd === "--help") { console.log(HELP); process.exit(cmd ? 0 : 2); }
  else if (cmd === "status") await cmdStatus(flag("--json"));
  else if (cmd === "protected") await cmdProtected();
  else if (cmd === "clear") await cmdClear(flag("--hard"), flag("--dry-run"), flag("--json"));
  else if (cmd === "run") await cmdRun(rest);
  else if (cmd === "jobs") cmdJobs(rest);
  else if (cmd === "tame") cmdTame(rest, false);
  else if (cmd === "untame") cmdTame(rest, true);
  else if (cmd === "tamed") { const st = readJson(STATE_FILE, { tamed: {} }); const e = Object.entries(st.tamed); console.log(e.length ? e.map(([p, v]) => `${p} (sebelumnya ${v})`).join("\n") : "(tidak ada)"); }
  else { console.error(HELP); process.exit(2); }
} catch (e) {
  console.error(`cc-mem: ${e.message}`);
  process.exit(1);
}
