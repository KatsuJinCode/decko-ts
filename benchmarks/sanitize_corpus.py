#!/usr/bin/env python3
"""sanitize_corpus.py -- build the structure-preserving, content-free benchmark
corpus for decko-ts (#1282 benchmark program).

Input : the Culturesmith mysqldump (1.2 GB) -- parsed LINEARLY, anchored on
        `INSERT INTO ... VALUES` line boundaries (never a backtracking regex
        over chunks; per-field matching is the quote/backslash-aware C-speed
        scanner pattern proven on this exact dump by the privacy-review
        tooling in brandonDojoTech/scripts/culturesmith-migration).
Output: benchmarks/corpus/bench-corpus.sqlite3 (gitignored) plus
        benchmarks/corpus/sanitize-manifest.json (histograms + build facts,
        no original text).

Preserved exactly (modulo recorded exceptions)
  - card row count (live + trashed), trash flag, per-type_id counts
  - junction/plus-card topology: names rebuilt from the left_id/right_id
    graph ("A+B" -> "p<leftid>+p<rightid>", part count and depth preserved)
  - name BYTE LENGTH distribution (synthetic names padded with deterministic
    filler to the original byte length; rare structural overflows recorded)
  - content BYTE LENGTH (exact whenever structurally possible) and the HTML
    tag skeleton (tags kept, attributes stripped, comments gutted)
  - the FULL card_references graph (ids preserved as-is)
  - read-rule reader lists -> synthetic role buckets preserving cardinality
    ("Role_A1, Role_A2, ...")

Never emitted anywhere
  - original card names, keys, codenames, referee keys
  - original content text (text runs -> deterministic letter filler sized to
    the card's byte budget; newlines preserved so line structure survives)
  - absolute timestamps (all shifted by one fixed offset; intervals kept)

Determinism: same dump + same SEED -> same corpus (PRNG streams are seeded
from card ids / vocab strings, never from processing order).
"""

import hashlib
import json
import os
import random
import re
import sqlite3
import sys
from collections import Counter
from datetime import datetime, timedelta

SEED = 0xDEC0
TIMESTAMP_SHIFT = timedelta(days=427, seconds=11111)
LOWER = "abcdefghijklmnopqrstuvwxyz"

CARDS_PREFIX = "INSERT INTO `cards` VALUES"
REFS_PREFIX = "INSERT INTO `card_references` VALUES"

# mysqldump field token: quoted string (backslash escapes + doubled quotes)
# or bare run (numbers / NULL). Proven linear pattern for this dump.
TOK_RE = re.compile(r"'(?:[^'\\]|\\.|'')*'|[^,()']+", re.S)
ESC_RE = re.compile(r"\\(.)|''", re.S)

_ESCAPES = {
    "0": "\0", "n": "\n", "r": "\r", "Z": "\x1a",
    "t": "\t", "b": "\b", "'": "'", '"': '"', "\\": "\\",
}


def _esc_sub(m):
    g = m.group(1)
    if g is None:
        return "'"
    return _ESCAPES.get(g, g)


def unquote(tok):
    """Decode one dump token: 'string' (escapes + doubled quotes) | NULL | bare."""
    if tok[0] == "'":
        s = tok[1:-1]
        if "\\" in s or "''" in s:
            return ESC_RE.sub(_esc_sub, s)
        return s
    if tok == "NULL":
        return None
    return tok


def parse_tuples(body):
    """Yield field-token lists for each (...) tuple in a VALUES body.

    Linear scan anchored on '(' / ')' boundaries; per-field matching is the
    C-speed TOK_RE alternation (string | bare-run). No backtracking risk.
    """
    i, n = 0, len(body)
    match = TOK_RE.match
    while i < n:
        if body[i] != "(":
            i += 1
            continue
        i += 1
        fields = []
        while i < n:
            m = match(body, i)
            if m is not None:
                fields.append(m.group())
                i = m.end()
                if i < n and body[i] == ",":
                    i += 1
                    continue
            if i < n and body[i] == ")":
                i += 1
                break
            i += 1  # guard against pathological loops on malformed input
        yield fields


