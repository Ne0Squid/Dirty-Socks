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
function parseProfessions(pr) {
  const out = [];
  for (const [group, primary] of [[pr?.primaries, true], [pr?.secondaries, false]]) {
    for (const e of group ?? []) {
      const name = e.profession?.name;
      if (!name) continue;
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

let checked = 0, raised = 0, unavailable = 0, specFound = 0, specMissing = 0, profFound = 0, ilvlFound = 0;
for (let i = 0; i < members.length; i += 5) {
  await Promise.all(members.slice(i, i + 5).map(async (m) => {
    if (!m.surname) return;
    const p = await get(`/profile/wow/character/${encodeURIComponent(slugOf(m))}`, accessToken);
    if (!p || typeof p.level !== "number") { unavailable++; return; }
    checked++;
    if (p.level > (m.level ?? 0)) { m.level = p.level; raised++; }
    const base = `/profile/wow/character/${encodeURIComponent(slugOf(m))}`;
    const [sp, pr, eq] = await Promise.all([
      get(`${base}/specializations`, accessToken),
      get(`${base}/professions`, accessToken),
      get(`${base}/equipment`, accessToken),
    ]);
    m.spec = sp ? activeSpec(sp) : null;
    if (m.spec) specFound++; else specMissing++;
    m.professions = pr ? parseProfessions(pr) : [];
    if (m.professions.length) profFound++;
    m.ilvl = itemLevel(p, eq);
    if (m.ilvl) ilvlFound++;
  }));
}
console.log(`Specializations: ${specFound} found, ${specMissing} without a spec`);
console.log(`Professions: ${profFound} characters with data`);
console.log(`Item levels: ${ilvlFound} characters with a value`);
console.log(`Profile levels: ${checked} checked, ${raised} higher than the roster, ${unavailable} unavailable`);

// ===== PROBE (temporary): which dungeon/raid endpoints does Forever answer, and with what? =====
// Results go to probe-data.json (shown on probe.html) so guild-data.json stays clean.
function trim(v, depth = 0) {
  if (Array.isArray(v)) return { _array: v.length, items: depth > 6 ? [] : v.slice(0, 3).map((x) => trim(x, depth + 1)) };
  if (v && typeof v === "object") {
    if (depth > 6) return "{…}";
    return Object.fromEntries(Object.entries(v).filter(([k]) => k !== "_links").map(([k, x]) => [k, trim(x, depth + 1)]));
  }
  return typeof v === "string" && v.length > 140 ? v.slice(0, 140) + "…" : v;
}
const PROBE_PATHS = ["/encounters", "/encounters/dungeons", "/encounters/raids", "/achievements",
  "/achievements/statistics", "/statistics", "/mythic-keystone-profile", "/quests/completed"];
const probeWho = members.filter((m) => m.surname && typeof m.level === "number")
  .sort((a, b) => b.level - a.level).slice(0, 3).map(slugOf);
const probe = { generated: new Date().toISOString(), characters: probeWho, results: [] };
for (const who of probeWho) {
  const base = `/profile/wow/character/${encodeURIComponent(who)}`;
  for (const path of PROBE_PATHS) {
    let status = 0, body = null;
    try {
      const res = await fetch(`${API}${base}${path}?locale=en_US`, {
        headers: { Authorization: `Bearer ${accessToken}`, "Battlenet-Namespace": NAMESPACE },
      });
      status = res.status;
      if (res.ok) body = trim(await res.json());
    } catch (e) { body = String(e); }
    probe.results.push({ character: who, path, status, body });
  }
}
writeFileSync(new URL("./probe-data.json", import.meta.url), JSON.stringify(probe, null, 2));
console.log(`Probe: ${probe.results.filter((r) => r.status === 200).length} of ${probe.results.length} endpoints answered`);
// ===== END PROBE =====

// Level history: one snapshot per day (the latest run of that day), kept for 35 days.
// It lives inside guild-data.json so the workflow needs no changes.
const outPath = new URL("./guild-data.json", import.meta.url);
let days = {};
if (existsSync(outPath)) {
  try { days = JSON.parse(readFileSync(outPath, "utf8")).history?.days ?? {}; } catch { days = {}; }
}
days[new Date().toISOString().slice(0, 10)] = Object.fromEntries(
  members.filter((m) => m.surname && typeof m.level === "number").map((m) => [slugOf(m), m.level]));
days = Object.fromEntries(Object.keys(days).sort().slice(-35).map((k) => [k, days[k]]));

const out = {
  generated: new Date().toISOString(),
  guild: { name: guild?.name ?? "Dirty Socks", faction: guild?.faction?.name ?? null },
  roster: members,
  history: { days },
  // Raw payloads, kept so raid/dungeon progress can be mapped once their shape is confirmed.
  raw: { guild, activity, achievements },
};

writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`Done: ${members.length} members written to guild-data.json`);
