// highlighter-seams-h1-h2-oracle-pins.test.ts -- the H1/H2 highlighter seam
// pins: byte identity between the port's scanners and the Ruby capture
// deck's rendered bytes. Ground-truth chain (all three legs read directly):
//   content  bench-corpus-raw.sqlite3 cards.id (readonly query)
//   oracle   tmp/raw-ground-truth/expected-v2/view-lane recapture shards
//   ruby     coderay-1.1.3 scanners + the card-mod views that call them
// (fixtures/corpus shard records for these ids are a divergent capture
// vintage -- 33795 is gibberish there while DB and oracle agree -- so the
// shards are NOT the grounding for these pins.)
//
//   H1  *Ace (id 33795) :open view, FULL BLOCK. Ruby:
//       card-mod-format-0.20.0 set/type/json.rb:19-21 view :core {
//       process_content ::CodeRay.scan(_render_raw, :json).div }. The
//       content carries no [[link]]/{{nest}} chunks, so the captured inner
//       IS the bare CodeRay scan and a full-block pin is exact. Exercises
//       the json key/string GROUP machinery the pre-2026-10-01 port
//       emitted as a bare <span>: coderay-1.1.3 styles/alpha.rb:97-99
//       (.key family), :122-125 (.string family), :132 (.value),
//       :94 (.integer); json.rb emits true/false/null as :value, numbers
//       as :integer/:float, punctuation as :operator (css_class false ->
//       no wrapper at all).
//   H2  Classic Layout (id 314) :content view, REGIONS. Ruby:
//       card-mod-layout-0.20.0 set/type/layout_type.rb:12-18 view :core
//       (with_nest_mode :template) wrapping CodeRay.scan(raw, :html).div;
//       the <script> body tokenizes through Scanners::JavaScript into the
//       SAME encoder (html.rb:76-80, `tokenize code, :tokens => encoder`),
//       so keyword/key/string tokens print INSIDE the :inline group
//       (html.rb:235-245). A full-block pin is impossible by construction:
//       the captured view ran process_content AFTER the scan (the [[...]]
//       links are expanded anchors in the oracle bytes, {{...}} nests stay
//       literal under :template), so the pins target the script-body
//       regions, which carry no chunks. Region bytes below are verbatim
//       substrings of the oracle d.views.content (recapture-raw-shard-
//       000000.jsonl, id 314); the synthetic inputs' body bytes match the
//       captured card's script body (2/4-space indent, \n joins).
import { describe, expect, it } from "vitest";
import { scanJson } from "../../../../src/card/render/code-highlighting/scanners/json.js";
import { scanHtml } from "../../../../src/card/render/code-highlighting/scanners/html.js";

// __ACE_CONTENT__ / __ACE_INNER__ are substituted from the DB + oracle
// extract (node, this suite) - never hand-copied bytes.
const ACE_CONTENT = "{\n  \"default\": {\n  \"showGutter\": true,\n  \"theme\": \"ace/theme/github\",\n  \"printMargin\": false,\n  \"tabSize\": 2,\n  \"useSoftTabs\": true,\n  \"maxLines\": 30\n  }\n}\n";
const ACE_ORACLE_INNER = "{\n  <span style=\"color:#606\"><span style=\"color:#404\">&quot;</span><span>default</span><span style=\"color:#404\">&quot;</span></span>: {\n  <span style=\"color:#606\"><span style=\"color:#404\">&quot;</span><span>showGutter</span><span style=\"color:#404\">&quot;</span></span>: <span style=\"color:#088\">true</span>,\n  <span style=\"color:#606\"><span style=\"color:#404\">&quot;</span><span>theme</span><span style=\"color:#404\">&quot;</span></span>: <span style=\"background-color:hsla(0,100%,50%,0.05)\"><span style=\"color:#710\">&quot;</span><span style=\"color:#D20\">ace/theme/github</span><span style=\"color:#710\">&quot;</span></span>,\n  <span style=\"color:#606\"><span style=\"color:#404\">&quot;</span><span>printMargin</span><span style=\"color:#404\">&quot;</span></span>: <span style=\"color:#088\">false</span>,\n  <span style=\"color:#606\"><span style=\"color:#404\">&quot;</span><span>tabSize</span><span style=\"color:#404\">&quot;</span></span>: <span style=\"color:#00D\">2</span>,\n  <span style=\"color:#606\"><span style=\"color:#404\">&quot;</span><span>useSoftTabs</span><span style=\"color:#404\">&quot;</span></span>: <span style=\"color:#088\">true</span>,\n  <span style=\"color:#606\"><span style=\"color:#404\">&quot;</span><span>maxLines</span><span style=\"color:#404\">&quot;</span></span>: <span style=\"color:#00D\">30</span>\n  }\n}\n";