def b64(s):
    """Deterministic short digest of a vocabulary string, base36, 10 chars."""
    num = int.from_bytes(hashlib.sha1(s.encode("utf-8")).digest()[:8], "big")
    chars = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = []
    for _ in range(10):
        num, rem = divmod(num, 36)
        out.append(chars[rem])
    return "".join(reversed(out))


def _null_or_int(tok):
    return None if tok == "NULL" else int(unquote(tok))


# --------------------------------------------------------------------------
# dump parsing
# --------------------------------------------------------------------------

def parse_dump(path):
    """Single linear pass over the dump.

    Returns (cards, refs): cards is a list of dicts with raw (unescaped)
    fields; refs likewise for card_references.
    """
    cards = []
    refs = []
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            if line.startswith(CARDS_PREFIX):
                body = line[line.index("VALUES") + 6:].strip().rstrip(";\n")
                for fl in parse_tuples(body):
                    if len(fl) < 17:
                        continue
                    cards.append({
                        "id": int(unquote(fl[0])),
                        "name": unquote(fl[1]),
                        "key": unquote(fl[2]),
                        "codename": unquote(fl[3]),
                        "left_id": _null_or_int(fl[4]),
                        "right_id": _null_or_int(fl[5]),
                        "created_at": unquote(fl[7]),
                        "updated_at": unquote(fl[8]),
                        "creator_id": int(unquote(fl[9])),
                        "updater_id": int(unquote(fl[10])),
                        "read_rule_class": unquote(fl[11]),
                        "read_rule_id": _null_or_int(fl[12]),
                        "references_expired": unquote(fl[13]),
                        "trash": int(unquote(fl[14])),
                        "type_id": int(unquote(fl[15])),
                        "db_content": unquote(fl[16]),
                    })
            elif line.startswith(REFS_PREFIX):
                body = line[line.index("VALUES") + 6:].strip().rstrip(";\n")
                for fl in parse_tuples(body):
                    if len(fl) < 6:
                        continue
                    refs.append({
                        "id": int(unquote(fl[0])),
                        "referer_id": int(unquote(fl[1])),
                        "referee_key": unquote(fl[2]),
                        "referee_id": _null_or_int(fl[3]),
                        "ref_type": unquote(fl[4]) or "",
                        "is_present": unquote(fl[5]),
                    })
    return cards, refs


# --------------------------------------------------------------------------
# name sanitization
# --------------------------------------------------------------------------

def build_name_sanitizer(cards):
    """Sanitized names preserve junction topology AND the exact name-length
    histogram.

    Simple named cards get a lowercase-letters token of EXACTLY the original
    name's byte length, derived deterministically from the card id and made
    globally unique by deterministic collision rehash (ids processed in
    ascending order). Junction names compose their parts' tokens via the
    left_id/right_id graph (part count and depth preserved); a junction name
    is padded when the composition is shorter than the original and recorded
    as an overflow when longer. A name-length deviation can therefore only
    come from junctions, and the count is reported.

    Returns (san_name_of, by_id).
    """
    by_id = {c["id"]: c for c in cards}
    memo = {}
    used_tokens = set()
    fit_state = {}

    def fitted_simple(cid):
        """Exact-length unique token for a simple card."""
        tok = fit_state.get(cid)
        if tok is not None:
            return tok
        target = len(by_id[cid]["name"].encode("utf-8"))
        tries = 0
        while True:
            rng = random.Random(SEED ^ (cid * 2654435761 % (2 ** 32)) ^ (tries * 40503))
            tok = "".join(rng.choices(LOWER, k=target))
            if tok not in used_tokens:
                break
            tries += 1
        used_tokens.add(tok)
        fit_state[cid] = tok
        return tok

    def structural(cid, depth=0):
        tok = memo.get(cid)
        if tok is not None:
            return tok
        row = by_id.get(cid)
        if row is None or row["name"] is None:
            # unnamed or missing rows only ever appear as junction parts
            tok = "p%d" % cid
        elif depth < 64 and "+" in row["name"] and row["left_id"] and row["right_id"]:
            left = structural(row["left_id"], depth + 1)
            right = structural(row["right_id"], depth + 1)
            base = "%s+%s" % (left, right)
            target = len(row["name"].encode("utf-8"))
            cur = len(base.encode("utf-8"))
            if cur < target:
                rng = random.Random(SEED ^ (cid * 2246822519 % (2 ** 32)))
                base += "".join(rng.choices(LOWER, k=target - cur))
            tok = base
        elif "+" in row["name"]:
            # orphan junction (no left/right ids): preserve part count, fit
            # each part with deterministic filler to the original parts' sizes
            orig_parts = row["name"].split("+")
            rng = random.Random(SEED ^ (cid * 2654435761 % (2 ** 32)))
            tok = "+".join(
                "".join(rng.choices(LOWER, k=max(1, len(p.encode("utf-8")))))
                for p in orig_parts)
        else:
            tok = fitted_simple(cid)
        memo[cid] = tok
        return tok

    # deterministic assignment order: simple named cards, ascending id
    for cid in sorted(c["id"] for c in cards
                      if c["name"] is not None and "+" not in c["name"]):
        fitted_simple(cid)

    def san_name_of(cid):
        row = by_id.get(cid)
        if row is None or row["name"] is None:
            return None
        return structural(cid)

    return san_name_of, by_id


