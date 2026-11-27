// Checks for scripts/character-data.mjs using sample payloads shaped like Blizzard's character endpoints.
// Usage: node scripts/test-character-data.mjs
import { parseEquipment, parseStats, parseMedia, parseProfile, parsePvp, parseReputations, mergeCharacter, finalize, fillIcons } from "./character-data.mjs";
let bad = 0;
const ok = (c, n, x = "") => { console.log((c ? "  ok   " : " FAIL ") + n + (c ? "" : "  " + JSON.stringify(x))); if (!c) bad++; };

const eq = { equipped_items: [
  { item: { id: 1001, key: { href: "https://us.api.blizzard.com/data/wow/item/1001?namespace=static-x" } }, slot: { type: "HEAD", name: "Head" }, name: "Helm of Testing",
    quality: { type: "EPIC", name: "Epic" }, binding: { name: "Binds when picked up" }, inventory_type: { name: "Head" }, item_subclass: { name: "Plate" },
    armor: { value: 120, display: { display_string: "120 Armor" } }, stats: [{ type: { name: "Strength" }, value: 20, display: { display_string: "+20 Strength" } }, { type: { name: "Stamina" }, value: 9 }],
    spells: [{ description: "Equip: Improves your chance to hit by 1%." }], enchantments: [{ display_string: "Enchanted: +10 Stamina" }],
    requirements: { level: { value: 55, display_string: "Requires Level 55" } }, durability: { value: 80, display_string: "Durability 80 / 80" },
    set: { item_set: { name: "Testing Plate" }, effects: [{ display_string: "(2) Set: +5 Strength", is_active: true }, { display_string: "(4) Set: +9 Strength" }] },
    media: { key: { href: "https://us.api.blizzard.com/data/wow/media/item/1001?namespace=static-x" } }, level: { value: 62 } },
  { item: { id: 1002 }, slot: { type: "MAIN_HAND", name: "Main Hand" }, name: "Sword of Examples", quality: { type: "RARE" },
    weapon: { damage: { display_string: "10 - 20 Damage" }, attack_speed: { display_string: "Speed 2.60" }, dps: { display_string: "(5.8 damage per second)" } } },
  { slot: { type: "FEET" } }, // no name: skipped
] };
const items = parseEquipment(eq);
ok(items.length === 2, "two named items kept, nameless one skipped", items.length);
ok(items[0].slot === "HEAD" && items[0].name === "Helm of Testing" && items[0].q === "EPIC" && items[0].id === 1001, "slot, name, quality, id");
ok(items[0].stats.join("|") === "+20 Strength|+9 Stamina", "stats from display strings and from type+value", items[0].stats);
ok(items[0].armor === "120 Armor" && items[0].sub === "Plate" && items[0].bind === "Binds when picked up", "armor, type and binding");
ok(items[0].spells[0].startsWith("Equip:") && items[0].enchants[0].startsWith("Enchanted:"), "equip effects and enchant");
ok(items[0].set.name === "Testing Plate" && items[0].set.effects.length === 2 && items[0].set.effects[0].on === true && items[0].set.effects[1].on === false, "set bonuses with active flags", items[0].set);
ok(items[0].mediaHref.includes("/media/item/1001"), "icon link taken from the item's media");
ok(!("level" in items[0]) && !JSON.stringify(items).includes("62"), "item level is not stored");
ok(items[1].weapon.speed === "Speed 2.60" && !items[1].mediaHref, "weapon details; no icon link when Blizzard gives none");
ok(parseEquipment(null) === null && parseEquipment({}) === null && parseEquipment({ equipped_items: [] }).length === 0, "missing or empty gear is handled");
const derived = parseEquipment({ equipped_items: [{ item: { id: 5, key: { href: "https://x/data/wow/item/5?namespace=n" } }, slot: { type: "BACK" }, name: "Cloak" }] });
ok(derived[0].mediaHref === "https://x/data/wow/media/item/5?namespace=n", "icon link derived from the item link when media is missing", derived[0]);

const st = parseStats({ health: 1234, power: 800, power_type: { name: "Mana" }, strength: { base: 40, effective: 55 }, melee_crit: { rating: 30, value: 4.52 }, armor: { base: 100, effective: 410 }, _links: {}, character: {}, weird: "x", dodge: { value: 3.1 } });
ok(st.health === 1234 && st.strength === 55 && st.melee_crit === 4.52 && st.armor === 410 && st.dodge === 3.1 && st.powerType === "Mana", "stats flattened", st);
ok(!("weird" in st) && !("_links" in st), "non-numbers and links dropped");
ok(parseStats(null) === null && parseStats({ _links: {} }) === null, "no stats -> null");


