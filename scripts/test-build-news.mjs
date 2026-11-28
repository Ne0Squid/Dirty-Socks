// Run: node scripts/test-build-news.mjs   (checks the nightly news-page builder: page content, safety, sitemap, and what it does when posts change or the service is down)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { buildPage, updateSitemap, loadFormatter, run, SITE } from "./build-news.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = loadFormatter(root), template = fs.readFileSync(path.join(root, "404.html"), "utf8");
let pass = 0, fail = 0;
const ok = (c, name, extra = "") => { c ? pass++ : fail++; console.log(`${c ? "  ok  " : " FAIL "} ${name}${c ? "" : "  " + extra}`); };
const API = "https://api.test";
const post = (o = {}) => ({ id: "abc123def", slug: "raid-night", title: "Raid night moved", body: "The raid is **Thursday** at 8 PM EST. Please sign up so officers can build the roster.", md: true, at: Date.UTC(2026, 10, 28, 3, 0), ...o });

// ---- one page ----
const html = buildPage(template, post({ cover: "cover123456", fx: 20, fy: 70 }), [post({ id: "z1", slug: "other", title: "Other post" })], { F, api: API });
ok(html.includes("<title>Raid night moved \u2013 Dirty Socks</title>"), "title tag is the post title");
ok(html.includes('<link rel="canonical" href="https://www.dirtysocks.net/news/raid-night">'), "canonical address");
ok(/<meta property="og:title" content="Raid night moved">/.test(html) && /<meta property="og:url" content="https:\/\/www\.dirtysocks\.net\/news\/raid-night">/.test(html) && html.includes('<meta property="og:type" content="article">'), "link-preview title, url and type");
ok(html.includes(`<meta property="og:image" content="${API}/api/news/img/cover123456">`) && html.includes(`<meta name="twitter:image" content="${API}/api/news/img/cover123456">`), "the cover photo is the preview picture");
ok(!html.includes("og-image.jpg") && !html.includes('og:image:width'), "the generic picture and its fixed size are gone when there is a cover");
ok(/<meta property="og:description" content="The raid is Thursday at 8 PM EST\./.test(html) && !/content="[^"]*\*\*/.test(html), "preview text is the start of the post without formatting marks");
ok(!html.includes('content="noindex"'), "built pages can be indexed");
ok(!html.includes('id="nlost"') && !html.includes("wandered off the map") && !html.includes("Clean-address fallback"), "the not-found screen is gone");
ok(/<div id="npost" data-slug="raid-night" data-v="\d+"><article class="npage">/.test(html) && html.includes('<h1 class="nstitle">Raid night moved</h1>') && html.includes("<strong>Thursday</strong>"), "the post is in the page, formatted");
ok(html.includes('<script src="news-post.js"></script>') && html.includes('<script src="nav.js"></script>') && html.includes('<footer>'), "menu, footer and scripts are kept");
ok(html.includes("November 27, 2026"), "dates use the guild's Eastern time (a 3 AM UTC post is the evening before)");
ok(html.includes("Other post") && html.includes('href="/news/other"'), "More news links to the other posts");
const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
ok(ld["@type"] === "NewsArticle" && ld.headline === "Raid night moved" && ld.datePublished === "2026-11-28T03:00:00.000Z", "search-engine data is valid and correct");
// no cover and no picture in the text: generic picture with its size
const plain = buildPage(template, post(), [], { F, api: API });
ok(plain.includes('<meta property="og:image" content="https://www.dirtysocks.net/images/og-image.jpg?v=3">') && plain.includes('og:image:width'), "no photo: the site picture is used");
const inText = buildPage(template, post({ body: "Look ![map](img:pic9999999)" }), [], { F, api: API });
ok(inText.includes(`${API}/api/news/img/pic9999999`) && inText.includes('<meta property="og:image" content="' + API), "no cover but a picture in the text: that picture is the preview");
// safety
const evil = buildPage(template, post({ title: 'Hi "x" </script><img src=x onerror=alert(1)>', body: "<script>alert(1)</script> [x](javascript:alert(1)) <b>hi</b>" }), [], { F, api: API });
ok(!/<img src=x/.test(evil) && !evil.includes("<script>alert") && !/href="javascript:/.test(evil), "scripts and tags in a title or text never become live HTML");
ok(JSON.parse(evil.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]).headline.includes("</script>"), "a title that tries to close the data block cannot (still valid JSON)");
for (const bad of ["../x", "a/b", "A B", "", "-x"]) { let threw = false; try { buildPage(template, post({ slug: bad }), [], { F, api: API }); } catch { threw = true; } ok(threw, `unsafe address refused: ${JSON.stringify(bad)}`); }
let threw = ""; try { buildPage(template.replace('<section class="lost" id="nlost">', '<section id="x">'), post(), [], { F, api: API }); } catch (e) { threw = e.message; }
ok(/no longer has the not-found section/.test(threw), "if 404.html is rearranged the build stops loudly instead of writing broken pages", threw);
ok(buildPage(template, post(), [], { F, api: API }) === buildPage(template, post(), [], { F, api: API }), "same input, same page (so nothing is re-committed for no reason)");

// ---- sitemap ----
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${SITE}/</loc>\n    <lastmod>2026-11-01</lastmod>\n    <priority>1.0</priority>\n  </url>\n  <url>\n    <loc>${SITE}/news</loc>\n    <lastmod>2026-11-01</lastmod>\n    <priority>0.6</priority>\n  </url>\n  <url>\n    <loc>${SITE}/news/old-post</loc>\n    <lastmod>2026-11-02</lastmod>\n    <priority>0.5</priority>\n  </url>\n</urlset>\n`;
const sm = updateSitemap(xml, [post({ slug: "raid-night", edited: Date.UTC(2026, 10, 29, 15) }), post({ slug: "second" })], (l) => (l === `${SITE}/` ? "2026-11-20" : null));
ok(!sm.includes("old-post") && sm.includes(`${SITE}/news/raid-night`) && sm.includes(`${SITE}/news/second`), "sitemap: removed posts go, current posts are listed");
ok(sm.includes(`${SITE}/news</loc>`) && sm.includes(`<loc>${SITE}/</loc>\n    <lastmod>2026-11-20</lastmod>`) && sm.includes("<lastmod>2026-11-01</lastmod>"), "sitemap: other pages stay, lastmod follows when known and is left alone when not");
ok(/raid-night<\/loc>\s*<lastmod>2026-11-29<\/lastmod>/.test(sm), "sitemap: an edited post uses its edit date");
ok(updateSitemap(sm, [post({ slug: "raid-night", edited: Date.UTC(2026, 10, 29, 15) }), post({ slug: "second" })], (l) => (l === `${SITE}/` ? "2026-11-20" : null)) === sm, "sitemap: running it again changes nothing");
ok((sm.match(/<url>/g) || []).length === (sm.match(/<\/url>/g) || []).length && sm.trim().endsWith("</urlset>"), "sitemap stays well-formed");

// ---- the whole job against a pretend login service ----
let posts = [post({ id: "a1", slug: "first", title: "First", at: 3e12 }), post({ id: "a2", slug: "second", title: "Second", at: 2e12 })], older = { id: "a3", slug: "ancient", title: "Ancient", body: "old", md: true, at: 1e12 }, feedDown = false;
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x"), send = (c, o) => { res.writeHead(c, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
  if (u.pathname === "/api/news") return feedDown ? send(500, { error: "down" }) : send(200, { news: posts });
  const m = u.pathname.match(/^\/api\/news\/post\/(.+)$/);
  if (m) { const p = [...posts, ...(older ? [older] : [])].find((x) => x.slug === m[1]); return p ? send(200, { post: p }) : send(404, { error: "not found" }); }
  send(404, {});
});
await new Promise((r) => srv.listen(0, r));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bn-"));
fs.copyFileSync(path.join(root, "404.html"), path.join(tmp, "404.html")); fs.copyFileSync(path.join(root, "news-format.js"), path.join(tmp, "news-format.js"));
fs.writeFileSync(path.join(tmp, "auth-config.js"), 'window.DS_API = "http://unused.example";'); fs.writeFileSync(path.join(tmp, "sitemap.xml"), xml);
const opts = { root: tmp, api: `http://127.0.0.1:${srv.address().port}` };
const names = () => (fs.existsSync(path.join(tmp, "news")) ? fs.readdirSync(path.join(tmp, "news")).sort() : []);
let r = await run(opts);
ok(JSON.stringify(names()) === JSON.stringify(["first.html", "second.html"]) && r.wrote === 2, "first run writes a page per post");
r = await run(opts);
ok(r.wrote === 0 && r.same === 2, "second run with nothing new writes nothing");
posts[0] = { ...posts[0], title: "First (edited)", edited: 4e12 };
r = await run(opts);
ok(r.wrote >= 1 && fs.readFileSync(path.join(tmp, "news/first.html"), "utf8").includes("First (edited)") && fs.readFileSync(path.join(tmp, "news/second.html"), "utf8").includes("First (edited)"), "an edited post's page is rewritten, and so is any page that lists it under More news");
posts = posts.slice(0, 1);   // "second" deleted
r = await run(opts);
ok(names().join() === "first.html" && r.removed === 1, "a deleted post's page is removed");
fs.writeFileSync(path.join(tmp, "news/ancient.html"), "<html>ancient</html>");   // older than the newest 30: not in the feed, but the service still has it
r = await run(opts);
ok(names().includes("ancient.html") && fs.readFileSync(path.join(tmp, "news/ancient.html"), "utf8").includes("Ancient"), "an older post outside the feed keeps (and refreshes) its page");
older = null;
r = await run(opts);
ok(!names().includes("ancient.html"), "...and loses it once the service says it is gone");
feedDown = true; const before = names().join() + fs.readFileSync(path.join(tmp, "sitemap.xml"), "utf8");
let err = ""; try { await run(opts); } catch (e) { err = e.message; }
ok(/nothing was changed/.test(err) && before === names().join() + fs.readFileSync(path.join(tmp, "sitemap.xml"), "utf8"), "if the service is down the job fails and touches nothing");
feedDown = false; posts = [];
await run(opts);
ok(names().length === 0 && !fs.existsSync(path.join(tmp, "news")) && !fs.readFileSync(path.join(tmp, "sitemap.xml"), "utf8").includes("/news/first"), "no posts at all: no news folder and no post entries in the sitemap");
srv.close(); fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
