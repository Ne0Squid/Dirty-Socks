// Builds a real page for every news post: news/<title-words>.html, so https://www.dirtysocks.net/news/<title-words> answers with a
// normal page (right title, preview text and cover photo for Discord / Google / social links) instead of the "page not found" screen
// that draws the post afterwards. Run every night by .github/workflows/build-news-pages.yml, or by hand:  node scripts/build-news.mjs
//
// What it does:   reads the posts from the login service (public feed, no password)  ->  writes news/<slug>.html for each one
//                 (edited posts are rewritten, deleted posts are removed)  ->  keeps the post entries in sitemap.xml up to date.
// The page layout comes from 404.html (so the menu, footer and holiday theme can never drift) and the post itself is drawn by
// news-format.js, the same code the browser uses.  If the service cannot be reached, nothing is changed.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SITE = "https://www.dirtysocks.net";
const DEFAULT_IMG = `${SITE}/images/og-image.jpg?v=3`;
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const IMG_TOKEN = /!\[[^\]\n]*\]\(img:([a-z0-9]{6,40})\)/;

export function loadFormatter(root) {
  const mod = { exports: {} };
  new Function("module", "exports", fs.readFileSync(path.join(root, "news-format.js"), "utf8")).call({}, mod, mod.exports);
  return mod.exports;
}

const etDate = (t) => new Date(t).toLocaleDateString("en-CA", { timeZone: "America/New_York" });   // 2026-11-28

// 404.html is the layout. Swap the "page not found" block for the post and add the head tags a link preview needs.
export function buildPage(template, post, others, ctx) {
  const { F, api } = ctx, e = F.esc;
  if (!SLUG.test(post.slug || "")) throw new Error(`unsafe slug: ${post.slug}`);
  const url = `${SITE}/news/${post.slug}`;
  const desc = F.excerpt(post.body, 160) || post.title;
  const inBody = String(post.body || "").match(IMG_TOKEN);
  const pic = post.cover || (inBody && inBody[1]);
  const img = pic ? `${api}/api/news/img/${pic}` : DEFAULT_IMG;
  const ld = {
    "@context": "https://schema.org", "@type": "NewsArticle", headline: post.title, description: desc, mainEntityOfPage: url,
    image: [img], datePublished: new Date(post.at).toISOString(), dateModified: new Date(post.edited || post.at).toISOString(),
    author: { "@type": "Organization", name: "Dirty Socks" },
    publisher: { "@type": "Organization", name: "Dirty Socks", logo: { "@type": "ImageObject", url: `${SITE}/images/apple-touch-icon.png` } },
  };
  const head = [
    `<link rel="canonical" href="${e(url)}">`,
    `<meta property="og:title" content="${e(post.title)}">`,
    `<meta property="og:description" content="${e(desc)}">`,
    `<meta property="og:url" content="${e(url)}">`,
    `<meta property="og:image" content="${e(img)}">`,
    ...(pic ? [] : ['<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">']),
    `<meta property="article:published_time" content="${new Date(post.at).toISOString()}">`,
    `<meta name="twitter:title" content="${e(post.title)}">`,
    `<meta name="twitter:description" content="${e(desc)}">`,
    `<meta name="twitter:image" content="${e(img)}">`,
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`,
  ].join("\n");

  let html = template;
  const swap = (re, to, what) => { if (!re.test(html)) throw new Error(`404.html no longer has ${what}; update scripts/build-news.mjs`); html = html.replace(re, () => to); };
  swap(/<title>[^<]*<\/title>/, `<title>${e(post.title)} \u2013 Dirty Socks</title>`, "a <title>");
  swap(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${e(desc)}">`, "a description tag");
  swap(/[ \t]*<meta name="robots" content="noindex">\n?/, "", "the noindex tag");
  swap(/<meta property="og:type" content="website">/, '<meta property="og:type" content="article">', "og:type");
  swap(/[ \t]*<meta property="og:image(:width|:height)?" content="[^"]*">\n?/g, "", "og:image tags");
  swap(/[ \t]*<meta name="twitter:image" content="[^"]*">\n?/, "", "twitter:image");
  swap(/<script src="faction\.js"><\/script>/, `<!-- Built from a news post by scripts/build-news.mjs every night. Edit the post on Post News, not this file. -->\n${head}\n<script src="faction.js"></script>`, "the faction.js script");
  swap(/<script>\s*\/\* Clean-address fallback[\s\S]*?<\/script>\s*/, "", "the clean-address script");
  const article = F.page(post, others, { api });
  swap(/<section class="lost" id="nlost">[\s\S]*?<\/section>/, `<div id="npost" data-slug="${e(post.slug)}" data-v="${e(post.edited || post.at)}">${article}</div>`, "the not-found section");
  if (!html.includes('<script src="news-post.js"></script>')) throw new Error("404.html no longer loads news-post.js");
  return html;
}

