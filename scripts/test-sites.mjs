import { writeFileSync } from "node:fs";
const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/124 Safari/537.36" };
const out = {};
for (const id of [280080, 18310, 280062]) {
  const r = await fetch(`https://endgametools.com/en/wow-forever/items/${id}`, { headers: UA });
  const t = await r.text();
  const i = t.indexOf("<h1");
  out[id] = { len: t.length, h1: t.slice(i, i + 5000) };
  const ld = [...t.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1].slice(0, 1500));
  out[id].ld = ld;
}
writeFileSync("sites-test.json", JSON.stringify(out, null, 1));
