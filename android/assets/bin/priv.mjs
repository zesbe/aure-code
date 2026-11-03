// priv —— 经 Aure Code 应用进程里的 Shizuku binder，以 shell 身份（uid 2000）执行命令。
// 协议见 android/java/cc/codtest/Priv.java。
import net from "node:net";

// 私有目录里的文件套接字：别的应用抢不走（以前的抽象套接字 \0cc.codtest.priv 谁都能先绑 —— 审查 H2）
const SOCKET = process.env.CCAPP_PRIV_SOCK || "/data/data/cc.codtest/files/.priv.sock";
const args = process.argv.slice(2);
const HELP = `Penggunaan:
  priv '<perintah>'        jalankan sebagai pengguna shell (/system/bin/sh -c)
  priv -- <program> [arg…] jalankan langsung, tanpa sh
  priv --status           status Shizuku
  priv --request          tampilkan permintaan izin Shizuku
  priv --keepalive on|off penguat keep-alive latar (batas phantom process, daftar putih baterai, dll.)
Standard input diteruskan ke perintah; kode keluar sama dengan kode keluar perintahnya.`;

function oneShot(req) {
  return new Promise((resolve, reject) => {
    const s = net.connect({ path: SOCKET }, () => s.write(JSON.stringify(req) + "\n"));
    let buf = "";
    s.on("data", (d) => (buf += d));
    s.on("end", () => { try { resolve(JSON.parse(buf)); } catch { reject(new Error("respons tidak bisa diurai: " + buf.slice(0, 200))); } });
    s.on("error", reject);
  });
}

function exec(argv) {
  // shell 进不了本应用的私有目录，工作目录只在共享存储时沿用
  const cwd = /^\/(sdcard|storage)\//.test(process.cwd()) ? process.cwd() : "/";
  const s = net.connect({ path: SOCKET }, () => {
    s.write(JSON.stringify({ op: "exec", argv, cwd }) + "\n");
    const frame = (type, b) => {
      const h = Buffer.alloc(5); h[0] = type; h.writeUInt32BE(b.length, 1);
      s.write(Buffer.concat([h, b]));
    };
    if (process.stdin.isTTY) frame(0, Buffer.alloc(0));
    else {
      process.stdin.on("data", (d) => frame(0, d));
      process.stdin.on("end", () => frame(0, Buffer.alloc(0)));
      process.stdin.on("error", () => frame(0, Buffer.alloc(0)));
    }
  });
  let buf = Buffer.alloc(0), connected = false, gotExit = false;
  s.on("connect", () => { connected = true; });
  s.on("data", (d) => {
    buf = Buffer.concat([buf, d]);
    while (buf.length >= 5) {
      const type = buf[0], len = buf.readUInt32BE(1);
      if (buf.length < 5 + len) break;
      const body = buf.subarray(5, 5 + len);
      buf = buf.subarray(5 + len);
      if (type === 1) process.stdout.write(body);
      else if (type === 2) process.stderr.write(body);
      else if (type === 4) process.stderr.write("priv: " + body.toString() + "\n");
      else if (type === 3) { gotExit = true; process.exitCode = body.readInt32BE(0); s.destroy(); process.stdin.destroy(); }
    }
  });
  // 连上之后的写错误（对端先结束了，我们还在递 stdin）不算失败 —— 回应可能已经在缓冲里，等 close 时再判断
  s.on("error", (e) => {
    if (connected) return;
    process.stderr.write(`priv: tidak bisa tersambung ke Aure Code (${e.code || e.message}). Apakah layanan latar aplikasi sedang berjalan?\n`);
    process.exit(125);
  });
  s.on("close", () => {
    if (!gotExit) { process.stderr.write("priv: koneksi terputus, kode keluar tidak diterima\n"); process.exitCode = 125; }
    process.stdin.destroy();
  });
}

if (!args.length || args[0] === "--help" || args[0] === "-h") { console.log(HELP); process.exit(args.length ? 0 : 2); }
try {
  if (args[0] === "--status") console.log(JSON.stringify(await oneShot({ op: "status" }), null, 2));
  else if (args[0] === "--request") console.log((await oneShot({ op: "request" })).message);
  else if (args[0] === "--keepalive") console.log(JSON.stringify(await oneShot({ op: "keepalive", enable: args[1] !== "off" }), null, 2));
  else if (args[0] === "--") exec(args.slice(1));
  else exec(["/system/bin/sh", "-c", args.join(" ")]);
} catch (e) {
  process.stderr.write(`priv: ${e.message}\n`);
  process.exit(125);
}
