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
  ok(L.signups.length === 2 && mine.mine === true && mine.verified === true && mine.status === "pending", "list shows both, mine flagged, verified, pending");
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
  ok((await st(A.token, { sub: sq.sub, character: "Squid Zero", status: "approved" })).status === 403, "non-officer cannot approve");
  ok((await st(O.token, { sub: sq.sub, character: "Squid Zero", status: "approved" })).status === 200, "officer can approve");
  ok((await st(O.token, { sub: sq.sub, character: "Squid Zero", status: "maybe" })).status === 400, "officer: bad status rejected");
  ok((await st(O.token, { sub: "999", character: "Ghost", status: "approved" })).status === 404, "officer: unknown sign-up -> 404");
  const after = await (await fetchW(req("/api/signups", { token: A.token }))).json();
  ok(after.signups.find((s) => s.character === "Squid Zero").status === "approved", "player sees the approval");
  await put(A.token, { ...good, roles: ["Healer", "DPS"] });
  const again = await (await fetchW(req("/api/signups", { token: A.token }))).json();
  ok(again.signups.find((s) => s.character === "Squid Zero").status === "pending", "editing an approved sign-up sends it back to pending");
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
bz.restore();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
