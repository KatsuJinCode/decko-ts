// serve-canonical-joint lane — step 1 gate: verify the canonical-shape DB COPY
// this lane will serve from, before anything boots against it.
//
// Verification convention byte-for-byte the canonical build lane's own
// (tmp/wrong-goal-hunt/canonical-shape-cold-work/build-canonical-deck-in-production-order.mjs
// lines 52-110, itself the fresh-account lane's verify-content.py convention):
// RS 0x1e BETWEEN canon() cells, REC 0x1d after every row, ORDER BY id.
// Expected digests are that lane's recorded cross-lane values.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import Database from "better-sqlite3";

const COPY = new URL("./canonical-production-order.sqlite3", import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, "$1");
const BACKUP = "C:/backups/decko-db-2026-10-03/dump-postscrub.sqlite3";
const EXPECTED_BACKUP_SHA = "623f5fcbfdbdde6e38d6a5b179e33a23c04cd1f4ec35c85779f2ee5ee6c66afd";
const EXPECTED_CARDS_SHA = "b841ac172934957b726b4d95cbfd0b309a180330f69e020e50c4fbc8d3754393";
const EXPECTED_REFS_SHA = "d338d1b9d4afeec57f847ee9b7af624e91b8b87590a69611f9db8392b53bee30";

const CARD_COLS = ["id","name","key","codename","left_id","right_id","current_revision_id","created_at","updated_at","creator_id","updater_id","read_rule_class","read_rule_id","references_expired","trash","type_id","db_content"];
const REF_COLS = ["id","referer_id","referee_key","referee_id","ref_type","is_present"];

function canon(v) {
  if (v === null || v === undefined) return Buffer.from("\x00N");
  if (typeof v === "bigint") return Buffer.concat([Buffer.from("\x00I"), Buffer.from(v.toString())]);
  if (typeof v === "number") {
    return Number.isInteger(v)
      ? Buffer.concat([Buffer.from("\x00I"), Buffer.from(String(v))])
      : Buffer.concat([Buffer.from("\x00F"), Buffer.from(String(v))]);
  }
  if (Buffer.isBuffer(v)) return Buffer.concat([Buffer.from("\x00X"), Buffer.from(v.toString("hex"))]);
  return Buffer.concat([Buffer.from("\x00T"), Buffer.from(String(v), "utf8")]);
}
function sha256File(p) {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(p).on("data", (c) => h.update(c)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
}
function tableDigest(db, table, cols) {
  const h = createHash("sha256");
  const q = `SELECT ${cols.map((c) => `"${c}"`).join(",")} FROM "${table}" ORDER BY "id"`;
  const RS = Buffer.from("\x1e");
  const REC = Buffer.from("\x1d");
  let n = 0;
  for (const row of db.prepare(q).raw().iterate()) {
    n += 1;
    for (let i = 0; i < row.length; i += 1) {
      if (i > 0) h.update(RS);
      h.update(canon(row[i]));
    }
    h.update(REC);
  }
  return { rows: n, sha256: h.digest("hex") };
}

const out = {};
out.backupSha256 = await sha256File(BACKUP);
out.backupUntouched = out.backupSha256 === EXPECTED_BACKUP_SHA;

const db = new Database(COPY, { readonly: true });
out.integrity = db.pragma("integrity_check", { simple: true });
out.census = db.prepare("SELECT type, COUNT(*) c FROM sqlite_master GROUP BY type ORDER BY type").all();
out.tablesExcludingInternal = db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().c;
out.cardsCount = db.prepare("SELECT COUNT(*) c FROM cards").get().c;
out.refsCount = db.prepare("SELECT COUNT(*) c FROM card_references").get().c;
out.cardsDigest = tableDigest(db, "cards", CARD_COLS);
out.refsDigest = tableDigest(db, "card_references", REF_COLS);
out.cardsDigestMatchesBuild = out.cardsDigest.sha256 === EXPECTED_CARDS_SHA;
out.refsDigestMatchesBuild = out.refsDigest.sha256 === EXPECTED_REFS_SHA;
out.cardsIdTypeof = db.prepare("SELECT DISTINCT typeof(\"id\") t FROM cards").all().map((r) => r.t);
out.journalMode = db.pragma("journal_mode", { simple: true });
db.close();

console.log(JSON.stringify(out, null, 2));
const ok =
  out.backupUntouched &&
  out.integrity === "ok" &&
  out.cardsCount === 21670 &&
  out.refsCount === 48525 &&
  out.tablesExcludingInternal === 12 &&
  out.cardsDigestMatchesBuild &&
  out.refsDigestMatchesBuild;
console.log(ok ? "VERIFY: PASS" : "VERIFY: FAIL");
process.exit(ok ? 0 : 1);