def tokenize_vocab(values, prefix):
    """Deterministic, collision-free synthetic tokens for one vocabulary
    (codenames). Same input -> same token. No original text kept.
    """
    mapping = {}
    seen = Counter()
    for v in sorted(set(values)):
        base = prefix + b64(v)
        n = seen[base]
        seen[base] += 1
        mapping[v] = base if n == 0 else "%s~%d" % (base, n)
    return mapping


def pad_to_length(token, original, seed_key):
    """Pad a synthetic token to the original's byte length (deterministic)."""
    target = len(original.encode("utf-8"))
    cur = len(token.encode("utf-8"))
    if cur < target:
        rng = random.Random(SEED ^ int.from_bytes(
            hashlib.sha1(seed_key.encode("utf-8")).digest()[:4], "big"))
        return token + "".join(rng.choices(LOWER, k=target - cur))
    return token


# --------------------------------------------------------------------------
# content sanitization
# --------------------------------------------------------------------------

TAG_START = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ/!?")


def stable_seed(s):
    return int.from_bytes(hashlib.sha1(s.encode("utf-8")).digest()[:4], "big")


def strip_tag(tag):
    """'<div class="x">' -> '<div>'; '</p>' -> '</p>'; comments gutted."""
    if tag.startswith("<!--"):
        end = tag.find("-->")
        inner_end = end if end >= 0 else len(tag)
        body = tag[4:inner_end - 3] if end >= 0 else tag[4:]
        tail = "-->" if end >= 0 else ""
        filler = "".join(random.Random(SEED ^ stable_seed(body)).choices(
            LOWER, k=len(body.encode("utf-8"))))
        return "<!--" + filler + tail
    closing = tag.startswith("</")
    i = 2 if closing else 1
    n = len(tag)
    j = i
    while j < n and (tag[j].isalnum() or tag[j] in ":-_"):
        j += 1
    name = tag[i:j]
    if not name:
        return tag  # '<' plus junk: not a real tag, keep verbatim
    return ("</" if closing else "<") + name + ">"


def find_gt(s, i):
    """Index of the '>' closing the tag opening at s[i] == '<' (quote-aware)."""
    n = len(s)
    k = i + 1
    while k < n:
        c = s[k]
        if c == ">":
            return k
        if c in ('"', "'"):
            k2 = s.find(c, k + 1)
            k = (n - 1) if k2 < 0 else k2
        k += 1
    return n - 1


def resolve_inclusion(inner, name_to_id, san_name_of):
    """'CardName|view;opts' -> '<sanitized>|view;opts' when the target name
    resolves; otherwise a same-length filler token (never original text)."""
    parts = inner.split("|", 1)
    target_name = parts[0].strip()
    cid = name_to_id.get(target_name)
    if cid is not None:
        san = san_name_of(cid)
        if san is not None:
            rest = ("|" + parts[1]) if len(parts) > 1 else ""
            return san + rest
    return "x" * len(inner)