// Keep one <url> per post in sitemap.xml (newest first), and bring each page's lastmod up to date.
export function updateSitemap(xml, posts, lastmodFor = () => null) {
  const block = (loc, mod, pr) => `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${mod}</lastmod>\n    <priority>${pr}</priority>\n  </url>\n`;
  let out = xml.replace(/[ \t]*<url>\s*<loc>https:\/\/www\.dirtysocks\.net\/news\/[^<]*<\/loc>[\s\S]*?<\/url>\n?/g, "");
  out = out.replace(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>[^<]*<\/lastmod>/g, (m, loc) => {
    const d = lastmodFor(loc);
    return d ? `<url>\n    <loc>${loc}</loc>\n    <lastmod>${d}</lastmod>` : m;
  });
  const add = posts.map((p) => block(`${SITE}/news/${p.slug}`, etDate(p.edited || p.at), "0.5")).join("");
  return out.replace(/<\/urlset>/, `${add}</urlset>`);
}

export async function run(opts = {}) {
  const root = opts.root || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const cfg = fs.readFileSync(path.join(root, "auth-config.js"), "utf8").match(/DS_API\s*=\s*"([^"]+)"/);
  const api = String(opts.api || process.env.NEWS_API || (cfg && cfg[1]) || "").replace(/\/+$/, "");
  if (!api) throw new Error("No login-service address (set NEWS_API or DS_API in auth-config.js)");
  const F = loadFormatter(root), dir = path.join(root, "news");
  const getJson = async (p) => { const r = await fetch(api + p, { headers: { Accept: "application/json" } }); return r.status === 404 ? "gone" : r.ok ? r.json() : null; };

  const feed = await getJson("/api/news?limit=30");
  if (!feed || !Array.isArray(feed.news)) throw new Error("Could not read the news feed, so nothing was changed.");
  const posts = new Map(feed.news.filter((p) => SLUG.test(p.slug || "")).map((p) => [p.slug, p]));
  const had = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".html")).map((f) => f.slice(0, -5)) : [];

  // The feed holds the newest 30. A built page for an older post stays as long as the service still has the post.
  const removed = [];
  for (const slug of had) {
    if (posts.has(slug)) continue;
    const r = await getJson("/api/news/post/" + encodeURIComponent(slug));
    if (r === "gone") removed.push(slug);
    else if (r && r.post && SLUG.test(r.post.slug || "")) posts.set(slug, r.post);
    else console.warn(`  could not check ${slug} just now, keeping its page`);
  }

  const template = fs.readFileSync(path.join(root, "404.html"), "utf8");
  fs.mkdirSync(dir, { recursive: true });
  let wrote = 0, same = 0;
  const latest = feed.news.filter((p) => SLUG.test(p.slug || ""));
  for (const [slug, p] of posts) {
    const others = latest.filter((x) => x.id !== p.id);
    const html = buildPage(template, p, others, { F, api });
    const file = path.join(dir, slug + ".html");
    if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === html) { same++; continue; }
    fs.writeFileSync(file, html); wrote++;
  }
  for (const slug of removed) fs.rmSync(path.join(dir, slug + ".html"), { force: true });
  if (!fs.readdirSync(dir).length) fs.rmdirSync(dir);

  // sitemap
  const shallow = (() => { try { return execFileSync("git", ["rev-parse", "--is-shallow-repository"], { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim() !== "false"; } catch { return true; } })();
  const gitDay = (file) => { try { return execFileSync("git", ["log", "-1", "--format=%cs", "--", file], { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || null; } catch { return null; } };
  const newest = latest.length ? etDate(Math.max(...latest.map((p) => p.edited || p.at))) : null;
  const lastmodFor = (loc) => {
    if (shallow) return null;
    const p = loc.replace(SITE, "").replace(/\/+$/, "");
    const file = p === "" ? "index.html" : p.slice(1) + ".html";
    if (!fs.existsSync(path.join(root, file))) return null;
    const d = gitDay(file);
    return p === "/news" && newest && d ? (newest > d ? newest : d) : d;
  };
  const smFile = path.join(root, "sitemap.xml"), sm = fs.readFileSync(smFile, "utf8");
  const next = updateSitemap(sm, [...posts.values()].sort((a, b) => (b.edited || b.at) - (a.edited || a.at)), lastmodFor);
  if (next !== sm) fs.writeFileSync(smFile, next);
  console.log(`News pages: ${posts.size} post(s), ${wrote} written, ${same} unchanged, ${removed.length} removed.${next !== sm ? " Sitemap updated." : ""}`);
  return { posts: posts.size, wrote, same, removed: removed.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run().catch((e) => { console.error("build-news failed: " + e.message); process.exit(1); });
