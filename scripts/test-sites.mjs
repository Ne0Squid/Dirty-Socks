import { writeFileSync, readFileSync } from "node:fs";
const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/124 Safari/537.36" };
const get = async u => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(30000) }); return { s: r.status, t: await r.text() }; };
const out = {};
const idx = await get("https://endgametools.com/en/wow-forever/items/search.json");
out.indexStatus = idx.s; out.indexLen = idx.t.length; out.indexHead = idx.t.slice(0, 600);
let rows = []; try { rows = JSON.parse(idx.t).rows; } catch {}
out.rowShape = Array.isArray(rows) ? rows.slice(0, 3) : Object.keys(rows).slice(0, 5);
const j = JSON.parse(readFileSync("dungeon-loot.json", "utf8"));
const names = [...new Set(j.dungeons.flatMap(d => d.bosses.flatMap(b => b.items.map(i => i.item))).concat(Object.values(j.trash).flat().map(i => i.item)))];
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const byName = new Map();
const arr = Array.isArray(rows) ? rows : Object.values(rows);
for (const r of arr) { const n = Array.isArray(r) ? r.find(x => typeof x === "string") : (r.n || r.name); const id = Array.isArray(r) ? r.find(x => typeof x === "number") : (r.i || r.id); if (n) { const k = norm(n); (byName.get(k) || byName.set(k, []).get(k)).push(id); } }
const missing = []; let found = 0, dup = 0;
for (const n of names) { const h = byName.get(norm(n)); if (h) { found++; if (h.length > 1) dup++; } else missing.push(n); }
out.names = names.length; out.found = found; out.ambiguous = dup; out.missing = missing.slice(0, 40);
const samples = ["Cloak of the Fleshborer", "Claymore of Two Moons", "Ritssyn's Wand of Bad Mojo", "Fiendish Machete", "Spike Crested Bracers"];
out.samples = [];
for (const n of samples) { const h = byName.get(norm(n)); if (!h) { out.samples.push({ n, none: true }); continue; }
  const p = await get(`https://endgametools.com/en/wow-forever/items/${h[0]}`);
  const text = p.t.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  out.samples.push({ n, ids: h, status: p.s, text: text.slice(0, 700) });
  if (n === "Fiendish Machete") writeFileSync("sample-endgametools.html", p.t); }
writeFileSync("sites-test.json", JSON.stringify(out, null, 1));
