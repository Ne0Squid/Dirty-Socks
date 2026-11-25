// Pulls roster, activity and achievements for a WoW Forever guild from Blizzard's API.
// Usage (Node 18+):
//   BLIZZARD_CLIENT_ID=xxx BLIZZARD_CLIENT_SECRET=yyy node fetch-guild-data.mjs
// Get a client at https://develop.battle.net/access/clients (keep the secret private).
// Writes guild-data.json next to this script.

import { writeFileSync, readFileSync, existsSync } from "node:fs";

const REGION = "us";
const GUILD_SLUG = "dirty-socks"; // Forever guilds are realmless, so only the slug is needed
const NAMESPACE = `profile-forever-${REGION}`;
const API = `https://${REGION}.api.blizzard.com`;

const { BLIZZARD_CLIENT_ID: id, BLIZZARD_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) {
  console.error("Set BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET first.");
  process.exit(1);
}

// Fallback class names/colors in case the class index call is unavailable.
const CLASSES = {
  1: ["Warrior", "#c79c6e"], 2: ["Paladin", "#f58cba"], 3: ["Hunter", "#abd473"],
  4: ["Rogue", "#fff569"], 5: ["Priest", "#c8c8c8"], 6: ["Death Knight", "#c41f3b"],
  7: ["Shaman", "#0070de"], 8: ["Mage", "#3fc7eb"], 9: ["Warlock", "#8788ee"],
  10: ["Monk", "#00ff96"], 11: ["Druid", "#ff7d0a"], 12: ["Demon Hunter", "#a330c9"],
  13: ["Evoker", "#33937f"],
};

async function token() {
  const res = await fetch("https://oauth.battle.net/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Token request failed: ${res.status}`);
  return (await res.json()).access_token;
}

async function get(path, accessToken) {
  const res = await fetch(`${API}${path}?locale=en_US`, {
    headers: { Authorization: `Bearer ${accessToken}`, "Battlenet-Namespace": NAMESPACE },
  });
  if (!res.ok) {
    console.warn(`  ${path} -> ${res.status}`);
    return null;
  }
  return res.json();
}

const accessToken = await token();
console.log(`Fetching ${GUILD_SLUG} (${NAMESPACE})...`);

const [guild, roster, activity, achievements] = await Promise.all([
  get(`/data/wow/guild/${GUILD_SLUG}`, accessToken),
  get(`/data/wow/guild/${GUILD_SLUG}/roster`, accessToken),
  get(`/data/wow/guild/${GUILD_SLUG}/activity`, accessToken),
  get(`/data/wow/guild/${GUILD_SLUG}/achievements`, accessToken),
]);

// Roster shape is still being documented for Forever, so read it defensively.
const members = (roster?.members ?? []).map((m) => {
  const c = m.character ?? m;
  const classId = c.playable_class?.id;
  const [cls, color] = CLASSES[classId] ?? [c.playable_class?.name ?? "Unknown", "#999999"];
  return {
    name: c.name ?? c.slug,
    surname: c.surname ?? null,
    level: c.level ?? null,
    cls,
    color,
    rank: m.rank ?? null, // numeric; Blizzard doesn't return rank titles
  };
}).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || (b.level ?? 0) - (a.level ?? 0));

