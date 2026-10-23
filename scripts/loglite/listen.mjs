// Replacement for LogLite: listens on 3273 and prints EVE Frontier client log messages as TSV.
// Usage: close LogLite, run `node scripts/loglite/listen.mjs > data/loglite/session.tsv`, then start the client.
// Wire format (EveLogLite src/logmodel.cpp): fixed 344-byte frames, little-endian.
import net from "node:net";

const FRAME = 344;
const SEV = ["INFO", "NOTICE", "WARN", "ERR"];
const cstr = (buf, off, len) => {
  const s = buf.subarray(off, off + len);
  const z = s.indexOf(0);
  return (z < 0 ? s : s.subarray(0, z)).toString("utf8");
};

net.createServer((sock) => {
  let pending = Buffer.alloc(0);
  let conn = null;
  let text = "";
  sock.on("data", (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= FRAME) {
      const f = pending.subarray(0, FRAME);
      pending = pending.subarray(FRAME);
      const type = f.readUInt32LE(0);
      const u = 8; // union offset
      if (type === 0) {
        conn = {
          version: f.readUInt32LE(u),
          pid: f.readBigUInt64LE(u + 8),
          machine: cstr(f, u + 16, 32),
          exe: cstr(f, u + 48, 260),
        };
        console.error("[connect]", conn);
        continue;
      }
      text += cstr(f, u + 76, 256);
      if (type === 1 || type === 4) {
        const ts = Number(f.readBigUInt64LE(u));
        const time = new Date(conn?.version === 1 ? ts * 1000 : ts).toISOString();
        const sev = SEV[f.readUInt32LE(u + 8)] ?? "?";
        const mod = cstr(f, u + 12, 32);
        const ch = cstr(f, u + 44, 32);
        console.log(`${time}\t${sev}\t${mod}\t${ch}\t${text}`);
        text = "";
      }
    }
  });
  sock.on("close", () => console.error("[disconnect]"));
}).listen(3273, () => console.error("listening on :3273"));
