// Dirty Socks login + raid sign-up API.
// Runs on Cloudflare Workers with no dependencies. Flow:
//   site -> /auth/login -> Battle.net -> /auth/callback -> site#session=<signed token>
//   site then calls /api/* with "Authorization: Bearer <token>".
// Secrets: BLIZZARD_CLIENT_ID, BLIZZARD_CLIENT_SECRET, SESSION_SECRET, and optionally DISCORD_WEBHOOK_URL (sign-up alerts),
// DISCORD_NEWS_WEBHOOK_URL (new news posts) and WEB_ADMIN_SUBS (who may post news; kept secret so the group stays hidden). Settings live in wrangler.toml.

const RAIDS = { barrow: 10, hyjal: 20, both: 0 };
const ROLES = ["Tank", "Healer", "DPS"];
const NIGHTS = ["wednesday", "thursday"];
const STATUSES = ["pending", "approved", "declined"];
// A "both" sign-up is two separate requests: each raid keeps its own status.
const raidsOf = (raid) => (raid === "both" ? ["barrow", "hyjal"] : [raid]);
const statusesOf = (s) => Object.fromEntries(raidsOf(s.raid).map((r) => [r, STATUSES.includes(s.statuses?.[r]) ? s.statuses[r] : (STATUSES.includes(s.status) ? s.status : "pending")]));
// Roster slots per raid (keep in step with RAIDS in recruitment.html). Backups are one shared pool, tagged with the role they cover.
const LAYOUT = { barrow: { main: 1, off: 1, heal: 2, dps: 6, bak: 2 }, hyjal: { main: 1, off: 1, heal: 4, dps: 14, bak: 4 } };
const SLOTS = ["main", "off", "heal", "dps", "bak-tank", "bak-heal", "bak-dps"];
const bucket = (slot) => (slot.startsWith("bak") ? "bak" : slot);
// Placements only count while that raid is approved.
const slotsOf = (s) => { const st = statusesOf(s); return Object.fromEntries(raidsOf(s.raid).filter((r) => st[r] === "approved" && SLOTS.includes(s.slots?.[r])).map((r) => [r, s.slots[r]])); };
const MAX_PER_ACCOUNT = 6;
const SESSION_DAYS = 7;

const enc = new TextEncoder(), dec = new TextDecoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const hmacKey = (secret) => crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

async function sign(obj, secret) {
  const p = b64u(enc.encode(JSON.stringify(obj)));
  return p + "." + b64u(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(p)));
}
async function verify(token, secret) {
  if (typeof token !== "string" || token.split(".").length !== 2) return null;
  const [p, s] = token.split(".");
  let ok = false;
  try { ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), unb64u(s), enc.encode(p)); } catch { return null; }
  if (!ok) return null;
  let o; try { o = JSON.parse(dec.decode(unb64u(p))); } catch { return null; }
  return o && o.exp > Date.now() / 1000 ? o : null;
}

// ---- storage: one Durable Object holding everything -------------------------------------------
const json = (o, status = 200, headers = {}) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", ...headers } });

export class Store {
  constructor(state) { this.s = state.storage; }
  async fetch(req) {
    const b = await req.json(), now = Date.now();
    if (b.op === "get") {
      const r = await this.s.get(b.key);
      if (r && r.exp && r.exp < now) { await this.s.delete(b.key); return json({ value: null }); }
      return json({ value: r ? r.v : null });
    }
    if (b.op === "put") { await this.s.put(b.key, { v: b.value, exp: b.ttl ? now + b.ttl * 1000 : 0 }); return json({ ok: true }); }
    if (b.op === "del") { await this.s.delete(b.key); return json({ ok: true }); }
    if (b.op === "list") {
      const m = await this.s.list({ prefix: b.prefix }), items = [];
      for (const [key, r] of m) if (!(r.exp && r.exp < now)) items.push({ key, value: r.v });
      return json({ items });
    }
    return json({ error: "bad op" }, 400);
  }
}
function db(env) {
  const stub = env.STORE.get(env.STORE.idFromName("main"));
  const call = async (b) => (await stub.fetch("https://store/", { method: "POST", body: JSON.stringify(b) })).json();
  return {
    get: async (k) => (await call({ op: "get", key: k })).value ?? null,
    put: (k, v, ttl) => call({ op: "put", key: k, value: v, ttl }),
    del: (k) => call({ op: "del", key: k }),
    list: async (p) => (await call({ op: "list", prefix: p })).items,
  };
}