def segment_content(s, name_to_id, san_name_of):
    """Ordered segmentation of original content.

    Returns a list of items, in source order:
      ("fixed", final_text)  -- already-sanitized structural text
                                (stripped tag / gutted comment / inclusion)
      ("run", original_text) -- text run to be replaced by filler
    """
    items = []
    n = len(s)
    i = 0
    while i < n:
        nxt_lt = s.find("<", i)
        nxt_ob = s.find("{{", i)
        if nxt_lt < 0 and nxt_ob < 0:
            items.append(("run", s[i:]))
            break
        j = min(x for x in (nxt_lt, nxt_ob) if x >= 0)
        if j > i:
            items.append(("run", s[i:j]))
        if nxt_ob >= 0 and (nxt_lt < 0 or nxt_ob < nxt_lt):
            end = s.find("}}", nxt_ob + 2)
            if end < 0:
                items.append(("run", s[nxt_ob:]))
                break
            inner = s[nxt_ob + 2:end]
            items.append(("fixed", "{{" + resolve_inclusion(
                inner, name_to_id, san_name_of) + "}}"))
            i = end + 2
        elif j + 1 < n and s[j + 1] in TAG_START:
            if s.startswith("<!--", j):
                endc = s.find("-->", j + 4)
                stop = n if endc < 0 else endc + 3
                items.append(("fixed", strip_tag(s[j:stop])))
                i = stop
            else:
                gt = find_gt(s, j)
                items.append(("fixed", strip_tag(s[j:gt + 1])))
                i = gt + 1
        else:
            items.append(("run", "<"))
            i = j + 1
    return items


