// Turns Blizzard's character endpoints into the small per-character files the site's /character page reads
// (characters/<slug>.json). Everything is read defensively: Forever's responses are still being documented,
// so a missing or differently shaped field just leaves that part out instead of breaking the run.
//
// Used by fetch-guild-data.mjs; tested by scripts/test-character-data.mjs.

const text = (v, n = 220) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, n) : null);
const list = (a) => (Array.isArray(a) ? a : []);
const strings = (a) => a.map((s) => text(s)).filter(Boolean);

// Equipped gear, one entry per slot. `mediaHref` is only used to look up the icon and never written to the files.
export function parseEquipment(eq) {
  if (!eq || !Array.isArray(eq.equipped_items)) return null;
  const out = [];
  for (const i of eq.equipped_items) {
    const slot = text(i?.slot?.type, 30);
    const name = text(i?.name ?? i?.item?.name, 120);
    if (!slot || !name) continue;
    const it = { slot, slotName: text(i.slot?.name, 30), id: i.item?.id ?? null, name, q: text(i.quality?.type, 20), qn: text(i.quality?.name, 20) };
    const put = (k, v) => { if (v != null && !(Array.isArray(v) && !v.length)) it[k] = v; };
    put("bind", text(i.binding?.name, 40));
    put("inv", text(i.inventory_type?.name, 30));
    put("sub", text(i.item_subclass?.name, 30));
    put("armor", text(i.armor?.display?.display_string) ?? (typeof i.armor?.value === "number" ? `${i.armor.value} Armor` : null));
    if (i.weapon) {
      const w = { dmg: text(i.weapon.damage?.display_string), speed: text(i.weapon.attack_speed?.display_string), dps: text(i.weapon.dps?.display_string) };
      if (w.dmg || w.speed || w.dps) it.weapon = w;
    }
    put("stats", strings(list(i.stats).map((s) => s?.display?.display_string ?? (s?.type?.name && typeof s.value === "number" ? `+${s.value} ${s.type.name}` : null))));
    put("spells", strings(list(i.spells).map((s) => s?.description ?? s?.spell?.name)));
    put("enchants", strings(list(i.enchantments).map((e) => e?.display_string)));
    put("sockets", strings(list(i.sockets).map((s) => s?.display_string ?? s?.item?.name)));
    put("req", text(i.requirements?.level?.display_string, 60));
    put("dur", text(i.durability?.display_string, 60));
    put("unique", text(i.unique_equipped, 40));
    if (i.set) {
      const name = text(i.set.item_set?.name ?? i.set.display_string, 80);
      const effects = list(i.set.effects).map((e) => ({ t: text(e?.display_string), on: !!e?.is_active })).filter((e) => e.t);
      if (name) it.set = { name, effects };
    }
    const href = i.media?.key?.href ?? (i.item?.key?.href ? String(i.item.key.href).replace("/data/wow/item/", "/data/wow/media/item/") : null);
    if (href) it.mediaHref = href;
    out.push(it);
  }
  return out;
}

// Character stats: every numeric figure Blizzard gives, flattened to key -> number.
// {base, effective} uses the effective value; {rating, value} (crit, haste...) uses the percentage.
export function parseStats(st) {
  if (!st || typeof st !== "object") return null;
  const out = {};
  for (const [k, v] of Object.entries(st)) {
    if (k === "_links" || k === "character") continue;
    let n = null;
    if (typeof v === "number") n = v;
    else if (v && typeof v === "object") n = typeof v.effective === "number" ? v.effective : typeof v.value === "number" ? v.value : typeof v.rating === "number" ? v.rating : null;
    if (n != null && Number.isFinite(n)) out[k] = Math.round(n * 100) / 100;
  }
  const powerType = text(st.power_type?.name, 30);
  if (powerType) out.powerType = powerType;
  return Object.keys(out).length ? out : null;
}

