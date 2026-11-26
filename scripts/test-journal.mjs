import { writeFileSync } from "node:fs";
const { BLIZZARD_CLIENT_ID: id, BLIZZARD_CLIENT_SECRET: secret } = process.env;
const API = "https://us.api.blizzard.com", ns = "static-forever-us";
const tok = (await (await fetch("https://oauth.battle.net/token", { method: "POST", headers: { Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" })).json()).access_token;
const H = { Authorization: `Bearer ${tok}` };
const out = {};
async function probe(label, path) {
  const sep = path.includes("?") ? "&" : "?";
  const r = await fetch(`${API}${path}${sep}namespace=${ns}&locale=en_US`, { headers: H });
  let body = null; try { body = await r.json(); } catch {}
  out[label] = { status: r.status, sample: JSON.stringify(body)?.slice(0, 1500) };
  return body;
}
const ji = await probe("journal-instance-index", "/data/wow/journal-instance/index");
await probe("journal-encounter-index", "/data/wow/journal-encounter/index");
await probe("search-journal-encounter", "/data/wow/search/journal-encounter?name.en_US=Withermaw");
await probe("search-journal-encounter-lord-roccor", "/data/wow/search/journal-encounter?name.en_US=Lord%20Roccor");
await probe("search-item-word", "/data/wow/search/item?name.en_US=Fleshborer");
await probe("search-item-hyphen", "/data/wow/search/item?name.en_US=Claymore%20of%20Two%20Moons");
await probe("item-1270", "/data/wow/item/1270");
await probe("item-index", "/data/wow/item/index");
const first = ji?.instances?.[0]?.id;
if (first) await probe("journal-instance-first", `/data/wow/journal-instance/${first}`);
const enc = await fetch(`${API}/data/wow/search/journal-encounter?name.en_US=Roccor&namespace=${ns}&locale=en_US`, { headers: H }).then(r => r.json()).catch(() => null);
const eid = enc?.results?.[0]?.data?.id;
if (eid) await probe("journal-encounter-detail", `/data/wow/journal-encounter/${eid}`);
writeFileSync("journal-test.json", JSON.stringify(out, null, 1));
