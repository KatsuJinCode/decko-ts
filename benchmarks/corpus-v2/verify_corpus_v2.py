#!/usr/bin/env python3
"""verify_corpus_v2.py -- prove corpus v2 is name-structure-faithful and
content-free. Companion to build_corpus_v2.py; NOTHING from the builder's
manifest is trusted -- every comparison is re-derived here from the dump,
the extract, and the corpus DB independently.

Check groups
  (a) structural fidelity (as v1): card counts, per-type distribution,
      name-length histogram, content-length histogram, junction part-count
      distribution, row-level (id, left_id, right_id, trash, type_id,
      codename) equality, references multiset equality, top-20 inclusion
      fan-out.
  (b) NAME-STRUCTURE fidelity (new in v2):
      - every live card carries a non-null sanitized name;
      - sanitized name byte length == reconstructed original, per card;
      - junction composition identity: for every card with both sides
        resolvable, san_name == san_name(left) + "+" + san_name(right)
        (the name algebra the fetch/lexicon layers rely on);
      - part-count histogram equality vs the reconstructed originals;
      - star-rule parts (*read, *type, ...) preserved verbatim: the distinct
        star-part vocabulary in the corpus equals the vocabulary in the
        reconstructed originals;
      - live sanitized names are unique (decko key-uniqueness invariant);
      - extract cross-check re-run: every comparable extract name equals the
        independently re-derived walk.
  (c) content absence: word 5-gram overlap (tags stripped), exact-name
      absence for 50 sampled RECONSTRUCTED names, distinctive-token absence
      for 20 sampled contents, leak-pattern scan over the full corpus
      (expect zero) with the original sample as instrument (expect fires).
  (d) digests: the canonical cards/references digests recomputed from the DB
      equal the values recorded in the DB's own meta table.

Deterministic sampling throughout (same inputs -> same verdicts).
Output: benchmarks/results/corpus-v2/corpus-v2-verification.json + markdown
tables on stdout (pasted into docs/corpus-v2-report.md).
"""

import json
import os
import random
import re
import sqlite3
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

if True:  # imports kept below the sys.path surgery
    from sanitize_corpus import is_read_rule_name, parse_dump  # noqa: E402
    from build_corpus_v2 import (  # noqa: E402
        EXTRACT_DEFAULT,
        EXTRACT_NAME_CAP,
        EXTRACT_NULL_PLACEHOLDER,
        DUMP_DEFAULT,
        canonical_digest,
        reconstruct_names,
    )

SAMPLE_SEED = 12345
NAME_SAMPLE = 50
SNIPPET_SAMPLE = 20
GRAM_N = 5

TAG_RE = re.compile(r"<[^>]*>")
WORD_RE = re.compile(r"\w+")

KEYWORDS = (
    r"wife|husband|spouse|son|daughter|mom|mother|dad|father|grandchild|"
    r"grandson|granddaughter|family|wedding|marri(?:ed|age)|funeral|memorial|"
    r"cancer|illness|diagnos|hospit|doctor|health|birthday|dear|prayer|"
    r"password|bank account|social security"
)
LEAK_RES = {
    "email": re.compile(r"[\w.+-]+@[\w-]+\.\w+"),
    "ssn_shape": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    "phone_shape": re.compile(r"\b(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b"),
    "keyword_list": re.compile(r"\b(?:%s)\b" % KEYWORDS, re.I),
}


def strip_tags(s):
    return TAG_RE.sub(" ", s)


def word_grams(s, n=GRAM_N):
    words = WORD_RE.findall(s.lower())
    return {" ".join(words[i:i + n]) for i in range(len(words) - n + 1)}


def longest_tokens(text, k, min_len=8):
    toks = sorted({t for t in WORD_RE.findall(text)
                   if len(t) >= min_len and t.isalpha()},
                  key=len, reverse=True)
    return toks[:k]


