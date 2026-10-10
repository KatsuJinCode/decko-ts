"""Speed-ship byte-identity and trip gate.

Every render is one fresh hidden node process over the local trial-deck
mirror. Byte identity masks only data-slot-id. The reference is the
integration tip's normal render (the baseline mode of a bundle built at the
tip), rendered once per page into --ref-dir.

  python benchmarks/speed-ship/gate.py pages                       print the page set
  python benchmarks/speed-ship/gate.py ref   --bundle B --start 0 --count 6
  python benchmarks/speed-ship/gate.py check --bundle B --mode baseline --start 0 --count 6 [--latency 30] [--extra "..."]

Keep every invocation under two minutes: slice with --start/--count.
"""
import argparse, hashlib, json, os, random, re, subprocess, sys, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)
SLOT = re.compile(rb'data-slot-id="[0-9a-f]+"')
POOL = r"C:\localProjects\brandonDojoTech\recovery\page-sample-pool.txt"

# WRITEUP rounds 5-8: the 8 gate pages, the 4 holdout pages, rounds 7-8's 12.
EARLIER = [
    "About", "Home", "Aikido Oak Cliff", "Archetypal Psychology", "Conflict Done Well", "Latest News",
    "Final", "ABCglobal 20100909 Iris Brandon Leon",
    "EM Forster - The Machine Stops 1909", "Anniversary card for Lisa 2013", "AriseBuilding",
    "Antero Alli - Astrology as Archetypal Language",
    "NCDHHSFAST SBR 03", "Family Christmas Ideas", "PxPx PRINTS Emeryville 20150107 4059",
    "Martial Nonviolence Cultural Resources", "Translators Note",
    "Kimberly Winston - Huston Smith A History Of Faith", "NMLIC QBR 04 prep", "Runequest w Don McClure",
    "screenshot", "Pavis - The Big Rubble Map", "social media maintenance", "Thomas Moore - An Altar to Artemis",
]
# Round 9: the Wagneer defect page and the slowest classes (denied root, deep content).
ROUND9 = ["Wagneer", "Gifts for", "Pattern", "DR Consult", "Daily reading BW", "File"]
FRESH_SEED = 20261006
FRESH_N = 10


def pool_names():
    paths = [l.strip() for l in open(POOL, encoding="utf8") if l.strip() and not l.startswith("#")]
    return [urllib.parse.unquote(p.lstrip("/")).replace("_", " ") for p in paths]


def fresh_pages():
    """10 pages none of the POC rounds measured: excludes rounds 5-8, the
    round-9 100 (seed 20261012) and the round-9 slow list."""
    names = pool_names()
    seen, cands = set(EARLIER + ROUND9), []
    for n in names:
        if n not in seen:
            seen.add(n)
            cands.append(n)
    r9 = set(random.Random(20261012).sample(cands, 100))
    cands = [c for c in cands if c not in r9]
    return random.Random(FRESH_SEED).sample(cands, FRESH_N)


def pages():
    return EARLIER + ROUND9 + fresh_pages()


def fname(page):
    safe = re.sub(r"[^A-Za-z0-9]+", "_", page)[:40]
    return f"{safe}-{hashlib.sha1(page.encode('utf8')).hexdigest()[:8]}.html"


def norm(path):
    with open(path, "rb") as f:
        return SLOT.sub(b'data-slot-id="X"', f.read())


def render(bundle, page, mode, latency, out, extra="", db=None, timeout=110):
    if os.path.exists(out):
        os.remove(out)
    cmd = ["node", bundle, "--page", page, "--mode", mode, "--latency", str(latency), "--out", out]
    if db:
        cmd += ["--db", db]
    cmd += extra.split()
    try:
        p = subprocess.run(cmd, cwd=REPO, capture_output=True, timeout=timeout, creationflags=NO_WINDOW)
    except subprocess.TimeoutExpired:
        return {"outcome": "timeout"}
    for line in p.stdout.decode("utf8", "replace").splitlines():
        if line.startswith("SHIP-REPORT "):
            return json.loads(line[len("SHIP-REPORT "):])
    return {"outcome": "no report", "stderr": p.stderr.decode("utf8", "replace")[-400:]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["pages", "ref", "check"])
    ap.add_argument("--bundle", default="benchmarks/speed-ship/render-page.mjs")
    ap.add_argument("--mode", default="baseline")
    ap.add_argument("--latency", type=int, default=0)
    ap.add_argument("--extra", default="")
    ap.add_argument("--db", default=None)
    ap.add_argument("--ref-dir", required=False)
    ap.add_argument("--out-dir", required=False)
    ap.add_argument("--pages", default="")
    ap.add_argument("--start", type=int, default=0)
    ap.add_argument("--count", type=int, default=1000)
    a = ap.parse_args()
    ps = a.pages.split(";") if a.pages else pages()
    ps = ps[a.start:a.start + a.count]
    if a.cmd == "pages":
        for i, p in enumerate(pages()):
            print(i, p)
        return
    if a.cmd == "ref":
        os.makedirs(a.ref_dir, exist_ok=True)
        for p in ps:
            r = render(a.bundle, p, "baseline", 0, os.path.join(a.ref_dir, fname(p)), a.extra, a.db)
            print(json.dumps({"page": p, "outcome": r.get("outcome"), "trips": r.get("round_trips_total"),
                              "wall": r.get("local_wall_ms"), "bytes": r.get("html_bytes")}), flush=True)
        return
    os.makedirs(a.out_dir, exist_ok=True)
    bad = 0
    for p in ps:
        out = os.path.join(a.out_dir, fname(p))
        r = render(a.bundle, p, a.mode, a.latency, out, a.extra, a.db)
        ref = os.path.join(a.ref_dir, fname(p))
        same = r.get("outcome") == "ok" and os.path.exists(ref) and norm(ref) == norm(out)
        bad += not same
        print(json.dumps({"page": p, "same": same, "trips": r.get("round_trips_total"), "stmts": r.get("statements"),
                          "wall": r.get("local_wall_ms"), "db": r.get("local_db_ms"), "bytes": r.get("html_bytes"),
                          **({} if r.get("outcome") == "ok" else {"outcome": r.get("outcome")}),
                          **({"extra_report": r["extra"]} if "extra" in r else {})}), flush=True)
    print(json.dumps({"pages": len(ps), "not_identical": bad}), flush=True)


if __name__ == "__main__":
    main()
