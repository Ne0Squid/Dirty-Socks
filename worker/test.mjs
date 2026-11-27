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
  const long = await (await post(tW, { title: "T".repeat(300), body: "b".repeat(9000) })).json();
  ok(long.post.title.length === 120 && long.post.body.length === 8000, "title and body are length-limited");
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
  ok(em.title === "Raid night bmoved/b" && em.description === "Line one\nLine two spaced\n\nLine three" && em.url === SITE + "/news/raid-night-bmoved-b" && newsPosts[0].body.allowed_mentions.parse.length === 0, "Discord message: title, body with line breaks, link to the post's own page, no pings", em);
  ok(!JSON.stringify(newsPosts).match(/3000|4000|WebAdmin|Both#|admin/i), "no author or admin information goes to Discord either");
  const sneaky = await (await post(tW, { title: "Hello @everyone", body: "**bold** [ok](https://good.example) [bad](javascript:alert(1)) [odd](ftp://x.example) @everyone" })).json(); await flush();
  const sd = posts[posts.length - 1].body.embeds[0], sb = posts[posts.length - 1].body;
  ok(sneaky.ok && sd.title.includes("\\@everyone") && sd.description.includes("**bold**") && sd.description.includes("[ok](https://good.example)") && !/javascript|ftp:/.test(sd.description) && sb.allowed_mentions.parse.length === 0,
    "Discord keeps bold and https links, drops other link targets, and never pings anyone", sd);

  const del = await fw(req(`/api/news?id=${id}`, { method: "DELETE", token: tW })); await flush();
  ok(del.status === 200, "a Web Admin can delete");
  ok(!(await feed()).some((p) => p.id === id), "the deleted post is gone from the feed");

  // flood guard: 10 Discord messages an hour per admin, but every post is still saved
  const before = (await feed()).length, sentBefore = posts.length;
  for (let i = 0; i < 14; i++) await post(tX, { title: "Bulk " + i, body: "" });
  await flush();
  ok((await feed()).length === Math.min(before + 14, 30) && posts.length - sentBefore <= 10, "at most 10 Discord messages an hour per admin; posts are still saved", [posts.length - sentBefore]);

  // ---- formatting, pictures ----------------------------------------------------------------------
  const bin = (type, bytes) => new Uint8Array(bytes);
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array.from({ length: 40 }, (_, i) => i)];
  const JPG = [0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: 40 }, (_, i) => i)];
  const WEBP = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, ...Array.from({ length: 30 }, (_, i) => i)];
  const GIF = [...Buffer.from("GIF89a"), ...Array.from({ length: 30 }, (_, i) => i)];
  const up = (t, type, bytes, h = {}) => fw(new Request(API + "/api/news/image", { method: "POST", headers: { ...(t ? { Authorization: "Bearer " + t } : {}), Origin: SITE, "Content-Type": type, ...h }, body: bytes }));
  const img = (id) => fw(new Request(API + "/api/news/img/" + id, { headers: { Origin: null } }));

  ok((await up(null, "image/png", bin("", PNG))).status === 401 && (await up(tP, "image/png", bin("", PNG))).status === 403 && (await up(tO, "image/png", bin("", PNG))).status === 403, "only Web Admins can upload pictures");
  const u1 = await up(tW, "image/png", bin("", PNG)), uj1 = await u1.json();
  ok(u1.status === 200 && uj1.ok && /^[a-z0-9]{6,40}$/.test(uj1.id) && uj1.url === "/api/news/img/" + uj1.id, "a Web Admin can upload a PNG", uj1);
  for (const [t, b] of [["image/jpeg", JPG], ["image/webp", WEBP], ["image/gif", GIF]]) ok((await up(tW, t, bin("", b))).status === 200, "upload accepted: " + t);
  const g1 = await img(uj1.id);
  ok(g1.status === 200 && g1.headers.get("Content-Type") === "image/png" && /immutable/.test(g1.headers.get("Cache-Control")) && g1.headers.get("X-Content-Type-Options") === "nosniff" && /sandbox/.test(g1.headers.get("Content-Security-Policy")), "pictures are public, cached for a year, and served with locked-down headers");
  ok(Buffer.compare(Buffer.from(await g1.arrayBuffer()), Buffer.from(PNG)) === 0, "the bytes come back exactly as uploaded");
  ok((await img("nothere1234")).status === 404 && (await img("..%2Fsecret")).status === 404 && (await fw(req("/api/news/img/" + uj1.id + "/x"))).status !== 200, "unknown or malformed picture ids are 404");
  ok((await up(tW, "text/html", Buffer.from("<script>x</script>"))).status === 400 && (await up(tW, "image/svg+xml", Buffer.from("<svg onload=alert(1)/>"))).status === 400, "HTML and SVG are refused");
  ok((await up(tW, "image/png", Buffer.from("<script>alert(1)</script>"))).status === 400 && (await up(tW, "image/png", bin("", JPG))).status === 400, "a file that only claims to be a picture is refused (checked by its bytes)");
  ok((await up(tW, "image/png", new Uint8Array(0))).status === 400, "an empty upload is refused");
  const big = new Uint8Array(800_001); big.set(PNG);
  ok((await up(tW, "image/png", big)).status === 413 && (await up(tW, "image/png", bin("", PNG), { "Content-Length": "900000" })).status === 413, "pictures over 800 KB are refused");

  // a post that uses the picture
  const withImg = await (await post(tW, { title: "With picture", body: `# Big news\n**Bold** and *italic*\n\n![The raid](img:${uj1.id})\n\n- one\n- two` })).json();
  ok(withImg.ok && withImg.post.md === true && withImg.post.body.includes(`img:${uj1.id}`), "a post can use an uploaded picture and keeps its formatting (> and # survive)", withImg);
  const quoted = await (await post(tW, { title: "Quote", body: "> wise words\n\na < b" })).json();
  ok(quoted.post.body === "> wise words\n\na b", "quotes keep their > marker but < is still stripped", quoted.post.body);
  await flush();
  const wd = posts[posts.length - 2].body.embeds[0];
  ok(wd.description === "# Big news\n**Bold** and *italic*\n\n- one\n- two" && wd.image.url === `https://login.test/api/news/img/${uj1.id}`, "Discord gets the formatted text, with the first picture as the embed image and no stray picture markup", wd);
  ok((await post(tW, { title: "Ghost", body: "![x](img:doesnotexist1)" })).status === 400, "a post cannot point at a picture that does not exist");
  ok((await post(tW, { title: "Steal", body: `![x](img:${uj1.id})` })).status === 400, "a picture already used by one post cannot be reused by another");
  const many = []; for (let i = 0; i < 13; i++) many.push(`![](img:aaaa${String(i).padStart(4, "0")})`);
  ok((await post(tW, { title: "Too many", body: many.join("\n") })).status === 400, "at most 12 pictures per post");

  // removing a picture from the text, or deleting the post, deletes the picture
  const u2 = await (await up(tW, "image/jpeg", bin("", JPG))).json(), u3 = await (await up(tW, "image/webp", bin("", WEBP))).json();
  const p2 = await (await post(tW, { title: "Two pics", body: `![a](img:${u2.id})\n![b](img:${u3.id})` })).json();
  ok(p2.ok && (await img(u2.id)).status === 200 && (await img(u3.id)).status === 200, "both pictures are kept while the post uses them");
  const e2x = await fw(req(`/api/news?id=${p2.post.id}`, { method: "PUT", token: tW, body: { title: "Two pics", body: `![b](img:${u3.id})` } }));
  ok(e2x.status === 200 && (await img(u2.id)).status === 404 && (await img(u3.id)).status === 200, "editing a picture out of the text deletes it, the other stays");
  const e2y = await fw(req(`/api/news?id=${p2.post.id}`, { method: "PUT", token: tW, body: { title: "Two pics", body: `![b](img:${u3.id}) and another` } }));
  ok(e2y.status === 200, "an edit can keep the picture it already owns");
  await fw(req(`/api/news?id=${p2.post.id}`, { method: "DELETE", token: tW }));
  ok((await img(u3.id)).status === 404, "deleting the post deletes its pictures");

  // pictures that never made it into a post are cleared after a day
  const orphan = await (await up(tW, "image/png", bin("", PNG))).json();
  ok((await img(orphan.id)).status === 200, "an unattached picture is kept for now");
  const realNow = Date.now; Date.now = () => realNow() + 25 * 3600e3;
  const trigger = await up(tW, "image/gif", bin("", GIF)); Date.now = realNow;
  ok(trigger.status === 200 && (await img(orphan.id)).status === 404 && (await img(uj1.id)).status === 200, "unused pictures older than a day are swept away; ones in posts stay");

  // upload flood guard
  let last = 200;
  for (let i = 0; i < 45 && last === 200; i++) last = (await up(tX, "image/png", bin("", PNG))).status;
  ok(last === 429, "an admin can upload at most 40 pictures an hour", last);
  ok(!JSON.stringify(await feed()).match(/"by"|3000|4000|imgmeta|imgdata/), "the feed still carries no author or storage details");

  // ---- post pages (slugs), cover photo, focus point -----------------------------------------------
  {
    const e3 = makeEnv({ WEB_ADMIN_SUBS: "3000", DISCORD_NEWS_WEBHOOK_URL: NEWS_HOOK }), f3 = (r) => worker.fetch(r, e3, ctx);
    const l3 = await f3(req("/auth/login")), st3 = new URL(l3.headers.get("Location")).searchParams.get("state");
    const t3 = ((await f3(req(`/auth/callback?code=codeW&state=${encodeURIComponent(st3)}`, { origin: null }))).headers.get("Location").match(/#session=(.+)$/) || [])[1];
    const mk = async (title, body = "x", extra = {}) => { await new Promise((r) => setTimeout(r, 4)); return (await f3(req("/api/news", { method: "POST", token: t3, body: { title, body, ...extra } }))); };
    const feed3 = async (q = "") => (await (await f3(req("/api/news" + q, { origin: null }))).json()).news;
    const up3 = (type, bytes) => f3(new Request(API + "/api/news/image", { method: "POST", headers: { Authorization: "Bearer " + t3, "Content-Type": type }, body: bytes }));
    const img3 = (id) => f3(new Request(API + "/api/news/img/" + id));
    const slugOfTitle = async (title) => (await (await mk(title)).json()).post?.slug;
    const PNGb = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array.from({ length: 40 }, (_, i) => i)]);

    ok(await slugOfTitle("Team Liquid Cafe is HERE!") === "team-liquid-cafe-is-here", "the address is made from the title: lowercase words joined by hyphens");
    ok(await slugOfTitle("Café & Crème: Ready?") === "cafe-and-creme-ready", "accents are dropped and & becomes 'and'");
    ok(await slugOfTitle("Raid's  new__time") === "raids-new-time", "apostrophes vanish and runs of symbols become one hyphen");
    ok(await slugOfTitle("!!! \u{1F525}\u{1F525}") === "post", "a title with no letters still gets a usable address");
    const longSlug = await slugOfTitle("word ".repeat(40));
    ok(longSlug.length <= 60 && !longSlug.endsWith("-") && longSlug.startsWith("word-word"), "long titles give a short address with no dangling hyphen", longSlug);
    const dups = [await slugOfTitle("Wow"), await slugOfTitle("WOW"), await slugOfTitle("wow!")];
    ok(dups.join() === "wow,wow-2,wow-3", "two posts with the same title get -2, -3 so every address is unique", dups);

    const feed1 = await feed3();
    ok(feed1.every((p) => /^[a-z0-9-]+$/.test(p.slug)) && new Set(feed1.map((p) => p.slug)).size === feed1.length, "every post in the feed has a unique address-safe slug");
    const get = (seg, o = {}) => f3(req("/api/news/post/" + seg, { origin: null, ...o }));
    const one = await (await get("team-liquid-cafe-is-here")).json();
    ok(one.post && one.post.title === "Team Liquid Cafe is HERE!" && !JSON.stringify(one).match(/"by"|3000/), "a post can be fetched by its address, with no author information");
    ok((await (await get("Team%20Liquid%20Cafe%20Is%20HERE")).json()).post?.id === one.post.id && (await (await get("TEAM-LIQUID-CAFE-IS-HERE")).json()).post?.id === one.post.id, "typing the title with spaces or capitals finds the same post");
    ok((await get("nothing-here")).status === 404 && (await get("%E0%A4%A")).status === 404 && (await get("")).status === 404, "unknown or malformed addresses are 404");
    const ren = await f3(req(`/api/news?id=${one.post.id}`, { method: "PUT", token: t3, body: { title: "Totally different title", body: "x" } }));
    ok((await ren.json()).post.slug === "team-liquid-cafe-is-here" && (await get("totally-different-title")).status === 404, "editing the title keeps the old address, so shared links never break");
    ok((await feed3("?limit=2")).length === 2 && (await feed3("?limit=0")).length === 1 && (await feed3("?limit=abc")).length === feed1.length && (await feed3("?limit=999")).length === feed1.length, "the feed can be limited (the home page asks for just the latest few)");
    // a post saved before slugs existed still gets an address
    await e3.STORE.get().fetch("https://store/", { method: "POST", body: JSON.stringify({ op: "put", key: "news:legacy01", value: { id: "legacy01", title: "Old one", body: "plain", at: 1, pinned: false } }) });
    const legacy = (await feed3()).find((p) => p.id === "legacy01");
    ok(legacy && legacy.slug === "old-one-acy01" && (await (await get(legacy.slug)).json()).post?.id === "legacy01", "a post from before addresses existed gets a stable one automatically", legacy);

    // cover photo
    const c1 = await (await up3("image/png", PNGb)).json(), c2 = await (await up3("image/png", PNGb)).json(), c3 = await (await up3("image/png", PNGb)).json();
    const cv = await (await mk("Cover test", "Body text", { cover: c1.id, fx: 30, fy: 70 })).json();
    ok(cv.ok && cv.post.cover === c1.id && cv.post.fx === 30 && cv.post.fy === 70, "a post can have a cover photo and a focus point", cv);
    ok((await img3(c1.id)).status === 200, "the cover is served publicly");
    ok((await (await mk("Clamp", "x", { cover: c2.id, fx: 150, fy: -5 })).json()).post.fx === 100, "the focus point is kept between 0 and 100");
    const c2post = (await feed3()).find((p) => p.title === "Clamp");
    ok(c2post.fx === 100 && c2post.fy === 0, "…both ways", c2post);
    ok((await (await mk("NaN", "x", { cover: c3.id, fx: "abc" })).json()).post.fx === 50, "a junk focus value falls back to the middle");
    ok((await mk("Ghost cover", "x", { cover: "doesnotexist1" })).status === 400 && (await mk("Bad cover", "x", { cover: "no way!" })).status === 400, "a cover that does not exist or is malformed is refused");
    ok((await mk("Steal cover", "x", { cover: c1.id })).status === 400, "a cover already used by another post cannot be reused");
    const noCover = await (await mk("No cover", "x")).json();
    ok(!("cover" in noCover.post) && !("fx" in noCover.post), "a post without a cover carries no cover fields");
    // replacing / removing the cover cleans up
    const c4 = await (await up3("image/webp", new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 9, 9, 9]))).json();
    const rep1 = await f3(req(`/api/news?id=${cv.post.id}`, { method: "PUT", token: t3, body: { title: "Cover test", body: "Body text", cover: c4.id, fx: 10, fy: 20 } }));
    ok(rep1.status === 200 && (await img3(c1.id)).status === 404 && (await img3(c4.id)).status === 200, "replacing the cover deletes the old photo");
    const rep2 = await (await f3(req(`/api/news?id=${cv.post.id}`, { method: "PUT", token: t3, body: { title: "Cover test", body: `Text ![](img:${c4.id})`, cover: c4.id } }))).json();
    ok(rep2.ok && (await img3(c4.id)).status === 200, "the same photo can be both cover and a picture in the text");
    const rep3 = await (await f3(req(`/api/news?id=${cv.post.id}`, { method: "PUT", token: t3, body: { title: "Cover test", body: `Text ![](img:${c4.id})`, cover: "" } }))).json();
    ok(rep3.ok && !("cover" in rep3.post) && (await img3(c4.id)).status === 200, "removing only the cover keeps a photo that the text still uses");
    const rep4 = await (await f3(req(`/api/news?id=${cv.post.id}`, { method: "PUT", token: t3, body: { title: "Cover test", body: "Text only", cover: "" } }))).json();
    ok(rep4.ok && (await img3(c4.id)).status === 404, "…and removing it from the text too deletes it");
    const c5 = await (await up3("image/png", PNGb)).json(), withC5 = await (await mk("Delete me", "x", { cover: c5.id })).json();
    await f3(req(`/api/news?id=${withC5.post.id}`, { method: "DELETE", token: t3 }));
    ok((await img3(c5.id)).status === 404, "deleting a post deletes its cover");

    // Discord: the cover leads, the title links to the post's page, long posts are cut short (fresh service, so the hourly alert limit is not used up)
    await Promise.all(pending.splice(0)); posts.length = 0;
    const e4 = makeEnv({ WEB_ADMIN_SUBS: "3000", DISCORD_NEWS_WEBHOOK_URL: NEWS_HOOK }), f4 = (r) => worker.fetch(r, e4, ctx);
    const l4 = await f4(req("/auth/login")), st4 = new URL(l4.headers.get("Location")).searchParams.get("state");
    const t4 = ((await f4(req(`/auth/callback?code=codeW&state=${encodeURIComponent(st4)}`, { origin: null }))).headers.get("Location").match(/#session=(.+)$/) || [])[1];
    const up4 = (bytes) => f4(new Request(API + "/api/news/image", { method: "POST", headers: { Authorization: "Bearer " + t4, "Content-Type": "image/png" }, body: bytes }));
    const c6 = await (await up4(PNGb)).json(), c7 = await (await up4(PNGb)).json();
    const longBody = `![](img:${c7.id})\n` + Array.from({ length: 60 }, (_, i) => `Paragraph ${i} with some words in it.`).join("\n\n");
    const dp = await (await f4(req("/api/news", { method: "POST", token: t4, body: { title: "Discord cover", body: longBody, cover: c6.id } }))).json(); await Promise.all(pending.splice(0));
    const de = posts[posts.length - 1].body.embeds[0];
    ok(de.image.url === `https://login.test/api/news/img/${c6.id}` && de.url === `${SITE}/news/${dp.post.slug}`, "Discord: the cover photo is the embed picture and the title links to the post page", de);
    ok(de.description.length < 1700 && de.description.endsWith(`[Read the full post](${SITE}/news/${dp.post.slug})`), "Discord: a long post is cut short with a link to read the rest", de.description.slice(-120));
    ok(!JSON.stringify(posts).match(/3000|"by"/), "…and still shows no author");
  }

  // no news webhook configured -> posting still works, nothing is sent
  const e2 = makeEnv({ WEB_ADMIN_SUBS: "3000" }), fw2 = (r) => worker.fetch(r, e2, ctx);
  const l2 = await fw2(req("/auth/login")), st2 = new URL(l2.headers.get("Location")).searchParams.get("state");
  const cb2 = await fw2(req(`/auth/callback?code=codeW&state=${encodeURIComponent(st2)}`, { origin: null })), t2 = (cb2.headers.get("Location").match(/#session=(.+)$/) || [])[1];
  const n0 = posts.length;
  ok((await fw2(req("/api/news", { method: "POST", token: t2, body: { title: "Quiet" } }))).status === 200, "posting works with no Discord webhook"); await flush();
  ok(posts.length === n0, "and nothing is sent");
  globalThis.fetch = baseFetch;
}

console.log("BiS checklist (private ticks)");
{
  const eb = makeEnv({}), fb = (r) => worker.fetch(r, eb);
  const login = async (code) => { const l = await fb(req("/auth/login")), st = new URL(l.headers.get("Location")).searchParams.get("state"); return ((await fb(req(`/auth/callback?code=${code}&state=${encodeURIComponent(st)}`, { origin: null }))).headers.get("Location").match(/#session=(.+)$/) || [])[1]; };
  const ta = await login("codeA"), tb = await login("codeB");
  const put = (token, body, extra = {}) => fb(req("/api/bis", { method: "PUT", token, body, ...extra }));
  ok((await fb(req("/api/bis"))).status === 401 && (await fb(req("/api/bis", { method: "PUT", body: { spec: "x", have: [] } }))).status === 401, "signed-out visitors cannot read or save ticks");
  ok(JSON.stringify(await (await fb(req("/api/bis", { token: ta }))).json()) === '{"specs":{}}', "a new account starts with nothing ticked");
  const r1 = await put(ta, { spec: "resto-druid", have: ["i:Head", "e:Head", "a:Neck:Heart of the Fiend", "i:Head"] });
  ok(r1.status === 200 && (await r1.json()).have.length === 3, "saves ticks for a list (duplicates dropped)");
  await put(ta, { spec: "balance-druid", have: ["i:Back"] });
  const g1 = await (await fb(req("/api/bis", { token: ta }))).json();
  ok(JSON.stringify(g1.specs["resto-druid"]) === '["i:Head","e:Head","a:Neck:Heart of the Fiend"]' && g1.specs["balance-druid"].length === 1, "reads them back, one list per spec");
  ok(Object.keys((await (await fb(req("/api/bis", { token: tb }))).json()).specs).length === 0, "another account sees none of them (private)");
  await put(ta, { spec: "resto-druid", have: ["i:Chest"] });
  ok(JSON.stringify((await (await fb(req("/api/bis", { token: ta }))).json()).specs["resto-druid"]) === '["i:Chest"]', "a save replaces that list only");
  await put(ta, { spec: "resto-druid", have: [] });
  const g2 = (await (await fb(req("/api/bis", { token: ta }))).json()).specs;
  ok(!("resto-druid" in g2) && "balance-druid" in g2, "saving an empty list clears just that spec");
  ok((await put(ta, { spec: "Bad Spec!", have: [] })).status === 400 && (await put(ta, { spec: "../x", have: [] })).status === 400 && (await put(ta, { spec: "x" })).status === 400 && (await put(ta, { spec: "x", have: "no" })).status === 400, "odd spec names or shapes are refused");
  const weird = await (await put(ta, { spec: "fury-warrior", have: ["<b>x</b>", 5, null, {}, "  ", "i:" + "a".repeat(300), "ok\u0000key", ...Array.from({ length: 400 }, (_, i) => "k" + i)] })).json();
  ok(weird.have.length === 150 && weird.have.every((k) => typeof k === "string" && k.length <= 100 && !/[<>\u0000]/.test(k)), "keys are cleaned (no markup or control characters), shortened and capped at 150", weird.have.length);
  ok((await fb(req("/api/bis", { method: "PUT", token: ta, body: { spec: "x", have: ["y".repeat(50000)] } }))).status === 413, "an oversized save is refused");
  const manyEnv = makeEnv({}), fm = (r) => worker.fetch(r, manyEnv);
  const lm = await fm(req("/auth/login")), stm = new URL(lm.headers.get("Location")).searchParams.get("state"), tm = ((await fm(req(`/auth/callback?code=codeA&state=${encodeURIComponent(stm)}`, { origin: null }))).headers.get("Location").match(/#session=(.+)$/) || [])[1];
  let lastStatus = 0; for (let i = 0; i < 41; i++) lastStatus = (await fm(req("/api/bis", { method: "PUT", token: tm, body: { spec: "s" + i, have: ["i:Head"] } }))).status;
  ok(lastStatus === 400 && Object.keys((await (await fm(req("/api/bis", { token: tm }))).json()).specs).length === 40, "at most 40 lists per account");
  let limited = 0; for (let i = 0; i < 300; i++) if ((await fm(req("/api/bis", { method: "PUT", token: tm, body: { spec: "s1", have: ["i:Head"] } }))).status === 429) limited++;
  ok(limited > 0, "saves are limited per hour per account");
}
bz.restore();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
