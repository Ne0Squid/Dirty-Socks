// Test/dev helpers: an in-memory stand-in for the Durable Object and a pretend Battle.net.
import { Store } from "./src/index.js";

export function makeEnv(extra = {}) {
  const map = new Map();
  const storage = {
    get: async (k) => map.get(k), put: async (k, v) => void map.set(k, v), delete: async (k) => void map.delete(k),
    list: async ({ prefix }) => new Map([...map].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b))),
  };
  const store = new Store({ storage });
  return {
    BLIZZARD_CLIENT_ID: "test-client", BLIZZARD_CLIENT_SECRET: "test-secret", SESSION_SECRET: "x".repeat(40),
    SITE_ORIGIN: "https://www.dirtysocks.net", REGION: "us", PROFILE_NAMESPACE: "profile-forever-us", OFFICER_SUBS: "", ALLOWED_ORIGINS: "",
    STORE: { idFromName: () => "main", get: () => ({ fetch: (u, init) => store.fetch(new Request(u, init)) }) },
    ...extra,
  };
}

// accounts: { code: { sub, battletag, chars: [...] | null } }  (chars null => the profile endpoint answers 404)
export function mockBlizzard(accounts, { roster = [] } = {}) {
  const real = globalThis.fetch, tokens = new Map(), log = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url ?? String(input));
    const auth = (init.headers && (init.headers.Authorization || init.headers.authorization)) || "";
    if (url.hostname === "oauth.battle.net" && url.pathname === "/token") {
      const body = new URLSearchParams(init.body), acct = accounts[body.get("code")];
      log.push(["token", body.get("redirect_uri"), auth.startsWith("Basic ")]);
      if (!acct || body.get("grant_type") !== "authorization_code") return new Response("{}", { status: 400 });
      const t = "tok-" + body.get("code"); tokens.set(t, acct);
      return new Response(JSON.stringify({ access_token: t, token_type: "bearer" }), { status: 200 });
    }
    if (url.hostname === "oauth.battle.net" && url.pathname === "/userinfo") {
      const a = tokens.get(auth.replace("Bearer ", "")); if (!a) return new Response("{}", { status: 401 });
      return new Response(JSON.stringify({ sub: a.sub, id: a.sub, battletag: a.battletag }), { status: 200 });
    }
    if (url.hostname.endsWith(".api.blizzard.com") && url.pathname === "/profile/user/wow") {
      const a = tokens.get(auth.replace("Bearer ", ""));
      log.push(["profile", url.searchParams.get("namespace")]);
      if (!a || !a.chars) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ wow_accounts: [{ id: 1, characters: a.chars }] }), { status: 200 });
    }
    if (url.pathname === "/guild-data.json" && roster.length) return new Response(JSON.stringify({ roster }), { status: 200 });
    return real(input, init);
  };
  return { log, restore: () => (globalThis.fetch = real) };
}
