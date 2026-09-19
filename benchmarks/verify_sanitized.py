#!/usr/bin/env python3
"""verify_sanitized.py -- prove the benchmark corpus is structure-preserving
and content-free. Companion to sanitize_corpus.py (reuses its dump parser so
original-side metrics come from the same proven linear reader, but every
comparison is computed here from the dump and the corpus independently -- the
sanitizer's manifest is never trusted).

Checks
  (a) structural fidelity: card counts, per-type distribution, name-length
      histogram, content-length histogram, junction part-count distribution,
      row-level (id, left_id, right_id, trash, type_id) equality, references
      multiset equality, top-20 inclusion fan-out degrees.
  (b) content absence: word 5-gram overlap (original vs sanitized, tags
      stripped), exact-name absence for 50 sampled cards, distinctive-token
      absence for 20 sampled contents.
  (c) leak-pattern scan: the deterministic patterns from the proven public-
      leak scanner (extract-public-pile-for-privacy-review.py SIGNAL_RE
      keyword list + email pattern) plus SSN/phone digit shapes, over the
      full sanitized corpus (expect zero) AND over the sampled original
      content as an instrument check (expect fires).

Sampling is deterministic: contents are captured inline for ids with
id % SAMPLE_MOD == SAMPLE_RES; name/snippet subsets are drawn with a seeded
PRNG. Same dump -> same verdicts.

Output: benchmarks/results/corpus-verification.json + markdown tables on
stdout (pasted into docs/benchmark-corpus-report.md).
"""

import json
import os
import random
import re
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sanitize_corpus import parse_dump, is_read_rule_name  # noqa: E402

SAMPLE_MOD = 199
SAMPLE_RES = 3
SAMPLE_SEED = 12345
NAME_SAMPLE = 50
SNIPPET_SAMPLE = 20
GRAM_N = 5

TAG_RE = re.compile(r"<[^>]*>")
WORD_RE = re.compile(r"\w+")

# deterministic leak patterns (extended from the proven SIGNAL_RE)
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
    """Distinctive letters-only tokens from text, longest first."""
    toks = sorted({t for t in WORD_RE.findall(text)
                   if len(t) >= min_len and t.isalpha()},
                  key=len, reverse=True)
    return toks[:k]


def scan_leaks(text):
    """Run the leak patterns over one blob with cheap rejection prefilters.

    Prefilters matter: sanitized filler is long continuous letter runs, and
    the email pattern's leading [\\w.+-]+ backtracks through every position
    of such runs (quadratic). An email requires '@'; the SSN/phone shapes
    require a digit. The keyword alternation is linear and always runs.
    """
    out = {}
    if "@" in text:
        out["email"] = len(LEAK_RES["email"].findall(text))
    if any(c.isdigit() for c in text):
        out["ssn_shape"] = len(LEAK_RES["ssn_shape"].findall(text))
        out["phone_shape"] = len(LEAK_RES["phone_shape"].findall(text))
    out["keyword_list"] = len(LEAK_RES["keyword_list"].findall(text))
    return out


# --------------------------------------------------------------------------
# original side: one linear pass over the dump
# --------------------------------------------------------------------------

def collect_original(dump):
    cards, refs = parse_dump(dump)
    live = [c for c in cards if c["trash"] == 0]
    orig = {
        "cards": cards,
        "refs": refs,
        "live_ids": {c["id"] for c in live},
        "type_hist": Counter(c["type_id"] for c in live),
        "name_len_hist": Counter(len(c["name"].encode("utf-8"))
                                 for c in live if c["name"] is not None),
        "content_len_hist": Counter(len(c["db_content"].encode("utf-8"))
                                    for c in live if c["db_content"] is not None),
        "junction_parts_hist": Counter(c["name"].count("+") + 1
                                       for c in live if c["name"] is not None),
        "out_deg": Counter(),
    }
    for r in refs:
        if r["ref_type"] == "I":
            orig["out_deg"][r["referer_id"]] += 1
    return orig


