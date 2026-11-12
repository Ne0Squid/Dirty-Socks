// Pulls roster, activity and achievements for a WoW Forever guild from Blizzard's API.
// Usage (Node 18+):
//   BLIZZARD_CLIENT_ID=xxx BLIZZARD_CLIENT_SECRET=yyy node fetch-guild-data.mjs
// Get a client at https://develop.battle.net/access/clients (keep the secret private).
// Writes guild-data.json next to this script.

import { writeFileSync } from "node:fs";

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
let checked = 0, raised = 0, unavailable = 0;
for (let i = 0; i < members.length; i += 5) {
  await Promise.all(members.slice(i, i + 5).map(async (m) => {
    if (!m.surname) return;
    const p = await get(`/profile/wow/character/${encodeURIComponent(slugOf(m))}`, accessToken);
    if (!p || typeof p.level !== "number") { unavailable++; return; }
    checked++;
    if (p.level > (m.level ?? 0)) { m.level = p.level; raised++; }
  }));
}
console.log(`Profile levels: ${checked} checked, ${raised} higher than the roster, ${unavailable} unavailable`);

const out = {
  generated: new Date().toISOString(),
  guild: { name: guild?.name ?? "Dirty Socks", faction: guild?.faction?.name ?? null },
  roster: members,
  // Raw payloads, kept so raid/dungeon progress can be mapped once their shape is confirmed.
  raw: { guild, activity, achievements },
};

writeFileSync(new URL("./guild-data.json", import.meta.url), JSON.stringify(out, null, 2));
console.log(`Done: ${members.length} members written to guild-data.json`);