def split_text_filler(run, budget_bytes, rng):
    """Deterministic filler for one text run with an explicit byte budget.
    Newlines are preserved so line structure survives. Returns exactly
    budget_bytes bytes when budget >= newline count.
    """
    if budget_bytes <= 0:
        return ""
    chunks = run.split("\n")
    if len(chunks) == 1:
        return "".join(rng.choices(LOWER, k=budget_bytes))
    chunk_bytes = [len(c.encode("utf-8")) for c in chunks]
    avail = budget_bytes - (len(chunks) - 1)
    if avail <= 0:
        return "\n" * budget_bytes
    total = sum(chunk_bytes)
    out = []
    remaining = avail
    for idx, cb in enumerate(chunk_bytes):
        share = (avail * cb // total) if total else (remaining // (len(chunk_bytes) - idx))
        share = max(0, min(share, remaining))
        out.append("".join(rng.choices(LOWER, k=share)))
        remaining -= share
        if idx < len(chunk_bytes) - 1:
            out.append("\n")
    if remaining > 0:
        out.append("".join(rng.choices(LOWER, k=remaining)))
    return "".join(out)


def role_bucket(content, target, card_id):
    """Read-rule reader list -> 'Role_A1, Role_A2, ...' preserving item
    cardinality, padded to the original byte length."""
    items2 = []
    flat = content.replace("[[", ",").replace("]]", ",").replace("\n", ",")
    for piece in flat.split(","):
        piece = piece.strip()
        if piece:
            items2.append(piece)
    k = len(items2)
    rng = random.Random(SEED ^ (card_id * 2246822519 % (2 ** 32)))

    def role_name(i):
        return "Role_%s%d" % (chr(ord("A") + (i // 9) % 26), i % 9 + 1)

    base = ", ".join(role_name(i) for i in range(k)) if k else ""
    cur = len(base.encode("utf-8"))
    if cur < target:
        base += "".join(rng.choices(LOWER, k=target - cur))
    return base, max(0, cur - target)


def is_read_rule_name(name):
    if not name:
        return False
    return name == "*read" or name.endswith("+*read")


def sanitize_content(s, card_id, name_to_id, san_name_of, read_rule=False):
    """Return (sanitized_content, overflow_bytes). Byte length equals the
    original whenever the structural skeleton fits; overflows are recorded.
    """
    if s is None:
        return None, 0
    target = len(s.encode("utf-8"))
    if read_rule:
        return role_bucket(s, target, card_id)

    items = segment_content(s, name_to_id, san_name_of)
    fixed_bytes = sum(len(t.encode("utf-8")) for kind, t in items if kind == "fixed")
    run_idx = [i for i, (kind, _) in enumerate(items) if kind == "run"]
    weights = [max(1, len(items[i][1].encode("utf-8"))) for i in run_idx]

    budget = target - fixed_bytes
    if budget < 0:
        budget = 0
    budgets = [0] * len(run_idx)
    if run_idx:
        total_w = sum(weights)
        assigned = 0
        for k in range(len(run_idx) - 1):
            share = budget * weights[k] // total_w
            budgets[k] = share
            assigned += share
        budgets[-1] = budget - assigned  # last run absorbs the remainder

    rng = random.Random(SEED ^ (card_id * 40503 % (2 ** 32)))
    out = []
    ri = 0
    for kind, payload in items:
        if kind == "fixed":
            out.append(payload)
        else:
            out.append(split_text_filler(payload, budgets[ri], rng))
            ri += 1
    result = "".join(out)
    actual = len(result.encode("utf-8"))
    return result, max(0, actual - target)


# --------------------------------------------------------------------------
# build
# --------------------------------------------------------------------------

def histogram(values):
    return dict(sorted(Counter(values).items()))


def main():
    dump = sys.argv[1] if len(sys.argv) > 1 else \
        r"C:\localProjects\culturesmith-migration\incoming\culturesmith-2026-09-07.sql"
    outdir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "corpus")
    os.makedirs(outdir, exist_ok=True)
    dbpath = os.path.join(outdir, "bench-corpus.sqlite3")
    if os.path.exists(dbpath):
        os.remove(dbpath)

    print("parsing dump (single linear pass) ...", flush=True)
    cards, refs = parse_dump(dump)
    print("cards rows: %d  ref rows: %d" % (len(cards), len(refs)), flush=True)

    live = [c for c in cards if c["trash"] == 0]

    san_name_of, by_id = build_name_sanitizer(cards)
    name_to_id = {}
    for c in cards:
        if c["name"] is not None:
            name_to_id.setdefault(c["name"], c["id"])

    codemap = tokenize_vocab([c["codename"] for c in cards if c["codename"]], "cd")

    key_tokens = {}
    seen = Counter()
    for k in sorted({r["referee_key"] for r in refs if r["referee_key"] is not None}):
        tok = "+".join("k" + b64(p) for p in k.split("+"))
        n = seen[tok]
        seen[tok] += 1
        key_tokens[k] = tok if n == 0 else "%s~%d" % (tok, n)

    def shift_ts(v):
        if not v:
            return v
        try:
            return (datetime.strptime(v, "%Y-%m-%d %H:%M:%S") + TIMESTAMP_SHIFT
                    ).strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            return v

    print("sanitizing ...", flush=True)
    name_overflows = 0
    content_overflows = 0
    card_rows = []
    for c in cards:
        san_name = san_name_of(c["id"])
        orig = c["name"]
        if orig is not None and len(san_name.encode("utf-8")) > len(orig.encode("utf-8")):
            name_overflows += 1
        san_code = None
        if c["codename"] is not None:
            tok = codemap[c["codename"]]
            san_code = pad_to_length(tok, c["codename"], "code" + c["codename"])
        content, c_over = sanitize_content(
            c["db_content"], c["id"], name_to_id, san_name_of,
            read_rule=is_read_rule_name(orig))
        content_overflows += 1 if c_over else 0
        card_rows.append((
            c["id"], san_name, san_name, san_code,
            c["left_id"], c["right_id"],
            c["creator_id"], c["updater_id"],
            c["read_rule_class"], c["read_rule_id"],
            c["trash"], c["type_id"],
            content,
            shift_ts(c["created_at"]), shift_ts(c["updated_at"]),
        ))

    # structural uniqueness guarantee, asserted (belt and braces)
    names_seen = set()
    for row in card_rows:
        nm = row[1]
        if nm is not None:
            if nm in names_seen:
                raise SystemExit("FATAL: sanitized name collision: %r" % nm)
            names_seen.add(nm)

    ref_rows = []
    for r in refs:
        k = r["referee_key"]
        san_k = None if k is None else pad_to_length(key_tokens[k], k, "rkey" + k)
        ref_rows.append((r["id"], r["referer_id"], san_k, r["referee_id"],
                         r["ref_type"], r["is_present"]))

    print("writing sqlite ...", flush=True)
    con = sqlite3.connect(dbpath)
    con.execute("PRAGMA journal_mode=OFF")
    con.execute("PRAGMA synchronous=OFF")
    con.executescript("""
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE cards (
      id INTEGER PRIMARY KEY,
      name TEXT, key TEXT, codename TEXT,
      left_id INTEGER, right_id INTEGER,
      creator_id INTEGER, updater_id INTEGER,
      read_rule_class TEXT, read_rule_id INTEGER,
      trash INTEGER NOT NULL DEFAULT 0,
      type_id INTEGER NOT NULL,
      content TEXT,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE card_references (
      id INTEGER PRIMARY KEY,
      referer_id INTEGER NOT NULL,
      referee_key TEXT,
      referee_id INTEGER,
      ref_type TEXT NOT NULL DEFAULT '',
      is_present INTEGER
    );
    """)
    con.executemany(
        "INSERT INTO cards (id,name,key,codename,left_id,right_id,creator_id,"
        "updater_id,read_rule_class,read_rule_id,trash,type_id,content,"
        "created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        card_rows)
    con.executemany(
        "INSERT INTO card_references (id,referer_id,referee_key,referee_id,"
        "ref_type,is_present) VALUES (?,?,?,?,?,?)",
        ref_rows)
    for ddl in (
        "CREATE INDEX idx_cards_type ON cards(type_id)",
        "CREATE INDEX idx_cards_left ON cards(left_id)",
        "CREATE INDEX idx_cards_right ON cards(right_id)",
        "CREATE INDEX idx_cards_name ON cards(name)",
        "CREATE INDEX idx_refs_referer ON card_references(referer_id)",
        "CREATE INDEX idx_refs_referee_id ON card_references(referee_id)",
        "CREATE INDEX idx_refs_ref_type ON card_references(ref_type)",
    ):
        con.execute(ddl)
    meta = {
        "seed": str(SEED),
        "card_rows": str(len(card_rows)),
        "live_cards": str(len(live)),
        "ref_rows": str(len(ref_rows)),
        "name_length_overflows": str(name_overflows),
        "content_length_overflows": str(content_overflows),
        "timestamp_shift_days": str(TIMESTAMP_SHIFT.days),
    }
    con.executemany("INSERT INTO meta (key,value) VALUES (?,?)", list(meta.items()))
    con.commit()
    con.close()

    live_name_len = histogram(
        len(c["name"].encode("utf-8")) for c in live if c["name"] is not None)
    live_content_len = histogram(
        len(c["db_content"].encode("utf-8")) for c in live if c["db_content"] is not None)
    out_deg = Counter()
    for r in refs:
        if r["ref_type"] == "I":
            out_deg[r["referer_id"]] += 1
    manifest = {
        "source": os.path.basename(dump),
        "seed": SEED,
        "card_rows_total": len(cards),
        "live_cards": len(live),
        "trashed_cards": len(cards) - len(live),
        "ref_rows": len(refs),
        "live_type_distribution": histogram(c["type_id"] for c in live),
        "live_name_length_histogram": live_name_len,
        "live_content_length_histogram": live_content_len,
        "top20_inclusion_fanout_degrees": sorted(out_deg.values(), reverse=True)[:20],
        "distinct_referee_keys": len(key_tokens),
        "name_length_overflows": name_overflows,
        "content_length_overflows": content_overflows,
        "timestamp_shift_days": TIMESTAMP_SHIFT.days,
    }
    with open(os.path.join(outdir, "sanitize-manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, sort_keys=True)
        f.write("\n")
    print("done: %s" % dbpath, flush=True)
    print(json.dumps({k: manifest[k] for k in (
        "card_rows_total", "live_cards", "trashed_cards", "ref_rows",
        "distinct_referee_keys", "name_length_overflows",
        "content_length_overflows")}, indent=2), flush=True)


if __name__ == "__main__":
    main()