// ---- helpers ----------------------------------------------------------------------------------
function allowedOrigins(env) {
  const site = new URL(env.SITE_ORIGIN), set = new Set([site.origin]);
  set.add(site.hostname.startsWith("www.") ? `${site.protocol}//${site.hostname.slice(4)}` : `${site.protocol}//www.${site.hostname}`);
  (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean).forEach((o) => set.add(o));
  return set;
}
function corsHeaders(req, env) {
  const o = req.headers.get("Origin");
  return o && allowedOrigins(env).has(o)
    ? { "Access-Control-Allow-Origin": o, "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS", "Access-Control-Max-Age": "86400", Vary: "Origin" }
    : {};
}
const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);
const full = (c) => (c.surname ? `${c.name} ${c.surname}` : c.name);
const key = (name) => name.toLowerCase().replace(/\s+/g, " ");
const isOfficer = (env, sub) => (env.OFFICER_SUBS || "").split(",").map((s) => s.trim()).filter(Boolean).includes(String(sub));
// Web Admins may post news. The list is a secret (not in the repo) and the group is never shown to anyone: it only turns on the post form for them.
const isWebAdmin = (env, sub) => (env.WEB_ADMIN_SUBS || "").split(",").map((s) => s.trim()).filter(Boolean).includes(String(sub));

async function me(req, env) {
  const m = (req.headers.get("Authorization") || "").match(/^Bearer (.+)$/);
  return m ? verify(m[1], env.SESSION_SECRET) : null;
}

// What Battle.net says this account owns. Never throws: if the game's profile is not exposed, the site falls back to "claim a character".
async function fetchCharacters(env, accessToken) {
  const region = env.REGION || "us", ns = env.PROFILE_NAMESPACE || "profile-forever-us";
  try {
    const r = await fetch(`https://${region}.api.blizzard.com/profile/user/wow?namespace=${ns}&locale=en_US`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!r.ok) return { status: r.status, list: [] };
    const data = await r.json(), list = [];
    for (const acct of data.wow_accounts || []) for (const c of acct.characters || []) {
      list.push({
        name: clean(c.name, 40), surname: c.surname ? clean(c.surname, 40) : undefined, id: c.id,
        realm: c.realm && c.realm.name ? clean(c.realm.name, 40) : undefined,
        level: c.level, cls: c.playable_class && c.playable_class.name, race: c.playable_race && c.playable_race.name,
        faction: c.faction && (c.faction.name || c.faction.type),
      });
    }
    return { status: 200, list };
  } catch { return { status: 0, list: [] }; }
}

async function rosterNames(env) {
  try {
    const r = await fetch(new URL("/guild-data.json", env.SITE_ORIGIN));
    const g = await r.json();
    return new Set((g.roster || []).filter((m) => m.level >= 10).map((m) => key(full(m))));
  } catch { return null; }
}

// ---- routes -----------------------------------------------------------------------------------
async function login(url, env) {
  const ret = url.searchParams.get("return") || new URL("/signup", env.SITE_ORIGIN).href;
  let origin; try { origin = new URL(ret).origin; } catch { return json({ error: "bad return url" }, 400); }
  if (!allowedOrigins(env).has(origin)) return json({ error: "return url not allowed" }, 400);
  const state = await sign({ r: ret, n: b64u(crypto.getRandomValues(new Uint8Array(12))), exp: Math.floor(Date.now() / 1000) + 600 }, env.SESSION_SECRET);
  const q = new URLSearchParams({ client_id: env.BLIZZARD_CLIENT_ID, redirect_uri: `${url.origin}/auth/callback`, response_type: "code", scope: "openid wow.profile", state });
  return Response.redirect(`${env.OAUTH_AUTHORIZE_URL || "https://oauth.battle.net/authorize"}?${q}`, 302); // OAUTH_AUTHORIZE_URL is only set by the local dev server
}

