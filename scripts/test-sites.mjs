import { writeFileSync } from "node:fs";
const urls = [
 "https://nether.wowhead.com/forever/tooltip/item/280080?dataEnv=1&locale=0",
 "https://nether.wowhead.com/tooltip/item/280080?dataEnv=17&locale=0",
 "https://www.wowhead.com/forever/item=280080?xml",
 "https://www.wowhead.com/forever/item=280080/claymore-of-two-moons",
 "https://www.wowhead.com/forever/search?q=Claymore+of+Two+Moons",
 "https://endgametools.com/en/wow-forever/items/280080",
 "https://endgametools.com/en/wow-forever/items/280062",
 "https://wowforever.wclbox.com/en/wupin/280080",
 "https://www.gamemaps.net/game/wow_forever/items/280080-claymore-of-two-moons",
 "https://metaforge.app/wow-forever/database/weapons/claymore-of-two-moons",
 "https://metaforge.app/wow-forever/database/items?page=1",
 "https://wowtbc.gg/warcraftforever/loot-tables/dungeons/blackmaw-hold/",
 "https://wow.zamimg.com/js/tooltips.js",
];
const out = {};
for (const u of urls) {
  try {
    const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/124 Safari/537.36", Accept: "*/*" }, signal: AbortSignal.timeout(20000) });
    const t = await r.text();
    out[u] = { status: r.status, type: r.headers.get("content-type"), len: t.length, hasName: /Claymore of Two Moons|Fleshborer/.test(t), head: t.replace(/\s+/g, " ").slice(0, 500) };
  } catch (e) { out[u] = { error: String(e) }; }
}
writeFileSync("sites-test.json", JSON.stringify(out, null, 1));