def scan_leaks(text):
    out = {}
    if "@" in text:
        out["email"] = len(LEAK_RES["email"].findall(text))
    if any(c.isdigit() for c in text):
        out["ssn_shape"] = len(LEAK_RES["ssn_shape"].findall(text))
        out["phone_shape"] = len(LEAK_RES["phone_shape"].findall(text))
    out["keyword_list"] = len(LEAK_RES["keyword_list"].findall(text))
    return out


def mark(checks, key, orig, san, equal):
    checks[key] = {"original": orig, "sanitized": san, "equal": bool(equal)}


def main():
    dump = sys.argv[1] if len(sys.argv) > 1 else DUMP_DEFAULT
    extract_path = sys.argv[2] if len(sys.argv) > 2 else EXTRACT_DEFAULT
    dbpath = os.path.join(HERE, "bench-corpus-v2.sqlite3")
    outdir = os.path.join(os.path.dirname(HERE), "results", "corpus-v2")
    os.makedirs(outdir, exist_ok=True)

    print("[1/5] linear pass over original dump + walk ...", flush=True)
    cards, refs = parse_dump(dump)
    recon = reconstruct_names(cards)
    by_id = {c["id"]: c for c in cards}
    live_ids = {c["id"] for c in cards if c["trash"] == 0}

    print("[2/5] reading corpus v2 ...", flush=True)
    con = sqlite3.connect(dbpath)
    con.row_factory = sqlite3.Row
    san_cards = {r["id"]: dict(r) for r in con.execute(
        "SELECT id,name,key,codename,left_id,right_id,trash,type_id,content"
        " FROM cards")}
    san_refs = [tuple(r) for r in con.execute(
        "SELECT referer_id,referee_id,ref_type,is_present FROM card_references")]
    orig_refs = [(r["referer_id"], r["referee_id"], r["ref_type"], r["is_present"])
                 for r in refs]

    def san_name_of(cid):
        row = san_cards.get(cid)
        return row["name"] if row else None

    # ---- (a) structural fidelity ----------------------------------------
    print("[3/5] structural + name-structure fidelity ...", flush=True)
    san_live_ids = {cid for cid, c in san_cards.items() if c["trash"] == 0}
    checks = {}
    mark(checks, "card_rows_total", len(cards), len(san_cards),
         len(cards) == len(san_cards))
    mark(checks, "live_cards", len(live_ids), len(san_live_ids),
         live_ids == san_live_ids)
    mark(checks, "references_rows", len(orig_refs), len(san_refs),
         len(orig_refs) == len(san_refs))
    mark(checks, "references_multiset_equal", "multiset", "multiset",
         Counter(orig_refs) == Counter(san_refs))

    orig_type = Counter(c["type_id"] for c in cards if c["id"] in live_ids)
    san_type = Counter(san_cards[cid]["type_id"] for cid in san_live_ids)
    mark(checks, "type_distribution_equal", sum(orig_type.values()),
         sum(san_type.values()), orig_type == san_type)

    orig_codename = Counter((c["codename"] or "") for c in cards
                            if c["id"] in live_ids)
    san_codename = Counter((san_cards[cid]["codename"] or "")
                           for cid in san_live_ids)
    mark(checks, "codename_distribution_equal", len(orig_codename),
         len(san_codename), orig_codename == san_codename)

    orig_name_len = Counter(len(recon[cid].encode("utf-8")) for cid in live_ids
                            if recon.get(cid) is not None)
    san_name_len = Counter(len(san_cards[cid]["name"].encode("utf-8"))
                           for cid in san_live_ids if san_cards[cid]["name"])
    mark(checks, "name_length_histogram_equal", sum(orig_name_len.values()),
         sum(san_name_len.values()), orig_name_len == san_name_len)

    orig_content_len = Counter(
        len(c["db_content"].encode("utf-8")) for c in cards
        if c["id"] in live_ids and c["db_content"] is not None)
    san_content_len = Counter(
        len(san_cards[cid]["content"].encode("utf-8")) for cid in san_live_ids
        if san_cards[cid]["content"] is not None)
    mark(checks, "content_length_histogram_equal", sum(orig_content_len.values()),
         sum(san_content_len.values()), orig_content_len == san_content_len)

    orig_parts = Counter(recon[cid].count("+") + 1 for cid in live_ids
                         if recon.get(cid) is not None)
    san_parts = Counter(san_cards[cid]["name"].count("+") + 1
                        for cid in san_live_ids if san_cards[cid]["name"])
    mark(checks, "junction_part_count_equal", "max %d" % max(orig_parts),
         "max %d" % max(san_parts), orig_parts == san_parts)

    row_bad = 0
    for cid in san_live_ids:
        oc = by_id.get(cid)
        sc = san_cards.get(cid)
        if oc is None or sc is None:
            row_bad += 1
            continue
        if (oc["left_id"] != sc["left_id"] or oc["right_id"] != sc["right_id"]
                or oc["type_id"] != sc["type_id"]
                or oc["codename"] != sc["codename"]):
            row_bad += 1
    mark(checks, "row_topology_equal", len(san_live_ids), row_bad, row_bad == 0)

    orig_out = Counter()
    for r in refs:
        if r["ref_type"] == "I":
            orig_out[r["referer_id"]] += 1
    san_out = Counter()
    for referer, _ref, rtype, _present in san_refs:
        if rtype == "I":
            san_out[referer] += 1
    mark(checks, "top20_inclusion_fanout_equal", orig_out.most_common(1)[0][1],
         san_out.most_common(1)[0][1],
         sorted(orig_out.values(), reverse=True)[:20]
         == sorted(san_out.values(), reverse=True)[:20])

    # ---- (b) name-structure fidelity ------------------------------------
    name_checks = {}

    unresolved_live = sorted(cid for cid in live_ids if recon.get(cid) is None)
    live_named_orig = sum(1 for cid in live_ids if recon.get(cid) is not None)
    live_named_san = sum(1 for cid in san_live_ids if san_cards[cid]["name"])
    mark(name_checks, "live_cards_named_walk_vs_corpus", live_named_orig,
         live_named_san, live_named_orig == live_named_san)
    mark(name_checks, "unresolved_live_names",
         "%d (broken-ancestor junctions, ids %s..)" % (
             len(unresolved_live), unresolved_live[:3]),
         "%d" % (len(live_ids) - live_named_san),
         len(unresolved_live) == len(live_ids) - live_named_san)

    len_bad = 0
    for cid in live_ids:
        orig, san = recon.get(cid), (san_cards[cid]["name"]
                                     if cid in san_cards else None)
        if orig is None:
            continue
        if san is None or len(san.encode("utf-8")) != len(orig.encode("utf-8")):
            len_bad += 1
    mark(name_checks, "name_byte_length_exact_per_card", live_named_orig,
         len_bad, len_bad == 0)

    compose_checked = compose_bad = 0
    for cid in live_ids:
        sc = san_cards.get(cid)
        if sc is None:
            continue
        left, right = sc["left_id"], sc["right_id"]
        if not left or not right:
            continue
        lname, rname = san_name_of(left), san_name_of(right)
        if lname is None or rname is None or sc["name"] is None:
            continue
        compose_checked += 1
        if sc["name"] != lname + "+" + rname:
            compose_bad += 1
    mark(name_checks, "junction_composition_identity", compose_checked,
         compose_bad, compose_bad == 0)

    orig_star = sorted({p for cid in live_ids if recon.get(cid)
                        for p in recon[cid].split("+") if p.startswith("*")})
    san_star = sorted({p for cid in san_live_ids if san_cards[cid]["name"]
                       for p in san_cards[cid]["name"].split("+")
                       if p.startswith("*")})
    mark(name_checks, "star_rule_parts_preserved_verbatim", len(orig_star),
         len(san_star), orig_star == san_star)

    seen = set()
    dupes = 0
    for cid in sorted(san_live_ids):
        nm = san_cards[cid]["name"]
        if nm is None:
            continue
        if nm in seen:
            dupes += 1
        seen.add(nm)
    mark(name_checks, "live_sanitized_names_unique", len(seen) + dupes, dupes,
         dupes == 0)

    # read-rule flag follows the reconstructed name (content transform gate)
    rr_orig = sum(1 for cid in live_ids
                  if is_read_rule_name(recon.get(cid)))
    rr_san = sum(1 for cid in san_live_ids
                 if is_read_rule_name(san_cards[cid]["name"]))
    mark(name_checks, "read_rule_name_count", rr_orig, rr_san, rr_orig == rr_san)

    # extract cross-check, re-derived (same tolerances as the builder:
    # 120-char display cap => prefix match; placeholder rows not comparable)
    xc_total = xc_comparable = xc_bad = xc_trunc = 0
    with open(extract_path, encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            cid = int(d["id"])
            xc_total += 1
            name = d.get("name")
            if name in (None, EXTRACT_NULL_PLACEHOLDER):
                continue
            got = recon.get(cid)
            if got is None:
                xc_bad += 1
                continue
            xc_comparable += 1
            if name == got:
                pass
            elif len(name) == EXTRACT_NAME_CAP and got.startswith(name):
                xc_trunc += 1
            else:
                xc_bad += 1
    mark(name_checks, "extract_names_match_rederived_walk", xc_comparable,
         "%d mismatched (%d truncated-at-cap accepted)" % (xc_bad, xc_trunc),
         xc_bad == 0)

    # ---- (c) content absence --------------------------------------------
    print("[4/5] content-absence checks ...", flush=True)
    rng = random.Random(SAMPLE_SEED)
    live_named = sorted(cid for cid in live_ids if recon.get(cid) is not None)
    name_sample_ids = rng.sample(live_named, min(NAME_SAMPLE, len(live_named)))

    inline_ids = {c["id"] for c in cards
                  if c["id"] % 199 == 3 and c["db_content"] is not None
                  and c["trash"] == 0}
    gram_orig_total = gram_overlap = gram_cards = 0
    for oc in cards:
        if oc["id"] not in inline_ids or oc["db_content"] is None:
            continue
        sc = san_cards.get(oc["id"])
        if sc is None or sc["content"] is None:
            continue
        if is_read_rule_name(recon.get(oc["id"])):
            continue
        go = word_grams(strip_tags(oc["db_content"]))
        gs = word_grams(strip_tags(sc["content"]))
        gram_orig_total += len(go)
        gram_overlap += len(go & gs)
        gram_cards += 1

    san_names_blob = "\n".join((c["name"] or "") + "\x00" + (c["key"] or "")
                               for c in san_cards.values())
    name_absent = 0
    name_hit_lengths = []
    for cid in name_sample_ids:
        nm = recon[cid]
        if nm not in san_names_blob:
            name_absent += 1
        else:
            name_hit_lengths.append(len(nm))

    contents_blob = [r[0] for r in con.execute(
        "SELECT content FROM cards WHERE content IS NOT NULL")]
    snippet_candidates = sorted(
        cid for cid in inline_ids
        if by_id.get(cid) and by_id[cid]["db_content"]
        and not is_read_rule_name(recon.get(cid)))
    rng2 = random.Random(SAMPLE_SEED + 1)
    snippet_sample = rng2.sample(
        snippet_candidates, min(SNIPPET_SAMPLE, len(snippet_candidates)))
    token_checks = []
    for cid in snippet_sample:
        text = strip_tags(by_id[cid]["db_content"])
        toks = longest_tokens(text, 1)
        if not toks:
            continue
        tok = toks[0]
        hits = sum(1 for s in contents_blob if tok in s)
        token_checks.append({"token_len": len(tok), "hits": hits,
                             "absent": hits == 0})

    print("[5/5] leak-pattern scan ...", flush=True)
    leak_san = {k: 0 for k in LEAK_RES}
    leak_by_column = {"name": 0, "codename": 0, "content": 0, "referee_key": 0}
    for c in san_cards.values():
        for col in ("name", "codename", "content"):
            v = c[col] or ""
            hits = scan_leaks(v)
            for k, n in hits.items():
                leak_san[k] += n
                leak_by_column[col] += n
    for r in con.execute("SELECT referee_key FROM card_references"
                         " WHERE referee_key IS NOT NULL"):
        for k, n in scan_leaks(r[0]).items():
            leak_san[k] += n
            leak_by_column["referee_key"] += n

    instrument = {k: 0 for k in LEAK_RES}
    instrument_texts = 0
    for oc in cards:
        if oc["id"] in inline_ids and oc["db_content"]:
            instrument_texts += 1
            for k, n in scan_leaks(oc["db_content"]).items():
                instrument[k] += n

    # ---- (d) digest self-consistency -------------------------------------
    db_rows = [tuple(r) for r in con.execute(
        "SELECT id,name,key,codename,left_id,right_id,creator_id,updater_id,"
        "read_rule_class,read_rule_id,trash,type_id,content,created_at,"
        "updated_at FROM cards")]
    ref_rows_db = [tuple(r) for r in con.execute(
        "SELECT id,referer_id,referee_key,referee_id,ref_type,is_present "
        "FROM card_references")]
    meta = {r[0]: r[1] for r in con.execute("SELECT key,value FROM meta")}
    con.close()
    # NOTE: canonical_digest over (id,...)-tuples must match the builder's
    # row tuples; recompute on the same column order the builder used.
    cards_digest_db = canonical_digest(sorted(db_rows, key=lambda r: r[0]))
    refs_digest_db = canonical_digest(sorted(ref_rows_db, key=lambda r: r[0]))
    digests = {
        "cards_digest_recomputed": cards_digest_db,
        "cards_digest_recorded": meta.get("cards_digest"),
        "cards_digest_match": cards_digest_db == meta.get("cards_digest"),
        "references_digest_recomputed": refs_digest_db,
        "references_digest_recorded": meta.get("references_digest"),
        "references_digest_match": refs_digest_db == meta.get("references_digest"),
    }

    results = {
        "sampling": {
            "inline_content_rule": "id % 199 == 3",
            "inline_contents": len(inline_ids),
            "gram_cards_compared": gram_cards,
            "name_sample": len(name_sample_ids),
            "snippet_sample": len(token_checks),
        },
        "structural": checks,
        "name_structure": name_checks,
        "content_absence": {
            "five_grams_original": gram_orig_total,
            "five_grams_overlap": gram_overlap,
            "names_absent_exact": name_absent,
            "names_total": len(name_sample_ids),
            "name_substring_hit_lengths": name_hit_lengths,
            "token_checks": token_checks,
        },
        "leak_scan_sanitized": leak_san,
        "leak_scan_by_column": leak_by_column,
        "leak_scan_original_instrument": {
            "texts_scanned": instrument_texts,
            "hits": instrument,
        },
        "digests": digests,
        "star_rule_vocabulary": san_star,
    }
    out = os.path.join(outdir, "corpus-v2-verification.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, sort_keys=True)
        f.write("\n")

    def table(title, section):
        print("\n== %s ==" % title)
        print("| check | original | sanitized | equal |")
        print("|---|---|---|---|")
        for k, v in section.items():
            print("| %s | %s | %s | %s |" % (
                k.replace("_", " "), v["original"], v["sanitized"],
                "yes" if v["equal"] else "NO"))

    table("structural fidelity (original vs corpus v2)", checks)
    table("name-structure fidelity (new in v2)", name_checks)
    print("\n== content absence ==")
    print("5-grams compared: %d, overlap: %d" % (gram_orig_total, gram_overlap))
    print("sampled reconstructed names absent: %d/%d (substring-hit lengths: %s)"
          % (name_absent, len(name_sample_ids), name_hit_lengths))
    ok_tokens = sum(1 for t in token_checks if t["absent"])
    print("distinctive tokens absent: %d/%d" % (ok_tokens, len(token_checks)))
    print("\n== leak scan (corpus v2) ==")
    for k, v in leak_san.items():
        print("%s: %d" % (k, v))
    print("\n== leak scan instrument check (original sample, %d texts) =="
          % instrument_texts)
    for k, v in instrument.items():
        print("%s: %d" % (k, v))
    print("\n== digests ==")
    print(json.dumps(digests, indent=2))
    print("\nwrote %s" % out)


if __name__ == "__main__":
    main()