// PvP and reputation, shaped like Blizzard's real answers for Forever (captured by the probe run).
const pvpSummary = { honorable_kills: 125, pvp_rank: 0, character: { name: "Capo" }, pvp_map_statistics: [
  { world_map: { name: "Warsong Gulch", id: 489 }, match_statistics: { played: 1, won: 1, lost: 0 } },
  { world_map: { name: "Arathi Basin", id: 529 }, match_statistics: { played: 1, won: 0, lost: 1 } } ] };
const pvpStats = { categories: [
  { name: "Player vs. Player", sub_categories: [{ name: "Battlegrounds", statistics: [{ name: "Battlegrounds played", quantity: 2 }, { name: "Arathi Basin battles", quantity: 1 }, { name: "Warsong Gulch victories", quantity: 1 }] }] },
  { name: "Kills", sub_categories: [{ name: "Honorable Kills", statistics: [{ name: "Total Honorable Kills", quantity: 125 }, { name: "World Honorable Kills", quantity: 6 }, { name: "Continent with the most Honorable Kills", quantity: 4 },
    { name: "Battleground Honorable Kills", quantity: 119 }, { name: "Battleground with the most Honorable Kills", quantity: 63 }, { name: "Arathi Basin Honorable Kills", quantity: 56 }, { name: "Warsong Gulch Honorable Kills", quantity: 63 }] }] },
  { name: "Deaths", sub_categories: [{ name: "Battlegrounds", statistics: [{ name: "Deaths in Arathi Basin", quantity: 6 }, { name: "Deaths in Warsong Gulch", quantity: 5 }] }] } ] };
const pv = parsePvp(pvpSummary, pvpStats);
ok(pv.hk === 125 && pv.rank === 0 && pv.world === 6 && pv.bg === 119, "pvp totals: kills, rank, world and battleground kills", pv);
ok(pv.maps.length === 2 && !pv.maps.some((m) => /Continent|Total|World|Battleground/.test(m.n)), "only real battlegrounds listed as maps", pv.maps);
const wsg = pv.maps.find((m) => m.n === "Warsong Gulch"), ab = pv.maps.find((m) => m.n === "Arathi Basin");
ok(wsg.played === 1 && wsg.won === 1 && wsg.lost === 0 && wsg.hk === 63 && wsg.deaths === 5, "battleground record, kills and deaths", wsg);
ok(ab.won === 0 && ab.lost === 1 && ab.hk === 56 && ab.deaths === 6, "second battleground", ab);
const noBg = parsePvp({ honorable_kills: 8, pvp_rank: 0 }, { categories: [{ name: "Kills", sub_categories: [{ name: "Honorable Kills", statistics: [{ name: "Total Honorable Kills", quantity: 8 }, { name: "World Honorable Kills", quantity: 8 }] }] }] });
ok(noBg.hk === 8 && noBg.world === 8 && !noBg.maps, "no battlegrounds played -> no map list", noBg);
const statsOnly = parsePvp(null, pvpStats);
ok(statsOnly.hk === 125 && statsOnly.maps.find((m) => m.n === "Arathi Basin").played === 1 && statsOnly.maps.find((m) => m.n === "Arathi Basin").lost === 1, "kills and records fall back to the statistics when pvp-summary is missing", statsOnly);
ok(parsePvp(null, null) === null && parsePvp({}, {}) === null, "no pvp data -> null");

const rep = { reputations: [
  { faction: { name: "Everlook", id: 577 }, standing: { raw: 2230, value: 2230, max: 3000, tier: 3, name: "Neutral" } },
  { faction: { name: "Thunder Bluff", id: 81 }, standing: { raw: 9537, value: 537, max: 12000, tier: 5, name: "Honored" } },
  { faction: { name: "Bloodsail Buccaneers", id: 87 }, standing: { raw: -9750, value: 32250, max: 36000, tier: 0, name: "Hated" } },
  { faction: { name: "Orgrimmar", id: 76 }, standing: { raw: 42999, value: 999, max: 1000, tier: 7, name: "Exalted" } },
  { faction: { name: "Ratchet", id: 470 }, standing: { raw: 3230, value: 230, max: 6000, tier: 4, name: "Friendly" } },
  { faction: { name: "No standing" } } ] };
const rp = parseReputations(rep);
ok(rp.length === 5, "factions without a standing are skipped", rp.length);
ok(rp.map((r) => r.n).join("|") === "Orgrimmar|Thunder Bluff|Ratchet|Everlook|Bloodsail Buccaneers", "most-trusted first", rp.map((r) => r.n));
ok(rp[1].s === "Honored" && rp[1].t === 5 && rp[1].v === 537 && rp[1].m === 12000, "standing name, tier and progress", rp[1]);
ok(JSON.stringify(parseReputations(rep)) === JSON.stringify(rp), "output order is stable (no churn in the hourly files)");
ok(parseReputations(null) === null && parseReputations({}) === null && parseReputations({ reputations: [] }) === null, "no reputations -> null");
const mergedPr = mergeCharacter({ slug: "a-b", name: "A", pvp: { hk: 5 }, rep: [{ n: "X", t: 3 }] }, { slug: "a-b", name: "A", pvp: null, rep: null });
ok(mergedPr.pvp.hk === 5 && mergedPr.rep.length === 1, "pvp and reputation keep their last good value when Blizzard doesn't answer", mergedPr);

