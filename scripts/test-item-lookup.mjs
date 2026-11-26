// Temporary test: can Blizzard's API find WoW Forever dungeon items by name?
import { readFileSync, writeFileSync } from "node:fs";
const { BLIZZARD_CLIENT_ID: id, BLIZZARD_CLIENT_SECRET: secret } = process.env;
const API = "https://us.api.blizzard.com";
const out = { namespaces: {}, items: [] };
const tr = await fetch("https://oauth.battle.net/token", { method: "POST",
  headers: { Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
  body: "grant_type=client_credentials" });
out.tokenStatus = tr.status;
const tok = (await tr.json()).access_token;
const H = { Authorization: `Bearer ${tok}` };
const j = JSON.parse(readFileSync("dungeon-loot.json", "utf8"));
const all = j.dungeons.flatMap(d => d.bosses.flatMap(b => b.items.map(i => i.item)));
const names = [all[0], all[1], all[3], all[7], all[9], "Spike Crested Bracers", "Lunarlight Robe", all[100], all[300], all[600]];
const nss = ["static-forever-us", "static-classic1x-us", "static-classic-us", "static-us", "static-classic-era-us"];
for (const ns of nss) {
  const r = await fetch(`${API}/data/wow/search/item?namespace=${ns}&name.en_US=${encodeURIComponent(names[0])}&orderby=id&_pageSize=5`, { headers: H });
  out.namespaces[ns] = { status: r.status, hits: r.ok ? (await r.json()).results?.length : null };
}
const good = Object.entries(out.namespaces).find(([, v]) => v.hits > 0)?.[0];
out.namespaceUsed = good || null;
if (good) for (const n of names) {
  const r = await fetch(`${API}/data/wow/search/item?namespace=${good}&name.en_US=${encodeURIComponent(n)}&orderby=id&_pageSize=3`, { headers: H });
  const body = r.ok ? await r.json() : null;
  const hit = body?.results?.[0]?.data;
  let detail = null;
  if (hit) { const d = await fetch(`${API}/data/wow/item/${hit.id}?namespace=${good}&locale=en_US`, { headers: H }); if (d.ok) detail = await d.json(); }
  out.items.push({ searched: n, status: r.status, found: body?.results?.length || 0, id: hit?.id, name: hit?.name?.en_US,
    detailKeys: detail ? Object.keys(detail) : null, preview: detail?.preview_item ? { stats: detail.preview_item.stats, armor: detail.preview_item.armor, weapon: detail.preview_item.weapon, binding: detail.preview_item.binding?.name, req: detail.preview_item.requirements } : null });
}
writeFileSync("item-lookup-test.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