async function callback(url, env) {
  const st = await verify(url.searchParams.get("state"), env.SESSION_SECRET);
  if (!st) return json({ error: "login expired, go back and try again" }, 400);
  const back = (frag) => Response.redirect(`${st.r.split("#")[0]}#${frag}`, 302);
  const code = url.searchParams.get("code");
  if (!code) return back("error=" + encodeURIComponent(url.searchParams.get("error") || "cancelled"));
  try {
    const tr = await fetch("https://oauth.battle.net/token", {
      method: "POST",
      headers: { Authorization: "Basic " + btoa(`${env.BLIZZARD_CLIENT_ID}:${env.BLIZZARD_CLIENT_SECRET}`), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: `${url.origin}/auth/callback` }),
    });
    if (!tr.ok) return back("error=token");
    const { access_token } = await tr.json();
    const ur = await fetch("https://oauth.battle.net/userinfo", { headers: { Authorization: `Bearer ${access_token}` } });
    if (!ur.ok) return back("error=userinfo");
    const u = await ur.json(), sub = String(u.sub || u.id);
    const chars = await fetchCharacters(env, access_token);
    await db(env).put(`chars:${sub}`, { list: chars.list, status: chars.status, at: Date.now() }, SESSION_DAYS * 86400);
    const token = await sign({ sub, bt: clean(u.battletag, 60), exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400 }, env.SESSION_SECRET);
    return back("session=" + token);
  } catch { return back("error=login"); }
}

// Public, read-only: who is confirmed and where they sit. Names only (no BattleTags, notes or account ids).
// ---- Discord sign-up alerts -------------------------------------------------------------------------
// Optional: with a DISCORD_WEBHOOK_URL secret, a short message is posted to that channel when a player signs up or
// withdraws. Nothing is sent without the secret, nothing in a message can ping anyone, BattleTags are left out,
// and a Discord problem never affects the player (it is sent after the answer, errors are swallowed).
const WEBHOOK_RE = /^https:\/\/(?:(?:canary|ptb)\.)?(?:discord|discordapp)\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]+$/;
const RAID_NAMES = { barrow: "The Barrow Deeps", hyjal: "Hyjal Summit", both: "Both raids" };
const ALERTS_PER_HOUR = 8;   // per account, so nobody can flood the channel by signing up and withdrawing over and over
const plain = (s, n = 300) => String(s ?? "").replace(/\s+/g, " ").replace(/[\\`*_~|>[\]()<@]/g, "\\$&").slice(0, n);   // player text shown as plain text
const cap1 = (w) => w.charAt(0).toUpperCase() + w.slice(1);

function signupEmbed(env, kind, s, info, extra = {}) {
  const raids = (r) => RAID_NAMES[r] ?? r;
  const fields = [];
  let title, color;
  if (kind === "new") { title = "New raid sign-up"; color = 0x2ecc71; }
  else if (kind === "left") { title = "Left one raid"; color = 0xe67e22; }
  else { title = "Sign-up withdrawn"; color = 0x95a5a6; }
  if (kind === "left") {
    fields.push({ name: "Left", value: raids(extra.left), inline: true }, { name: "Still signed up for", value: raids(s.raid === "both" ? extra.keep : s.raid), inline: true });
  } else {
    fields.push({ name: "Raid", value: raids(s.raid), inline: true });
    if (s.roles?.length) fields.push({ name: "Roles", value: s.roles.map((r) => plain(r, 20)).join(", "), inline: true });
    if (s.nights?.length) fields.push({ name: "Nights", value: s.nights.map((n) => plain(cap1(n), 20)).join(", "), inline: true });
    if (kind === "new" && s.note) fields.push({ name: "Note", value: plain(s.note) });
  }
  const site = String(env.SITE_ORIGIN || "").replace(/\/+$/, "");
  const embed = {
    title, color, timestamp: new Date().toISOString(),
    description: `**${plain(s.character, 80)}**${info ? " · " + plain(info, 60) : ""}`,
    fields,
  };
  if (kind === "new") embed.footer = { text: s.verified ? "Verified with Battle.net" : "Not verified, so officers should double-check the character" };
  if (site) embed.url = `${site}/signup`;
  return { username: "Dirty Socks Sign-ups", allowed_mentions: { parse: [] }, embeds: [embed] };
}

async function allowAlert(store, who, now, max = ALERTS_PER_HOUR) {
  const k = `alerts:${who}`, a = (await store.get(k)) || { start: now, n: 0 };
  if (now - a.start > 3600e3) { a.start = now; a.n = 0; }
  if (a.n >= max) return false;
  a.n++; await store.put(k, a);
  return true;
}

// Fire and forget: runs after the response has been sent when the platform allows it.
function alertDiscord(ctx, env, store, sub, build, url = env.DISCORD_WEBHOOK_URL, max = ALERTS_PER_HOUR) {
  if (!url || !WEBHOOK_RE.test(url)) return;
  const job = (async () => {
    try {
      if (!(await allowAlert(store, sub, Date.now(), max))) return;
      await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(build()) });
    } catch { /* a Discord hiccup must never touch the sign-up itself */ }
  })();
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(job);
}

// ---- News (home page) ------------------------------------------------------------------------------
// Anyone can read the feed. Only Web Admins can post, edit or delete. Posts are plain text; the author is stored
// for the record but never sent to the site or to Discord, so nothing shows who (or what group) wrote a post.
const NEWS_ID = /^[a-z0-9]{6,40}$/;
const NEWS_FEED_MAX = 30, NEWS_STORE_MAX = 200, NEWS_ALERTS_PER_HOUR = 10;
const lines = (s, n) => String(s ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f<>]/g, "").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, n);
const publicPost = (p) => ({ id: p.id, title: p.title, body: p.body, pinned: !!p.pinned, at: p.at, ...(p.edited ? { edited: p.edited } : {}) });

async function publicNews(env) {
  const posts = (await db(env).list("news:")).map(({ value }) => value);
  posts.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.at - a.at);
  return json({ news: posts.slice(0, NEWS_FEED_MAX).map(publicPost) }, 200, { "Cache-Control": "public, max-age=15", Vary: "Origin" });
}

function newsEmbed(env, post) {
  const site = String(env.SITE_ORIGIN || "").replace(/\/+$/, "");
  const embed = { title: plain(post.title, 250), color: 0xd9534f, timestamp: new Date(post.at).toISOString(), footer: { text: "Dirty Socks news" } };
  if (post.body) embed.description = post.body.replace(/[\\`*_~|>[\]()<@]/g, "\\$&").slice(0, 3800);
  if (site) embed.url = `${site}/#news`;
  return { username: "Dirty Socks News", allowed_mentions: { parse: [] }, embeds: [embed] };
}