const md = parseMedia({ assets: [{ key: "avatar", value: "a.jpg" }, { key: "inset", value: "i.jpg" }, { key: "main-raw", value: "m.png" }] });
ok(md.main === "m.png" && md.inset === "i.jpg" && md.avatar === "a.jpg", "portrait assets", md);
ok(parseMedia({ avatar_url: "a", bust_url: "b", render_url: "r" }).main === "r", "older *_url portrait fields");
ok(parseMedia({ assets: [] }) === null && parseMedia(null) === null, "no portrait -> null");

const pf = parseProfile({ race: { name: "Undead" }, gender: { name: "Male" }, faction: { name: "Horde" }, active_title: { display_string: "{name} the Explorer" } });
ok(pf.race === "Undead" && pf.faction === "Horde" && pf.title === "{name} the Explorer", "profile", pf);
ok(parseProfile({}) === null, "empty profile -> null");

// merge: keep last good sections, reuse icons, only move `updated` on real change
const base = { slug: "a-b", name: "A", surname: "B", cls: "Mage", level: 30, spec: "Fire" };
const oldFile = { ...base, updated: "2026-01-01T00:00:00.000Z", equipment: [{ slot: "HEAD", id: 1001, name: "Helm of Testing", icon: "https://i/1001.jpg" }], stats: { health: 10 }, kills: [["Boss kills (Place)", 2, 5]] };
const m1 = mergeCharacter(oldFile, { ...base, equipment: null, stats: { health: 10 }, kills: [["Boss kills (Place)", 2, 5]] });
ok(m1.equipment.length === 1 && m1.equipment[0].icon, "gear Blizzard didn't answer is kept from last time");
const f1 = finalize(oldFile, m1, "2026-02-02T00:00:00.000Z");
ok(f1.changed === false && f1.file.updated === oldFile.updated, "identical data -> not changed, `updated` kept", f1);
const m2 = mergeCharacter(oldFile, { ...base, level: 31, equipment: parseEquipment(eq), stats: null, kills: null });
ok(m2.equipment[0].name === "Helm of Testing" && m2.stats.health === 10 && m2.kills.length === 1, "fresh gear replaces, missing stats/kills carry over");
ok(m2.equipment.find((x) => x.id === 1001).icon === "https://i/1001.jpg", "icon already known is reused");
const f2 = finalize(oldFile, m2, "2026-02-02T00:00:00.000Z");
ok(f2.changed === true && f2.file.updated === "2026-02-02T00:00:00.000Z" && !JSON.stringify(f2.file).includes("mediaHref"), "changed data -> `updated` moves, lookup links are not written");
const f3 = finalize(null, mergeCharacter(null, { ...base, equipment: parseEquipment(eq) }), "2026-02-02T00:00:00.000Z");
ok(f3.changed && f3.file.equipment.length === 2 && f3.file.updated, "brand new character");
ok(!("equipment" in finalize(null, mergeCharacter(null, base), "t").file), "no gear section when there is none");

// icons: each distinct link looked up once, cached ones skipped, failures leave the icon out
const calls = [];
const files = [mergeCharacter(null, { ...base, slug: "x", equipment: [
  { slot: "HEAD", id: 1, name: "a", mediaHref: "h1" }, { slot: "BACK", id: 2, name: "b", mediaHref: "h2" }, { slot: "FEET", id: 3, name: "c", mediaHref: "h3" }, { slot: "HANDS", id: 4, name: "d" }] }),
  mergeCharacter(null, { ...base, slug: "y", equipment: [{ slot: "HEAD", id: 1, name: "a", mediaHref: "h1" }] })];
const known = new Map([[2, "https://i/2.jpg"]]);
const res = await fillIcons(files, known, async (h) => { calls.push(h); if (h === "h3") throw new Error("boom"); return `https://i/${h}.jpg`; });
ok(calls.filter((c) => c === "h1").length === 1 && !calls.includes("h2"), "link shared by two characters fetched once; cached item not fetched", calls);
ok(files[0].equipment[0].icon === "https://i/h1.jpg" && files[1].equipment[0].icon === "https://i/h1.jpg", "icon filled for both");
ok(files[0].equipment[1].icon === "https://i/2.jpg", "cached icon used");
ok(!files[0].equipment[2].icon && !files[0].equipment[3].icon && res.looked === 2 && res.found === 1, "failed or missing lookups leave no icon", res);

console.log(bad ? `\n${bad} FAILED` : "\nall passed");
process.exit(bad ? 1 : 0);
