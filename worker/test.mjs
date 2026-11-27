// Run: node worker/test.mjs   (Node 18+, no dependencies)
import worker from "./src/index.js";
import { makeEnv, mockBlizzard } from "./mock-env.mjs";

let pass = 0, fail = 0;
const ok = (cond, name, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "  ok  " : " FAIL "} ${name}${cond ? "" : "  " + extra}`); };
const SITE = "https://www.dirtysocks.net", API = "https://login.test";
const req = (path, { method = "GET", token, body, origin = SITE } = {}) =>
  new Request(API + path, { method, headers: { ...(token ? { Authorization: "Bearer " + token } : {}), ...(origin ? { Origin: origin } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });

const roster = [
  { name: "Squid", surname: "Zero", level: 60, cls: "Druid" }, { name: "Scott", surname: "Frost", level: 58, cls: "Paladin" },
  { name: "Tiny", surname: "Alt", level: 5, cls: "Mage" }, { name: "Needmore", surname: "Beers", level: 57, cls: "Warrior" },
];
const accounts = {
  codeA: { sub: "1001", battletag: "Squid#1234", chars: [{ name: "Squid", surname: "Zero", id: 1, level: 60, playable_class: { name: "Druid" }, faction: { name: "Horde" } }, { name: "Neo", surname: "Squid", id: 2, level: 12, playable_class: { name: "Rogue" } }] },
  codeB: { sub: "1002", battletag: "NoProfile#9999", chars: null },
  codeO: { sub: "2000", battletag: "Officer#0001", chars: [{ name: "Scott", surname: "Frost", id: 3, level: 58, playable_class: { name: "Paladin" } }] },
  codeW: { sub: "3000", battletag: "WebAdmin#0003", chars: [{ name: "Tiny", surname: "Alt", id: 4, level: 5, playable_class: { name: "Mage" } }] },
  codeX: { sub: "4000", battletag: "Both#0004", chars: [{ name: "Needmore", surname: "Beers", id: 5, level: 57, playable_class: { name: "Warrior" } }] },
};
const bz = mockBlizzard(accounts, { roster });
const env = makeEnv({ OFFICER_SUBS: "2000" });
const fetchW = (r) => worker.fetch(r, env);

async function signIn(code) {
  const l = await fetchW(req("/auth/login"));
  const state = new URL(l.headers.get("Location")).searchParams.get("state");
  const cb = await fetchW(req(`/auth/callback?code=${code}&state=${encodeURIComponent(state)}`, { origin: null }));
  const loc = cb.headers.get("Location") || "";
  return { l, cb, loc, token: (loc.match(/#session=(.+)$/) || [])[1] };
}

console.log("login redirect");
{
  const r = await fetchW(req("/auth/login")), u = new URL(r.headers.get("Location"));
  ok(r.status === 302 && u.origin === "https://oauth.battle.net" && u.pathname === "/authorize", "redirects to Battle.net authorize");
  ok(u.searchParams.get("client_id") === "test-client" && u.searchParams.get("scope") === "openid wow.profile" && u.searchParams.get("response_type") === "code", "asks for openid + wow.profile");
  ok(u.searchParams.get("redirect_uri") === API + "/auth/callback", "redirect_uri points at the worker callback");
  const bad = await fetchW(req("/auth/login?return=https://evil.example/steal"));
  ok(bad.status === 400, "refuses a return address on another site");
  const tampered = await fetchW(req("/auth/callback?code=codeA&state=abc.def", { origin: null }));
  ok(tampered.status === 400, "refuses a forged state");
}

console.log("callback + session");
const A = await signIn("codeA");
ok(A.cb.status === 302 && A.loc.startsWith(SITE + "/signup#session="), "sends the player back to /signup with a session", A.loc);
ok(bz.log.some((e) => e[0] === "token" && e[1] === API + "/auth/callback" && e[2]), "token exchange used Basic auth and the same redirect_uri");
ok(bz.log.some((e) => e[0] === "profile" && e[1] === "profile-forever-us"), "asked Blizzard for the Forever profile namespace");
{
  const m = await (await fetchW(req("/api/me", { token: A.token }))).json();
  ok(m.battletag === "Squid#1234" && m.source === "blizzard" && m.characters.length === 2 && m.officer === false, "/api/me returns battletag + verified characters");
  ok(m.characters[0].name === "Squid" && m.characters[0].level === 60 && m.characters[0].cls === "Druid", "characters are normalised");
  ok((await fetchW(req("/api/me"))).status === 401, "no token -> 401");
  ok((await fetchW(req("/api/me", { token: A.token.slice(0, -2) + "xx" }))).status === 401, "tampered token -> 401");
}
const B = await signIn("codeB");
{
  const m = await (await fetchW(req("/api/me", { token: B.token }))).json();
  ok(m.source === "none" && m.characters.length === 0 && m.charsStatus === 404, "profile unavailable -> source none (claim mode), status reported");
}
const bad = await fetchW(req("/auth/callback?code=nope&state=" + encodeURIComponent(new URL((await fetchW(req("/auth/login"))).headers.get("Location")).searchParams.get("state")), { origin: null }));
ok((bad.headers.get("Location") || "").includes("#error=token"), "failed token exchange -> #error=token");
const cancelled = await fetchW(req("/auth/callback?error=access_denied&state=" + encodeURIComponent(new URL((await fetchW(req("/auth/login"))).headers.get("Location")).searchParams.get("state")), { origin: null }));
ok((cancelled.headers.get("Location") || "").includes("#error=access_denied"), "player cancels at Battle.net -> #error=access_denied");

console.log("sign-ups");
const put = (token, body) => fetchW(req("/api/signup", { method: "PUT", token, body }));
const good = { character: "Squid Zero", raid: "barrow", roles: ["Healer"], nights: ["wednesday", "thursday"], note: "Resto, can off-tank" };
ok((await put(A.token, good)).status === 200, "verified player can sign up their own character");
ok((await put(A.token, { ...good, character: "Scott Frost" })).status === 403, "cannot sign up a character that is not on their Battle.net account");
ok((await put(A.token, { ...good, roles: [] })).status === 400, "needs a role");
ok((await put(A.token, { ...good, nights: ["friday"] })).status === 400, "rejects an unknown night");
ok((await put(A.token, { ...good, raid: "naxx" })).status === 400, "rejects an unknown raid");
ok((await put(A.token, { ...good, roles: ["King"] })).status === 400, "rejects an unknown role");
ok((await put(B.token, { ...good, character: "Scott Frost" })).status === 200, "claim mode: roster character is accepted (unverified)");
ok((await put(B.token, { ...good, character: "Nobody Real" })).status === 400, "claim mode: not on the roster -> rejected");
ok((await put(B.token, { ...good, character: "Tiny Alt" })).status === 400, "claim mode: under level 10 -> rejected like the old form");
{
  const L = await (await fetchW(req("/api/signups", { token: A.token }))).json();
  const mine = L.signups.find((s) => s.character === "Squid Zero"), other = L.signups.find((s) => s.character === "Scott Frost");
  ok(L.signups.length === 2 && mine.mine === true && mine.verified === true && mine.statuses.barrow === "pending" && Object.keys(mine.statuses).join() === "barrow", "list shows both, mine flagged, verified, pending (barrow only)");
  ok(other.mine === false && other.verified === false && other.battletag === undefined && other.note === undefined && other.sub === undefined, "other players' battletag/note/sub stay private");
  ok(mine.note === "Resto, can off-tank", "my own note is visible to me");
  ok(L.caps.barrow === 10 && L.caps.hyjal === 20, "raid sizes included");
}
ok((await put(A.token, { ...good, raid: "both" })).status === 200, "editing a sign-up works");
{ const L = await (await fetchW(req("/api/signups", { token: A.token }))).json(); ok(L.signups.filter((s) => s.character === "Squid Zero").length === 1, "editing does not duplicate"); }

console.log("officers");
const O = await signIn("codeO");
{
  const m = await (await fetchW(req("/api/me", { token: O.token }))).json();
  ok(m.officer === true, "OFFICER_SUBS account is flagged officer");
  const L = await (await fetchW(req("/api/signups", { token: O.token }))).json();
  ok(L.signups.every((s) => s.sub && s.battletag), "officer sees battletags + account ids");
  const sq = L.signups.find((s) => s.character === "Squid Zero");
  const st = (token, body) => fetchW(req("/api/signup/status", { method: "POST", token, body }));
  ok((await st(A.token, { sub: sq.sub, character: "Squid Zero", raid: "barrow", status: "approved" })).status === 403, "non-officer cannot approve");
  ok((await st(O.token, { sub: sq.sub, character: "Squid Zero", raid: "barrow", status: "maybe" })).status === 400, "officer: bad status rejected");
  ok((await st(O.token, { sub: "999", character: "Ghost", raid: "barrow", status: "approved" })).status === 404, "officer: unknown sign-up -> 404");
  const get = async (name) => (await (await fetchW(req("/api/signups", { token: A.token }))).json()).signups.find((s) => s.character === name);
  ok(sq.raid === "both" && sq.statuses.barrow === "pending" && sq.statuses.hyjal === "pending", "a both-raids sign-up starts pending in each raid");

  ok((await st(O.token, { sub: sq.sub, character: "Squid Zero", raid: "barrow", status: "approved" })).status === 200, "officer approves Barrow only");
  let z = await get("Squid Zero");
  ok(z.statuses.barrow === "approved" && z.statuses.hyjal === "pending", "approving Barrow leaves Hyjal pending", JSON.stringify(z.statuses));

  ok((await st(O.token, { sub: sq.sub, character: "Squid Zero", raid: "hyjal", status: "declined" })).status === 200, "officer declines Hyjal only");
  z = await get("Squid Zero");
  ok(z.statuses.barrow === "approved" && z.statuses.hyjal === "declined", "declining Hyjal leaves Barrow approved", JSON.stringify(z.statuses));

  ok((await st(O.token, { sub: sq.sub, character: "Squid Zero", raid: "barrow", status: "declined" })).status === 200, "officer can change their mind on one raid");
  z = await get("Squid Zero");
  ok(z.statuses.barrow === "declined" && z.statuses.hyjal === "declined", "each raid keeps its own answer", JSON.stringify(z.statuses));

  ok((await st(O.token, { sub: sq.sub, character: "Squid Zero", status: "approved" })).status === 200, "no raid given -> applies to every raid in the sign-up");
  z = await get("Squid Zero");
  ok(z.statuses.barrow === "approved" && z.statuses.hyjal === "approved", "approve with no raid covers both", JSON.stringify(z.statuses));

  const sf = L.signups.find((s) => s.character === "Scott Frost");
  ok((await st(O.token, { sub: sf.sub, character: "Scott Frost", raid: "hyjal", status: "approved" })).status === 400, "cannot approve a raid the player did not sign up for");

  await put(A.token, { ...good, raid: "both", roles: ["Healer", "DPS"] });
  z = await get("Squid Zero");
  ok(z.statuses.barrow === "pending" && z.statuses.hyjal === "pending", "editing a sign-up sends every raid back to pending", JSON.stringify(z.statuses));

  // sign-ups saved before per-raid statuses existed still read correctly
  await env.STORE.get(env.STORE.idFromName("main")).fetch("https://store/", { method: "POST", body: JSON.stringify({ op: "put", key: "signup:1001:legacy one", value: { sub: "1001", battletag: "Squid#1234", character: "Legacy One", raid: "both", roles: ["DPS"], nights: ["wednesday"], note: "", verified: true, status: "approved", created: 1, updated: 1 } }) });
  {
    const lg = await get("Legacy One");
    ok(lg && lg.statuses.barrow === "approved" && lg.statuses.hyjal === "approved", "old single-status sign-ups show their status for each raid", JSON.stringify(lg && lg.statuses));
    await st(O.token, { sub: "1001", character: "Legacy One", raid: "hyjal", status: "declined" });
    const lg2 = await get("Legacy One");
    ok(lg2.statuses.barrow === "approved" && lg2.statuses.hyjal === "declined", "an old sign-up upgrades cleanly on first per-raid change", JSON.stringify(lg2.statuses));
    await fetchW(req("/api/signup?character=Legacy%20One", { method: "DELETE", token: A.token }));
  }
}

console.log("remove one raid");
{
  const del = (token, q) => fetchW(req("/api/signup?" + q, { method: "DELETE", token }));
  const get = async (name) => (await (await fetchW(req("/api/signups", { token: O.token }))).json()).signups.find((s) => s.character === name);
  const st = (body) => fetchW(req("/api/signup/status", { method: "POST", token: O.token, body }));
  await put(A.token, { ...good, raid: "both" });
  await st({ sub: "1001", character: "Squid Zero", raid: "barrow", status: "approved" });
  await st({ sub: "1001", character: "Squid Zero", raid: "hyjal", status: "declined" });
  await del(A.token, "character=Scott%20Frost&sub=1002&raid=barrow");
  ok(!!(await get("Scott Frost")), "a player cannot use ?sub= to take someone else out of a raid");
  ok((await del(O.token, "character=Squid%20Zero&sub=1001&raid=hyjal")).status === 200, "officer removes Hyjal only");
  let z = await get("Squid Zero");
  ok(z && z.raid === "barrow" && z.statuses.barrow === "approved" && z.statuses.hyjal === undefined, "Barrow stays, with its own approval", JSON.stringify(z));
  ok((await del(O.token, "character=Squid%20Zero&sub=1001&raid=hyjal")).status === 400, "cannot remove a raid the sign-up is not in");
  ok((await del(O.token, "character=Squid%20Zero&sub=1001&raid=barrow")).status === 200 && !(await get("Squid Zero")), "removing the last raid removes the sign-up");
  await put(A.token, { ...good, raid: "both" });
  await st({ sub: "1001", character: "Squid Zero", raid: "hyjal", status: "approved" });
  ok((await del(O.token, "character=Squid%20Zero&sub=1001&raid=barrow")).status === 200, "officer removes Barrow only");
  z = await get("Squid Zero");
  ok(z.raid === "hyjal" && z.statuses.hyjal === "approved" && z.statuses.barrow === undefined, "Hyjal stays, with its own approval", JSON.stringify(z));
  ok((await del(A.token, "character=Squid%20Zero")).status === 200 && !(await get("Squid Zero")), "no raid given (Withdraw) removes the whole sign-up");
  await put(A.token, { ...good, raid: "both" });
}

console.log("roster slots");
{
  const del = (token, q) => fetchW(req("/api/signup?" + q, { method: "DELETE", token }));
  const slot = (token, body) => fetchW(req("/api/signup/slot", { method: "POST", token, body }));
  const st = (body) => fetchW(req("/api/signup/status", { method: "POST", token: O.token, body }));
  const get = async (name) => (await (await fetchW(req("/api/signups", { token: O.token }))).json()).signups.find((s) => s.character === name);
  const pub = async () => (await fetchW(req("/api/roster"))).json();
  const SQ = { sub: "1001", character: "Squid Zero" }, NEO = { sub: "1001", character: "Neo Squid" }, SF = { sub: "1002", character: "Scott Frost" };
  await put(A.token, { ...good, raid: "both" });
  await put(A.token, { ...good, character: "Neo Squid", raid: "barrow", roles: ["DPS"] });
  await put(B.token, { ...good, character: "Scott Frost", raid: "barrow", roles: ["Tank"] });

  ok((await slot(A.token, { ...SQ, raid: "barrow", slot: "heal" })).status === 403, "non-officer cannot place players");
  ok((await slot(O.token, { ...SQ, raid: "barrow", slot: "king" })).status === 400, "unknown slot rejected");
  ok((await slot(O.token, { ...SF, raid: "hyjal", slot: "main" })).status === 400, "cannot place someone in a raid they did not ask for");
  ok((await slot(O.token, { sub: "999", character: "Ghost", raid: "barrow", slot: "dps" })).status === 404, "unknown sign-up -> 404");
  ok((await pub()).raids.barrow.length === 0, "nothing public until someone is placed");

  ok((await slot(O.token, { ...SQ, raid: "barrow", slot: "heal" })).status === 200, "officer places Squid Zero as Healer in Barrow");
  let z = await get("Squid Zero");
  ok(z.statuses.barrow === "approved" && z.slots.barrow === "heal" && z.statuses.hyjal === "pending" && !z.slots.hyjal, "placing also approves that raid, and only that raid", JSON.stringify(z));
  let r = await pub();
  ok(r.raids.barrow.length === 1 && r.raids.barrow[0].character === "Squid Zero" && r.raids.barrow[0].slot === "heal" && r.raids.hyjal.length === 0, "public roster shows the placement", JSON.stringify(r.raids));
  ok(JSON.stringify(r).indexOf("battletag") < 0 && JSON.stringify(r).indexOf("1001") < 0 && JSON.stringify(r).indexOf("Resto") < 0, "public roster leaks no BattleTag, account id or note");
  ok((await fetchW(req("/api/roster"))).headers.get("Access-Control-Allow-Origin") === SITE, "public roster can be read from the website");
  ok((await fetchW(req("/api/roster", { origin: "https://evil.example" }))).headers.get("Access-Control-Allow-Origin") === null, "…but not from other sites");

  ok((await slot(O.token, { ...NEO, raid: "barrow", slot: "main" })).status === 200, "Neo Squid takes Main Tank");
  ok((await slot(O.token, { ...SF, raid: "barrow", slot: "main" })).status === 409, "Main Tank is full -> 409");
  ok((await slot(O.token, { ...NEO, raid: "barrow", slot: "bak-dps" })).status === 200, "move Neo Squid to Backup (DPS)");
  ok((await slot(O.token, { ...SQ, raid: "barrow", slot: "bak-heal" })).status === 200, "Squid Zero as a Backup Healer");
  ok((await slot(O.token, { ...SF, raid: "barrow", slot: "bak-tank" })).status === 409, "backups are one shared pool (2 in Barrow) -> third is refused");
  ok((await slot(O.token, { ...SF, raid: "barrow", slot: "main" })).status === 200, "Main Tank is free again after the move");
  r = await pub();
  const by = Object.fromEntries(r.raids.barrow.map((x) => [x.character, x.slot]));
  ok(by["Scott Frost"] === "main" && by["Neo Squid"] === "bak-dps" && by["Squid Zero"] === "bak-heal", "backup slots carry the role they cover", JSON.stringify(by));

  ok((await st({ ...SQ, raid: "barrow", status: "declined" })).status === 200, "decline Squid Zero in Barrow");
  ok(!(await pub()).raids.barrow.some((x) => x.character === "Squid Zero"), "declined players leave the public roster");
  await st({ ...SQ, raid: "barrow", status: "approved" });
  ok(!(await pub()).raids.barrow.some((x) => x.character === "Squid Zero") && (await get("Squid Zero")).statuses.barrow === "approved", "re-approving does not silently restore the old slot");

  await slot(O.token, { ...SQ, raid: "barrow", slot: "dps" });
  await slot(O.token, { ...SQ, raid: "hyjal", slot: "heal" });
  ok((await slot(O.token, { ...SQ, raid: "barrow", slot: "" })).status === 200 && !(await get("Squid Zero")).slots.barrow && (await get("Squid Zero")).statuses.barrow === "approved", "clearing a slot keeps the approval");
  await slot(O.token, { ...SQ, raid: "barrow", slot: "dps" });
  ok((await del(O.token, "character=Squid%20Zero&sub=1001&raid=barrow")).status === 200, "remove Barrow from a placed both-raids sign-up");
  z = await get("Squid Zero");
  ok(z.raid === "hyjal" && z.slots.hyjal === "heal" && z.statuses.hyjal === "approved", "Hyjal keeps its approval and slot", JSON.stringify(z));
  await put(A.token, { ...good, raid: "hyjal" });
  ok(Object.keys((await get("Squid Zero")).slots).length === 0 && (await pub()).raids.hyjal.length === 0, "editing a sign-up clears its roster slots (back to pending)");

  await del(O.token, "character=Neo%20Squid&sub=1001");
  await put(A.token, { ...good, raid: "both" });
  await put(B.token, { ...good, character: "Scott Frost" });
}

console.log("withdraw + limits");
{
  const del = (token, q) => fetchW(req("/api/signup?" + q, { method: "DELETE", token }));
  await del(B.token, "character=Scott%20Frost");
  let L = await (await fetchW(req("/api/signups", { token: A.token }))).json();
  ok(!L.signups.some((s) => s.character === "Scott Frost"), "player can withdraw their own sign-up");
  await del(A.token, "character=Squid%20Zero&sub=1002"); // trying to hit someone else's with ?sub= must not work for non-officers
  await put(B.token, { ...good, character: "Scott Frost" });
  await del(A.token, "character=Scott%20Frost&sub=1002");
  L = await (await fetchW(req("/api/signups", { token: A.token }))).json();
  ok(L.signups.some((s) => s.character === "Scott Frost"), "a player cannot withdraw someone else's sign-up");
  await del(O.token, "character=Scott%20Frost&sub=1002");
  L = await (await fetchW(req("/api/signups", { token: A.token }))).json();
  ok(!L.signups.some((s) => s.character === "Scott Frost"), "an officer can remove any sign-up");
  const many = { sub: "3000", battletag: "Many#1", chars: Array.from({ length: 8 }, (_, i) => ({ name: "Alt" + i, id: 50 + i, level: 20 })) };
  accounts.codeM = many; const M = await signIn("codeM");
  let last; for (let i = 0; i < 8; i++) last = await put(M.token, { ...good, character: "Alt" + i });
  ok(last.status === 400, "capped at 6 sign-ups per account");
}

console.log("CORS + misc");
{
  const pre = await fetchW(req("/api/signups", { method: "OPTIONS" }));
  ok(pre.status === 204 && pre.headers.get("Access-Control-Allow-Origin") === SITE, "preflight allowed from the site");
  const alt = await fetchW(req("/api/signups", { method: "OPTIONS", origin: "https://dirtysocks.net" }));
  ok(alt.headers.get("Access-Control-Allow-Origin") === "https://dirtysocks.net", "bare domain allowed too");
  const evil = await fetchW(req("/api/me", { token: A.token, origin: "https://evil.example" }));
  ok(!evil.headers.get("Access-Control-Allow-Origin"), "other sites get no CORS header");
  ok((await fetchW(req("/nope"))).status === 404, "unknown path -> 404");
}

console.log("discord sign-up alerts");
{
  const posts = [], pending = [], ctx = { waitUntil: (p) => pending.push(p) };
  let discordDown = false;
  const baseFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const u = new URL(typeof input === "string" ? input : input.url ?? String(input));
    if (u.hostname === "discord.com" || u.hostname === "evil.example") { if (discordDown) throw new Error("discord is down"); posts.push({ url: String(u), body: JSON.parse(init.body) }); return new Response(null, { status: 204 }); }
    return baseFetch(input, init);
  };
  const HOOK = "https://discord.com/api/webhooks/123456789012345678/abc-DEF_ghi123";
  const mk = (extra) => { const e = makeEnv({ OFFICER_SUBS: "2000", ...extra }); return (r) => worker.fetch(r, e, ctx); };
  const flush = async () => { await Promise.all(pending.splice(0)); };
  const login = async (fw, code) => {
    const l = await fw(req("/auth/login")), state = new URL(l.headers.get("Location")).searchParams.get("state");
    const cb = await fw(req(`/auth/callback?code=${code}&state=${encodeURIComponent(state)}`, { origin: null }));
    return ((cb.headers.get("Location") || "").match(/#session=(.+)$/) || [])[1];
  };
  const body = (extra = {}) => ({ character: "Squid Zero", raid: "both", roles: ["Healer"], nights: ["wednesday", "thursday"], note: "", ...extra });

  // no secret -> silent
  const none = mk({});
  const tN = await login(none, "codeA");
  ok((await none(req("/api/signup", { method: "PUT", token: tN, body: body() }))).status === 200, "sign-up works with no Discord secret");
  await flush(); ok(posts.length === 0, "no webhook configured: nothing is sent");

  // a webhook that isn't a Discord address is never called
  const bad = mk({ DISCORD_WEBHOOK_URL: "https://evil.example/api/webhooks/1/x" });
  const tBad = await login(bad, "codeA");
  await bad(req("/api/signup", { method: "PUT", token: tBad, body: body() })); await flush();
  ok(posts.length === 0, "a webhook address that is not Discord's is ignored");

  // configured
  const fw = mk({ DISCORD_WEBHOOK_URL: HOOK });
  const tA = await login(fw, "codeA"), tO = await login(fw, "codeO");
  const r1 = await fw(req("/api/signup", { method: "PUT", token: tA, body: body({ note: "@everyone [free nitro](https://evil.example) **bold** `x`" }) }));
  ok(r1.status === 200, "sign-up still succeeds");
  await flush();
  ok(posts.length === 1 && posts[0].url === HOOK, "new sign-up posts to the webhook", posts.length);
  const e = posts[0]?.body.embeds[0] || {};
  ok(e.title === "New raid sign-up" && e.description === "**Squid Zero** · Level 60 Druid", "title, character, level and class", e.description);
  const f = Object.fromEntries((e.fields || []).map((x) => [x.name, x.value]));
  ok(f.Raid === "Both raids" && f.Roles === "Healer" && f.Nights === "Wednesday, Thursday", "raid, roles and nights", f);
  ok(f.Note.includes("\\@everyone") && !/(^|[^\\])\]\(/.test(f.Note) && !/(^|[^\\])\*\*/.test(f.Note), "player text is escaped so it cannot form links, bold or mentions", f.Note);
  ok(Array.isArray(posts[0].body.allowed_mentions.parse) && posts[0].body.allowed_mentions.parse.length === 0, "mentions are switched off");
  ok(e.footer.text === "Verified with Battle.net" && e.url === SITE + "/signup", "verified footer and a link to the sign-up page");
  ok(!JSON.stringify(posts[0].body).includes("Squid#1234") && !JSON.stringify(posts[0].body).includes("1001"), "no BattleTag or account id is sent");

  await fw(req("/api/signup", { method: "PUT", token: tA, body: body({ roles: ["Healer", "DPS"] }) })); await flush();
  ok(posts.length === 1, "editing an existing sign-up is not announced");

  await fw(req("/api/signup?character=Squid%20Zero&raid=barrow", { method: "DELETE", token: tA })); await flush();
  const e2 = posts[1]?.body.embeds[0] || {}, f2 = Object.fromEntries((e2.fields || []).map((x) => [x.name, x.value]));
  ok(posts.length === 2 && e2.title === "Left one raid" && f2.Left === "The Barrow Deeps" && f2["Still signed up for"] === "Hyjal Summit", "leaving one raid says which and what remains", f2);

  await fw(req("/api/signup?character=Squid%20Zero", { method: "DELETE", token: tA })); await flush();
  ok(posts.length === 3 && posts[2].body.embeds[0].title === "Sign-up withdrawn", "withdrawing is announced");

  await fw(req("/api/signup", { method: "PUT", token: tA, body: body({ character: "Neo Squid", raid: "hyjal" }) })); await flush();
  ok(posts.length === 4 && posts[3].body.embeds[0].description.startsWith("**Neo Squid**"), "second character announced");
  const sub = (await (await fw(req("/api/signups", { token: tO }))).json()).signups.find((x) => x.character === "Neo Squid").sub;
  const rm = await fw(req(`/api/signup?character=Neo%20Squid&sub=${sub}`, { method: "DELETE", token: tO })); await flush();
  ok(rm.status === 200 && posts.length === 4, "an officer removing someone is not announced");

  // flood protection: 8 alerts per account per hour
  for (let i = 0; i < 6; i++) { await fw(req("/api/signup", { method: "PUT", token: tA, body: body({ character: "Neo Squid", raid: "hyjal" }) })); await fw(req("/api/signup?character=Neo%20Squid", { method: "DELETE", token: tA })); await flush(); }
  ok(posts.length === 8, "at most 8 alerts per account per hour", posts.length);

  // Discord being down never breaks the player's sign-up
  discordDown = true;
  const tB = await login(fw, "codeB");
  const rb = await fw(req("/api/signup", { method: "PUT", token: tB, body: body({ character: "Needmore Beers", raid: "barrow" }) })); await flush();
  ok(rb.status === 200 && (await (await fw(req("/api/signups", { token: tB }))).json()).signups.some((x) => x.character === "Needmore Beers"), "Discord down: the sign-up is still saved");
  const eb = posts.length; discordDown = false;
  ok(eb === 8, "nothing was sent while it was down");
  const unv = mk({ DISCORD_WEBHOOK_URL: HOOK }); const tU = await login(unv, "codeB");
  await unv(req("/api/signup", { method: "PUT", token: tU, body: body({ character: "Scott Frost", raid: "hyjal", roles: ["Tank"], nights: ["thursday"] }) })); await flush();
  const eu = posts[posts.length - 1].body.embeds[0];
  ok(posts.length === 9 && eu.footer.text.startsWith("Not verified") && eu.description === "**Scott Frost**", "unverified sign-up is flagged for the officers", eu);
  globalThis.fetch = baseFetch;
}

console.log("news + web admins");
{
  const posts = [], pending = [], ctx = { waitUntil: (p) => pending.push(p) };
  const baseFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const u = new URL(typeof input === "string" ? input : input.url ?? String(input));
    if (u.hostname === "discord.com") { posts.push({ url: String(u), body: JSON.parse(init.body) }); return new Response(null, { status: 204 }); }
    return baseFetch(input, init);
  };
  const SIGNUP_HOOK = "https://discord.com/api/webhooks/111111111111111111/signup-hook", NEWS_HOOK = "https://discord.com/api/webhooks/222222222222222222/news-hook";
  const e = makeEnv({ OFFICER_SUBS: "2000,4000", WEB_ADMIN_SUBS: "3000,4000", DISCORD_WEBHOOK_URL: SIGNUP_HOOK, DISCORD_NEWS_WEBHOOK_URL: NEWS_HOOK });
  const fw = (r) => worker.fetch(r, e, ctx), flush = async () => { await Promise.all(pending.splice(0)); };
  const login = async (code) => {
    const l = await fw(req("/auth/login")), state = new URL(l.headers.get("Location")).searchParams.get("state");
    const cb = await fw(req(`/auth/callback?code=${code}&state=${encodeURIComponent(state)}`, { origin: null }));
    return ((cb.headers.get("Location") || "").match(/#session=(.+)$/) || [])[1];
  };
  const [tP, tO, tW, tX] = [await login("codeA"), await login("codeO"), await login("codeW"), await login("codeX")];
  const post = async (t, b) => { await new Promise((r) => setTimeout(r, 4)); return fw(req("/api/news", { method: "POST", token: t, body: b })); };   // a few ms apart so "newest first" is unambiguous
  const feed = async () => (await (await fw(req("/api/news", { origin: SITE }))).json()).news;

  ok((await fw(req("/api/news", { origin: null }))).status === 200 && (await feed()).length === 0, "the news feed is public and starts empty");
  ok((await post(null, { title: "x" })).status === 401, "posting without signing in -> 401");
  ok((await post(tP, { title: "Hi" })).status === 403, "a normal player cannot post");
  ok((await post(tO, { title: "Hi" })).status === 403, "an officer who is not a Web Admin cannot post");
  ok((await feed()).length === 0 && posts.length === 0, "refused posts leave nothing behind and send nothing");

  const r1 = await post(tW, { title: "  Raid night <b>moved</b>  ", body: "Line one\r\nLine two   spaced\n\n\n\nLine three", pinned: false });
  const j1 = await r1.json();
  ok(r1.status === 200 && j1.ok && j1.post.title === "Raid night bmoved/b" && j1.post.body === "Line one\nLine two spaced\n\nLine three", "a Web Admin can post; text is cleaned, line breaks kept, tags removed", j1);
  ok((await post(tW, { title: "   ", body: "x" })).status === 400, "a post needs a title");
  const long = await (await post(tW, { title: "T".repeat(300), body: "b".repeat(5000) })).json();
  ok(long.post.title.length === 120 && long.post.body.length === 2000, "title and body are length-limited");
  await post(tX, { title: "Pinned one", body: "stays on top", pinned: true });
  const order = (await feed()).map((p) => p.title);
  ok(order[0] === "Pinned one" && order.length === 3 && order[1].startsWith("TTT"), "pinned posts come first, then newest", order);
  const raw = JSON.stringify(await feed());
  ok(!/"by"|3000|4000|WebAdmin|Both#|admin/i.test(raw), "the public feed never shows who posted or any admin information", raw.slice(0, 200));

  const meW = await (await fw(req("/api/me", { token: tW }))).json(), meO = await (await fw(req("/api/me", { token: tO }))).json(), meP = await (await fw(req("/api/me", { token: tP }))).json(), meX = await (await fw(req("/api/me", { token: tX }))).json();
  ok(meW.webAdmin === true && meW.officer === false, "a Web Admin sees the post form (webAdmin flag only for themselves)");
  ok(!("webAdmin" in meO) && !("webAdmin" in meP) && !JSON.stringify(meO).includes("webAdmin"), "officers and players get no webAdmin flag at all");
  ok(meX.webAdmin === true && meX.officer === true, "someone can be an officer and a Web Admin at once");
  ok((await fw(req(`/api/signup/status`, { method: "POST", token: tW, body: { sub: "1", character: "x", status: "approved" } }))).status === 403, "being a Web Admin does not make you an officer");

  const id = j1.post.id;
  ok((await fw(req(`/api/news?id=${id}`, { method: "PUT", token: tP, body: { title: "Hacked" } }))).status === 403 && (await fw(req(`/api/news?id=${id}`, { method: "DELETE", token: tO }))).status === 403, "players and officers cannot edit or delete");
  const ed = await (await fw(req(`/api/news?id=${id}`, { method: "PUT", token: tW, body: { title: "Raid night moved", body: "Thursday instead", pinned: true } }))).json();
  ok(ed.ok && ed.post.title === "Raid night moved" && ed.post.pinned === true && ed.post.edited > 0 && ed.post.at === j1.post.at, "a Web Admin can edit (keeps the original date)", ed);
  ok((await fw(req(`/api/news?id=nope1234`, { method: "PUT", token: tW, body: { title: "x" } }))).status === 404 && (await fw(req(`/api/news?id=!!`, { method: "DELETE", token: tW }))).status === 400, "unknown or malformed ids are refused");

  await flush();
  const newsPosts = posts.filter((p) => p.url === NEWS_HOOK);
  ok(newsPosts.length === 3 && posts.every((p) => p.url === NEWS_HOOK), "each NEW post went to the news webhook (edits did not), and nothing went to the sign-up one", posts.map((p) => p.url));
  const em = newsPosts[0].body.embeds[0];
  ok(em.title === "Raid night bmoved/b" && em.description === "Line one\nLine two spaced\n\nLine three" && em.url === SITE + "/#news" && newsPosts[0].body.allowed_mentions.parse.length === 0, "Discord message: title, body with line breaks, link to the news section, no pings", em);
  ok(!JSON.stringify(newsPosts).match(/3000|4000|WebAdmin|Both#|admin/i), "no author or admin information goes to Discord either");
  const sneaky = await (await post(tW, { title: "Hello @everyone", body: "**bold** [click](https://evil.example)" })).json(); await flush();
  const sd = posts[posts.length - 1].body.embeds[0];
  ok(sneaky.ok && sd.title.includes("\\@everyone") && !/(^|[^\\])\*\*/.test(sd.description) && !/(^|[^\\])\]\(/.test(sd.description), "Discord formatting and links in a post are escaped", sd);

  const del = await fw(req(`/api/news?id=${id}`, { method: "DELETE", token: tW })); await flush();
  ok(del.status === 200, "a Web Admin can delete");
  ok(!(await feed()).some((p) => p.id === id), "the deleted post is gone from the feed");

  // flood guard: 10 Discord messages an hour per admin, but every post is still saved
  const before = (await feed()).length, sentBefore = posts.length;
  for (let i = 0; i < 14; i++) await post(tX, { title: "Bulk " + i, body: "" });
  await flush();
  ok((await feed()).length === Math.min(before + 14, 30) && posts.length - sentBefore <= 10, "at most 10 Discord messages an hour per admin; posts are still saved", [posts.length - sentBefore]);

  // no news webhook configured -> posting still works, nothing is sent
  const e2 = makeEnv({ WEB_ADMIN_SUBS: "3000" }), fw2 = (r) => worker.fetch(r, e2, ctx);
  const l2 = await fw2(req("/auth/login")), st2 = new URL(l2.headers.get("Location")).searchParams.get("state");
  const cb2 = await fw2(req(`/auth/callback?code=codeW&state=${encodeURIComponent(st2)}`, { origin: null })), t2 = (cb2.headers.get("Location").match(/#session=(.+)$/) || [])[1];
  const n0 = posts.length;
  ok((await fw2(req("/api/news", { method: "POST", token: t2, body: { title: "Quiet" } }))).status === 200, "posting works with no Discord webhook"); await flush();
  ok(posts.length === n0, "and nothing is sent");
  globalThis.fetch = baseFetch;
}
bz.restore();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
