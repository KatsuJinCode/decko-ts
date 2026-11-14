#!/usr/bin/env python3
"""reconstruct-coderay-byte-identity-shard-pair.py -- provisioning command for
the private corpus shard pair the coderay byte-identity gate reads.

Restores fixtures/corpus/shard-000000.jsonl + shard-000001.jsonl (gitignored,
machine-local, per the 46a05a64 test-corpus-paths contract) for
tests/card/render/code-highlighting/coderay-byte-identity.test.ts.

WHY THIS EXISTS
The original pair was untracked and lost with the 2026-10-02 root-checkout
deletion (C:/localProjects/decko-ts); until 2026-10-06 no provisioning command
existed, so the gate's 12 shard-dependent tests were dead with shard-read
ENOENT (adjudication: brandonDojoTech tmp/wrong-goal-hunt/
a1-mods-validation-lane.md, "Core reds adjudication" row 1).

HOW THE CONTENT BYTES ARE RECONSTRUCTED (provenance chain)
The lost shards carried the corpus-v2 SANITIZED deck content (the
build_corpus_v2.py pipeline: text runs -> deterministic same-byte-length
filler, HTML tag skeleton kept, inclusions resolved to sanitized names).
That transform is committed and deterministic (SEED ^ sha1/per-card PRNG
streams), so the shard content is reproduced by driving the committed
transform over a surviving copy of the deck: the machine backup
C:/backups/decko-db-2026-10-03/dump-postscrub.sqlite3 (sha256
623f5fcbfdbdde6e38d6a5b179e33a23c04cd1f4ec35c85779f2ee5ee6c66afd, copied
2026-10-03 AFTER the deletion by operator order; see that directory's
PROVENANCE.txt). Nothing original is emitted: the outputs are the sanitized
bytes the corpus itself was built from.

Correctness is not assumed: after writing, the script verifies structurally,
and the gate itself is the byte proof -- highlight(record.content, lang) must
reproduce the git-tracked Ruby oracle captures verbatim. All six cards were
byte-verified against those captures on 2026-10-06 (MATCH on every case,
including the two cards whose captured content contains non-structural atom
tokens, so the backup subset deck's atom vocabulary demonstrably reproduces
the original assignment for this pair).

NOT REPRODUCED (named): the original full-shard entry sets (thousands of
entries per shard) and the per-entry captured `views` objects from the Ruby
render sweep. The gate reads only `id` and `record.content`; see
README-coderay-byte-identity-shard-pair-provisioning.md next to this script.

Source DB override: DECKO_TS_CODERAY_SHARD_SOURCE_DB=<path to a deck sqlite
with the cards/card_references tables>.

Run:    python benchmarks/corpus-v2/reconstruct-coderay-byte-identity-shard-pair.py
Gate:   npx vitest run tests/card/render/code-highlighting/coderay-byte-identity.test.ts
"""

import json
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(REPO, "benchmarks"))
sys.path.insert(0, os.path.join(REPO, "benchmarks", "corpus-v2"))

import build_corpus_v2 as v2  # noqa: E402  (import rebinds resolve_inclusion -> v2)
from sanitize_corpus import is_read_rule_name, sanitize_content  # noqa: E402

SRC = os.environ.get(
    "DECKO_TS_CODERAY_SHARD_SOURCE_DB",
    "C:/backups/decko-db-2026-10-03/dump-postscrub.sqlite3",
)
PRIVATE_SHARD_DIR = os.path.join(REPO, "fixtures", "corpus")
CAPTURED_CODERAY_DIR = os.path.join(REPO, "fixtures", "captured", "coderay")

# shard file -> [(cardId, tracked capture the gate byte-compares, expected
# type_code of the row -- the gate's language dispatch)]
SHARDS = {
    "shard-000000.jsonl": [
        (53, "json-tinymce-corpus-53", "json"),
        (198, "css-corpus-198", "css"),
        (314, "html-layout-corpus-314", "layout_type"),
    ],
    "shard-000001.jsonl": [
        (2339, "html-layout-shard1-2339", "layout_type"),
        (2347, "html-layout-shard1-2347", "layout_type"),
        (2575, "html-layout-shard1-2575", "layout_type"),
    ],
}


