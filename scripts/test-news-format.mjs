// Run: node scripts/test-news-format.mjs   (checks that news-format.js renders posts correctly and can never emit unsafe HTML)
import fs from "node:fs";
const mod = { exports: {} };
new Function("module", "exports", fs.readFileSync(new URL("../news-format.js", import.meta.url), "utf8")).call({}, mod, mod.exports);
const { render, excerpt, slide } = mod.exports;
const BASE = "https://api.test";
let pass = 0, fail = 0;
const ok = (c, name, extra = "") => { c ? pass++ : fail++; console.log(`${c ? "  ok  " : " FAIL "} ${name}${c ? "" : "  " + extra}`); };
const has = (html, s) => html.includes(s);

// Safety invariant: only these tags/attributes, links and pictures only to http(s), nothing script-like, no stray angle brackets from the author.
const TAGS = new Set(["p", "br", "strong", "em", "s", "code", "a", "ul", "ol", "li", "blockquote", "hr", "h4", "figure", "figcaption", "img"]);
const ATTRS = new Set(["href", "target", "rel", "src", "alt", "loading", "decoding", "class"]);
function unsafe(html) {
  const bad = [];
  for (const m of html.matchAll(/<(\/?)([a-zA-Z0-9]+)((?:\s+[a-z-]+="[^"<>]*")*)\s*\/?>/g)) {
    if (!TAGS.has(m[2])) bad.push("tag " + m[2]);
    for (const a of m[3].matchAll(/\s+([a-z-]+)="([^"]*)"/g)) {
      if (!ATTRS.has(a[1])) bad.push("attr " + a[1]);
      if ((a[1] === "href" || a[1] === "src") && !/^https?:\/\//.test(a[2])) bad.push("url " + a[2]);
    }
  }
  const stripped = html.replace(/<(\/?)([a-zA-Z0-9]+)((?:\s+[a-z-]+="[^"<>]*")*)\s*\/?>/g, "");
  if (/[<>]/.test(stripped)) bad.push("stray < or > in text");
  if (/\u0000/.test(html)) bad.push("placeholder leaked");
  return bad;
}

console.log("formatting");
ok(has(render("**bold** and *italic* and _under_ and ~~gone~~"), "<strong>bold</strong> and <em>italic</em> and <em>under</em> and <s>gone</s>"), "bold, italic, underscore italic, strike");
ok(render("snake_case_name and 2 * 3 * 4") === "<p>snake_case_name and 2 * 3 * 4</p>", "snake_case and spaced asterisks are left alone", render("snake_case_name and 2 * 3 * 4"));
ok(render("# One\n## Two\n### Three") === '<h4 class="nh nh1">One</h4><h4 class="nh nh2">Two</h4><h4 class="nh nh3">Three</h4>', "three heading levels");
ok(render("- a\n- b\n\n1. x\n2) y") === "<ul><li>a</li><li>b</li></ul><ol><li>x</li><li>y</li></ol>", "bullet and numbered lists");
ok(render("> one\n> two") === "<blockquote>one<br>two</blockquote>", "quotes");
ok(render("a\n---\nb") === "<p>a</p><hr><p>b</p>", "a divider line");
ok(render("line one\nline two\n\nnew paragraph") === "<p>line one<br>line two</p><p>new paragraph</p>", "line breaks are kept, blank lines start a paragraph");
ok(has(render("`<b>x</b>`"), "<code>&lt;b&gt;x&lt;/b&gt;</code>"), "code is shown, not run");
const lnk = render("see [the site](https://example.com/a?b=1&c=2) now");
ok(has(lnk, '<a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer nofollow">the site</a>'), "links open in a new tab with safe rel", lnk);
ok(has(render("go to https://example.com/x."), '>https://example.com/x</a>.'), "bare links work and keep the full stop outside");
ok(has(render("[**bold link**](https://e.com)"), "<strong>bold link</strong></a>"), "formatting inside a link label");
const swapped = render("See [https://www.dirtysocks.net/bis](Best In Slot) and [https://www.dirtysocks.net/dungeon-loot](Dungeon Loot)");
ok(has(swapped, '<a href="https://www.dirtysocks.net/bis" target="_blank" rel="noopener noreferrer nofollow">Best In Slot</a>') && has(swapped, '>Dungeon Loot</a>') && !has(swapped, "]("), "a link written the wrong way round, [address](words), still works", swapped);
ok(has(render("[https://a.com](https://b.com)"), 'href="https://b.com"'), "[address](address) is read the normal way (second one is the target)");
ok(!has(render('[https://a.com"onmouseover="x](hi)'), "onmouseover=\"x") || !has(render('[https://a.com"onmouseover="x](hi)'), "<a"), "a quote inside a wrong-way-round address cannot add attributes");
ok(!has(render("[https://a.com](javascript:alert(1))"), 'href="javascript'), "wrong-way-round with a script target is not a script link");
ok(excerpt("Try [https://www.dirtysocks.net/bis](Best In Slot) now") === "Try Best In Slot now", "teaser shows the words of a wrong-way-round link", excerpt("Try [https://www.dirtysocks.net/bis](Best In Slot) now"));
const pic = render("![The raid](img:abc123xyz)", BASE);
ok(pic === '<figure class="nfig"><a class="nimg" href="https://api.test/api/news/img/abc123xyz" target="_blank" rel="noopener"><img src="https://api.test/api/news/img/abc123xyz" alt="The raid" loading="lazy" decoding="async"></a><figcaption>The raid</figcaption></figure>', "a picture on its own line becomes a captioned figure", pic);
ok(!has(render("![](img:abc123xyz)", BASE), "figcaption") && has(render("![](img:abc123xyz)", BASE), 'alt="Picture from this news post"'), "no caption: no figcaption, still has alt text");
ok(has(render("text ![x](img:abc123xyz) more", BASE), '<p>text <a class="nimg"'), "a picture inside a line stays inline");
ok(render("") === "" && render(null) === "" && render("   \n \n") === "", "empty input renders nothing");

console.log("teaser (excerpt)");
ok(excerpt("") === "" && excerpt(null) === "" && excerpt("short and sweet") === "short and sweet", "short or empty text comes back as is");
const long = "word ".repeat(200), ex = excerpt(long);
ok(ex.length >= 200 && ex.length <= 300 && ex.endsWith("\u2026") && !/\s\u2026$/.test(ex) && /word\u2026$/.test(ex), "long text is cut at a word to 200-300 characters with an ellipsis", ex.length + " " + ex.slice(-20));
ok(excerpt("x".repeat(900)).length <= 300, "even one huge word stays under 300");
ok(excerpt("# Big news\n**Bold** and *italic* with a [link](https://example.com/x).") === "Big news. Bold and italic with a link.", "formatting marks are removed, headings get a full stop", excerpt("# Big news\n**Bold** and *italic* with a [link](https://example.com/x)."));
ok(excerpt("![cap](img:abc123xyz)\n---\n> quoted\n- one\n1. two\n`code`") === "quoted one two code", "pictures and dividers are skipped, list and quote marks removed");
ok(excerpt("Sign up at https://www.dirtysocks.net/signup now") === "Sign up at dirtysocks.net/signup now", "bare links show as short addresses");
ok(excerpt("<script>alert(1)</script> & \"q\"") === "<script>alert(1)</script> & \"q\"", "it is plain text (the slide escapes it), nothing is interpreted");

console.log("slide");
const sl = slide({ title: "Hi <b>", body: "hello **w**", slug: "hi-b", cover: "abc123xyz", fx: 20, fy: 80 }, "https://api.test", { eager: true });
ok(sl.includes('class="nstitle">Hi &lt;b&gt;</h3>') && sl.includes('<p class="nsex">hello w</p>') && sl.includes('href="/news/hi-b"') && sl.includes("object-position:20% 80%") && sl.includes("https://api.test/api/news/img/abc123xyz"), "a slide has the cover, bold title, teaser and a Read More link to the post page", sl);
ok(!slide({ title: "t", body: "b", slug: "t" }, "https://api.test").includes("<img class=\"nbg\"") && slide({ title: "t", body: "b", slug: "t" }, "https://api.test").includes("nbg-none"), "no cover: the slide shows the guild crest instead");
ok(!slide({ title: "t", body: "b", slug: "t" }, "", { href: "" }).includes("<a "), "href '' draws the button without a link (editor preview)");
const hostile = slide({ title: '"><img src=x onerror=alert(1)>', body: "<script>alert(1)</script>", slug: 'a"b<c', cover: "abc123xyz", fx: '50" onload="x', fy: 1 }, "https://api.test");
ok(!/<script|<img src=x|onload=|onerror=alert/.test(hostile.replace(/&lt;[^>]*/g, "")) && !hostile.includes('onload="x'), "hostile titles, slugs and focus values cannot break out of the markup", hostile);

console.log("safety");
const attacks = [
  "<script>alert(1)</script>", '"><img src=x onerror=alert(1)>', "<img src=x onerror=alert(1)>", "[x](javascript:alert(1))", "[x](JaVaScRiPt:alert(1))",
  "[x](data:text/html,<script>alert(1)</script>)", "[x](https://a.com\" onmouseover=\"alert(1))", "[x](https://a.com/'onmouseover='alert(1))", "https://a.com/\"onmouseover=\"alert(1)",
  "![x](https://evil.example/track.png)", "![x](javascript:alert(1))", "![x](img:../../etc/passwd)", "![\" onerror=\"alert(1)](img:abc123xyz)", "![<script>](img:abc123xyz)",
  "[<img src=x onerror=alert(1)>](https://a.com)", "**<b onclick=alert(1)>x</b>**", "`<script>`", "> <script>alert(1)</script>", "- <iframe src=javascript:alert(1)>", "# <svg onload=alert(1)>",
  "\u00000\u0000", "[a](https://a.com) \u00001\u0000 `b` \u00000\u0000", "<a href=\"javascript:alert(1)\">x</a>", "&lt;script&gt;", "&#60;script&#62;", "[x](https://a.com/&quot;onmouseover=&quot;alert(1))",
];
for (const a of attacks) { const h = render(a, BASE); ok(unsafe(h).length === 0, "safe output for: " + JSON.stringify(a).slice(0, 56), JSON.stringify(unsafe(h)) + " :: " + h); }
ok(!has(render("![x](https://evil.example/track.png)", BASE), "<img"), "pictures from other sites are not rendered");
ok(!has(render("[x](javascript:alert(1))", BASE), "<a"), "javascript: links are not links");

// Fuzz: random mixes of every markdown token and hostile characters must always come out safe.
const bits = ["**", "*", "_", "~~", "`", "[", "]", "(", ")", "![", "](img:abc123xyz)", "](https://a.com)", "](javascript:x)", "https://x.com/a", "<", ">", "\"", "'", "&", "&amp;", "\n", "\n\n", "> ", "- ", "1. ", "# ", "## ", "---", "\u0000", " ", "a", "b c", "img:abc123xyz", "onerror=", "<script>"];
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
let bad = null;
for (let n = 0; n < 4000 && !bad; n++) {
  let s = ""; for (let k = 0, len = 1 + Math.floor(rnd() * 30); k < len; k++) s += bits[Math.floor(rnd() * bits.length)];
  const h = render(s, BASE), u = unsafe(h); if (u.length) bad = { s, h, u };
}
ok(!bad, "4000 random mixes of markdown and hostile characters always render safely", JSON.stringify(bad));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