async function publicRoster(env) {
  const raids = { barrow: [], hyjal: [] };
  for (const { value: s } of await db(env).list("signup:")) for (const [r, slot] of Object.entries(slotsOf(s))) raids[r].push({ character: s.character, slot, at: s.created || 0 });
  for (const r of Object.keys(raids)) raids[r] = raids[r].sort((a, b) => a.at - b.at).map(({ character, slot }) => ({ character, slot }));
  return json({ raids, layout: LAYOUT }, 200, { "Cache-Control": "public, max-age=15", Vary: "Origin" });
}

async function handleApi(req, url, env, who, ctx) {
  const store = db(env), officer = isOfficer(env, who.sub), method = req.method, path = url.pathname;

  if (path === "/api/me" && method === "GET") {
    const c = (await store.get(`chars:${who.sub}`)) || { list: [], status: null };
    return json({ sub: who.sub, battletag: who.bt, officer, ...(isWebAdmin(env, who.sub) ? { webAdmin: true } : {}), characters: c.list, source: c.list.length ? "blizzard" : "none", charsStatus: c.status });
  }

  if (path === "/api/signups" && method === "GET") {
    const items = await store.list("signup:");
    const out = items.map(({ value: s }) => {
      const row = { character: s.character, raid: s.raid, roles: s.roles, nights: s.nights, statuses: statusesOf(s), slots: slotsOf(s), verified: s.verified, mine: s.sub === who.sub, updated: s.updated };
      if (officer || s.sub === who.sub) { row.note = s.note; row.battletag = s.battletag; }
      if (officer) row.sub = s.sub;
      return row;
    }).sort((a, b) => a.updated - b.updated);
    return json({ signups: out, caps: { barrow: RAIDS.barrow, hyjal: RAIDS.hyjal }, layout: LAYOUT });
  }

  if (path === "/api/signup" && method === "PUT") {
    let b; try { b = await req.json(); } catch { return json({ error: "bad request" }, 400); }
    const character = clean(b.character, 80), note = clean(b.note, 300);
    const roles = [...new Set(Array.isArray(b.roles) ? b.roles : [])], nights = [...new Set(Array.isArray(b.nights) ? b.nights : [])];
    if (!character) return json({ error: "Choose a character." }, 400);
    if (!Object.hasOwn(RAIDS, b.raid)) return json({ error: "Choose a raid." }, 400);
    if (!roles.length || !roles.every((r) => ROLES.includes(r))) return json({ error: "Pick at least one role." }, 400);
    if (!nights.length || !nights.every((n) => NIGHTS.includes(n))) return json({ error: "Pick at least one night." }, 400);

    const c = (await store.get(`chars:${who.sub}`)) || { list: [] };
    let verified = false;
    if (c.list.length) {
      if (!c.list.some((x) => key(full(x)) === key(character))) return json({ error: "That character is not on your Battle.net account." }, 403);
      verified = true;
    } else {
      const names = await rosterNames(env);
      if (names && !names.has(key(character))) return json({ error: "That character is not on the guild roster." }, 400);
    }
    const k = `signup:${who.sub}:${key(character)}`, prev = await store.get(k);
    if (!prev) {
      const mine = (await store.list(`signup:${who.sub}:`)).length;
      if (mine >= MAX_PER_ACCOUNT) return json({ error: `You can have up to ${MAX_PER_ACCOUNT} sign-ups. Withdraw one first.` }, 400);
    }
    const now = Date.now();
    const row = { sub: who.sub, battletag: who.bt, character, raid: b.raid, roles, nights, note, verified, statuses: Object.fromEntries(raidsOf(b.raid).map((r) => [r, "pending"])), created: prev ? prev.created : now, updated: now };
    await store.put(k, row);
    if (!prev) {   // only a brand-new sign-up is announced, not later edits
      const mine = c.list.find((x) => key(full(x)) === key(character));
      alertDiscord(ctx, env, store, who.sub, () => signupEmbed(env, "new", row, mine && mine.level ? `Level ${mine.level}${mine.cls ? " " + mine.cls : ""}` : ""));
    }
    return json({ ok: true });
  }

  if (path === "/api/signup" && method === "DELETE") {
    const character = clean(url.searchParams.get("character"), 80), target = officer && url.searchParams.get("sub") ? url.searchParams.get("sub") : who.sub;
    const k = `signup:${target}:${key(character)}`, raid = url.searchParams.get("raid"), byOwner = target === who.sub;
    const prior = await store.get(k);
    if (raid) {   // take them out of one raid only; a Both-raids sign-up keeps the other raid and its status
      const s = prior;
      if (!s) return json({ ok: true });
      const raids = raidsOf(s.raid);
      if (!raids.includes(raid)) return json({ error: "That sign-up is not for that raid." }, 400);
      if (raids.length > 1) {
        const keep = raids.find((r) => r !== raid), { status: _legacy, ...rest } = s;
        await store.put(k, { ...rest, raid: keep, statuses: { [keep]: statusesOf(s)[keep] }, slots: slotsOf(s)[keep] ? { [keep]: slotsOf(s)[keep] } : {}, updated: Date.now() });
        if (byOwner) alertDiscord(ctx, env, store, who.sub, () => signupEmbed(env, "left", s, "", { left: raid, keep }));
        return json({ ok: true });
      }
    }
    await store.del(k);
    if (prior && byOwner) alertDiscord(ctx, env, store, who.sub, () => signupEmbed(env, "withdrawn", prior, ""));   // officers removing someone is not announced
    return json({ ok: true });
  }

  if (path === "/api/signup/status" && method === "POST") {
    if (!officer) return json({ error: "Officers only." }, 403);
    let b; try { b = await req.json(); } catch { return json({ error: "bad request" }, 400); }
    if (!STATUSES.includes(b.status)) return json({ error: "bad status" }, 400);
    const k = `signup:${String(b.sub)}:${key(clean(b.character, 80))}`, s = await store.get(k);
    if (!s) return json({ error: "Sign-up not found." }, 404);
    const raids = raidsOf(s.raid), cur = statusesOf(s);
    if (b.raid !== undefined && b.raid !== null && b.raid !== "") {
      if (!raids.includes(b.raid)) return json({ error: "That sign-up is not for that raid." }, 400);
      cur[b.raid] = b.status;   // one raid only: the other keeps its own answer
    } else for (const r of raids) cur[r] = b.status;
    const { status: _legacy, ...rest } = s, slots = slotsOf(s);
    if (b.status !== "approved") for (const r of (b.raid ? [b.raid] : raids)) delete slots[r];   // declined or pending means no roster slot
    await store.put(k, { ...rest, statuses: cur, slots, updated: Date.now() });
    return json({ ok: true });
  }

  // Officer puts an approved player into a roster slot ("" clears it). Choosing a slot also approves that raid.
  if (path === "/api/signup/slot" && method === "POST") {
    if (!officer) return json({ error: "Officers only." }, 403);
    let b; try { b = await req.json(); } catch { return json({ error: "bad request" }, 400); }
    const k = `signup:${String(b.sub)}:${key(clean(b.character, 80))}`, s = await store.get(k);
    if (!s) return json({ error: "Sign-up not found." }, 404);
    if (!raidsOf(s.raid).includes(b.raid)) return json({ error: "That sign-up is not for that raid." }, 400);
    const slot = b.slot === "" || b.slot == null ? "" : String(b.slot);
    if (slot && !SLOTS.includes(slot)) return json({ error: "bad slot" }, 400);
    const cur = statusesOf(s), slots = slotsOf(s);
    if (slot) {
      let taken = 0;
      for (const { key: other, value: o } of await store.list("signup:")) if (other !== k && slotsOf(o)[b.raid] && bucket(slotsOf(o)[b.raid]) === bucket(slot)) taken++;
      if (taken >= LAYOUT[b.raid][bucket(slot)]) return json({ error: "That part of the roster is full. Pick another slot or move someone first." }, 409);
      slots[b.raid] = slot; cur[b.raid] = "approved";
    } else delete slots[b.raid];
    const { status: _legacy, ...rest } = s;
    await store.put(k, { ...rest, statuses: cur, slots, updated: Date.now() });
    return json({ ok: true });
  }
  if (path === "/api/news" && (method === "POST" || method === "PUT" || method === "DELETE")) {
    if (!isWebAdmin(env, who.sub)) return json({ error: "Not allowed." }, 403);
    const id = url.searchParams.get("id") || "";
    if (method === "DELETE") {
      if (!NEWS_ID.test(id)) return json({ error: "bad id" }, 400);
      await store.del(`news:${id}`);
      return json({ ok: true });
    }
    let b; try { b = await req.json(); } catch { return json({ error: "bad request" }, 400); }
    const title = clean(b.title, 120), body = lines(b.body, 2000);
    if (!title) return json({ error: "Give the post a title." }, 400);
    if (method === "PUT") {
      if (!NEWS_ID.test(id)) return json({ error: "bad id" }, 400);
      const prev = await store.get(`news:${id}`);
      if (!prev) return json({ error: "Post not found." }, 404);
      const post = { ...prev, title, body, pinned: !!b.pinned, edited: Date.now() };
      await store.put(`news:${id}`, post);
      return json({ ok: true, post: publicPost(post) });
    }
    if ((await store.list("news:")).length >= NEWS_STORE_MAX) return json({ error: "That is a lot of news. Delete some old posts first." }, 400);
    const now = Date.now(), nid = now.toString(36) + Array.from(crypto.getRandomValues(new Uint8Array(3)), (x) => x.toString(36).padStart(2, "0")).join("");
    const post = { id: nid, title, body, pinned: !!b.pinned, at: now, by: who.sub };
    await store.put(`news:${nid}`, post);
    alertDiscord(ctx, env, store, `news:${who.sub}`, () => newsEmbed(env, post), env.DISCORD_NEWS_WEBHOOK_URL, NEWS_ALERTS_PER_HOUR);   // new posts only, not edits
    return json({ ok: true, post: publicPost(post) });
  }
  return json({ error: "not found" }, 404);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), cors = corsHeaders(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    let res;
    try {
      if (url.pathname === "/auth/login") res = await login(url, env);
      else if (url.pathname === "/auth/callback") res = await callback(url, env);
      else if (url.pathname === "/api/roster" && req.method === "GET") res = await publicRoster(env);
      else if (url.pathname === "/api/news" && req.method === "GET") res = await publicNews(env);
      else if (url.pathname.startsWith("/api/")) {
        const who = await me(req, env);
        res = who ? await handleApi(req, url, env, who, ctx) : json({ error: "Please sign in." }, 401);
      } else if (url.pathname === "/") res = json({ ok: true, service: "dirty-socks-login" });
      else res = json({ error: "not found" }, 404);
    } catch (e) { res = json({ error: "Server error." }, 500); }
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
};