// Roster levels can lag behind each character's own profile, so check the profile too
// and keep the higher level. Characters only have profiles from level 10 after logging out.
const slugOf = (m) => `${m.name}-${m.surname ?? ""}`.toLowerCase().replace(/['’]/g, "").replace(/\s+/g, "-");
// Last run's data. If Blizzard fails to answer for a character, its last good values are kept
// instead of going blank, and boss kills are never dropped.
let prevData = {};
try { prevData = JSON.parse(readFileSync(new URL("../guild-data.json", import.meta.url), "utf8")); } catch { prevData = {}; }
const prevBy = Object.fromEntries((prevData.roster ?? []).map((m) => [slugOf(m), m]));
let carried = 0;
// Forever returns specialization_groups[]; the group with is_active:true holds the current spec.
// If that group lists more than one spec, use the one with the most talent points spent.
function activeSpec(sp) {
  const groups = sp?.specialization_groups ?? [];
  const group = groups.find((g) => g.is_active) ?? (groups.length === 1 ? groups[0] : null);
  const specs = group?.specializations ?? [];
  if (specs.length === 1) return specs[0].specialization?.name ?? null;
  let best = null, bestPoints = 0;
  for (const s of specs) {
    const points = (s.talents ?? []).reduce((n, t) => n + (t.talent_rank ?? 0), 0);
    if (points > bestPoints) { best = s.specialization?.name ?? null; bestPoints = points; }
  }
  return best;
}
// Professions: Forever's response shape isn't documented yet, so read the classic-style fields defensively.
// Every recipe a character knows, per profession (tiers hold the recipe lists).
function recipeNames(pr) {
  const out = [];
  for (const group of [pr?.primaries, pr?.secondaries]) {
    for (const e of group ?? []) {
      const prof = e.profession?.name;
      if (!prof) continue;
      for (const t of e.tiers ?? []) for (const r of t.known_recipes ?? []) {
        const name = r.name ?? r.recipe?.name;
        if (name) out.push([prof, name]);
      }
    }
  }
  return out;
}
const recipes = {}; // profession -> recipe -> [member slugs]
const recipeFailed = new Set(); // members whose professions didn't load this run
const professionHref = {}; // profession name -> its static data link, used to look up icons
function parseProfessions(pr) {
  const out = [];
  for (const [group, primary] of [[pr?.primaries, true], [pr?.secondaries, false]]) {
    for (const e of group ?? []) {
      const name = e.profession?.name;
      if (!name) continue;
      if (e.profession?.key?.href) professionHref[name] = e.profession.key.href;
      out.push({
        name,
        skill: e.skill_points ?? e.tiers?.[0]?.skill_points ?? null,
        max: e.max_skill_points ?? e.tiers?.[0]?.max_skill_points ?? null,
        primary,
      });
    }
  }
  return out;
}

// Boss kills: the "Dungeons & Raids" statistics hold lines like "Bazzalan kills (Ragefire Chasm)".
// Collected for every member and combined, so the site can tell which dungeon bosses the guild has killed.
function bossKillStats(st) {
  const found = [];
  const walk = (cat, inside) => {
    const here = inside || /dungeons/i.test(cat.name ?? "");
    if (here) for (const x of cat.statistics ?? []) if (/kills?\b/i.test(x.name ?? "")) found.push([x.name, x.quantity ?? 0, x.last_updated_timestamp ?? null]);
    for (const sub of cat.sub_categories ?? []) walk(sub, here);
  };
  for (const c of st?.categories ?? []) walk(c, false);
  return found;
}
// Honorable kills: a PvP statistic ("Total Honorable Kills" or similar); the largest matching figure is the lifetime total.
function honorableKills(st) {
  let best = null;
  const walk = (cat) => {
    for (const x of cat.statistics ?? []) if (/honou?rable\s+kills/i.test(x.name ?? "") && typeof x.quantity === "number") best = Math.max(best ?? 0, x.quantity);
    for (const sub of cat.sub_categories ?? []) walk(sub);
  };
  for (const c of st?.categories ?? []) walk(c);
  return best;
}
const bossKills = {}; // statistic name -> { total, members: [slug] }

// Item level: use Blizzard's own figure from the character profile when it has one,
// otherwise average the equipped items (shirt and tabard don't count).
const NO_ILVL_SLOTS = new Set(["SHIRT", "TABARD"]);
function itemLevel(profile, eq) {
  const given = profile?.equipped_item_level ?? profile?.average_item_level;
  if (typeof given === "number" && given > 0) return Math.round(given);
  const levels = (eq?.equipped_items ?? [])
    .filter((i) => !NO_ILVL_SLOTS.has(i.slot?.type))
    .map((i) => i.level?.value)
    .filter((v) => typeof v === "number");
  return levels.length ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) : null;
}

let checked = 0, raised = 0, unavailable = 0, specFound = 0, specMissing = 0, profFound = 0, ilvlFound = 0, hkFound = 0;
for (let i = 0; i < members.length; i += 5) {
  await Promise.all(members.slice(i, i + 5).map(async (m) => {
    if (!m.surname) return;
    const p = await get(`/profile/wow/character/${encodeURIComponent(slugOf(m))}`, accessToken);
    const old = prevBy[slugOf(m)];
    if (!p || typeof p.level !== "number") {
      unavailable++;
      recipeFailed.add(slugOf(m));
      if (old) { // keep what we had
        m.level = Math.max(m.level ?? 0, old.level ?? 0) || m.level;
        m.spec = old.spec ?? null; m.professions = old.professions ?? []; m.ilvl = old.ilvl ?? null; m.hk = old.hk ?? null;
        carried++;
      }
      return;
    }
    checked++;
    if (p.level > (m.level ?? 0)) { m.level = p.level; raised++; }
    const base = `/profile/wow/character/${encodeURIComponent(slugOf(m))}`;
    const [sp, pr, eq, ast, pvp] = await Promise.all([
      get(`${base}/specializations`, accessToken),
      get(`${base}/professions`, accessToken),
      get(`${base}/equipment`, accessToken),
      get(`${base}/achievements/statistics`, accessToken),
      get(`${base}/pvp-summary`, accessToken),
    ]);
    for (const [name, qty, ts] of bossKillStats(ast)) {
      if (qty <= 0) continue;
      const e = (bossKills[name] ??= { total: 0, members: [], first: null });
      e.total += qty; e.members.push(slugOf(m));
      // A member with exactly one kill gives that kill's exact time, so the earliest of those is the best "first cleared".
      if (qty === 1 && ts && (e.first == null || ts < e.first)) e.first = ts;
    }
    m.hk = honorableKills(ast) ?? (typeof pvp?.honorable_kills === "number" ? pvp.honorable_kills : null) ?? old?.hk ?? null;
    if (m.hk != null) hkFound++;
    m.spec = sp ? activeSpec(sp) : (old?.spec ?? null);
    if (m.spec) specFound++; else specMissing++;
    if (pr) { for (const [prof, name] of recipeNames(pr)) ((recipes[prof] ??= {})[name] ??= []).push(slugOf(m)); }
    else recipeFailed.add(slugOf(m));
    m.professions = pr ? parseProfessions(pr) : (old?.professions ?? []);
    if (m.professions.length) profFound++;
    m.ilvl = itemLevel(p, eq) ?? old?.ilvl ?? null;
    if (m.ilvl) ilvlFound++;
    if (!sp || !pr || !eq || !ast) carried++;
  }));
}
console.log(`Specializations: ${specFound} found, ${specMissing} without a spec`);
console.log(`Professions: ${profFound} characters with data`);
console.log(`Honorable kills: ${hkFound} characters with a value`);
console.log(`Item levels: ${ilvlFound} characters with a value`);
console.log(`Kept previous values for ${carried} characters where Blizzard did not answer`);
console.log(`Profile levels: ${checked} checked, ${raised} higher than the roster, ${unavailable} unavailable`);

// For characters that failed to load, keep the recipes they had last time.
for (const [prof, byName] of Object.entries(prevData.recipes ?? {})) {
  for (const [name, who] of Object.entries(byName)) {
    const keep = who.filter((w) => recipeFailed.has(w) && prevBy[w]);
    if (keep.length) { const list = ((recipes[prof] ??= {})[name] ??= []); for (const w of keep) if (!list.includes(w)) list.push(w); }
  }
}
console.log(`Recipes: ${Object.values(recipes).reduce((n, r) => n + Object.keys(r).length, 0)} distinct recipes across ${Object.keys(recipes).length} professions`);

// Boss kills only ever go up, so merge with last run: nothing is dropped if a character failed to load,
// and "seen" records the first run that noticed each kill (null = already there before tracking began).
const nowIso = new Date().toISOString();
const prevKills = prevData.bossKills ?? null;
for (const [name, e] of Object.entries(bossKills)) {
  const o = prevKills?.[name];
  e.seen = o ? (o.seen ?? null) : (prevKills ? nowIso : null);
  if (o) {
    e.total = Math.max(e.total, o.total ?? 0);
    e.members = [...new Set([...e.members, ...(o.members ?? [])])];
    if (o.first != null && (e.first == null || o.first < e.first)) e.first = o.first;
  }
}
for (const [name, o] of Object.entries(prevKills ?? {})) if (!bossKills[name]) bossKills[name] = { first: null, seen: null, ...o };

// Kill statistics that aren't for a dungeon or raid the site knows about, so new names are easy to spot.
const KNOWN_PLACES = ["Ragefire Chasm", "Hall of Thanes", "Ruins of Lordaeron", "The Deadmines", "Wailing Caverns", "Shadowfang Keep",
  "Blackfathom Deeps", "Excavation Site: Wetlands", "The Stockade", "City of Dalaran", "Gnomeregan", "Razorfen Kraul", "Scarlet Monastery",
  "The Drowned City", "Uldaman", "Razorfen Downs", "Zul'Farrak", "Krol'dok Stronghold", "Maraudon", "Alcaz Prison", "Sunken Temple",
  "Blackrock Depths", "Blackmaw Hold", "Blackrock Spire", "Shaper's Terrace", "Dire Maul", "Stratholme", "Scholomance",
  "The Barrow Deeps", "Hyjal Summit", "Onyxia's Lair"];
const placeKey = (n) => String(n).toLowerCase().replace(/[’']/g, "").replace(/^the\s+/, "").trim();
const known = new Set(KNOWN_PLACES.map(placeKey));
const unrecognizedKills = Object.keys(bossKills).filter((n) => { const m = n.match(/\(([^)]+)\)\s*$/); return !m || !known.has(placeKey(m[1])); });
if (unrecognizedKills.length) console.log(`Unrecognized kill statistics: ${unrecognizedKills.join("; ")}`);

// Profession icons: Blizzard's media endpoint gives each profession's icon URL.
// Built from the profession's own data link so the right game-version namespace is used.
const professionIcons = {};
await Promise.all(Object.entries(professionHref).map(async ([name, href]) => {
  try {
    const u = new URL(href);
    u.pathname = u.pathname.replace("/data/wow/profession/", "/data/wow/media/profession/");
    const res = await fetch(u, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) { console.warn(`  icon for ${name} -> ${res.status}`); return; }
    const url = (await res.json()).assets?.find((a) => a.key === "icon")?.value;
    if (url) professionIcons[name] = url;
  } catch (e) { console.warn(`  icon for ${name} failed: ${e.message}`); }
}));
console.log(`Profession icons: ${Object.keys(professionIcons).length} of ${Object.keys(professionHref).length}`);

// Class icons: Blizzard's media endpoint gives each class's icon URL (same static namespace as the profession icons).
const classIcons = {};
try {
  const ns = new URL(Object.values(professionHref)[0]).searchParams.get("namespace");
  await Promise.all(Object.entries(CLASSES).map(async ([id, [name]]) => {
    try {
      const res = await fetch(`${API}/data/wow/media/playable-class/${id}?namespace=${ns}&locale=en_US`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) return;
      const url = (await res.json()).assets?.find((a) => a.key === "icon")?.value;
      if (!url) return;
      classIcons[name] = url;
    } catch (e) { console.warn(`  class icon ${name} failed: ${e.message}`); }
  }));
} catch (e) { console.warn(`  class icons failed: ${e.message}`); }
console.log(`Class icons: ${Object.keys(classIcons).length}`);

// Level history: one snapshot per day (the latest run of that day), kept for 35 days.
// It lives inside guild-data.json so the workflow needs no changes.
const outPath = new URL("../guild-data.json", import.meta.url);
let days = {};
if (existsSync(outPath)) {
  try { days = JSON.parse(readFileSync(outPath, "utf8")).history?.days ?? {}; } catch { days = {}; }
}
days[new Date().toISOString().slice(0, 10)] = Object.fromEntries(
  members.filter((m) => m.surname && typeof m.level === "number").map((m) => [slugOf(m), m.level]));
days = Object.fromEntries(Object.keys(days).sort().slice(-35).map((k) => [k, days[k]]));

// Hall of Fame: the order characters first reach level 60, recorded the first run that sees them there.
// Only ever added to, so the podium can't change after the fact (times are as precise as the hourly run).
let prevFame = {};
if (existsSync(outPath)) { try { prevFame = JSON.parse(readFileSync(outPath, "utf8")).fame ?? {}; } catch { prevFame = {}; } }
const reached60 = [...(prevFame.reached60 ?? [])];
for (const m of members.filter((x) => x.surname && x.level >= 60 && !reached60.some((r) => r.slug === slugOf(x)))) {
  reached60.push({ slug: slugOf(m), name: m.name, surname: m.surname, cls: m.cls, color: m.color, at: new Date().toISOString() });
}
const fame = { reached60 };

const out = {
  generated: new Date().toISOString(),
  guild: { name: guild?.name ?? "Dirty Socks", faction: guild?.faction?.name ?? null },
  roster: members,
  history: { days },
  fame,
  professionIcons,
  recipes,
  classIcons,
  unrecognizedKills,
  bossKills, // dungeon/raid boss kills combined across the guild
  // Raw payloads, kept so raid/dungeon progress can be mapped once their shape is confirmed.
  raw: { guild, activity, achievements },
};

writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`Done: ${members.length} members written to guild-data.json`);