describe("highlighter seams H1: json group-scoped styles (the *Ace oracle, id 33795)", () => {
  it("scanJson reproduces the captured *Ace :open CodeRay block byte-for-byte", () => {
    expect(scanJson(ACE_CONTENT)).toBe(ACE_ORACLE_INNER);
  });

  it("the oracle bytes carry the group-scoped spans the old port dropped (pin sanity)", () => {
    // key group span + styled delimiters + styleless content span
    // (alpha.rb:97-99)
    expect(ACE_ORACLE_INNER).toContain(
      '<span style="color:#606"><span style="color:#404">&quot;</span><span>default</span><span style="color:#404">&quot;</span></span>',
    );
    // :value (true/false -> alpha .value, alpha.rb:132) and :integer
    // (alpha.rb:94) - the shapes the committed card-53 all-:error pin
    // never reaches
    expect(ACE_ORACLE_INNER).toContain('<span style="color:#088">true</span>');
    expect(ACE_ORACLE_INNER).toContain('<span style="color:#00D">30</span>');
    // string group: background + delimiter/content styles (alpha.rb:122-125)
    expect(ACE_ORACLE_INNER).toContain(
      '<span style="background-color:hsla(0,100%,50%,0.05)"><span style="color:#710">&quot;</span><span style="color:#D20">ace/theme/github</span><span style="color:#710">&quot;</span></span>',
    );
  });
});

describe("highlighter seams H2: script-body JS tokens (the Classic Layout oracle, id 314)", () => {
  it("region 1: tag head + inline group + keyword + key + string group (oracle bytes)", () => {
    // verbatim oracle region (shard-000000 id 314 views.content): the tag
    // close, the newline OUTSIDE the group, the .inline group span
    // (alpha.rb:91), bare spaces, the .keyword var span, the .key token,
    // the .string group with its delimiters
    const out = scanHtml(
      '<script type="text/javascript">\n  var uservoiceOptions = {\n    key: \'example.com\',\n    showTab: true\n  };\n</script>',
    );
    expect(out).toContain(
      '<span style="color:#070;font-weight:bold">&gt;</span>\n<span style="background-color:hsla(0,0%,0%,0.07);color:black">  <span style="color:#080;font-weight:bold">var</span> uservoiceOptions = {\n    <span style="color:#606">key</span>: <span style="background-color:hsla(0,100%,50%,0.05)"><span style="color:#710">\'</span><span style="color:#D20">example.com</span><span style="color:#710">\'</span></span>,',
    );
  });

  it("region 2: :predefined_constant + :function kinds inside the body (oracle bytes)", () => {
    // verbatim oracle region: showTab's true is a JS predefined constant
    // (alpha .predefined_constant, color:#069), the `};` operator run is
    // bare, `function` re-arms function-expected and the next ident gets
    // the .function span (java_script.rb:115-132's refinement chain)
    const out = scanHtml(
      '<script type="text/javascript">\n  var uservoiceOptions = {\n    key: \'example.com\',\n    showTab: true\n  };\n  function _loadUserVoice() {\n    var s = document.createElement(\'script\');\n  };\n</script>',
    );
    expect(out).toContain(
      '<span style="color:#606">showTab</span>: <span style="color:#069">true</span>\n  };\n  <span style="color:#080;font-weight:bold">function</span> <span style="color:#06B;font-weight:bold">_loadUserVoice</span>() {\n    <span style="color:#080;font-weight:bold">var</span> s = document.createElement(<span style="background-color:hsla(0,100%,50%,0.05)"><span style="color:#710">\'</span><span style="color:#D20">script</span><span style="color:#710">\'</span></span>);',
    );
  });

  it("region 3: key group closes at the inner quote, inline at the body end_group (received under job-1790863167087)", () => {
    // Body `{"a":` per the java_script.rb state machine: `{` operator
    // bare (css_class false), the :key group opens (alpha.rb:97 .key),
    // the opening quote as .key .delimiter (:99), the content span bare
    // (`  .key .content` has no alpha rule), then the body's SECOND quote
    // is the key's CLOSING delimiter - KEY_CHECK's lookahead already
    // required it plus the colon - so the key group closes THERE, the
    // trailing `:` scans bare in :initial, and the :inline group closes
    // at the body delegation's end_group (html.rb:243). Corollary: a
    // :key group can never survive to end_of_stream (the lookahead needs
    // the same quote that closes the group), so java_script.rb:215's
    // :string/:regexp-only close leaves nothing open on any reachable
    // input and the encoder's finish (html.rb:195-198, closeAllGroups)
    // runs as the byte-invisible no-op it is in Ruby. Expected bytes are
    // the stream RECEIVED under queue job-1790863167087-809eb639 (the
    // pre-fix pin's assertion failure printed them; every other pin in
    // this file passed that job).
    const out = scanHtml('<script>{"a":</script>');
    expect(out).toBe(
      '<span style="color:#070;font-weight:bold">&lt;script&gt;</span><span style="background-color:hsla(0,0%,0%,0.07);color:black">{<span style="color:#606"><span style="color:#404">&quot;</span><span>a</span><span style="color:#404">&quot;</span></span>:</span><span style="color:#070;font-weight:bold">&lt;/script&gt;</span>',
    );
  });
});
