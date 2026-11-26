import { writeFileSync } from "node:fs";
const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/124 Safari/537.36" };
const get = async u => { try { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) }); return { s: r.status, t: await r.text() }; } catch (e) { return { s: "err", t: String(e) }; } };
const out = {};
const q = encodeURIComponent("Claymore of Two Moons");
const cands = [
 "https://wowforever.wclbox.com/en/",
 "https://wowforever.wclbox.com/en/wupin/280080",
 `https://wowforever.wclbox.com/en/search?q=${q}`,
 `https://wowforever.wclbox.com/en/wupin?q=${q}`,
 `https://wowforever.wclbox.com/en/wupin/search?q=${q}`,
 "https://www.gamemaps.net/game/wow_forever/items",
 `https://www.gamemaps.net/game/wow_forever/items?search=${q}`,
 `https://www.gamemaps.net/game/wow_forever/search?q=${q}`,
 `https://www.gamemaps.net/search?q=${q}`,
 "https://www.gamemaps.net/sitemap.xml",
 "https://wowforever.wclbox.com/sitemap.xml",
 "https://endgametools.com/sitemap.xml",
 "https://endgametools.com/en/wow-forever/items",
];
for (const u of cands) {
  const r = await get(u);
  const hrefs = [...new Set([...r.t.matchAll(/href="([^"#]+)"/g)].map(m => m[1]))];
  const itemLinks = hrefs.filter(h => /item|wupin/.test(h));
  out[u] = { s: r.s, len: r.t.length, title: (r.t.match(/<title>([^<]*)/) || [])[1], forms: [...r.t.matchAll(/<form[^>]*>/g)].map(m => m[0]).slice(0, 3), inputs: [...r.t.matchAll(/<input[^>]*>/g)].map(m => m[0]).slice(0, 3), itemLinkCount: itemLinks.length, itemLinkSample: itemLinks.slice(0, 6), head: r.t.replace(/\s+/g, " ").slice(0, 200), locs: [...r.t.matchAll(/<loc>([^<]+)/g)].map(m => m[1]).slice(0, 8) };
}
const e = await get("https://endgametools.com/en/wow-forever/items/280062");
out.endgameBlocks = [...e.t.matchAll(/<script[^>]*type="application\/(?:ld\+)?json"[^>]*>([\s\S]{0,600})/g)].map(m => m[1]);
out.endgameStats = (e.t.match(/Stamina|Intellect|Armor/g) || []).length;
writeFileSync("sites-test.json", JSON.stringify(out, null, 1));
