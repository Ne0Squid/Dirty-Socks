// Builds item-stats.json (tooltip data) for every item in dungeon-loot.json, using Endgame Tools' WoW Forever item pages.
// Usage: node scripts/fetch-item-stats.mjs
import { readFileSync, writeFileSync } from "node:fs";
const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/124 Safari/537.36" };
const BASE = "https://endgametools.com/en/wow-forever/items";
const norm = s => String(s).toLowerCase().replace(/&#x27;|&#39;|’/g, "'").replace(/[^a-z0-9]+/g, " ").trim();
const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1)); return d[a.length][b.length]; };
const decode = s => s.replace(/<[^>]+>/g, "").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
const get = async u => { for (let n = 0; n < 3; n++) { try { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(30000) }); if (r.ok) return await r.text(); } catch {} await new Promise(r => setTimeout(r, 800)); } return null; };

const j = JSON.parse(readFileSync("dungeon-loot.json", "utf8"));
const bis = JSON.parse(readFileSync("bis.json", "utf8"));
// BiS entries can read "A / B" or "A (Horde: B)" or "Name (where it drops)"; pull out just the item names.
function itemNames(str) {
  const out = []; let paren = false, horde = false;
  for (const t of str.split(/( \/ |\(Horde: |\(|\))/)) {
    if (t === "(Horde: ") { paren = true; horde = true; } else if (t === "(") { paren = true; horde = false; } else if (t === ")") { paren = false; horde = false; }
    else if (t === " / ") {} else if (t.trim() && (!paren || horde)) out.push(t.trim());
  }
  return out;
}
const bisNames = bis.specs.flatMap(sp => sp.items.flatMap(it => [it.item, ...(it.alts || [])].flatMap(itemNames)));
const names = [...new Set(j.dungeons.flatMap(d => d.bosses.flatMap(b => b.items.map(i => i.item))).concat(Object.values(j.trash).flat().map(i => i.item), bisNames).map(n => n.trim()).filter(Boolean))];
const indexRaw = await get(`${BASE}/search.json`);
if (!indexRaw) { console.error("Item index unavailable; keeping existing data."); process.exit(0); }
const indexJson = JSON.parse(indexRaw);
const build = indexJson.build;
let prev = null; try { prev = JSON.parse(readFileSync("item-stats.json", "utf8")); } catch {}
const force = process.env.FORCE === "1";
const sameItems = prev && Object.keys(prev.items).concat(prev.missing || []).length === names.length;
if (!force && prev && prev.build === build && sameItems) { console.log(`Build ${build} unchanged; nothing to do.`); process.exit(0); }
// Manual overrides: item name -> item ID (for items whose names don't match the database, e.g. tier 0.5 sets).
let manual = {}; try { manual = Object.fromEntries(Object.entries(JSON.parse(readFileSync("item-ids.json", "utf8"))).map(([k, v]) => [norm(k), v])); } catch {}
const idx = indexJson.rows.map(r => ({ id: r[0], name: r[1], k: norm(r[1]) }));
const byK = new Map(); idx.forEach(r => { if (!byK.has(r.k)) byK.set(r.k, r); });
const out = {}, unmatched = [];
const jobs = [];
for (const n of names) {
  let r = manual[norm(n)] ? { id: manual[norm(n)], name: n } : byK.get(norm(n));
  if (!r) { const k = norm(n); let best = null, bd = 99; for (const c of idx) { if (Math.abs(c.k.length - k.length) > 3) continue; const d = lev(k, c.k); if (d < bd) { bd = d; best = c; } } if (best && bd <= 2 && k.length >= 10) r = best; }
  if (r) jobs.push({ n, r }); else unmatched.push(n);
}
function parse(html) {
  const h = html.indexOf('<h1 id="item-name"'); if (h < 0) return null;
  const q = (html.slice(h, h + 200).match(/text-q(\d)/) || [])[1];
  const end = html.indexOf("</section>", h);
  const lines = [];
  for (const m of html.slice(h, end).matchAll(/<p class="([^"]*)">([\s\S]*?)<\/p>/g)) {
    if (/Sell price/.test(m[2])) continue;
    const cls = (m[1].match(/text-(chalk|fog|q\d)/) || [])[1] || "chalk";
    const spans = [...m[2].matchAll(/<span>([\s\S]*?)<\/span>/g)].map(s => decode(s[1]));
    const text = decode(m[2]);
    if (!text) continue;
    lines.push(spans.length === 2 ? { c: cls, l: spans[0], r: spans[1] } : { c: cls, t: text });
  }
  return { q: q ? +q : 1, lines };
}
let k = 0, fail = 0;
await Promise.all(Array.from({ length: 6 }, async () => { while (k < jobs.length) { const { n, r } = jobs[k++]; const html = await get(`${BASE}/${r.id}`); const p = html && parse(html); if (p) out[n] = { id: r.id, ...(r.name !== n ? { as: r.name } : {}), ...p }; else { fail++; unmatched.push(n); } } }));
if (prev && Object.keys(out).length < Object.keys(prev.items).length * 0.9) { console.error(`Only ${Object.keys(out).length} items fetched (had ${Object.keys(prev.items).length}); keeping existing data.`); process.exit(0); }
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync("item-stats.json", JSON.stringify({ source: "endgametools.com", build, fetched: new Date().toISOString().slice(0, 10), items: sorted, missing: unmatched.sort() }, null, 0));
console.log(`items ${Object.keys(out).length}/${names.length}, missing ${unmatched.length}`, unmatched);