// Portrait images. Blizzard returns assets[{key, value}] (or the older *_url fields).
export function parseMedia(md) {
  if (!md || typeof md !== "object") return null;
  const a = {};
  for (const x of list(md.assets)) if (x?.key && x?.value) a[x.key] = x.value;
  const out = {};
  const main = a["main-raw"] ?? a.main ?? a.render ?? md.render_url;
  const inset = a.inset ?? a.bust ?? md.bust_url;
  const avatar = a.avatar ?? md.avatar_url;
  if (main) out.main = main;
  if (inset) out.inset = inset;
  if (avatar) out.avatar = avatar;
  return Object.keys(out).length ? out : null;
}

// Race, faction and title from the character summary.
export function parseProfile(p) {
  if (!p || typeof p !== "object") return null;
  const out = {
    race: text(p.race?.name, 40), gender: text(p.gender?.name, 20),
    faction: text(p.faction?.name ?? p.faction?.type, 20), title: text(p.active_title?.display_string ?? p.active_title?.name, 80),
  };
  for (const k of Object.keys(out)) if (out[k] == null) delete out[k];
  return Object.keys(out).length ? out : null;
}

const SECTIONS = ["profile", "media", "equipment", "stats", "kills"];
const nonEmpty = (v) => (Array.isArray(v) ? v.length > 0 : v != null && (typeof v !== "object" || Object.keys(v).length > 0));

// Combine this run's answers with last run's file: a section Blizzard didn't answer keeps its last good value,
// and icons already looked up are reused.
export function mergeCharacter(old, fresh) {
  const file = { slug: fresh.slug, name: fresh.name, surname: fresh.surname ?? null, cls: fresh.cls ?? old?.cls ?? null, level: fresh.level ?? old?.level ?? null, spec: fresh.spec ?? old?.spec ?? null };
  for (const s of SECTIONS) {
    const v = nonEmpty(fresh[s]) ? fresh[s] : old?.[s];
    if (nonEmpty(v)) file[s] = v;
  }
  if (file.equipment) {
    const oldIcons = new Map(list(old?.equipment).filter((x) => x.icon).map((x) => [x.id, x.icon]));
    file.equipment = file.equipment.map((x) => (x.icon || !oldIcons.has(x.id) ? x : { ...x, icon: oldIcons.get(x.id) }));
  }
  return file;
}

// What gets written: no lookup-only links, and `updated` only moves when something really changed,
// so the hourly job never commits a file that is identical to the last one.
export function finalize(old, file, nowIso) {
  const clean = { ...file, equipment: file.equipment?.map(({ mediaHref, ...rest }) => rest) };
  if (!clean.equipment) delete clean.equipment;
  const strip = ({ updated, ...rest }) => rest;
  const same = !!old && JSON.stringify(strip(old)) === JSON.stringify(strip(clean));
  clean.updated = same ? old.updated : nowIso;
  return { file: clean, changed: !same };
}

// Look up the icon of each item that doesn't have one yet. `known` maps item id -> icon url from earlier runs;
// `fetchIcon(href)` returns a url or null. Failures just leave the icon out (the page shows a placeholder).
export async function fillIcons(files, known, fetchIcon, limit = 8) {
  const todo = new Map(); // href -> items waiting for it
  for (const f of files) for (const it of list(f.equipment)) {
    if (it.icon) { known.set(it.id, it.icon); continue; }
    if (known.has(it.id)) { it.icon = known.get(it.id); continue; }
    if (it.mediaHref) (todo.get(it.mediaHref) ?? todo.set(it.mediaHref, []).get(it.mediaHref)).push(it);
  }
  const queue = [...todo.entries()];
  let found = 0;
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [href, items] = next;
      let url = null;
      try { url = await fetchIcon(href); } catch { url = null; }
      if (url) { found++; for (const it of items) { it.icon = url; known.set(it.id, url); } }
    }
  }));
  return { looked: todo.size, found };
}