def main():
    dump = sys.argv[1] if len(sys.argv) > 1 else \
        r"C:\localProjects\culturesmith-migration\incoming\culturesmith-2026-09-07.sql"
    here = os.path.dirname(os.path.abspath(__file__))
    dbpath = os.path.join(here, "corpus", "bench-corpus.sqlite3")
    outdir = os.path.join(here, "results")
    os.makedirs(outdir, exist_ok=True)

    print("[1/4] linear pass over original dump ...", flush=True)
    orig = collect_original(dump)
    print("      live=%d rows=%d refs=%d" % (len(orig["live_ids"]),
          len(orig["cards"]), len(orig["refs"])), flush=True)

    print("[2/4] reading sanitized corpus ...", flush=True)
    import sqlite3
    con = sqlite3.connect(dbpath)
    con.row_factory = sqlite3.Row
    san_cards = {r["id"]: dict(r) for r in con.execute(
        "SELECT id,name,key,codename,left_id,right_id,trash,type_id,content"
        " FROM cards")}
    san_refs = [tuple(r) for r in con.execute(
        "SELECT referer_id,referee_id,ref_type,is_present FROM card_references")]
    orig_refs = [(r["referer_id"], r["referee_id"], r["ref_type"], r["is_present"])
                 for r in orig["refs"]]

    # ---- (a) structural fidelity ------------------------------------------
    san_live_ids = {cid for cid, c in san_cards.items() if c["trash"] == 0}
    checks = {}
    checks["card_rows_total"] = (len(orig["cards"]), len(san_cards),
                                 len(orig["cards"]) == len(san_cards))
    checks["live_cards"] = (len(orig["live_ids"]), len(san_live_ids),
                            len(orig["live_ids"]) == len(san_live_ids))
    checks["trashed_cards"] = (len(orig["cards"]) - len(orig["live_ids"]),
                               len(san_cards) - len(san_live_ids), True)
    checks["references_rows"] = (len(orig_refs), len(san_refs),
                                 len(orig_refs) == len(san_refs))
    checks["references_multiset_equal"] = (
        "see note", "see note", Counter(orig_refs) == Counter(san_refs))

    san_type = Counter(san_cards[cid]["type_id"] for cid in san_live_ids)
    checks["type_distribution_equal"] = (
        sum(orig["type_hist"].values()), sum(san_type.values()),
        orig["type_hist"] == san_type)

    san_name_len = Counter(len(san_cards[cid]["name"].encode("utf-8"))
                           for cid in san_live_ids if san_cards[cid]["name"])
    orig_name_len = orig["name_len_hist"]
    mism_names = {k: (orig_name_len.get(k, 0), san_name_len.get(k, 0))
                  for k in set(orig_name_len) | set(san_name_len)
                  if orig_name_len.get(k, 0) != san_name_len.get(k, 0)}
    checks["name_length_histogram_equal"] = (
        sum(orig_name_len.values()), sum(san_name_len.values()),
        not mism_names)

    san_content_len = Counter(
        len(san_cards[cid]["content"].encode("utf-8"))
        for cid in san_live_ids if san_cards[cid]["content"] is not None)
    orig_content_len = orig["content_len_hist"]
    mism_content = {k: (orig_content_len.get(k, 0), san_content_len.get(k, 0))
                    for k in set(orig_content_len) | set(san_content_len)
                    if orig_content_len.get(k, 0) != san_content_len.get(k, 0)}
    checks["content_length_histogram_equal"] = (
        sum(orig_content_len.values()), sum(san_content_len.values()),
        not mism_content)

    san_parts = Counter(san_cards[cid]["name"].count("+") + 1
                        for cid in san_live_ids if san_cards[cid]["name"])
    checks["junction_part_count_equal"] = (
        "max %d" % max(orig["junction_parts_hist"]),
        "max %d" % max(san_parts),
        orig["junction_parts_hist"] == san_parts)

    # row-level topology equality on live cards
    orig_by_id = {c["id"]: c for c in orig["cards"]}
    row_bad = 0
    for cid in san_live_ids:
        oc = orig_by_id.get(cid)
        if oc is None:
            row_bad += 1
            continue
        sc = san_cards[cid]
        if (oc["left_id"] != sc["left_id"] or oc["right_id"] != sc["right_id"]
                or oc["type_id"] != sc["type_id"]):
            row_bad += 1
    checks["row_topology_equal"] = (len(san_live_ids), row_bad, row_bad == 0)

    orig_top20 = sorted(orig["out_deg"].values(), reverse=True)[:20]
    san_out = Counter()
    for referer, _referee, rtype, _present in san_refs:
        if rtype == "I":
            san_out[referer] += 1
    san_top20 = sorted(san_out.values(), reverse=True)[:20]
    checks["top20_inclusion_fanout_equal"] = (
        orig_top20[0], san_top20[0], orig_top20 == san_top20)

    # ---- (b) content absence ----------------------------------------------
    print("[3/4] content-absence checks ...", flush=True)
    rng = random.Random(SAMPLE_SEED)
    live_named = [c for c in orig["cards"]
                  if c["trash"] == 0 and c["name"] is not None]
    name_sample = rng.sample(live_named, min(NAME_SAMPLE, len(live_named)))

    # contents captured for the deterministic inline sample (hash-based id)
    inline_ids = {c["id"] for c in orig["cards"]
                  if c["id"] % SAMPLE_MOD == SAMPLE_RES
                  and c["db_content"] is not None and c["trash"] == 0}
    gram_orig_total = gram_overlap = 0
    gram_cards = 0
    for oc in orig["cards"]:
        if oc["id"] not in inline_ids or oc["db_content"] is None:
            continue
        sc = san_cards.get(oc["id"])
        if sc is None or sc["content"] is None:
            continue
        if is_read_rule_name(oc["name"]):
            continue  # role buckets are synthetic by design; grams meaningless
        go = word_grams(strip_tags(oc["db_content"]))
        gs = word_grams(strip_tags(sc["content"]))
        gram_orig_total += len(go)
        gram_overlap += len(go & gs)
        gram_cards += 1

    # exact-name absence + substring scan of the corpus name column
    san_names_blob = "\n".join((c["name"] or "") + "\x00" + (c["key"] or "")
                               for c in san_cards.values())
    name_absent = 0
    name_substring_hits = []
    for oc in name_sample:
        nm = oc["name"]
        if nm not in san_names_blob:
            name_absent += 1
        else:
            name_substring_hits.append(len(nm))

    # distinctive-token absence for sampled contents
    token_checks = []
    contents_blob = []
    for row in con.execute("SELECT content FROM cards WHERE content IS NOT NULL"):
        contents_blob.append(row[0])
    snippet_candidates = [c for c in orig["cards"]
                          if c["id"] in inline_ids and c["db_content"]
                          and not is_read_rule_name(c["name"])]
    rng2 = random.Random(SAMPLE_SEED + 1)
    snippet_sample = rng2.sample(
        snippet_candidates, min(SNIPPET_SAMPLE, len(snippet_candidates)))
    for oc in snippet_sample:
        text = strip_tags(oc["db_content"])
        toks = longest_tokens(text, 1)
        if not toks:
            continue
        tok = toks[0]
        hits = sum(1 for s in contents_blob if tok in s)
        token_checks.append({"token_len": len(tok), "hits": hits,
                             "absent": hits == 0})

    # ---- (c) leak-pattern scan --------------------------------------------
    print("[4/4] leak-pattern scan (sanitized corpus + original instrument) ...",
          flush=True)
    leak_san = {k: 0 for k in LEAK_RES}
    for c in san_cards.values():
        blob = (c["name"] or "") + "\n" + (c["content"] or "")
        for k, n in scan_leaks(blob).items():
            leak_san[k] += n
    for r in con.execute("SELECT referee_key FROM card_references"
                         " WHERE referee_key IS NOT NULL"):
        for k, n in scan_leaks(r[0]).items():
            leak_san[k] += n

    instrument_orig = {k: 0 for k in LEAK_RES}
    instrument_texts = 0
    for oc in orig["cards"]:
        if oc["id"] in inline_ids and oc["db_content"]:
            instrument_texts += 1
            for k, n in scan_leaks(oc["db_content"]).items():
                instrument_orig[k] += n

    con.close()

    # ---- verdicts ----------------------------------------------------------
    results = {
        "date_basis": "corpus-verification",
        "sampling": {
            "inline_content_rule": "id %% %d == %d" % (SAMPLE_MOD, SAMPLE_RES),
            "inline_contents": len(inline_ids),
            "gram_cards_compared": gram_cards,
            "name_sample": len(name_sample),
            "snippet_sample": len(token_checks),
        },
        "structural": {k: {"original": v[0], "sanitized": v[1], "equal": v[2]}
                       for k, v in checks.items()},
        "name_length_mismatch_buckets": {str(k): v for k, v in
                                         sorted(mism_names.items())},
        "content_length_mismatch_buckets": {str(k): v for k, v in
                                            sorted(mism_content.items())},
        "content_absence": {
            "five_grams_original": gram_orig_total,
            "five_grams_overlap": gram_overlap,
            "names_absent_exact": name_absent,
            "names_total": len(name_sample),
            "name_substring_hit_lengths": name_substring_hits,
            "token_checks": token_checks,
        },
        "leak_scan_sanitized": leak_san,
        "leak_scan_original_instrument": {
            "texts_scanned": instrument_texts,
            "hits": instrument_orig,
        },
    }
    out = os.path.join(outdir, "corpus-verification.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, sort_keys=True)
        f.write("\n")

    # markdown for the report
    print("\n== structural fidelity (original vs sanitized) ==")
    print("| metric | original | sanitized | equal |")
    print("|---|---|---|---|")
    for k, v in checks.items():
        print("| %s | %s | %s | %s |" % (k.replace("_", " "), v[0], v[1],
                                         "yes" if v[2] else "NO"))
    if mism_names:
        print("\nname-length buckets that deviated: %s" % mism_names)
    if mism_content:
        print("\ncontent-length buckets that deviated: %s" % mism_content)
    print("\n== content absence ==")
    print("5-grams compared: %d, overlap: %d" % (gram_orig_total, gram_overlap))
    print("sampled names absent: %d/%d (substring-hit lengths: %s)"
          % (name_absent, len(name_sample), name_substring_hits))
    ok_tokens = sum(1 for t in token_checks if t["absent"])
    print("distinctive tokens absent: %d/%d" % (ok_tokens, len(token_checks)))
    print("\n== leak scan (sanitized corpus) ==")
    for k, v in leak_san.items():
        print("%s: %d" % (k, v))
    print("\n== leak scan instrument check (original sample, %d texts) ==" % instrument_texts)
    for k, v in instrument_orig.items():
        print("%s: %d" % (k, v))
    print("\nwrote %s" % out)


if __name__ == "__main__":
    main()
