import { writeFileSync } from "node:fs";
const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/124 Safari/537.36" };
const out = {};
for (const u of ["https://endgametools.com/en/wow-forever/items/226785", "https://wowforever.wclbox.com/en/wupin/226785", "https://www.gamemaps.net/game/wow_forever/items/226785", "https://www.gamemaps.net/game/wow_forever/items/226785-feralheart-mantle", "https://wowforever.wclbox.com/en/wupin/226929"]) {
  try { const r = await fetch(u, { headers: UA, redirect: "follow" }); const t = await r.text(); const text = t.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "); const i = text.indexOf("Binds"); out[u] = { s: r.status, final: r.url, title: (t.match(/<title>([^<]*)/) || [])[1], tip: i >= 0 ? text.slice(Math.max(0, i - 80), i + 500) : text.slice(0, 200) }; } catch (e) { out[u] = String(e); }
}
writeFileSync("probe.json", JSON.stringify(out, null, 1));