def main():
    if not os.path.exists(SRC):
        raise SystemExit(
            "Source deck DB not found: %s\n"
            "Set DECKO_TS_CODERAY_SHARD_SOURCE_DB=<path> to a deck sqlite carrying "
            "the cards/card_references tables (machine backup: "
            "C:/backups/decko-db-2026-10-03/dump-postscrub.sqlite3)." % SRC
        )

    con = sqlite3.connect("file:%s?mode=ro" % SRC, uri=True)
    con.row_factory = sqlite3.Row
    cards = [dict(r) for r in con.execute(
        "SELECT id, name, key, codename, left_id, right_id, trash, type_id, db_content FROM cards")]
    refs = [dict(r) for r in con.execute("SELECT referee_key FROM card_references")]
    print("source deck: %d cards, %d refs (%s)" % (len(cards), len(refs), SRC))

    # --- the committed corpus-v2 name machinery, verbatim -------------------
    recon = v2.reconstruct_names(cards)
    atoms = set()
    for cid, name in recon.items():
        if name is None:
            continue
        for p in name.split("+"):
            atoms.add(p)
    key_parts = set()
    for r in refs:
        if r["referee_key"]:
            for p in r["referee_key"].split("+"):
                key_parts.add(p)
    atom_to_token, _overflows = v2.fit_tokens(atoms, key_parts)
    atom_keyform_to_token = {v2.keyform(a): t for a, t in atom_to_token.items()}
    unresolved_key_parts = {p for p in key_parts if p not in atom_keyform_to_token}
    key_part_tokens = v2.fit_key_tokens(unresolved_key_parts)

    def san_name_of(cid):
        name = recon.get(cid)
        if name is None:
            return None
        return "+".join(atom_to_token[p] for p in name.split("+"))

    def san_key_of(key):
        if key is None:
            return None
        if key == "":
            return ""
        return "+".join(
            atom_keyform_to_token.get(p) or key_part_tokens[p]
            for p in key.split("+"))

    name_to_id = {}
    for c in cards:
        nm = recon.get(c["id"])
        if nm is not None:
            name_to_id.setdefault(nm, c["id"])

    by_id = {c["id"]: c for c in cards}

    failures = 0
    os.makedirs(PRIVATE_SHARD_DIR, exist_ok=True)
    for shard_file, cases in sorted(SHARDS.items()):
        lines = []
        for card_id, fixture, expected_type_code in cases:
            row = by_id.get(card_id)
            if row is None:
                print("FAIL %s: card %d not in source deck" % (shard_file, card_id))
                failures += 1
                continue
            # The type card is the row whose id == type_id; its codename is
            # the Decko type_code (engine vocabulary, preserved verbatim).
            trow = by_id.get(row["type_id"])
            type_code = trow["codename"] if trow else None
            if type_code != expected_type_code:
                print("FAIL %s: card %d type_code is %r, expected %r"
                      % (shard_file, card_id, type_code, expected_type_code))
                failures += 1
                continue
            content = row["db_content"]
            if not content:
                print("FAIL %s: card %d has empty db_content" % (shard_file, card_id))
                failures += 1
                continue
            sanitized, _ovf = sanitize_content(
                content, card_id, name_to_id, san_name_of,
                read_rule=is_read_rule_name(recon.get(card_id) or ""))

            capture_path = os.path.join(CAPTURED_CODERAY_DIR, fixture + ".html")
            if not os.path.exists(capture_path):
                print("FAIL: tracked oracle capture missing: %s" % capture_path)
                failures += 1
                continue
            with open(capture_path, encoding="utf-8") as f:
                capture = f.read()
            if not capture.startswith('<div class="CodeRay">'):
                print("FAIL: capture lacks CodeRay DIV prefix: %s" % capture_path)
                failures += 1

            # Same field order as the committed miniature shard's lines.
            # left/right are the SANITIZED parent names (null here for all six).
            entry = {
                "id": card_id,
                "name": san_name_of(card_id),
                "record": {
                    "codename": row["codename"],
                    "content": sanitized,
                    "id": card_id,
                    "key": san_key_of(row["key"]),
                    "left": san_name_of(row["left_id"]) if row["left_id"] else None,
                    "name": san_name_of(card_id),
                    "right": san_name_of(row["right_id"]) if row["right_id"] else None,
                    "type": san_name_of(row["type_id"]),
                    "type_code": type_code,
                },
            }
            lines.append(json.dumps(entry) + "\n")

        if len(lines) == len(cases):
            out_path = os.path.join(PRIVATE_SHARD_DIR, shard_file)
            with open(out_path, "w", encoding="utf-8", newline="\n") as f:
                f.write("".join(lines))
            with open(out_path, encoding="utf-8") as f:
                written_ids = {json.loads(l)["id"] for l in f if l.strip()}
            for card_id, _fx, _tc in cases:
                if card_id not in written_ids:
                    print("FAIL readback: card %d not resolvable from %s"
                          % (card_id, out_path))
                    failures += 1
            print("wrote %s (%d entries: %s)"
                  % (out_path, len(lines), ", ".join(str(c[0]) for c in cases)))

    if failures:
        raise SystemExit("%d verification failure(s); shard pair NOT fully provisioned"
                         % failures)
    print("\nShard pair provisioned. Run the gate:\n"
          "  npx vitest run tests/card/render/code-highlighting/coderay-byte-identity.test.ts")


if __name__ == "__main__":
    main()
