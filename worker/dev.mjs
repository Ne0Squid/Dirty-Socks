// Local dev server: runs the Worker on http://localhost:8787 with a pretend Battle.net and in-memory storage.
//   node worker/dev.mjs            then open  http://localhost:8123/signup?api=http://localhost:8787
// (serve the site on 8123 first, e.g. python3 -m http.server 8123). Pretend accounts: codeA, codeB (no profile), codeO (officer), codeW (can post news).
import http from "node:http";
import worker from "./src/index.js";
import { makeEnv, mockBlizzard } from "./mock-env.mjs";

const PORT = 8787, SITE = process.env.SITE || "http://localhost:8123";
mockBlizzard({
  codeA: { sub: "1001", battletag: "Squid#1234", chars: [
    { name: "Squid", surname: "Zero", id: 1, level: 60, playable_class: { name: "Druid" }, faction: { name: "Horde" } },
    { name: "Fresh", surname: "Recruit", id: 2, level: 12, playable_class: { name: "Rogue" }, faction: { name: "Horde" } }] },
  codeB: { sub: "1002", battletag: "NoProfile#9999", chars: null },
  codeO: { sub: "2000", battletag: "Officer#0001", chars: [{ name: "Scott", surname: "Frost", id: 3, level: 58, playable_class: { name: "Paladin" } }] },
  codeW: { sub: "3000", battletag: "WebAdmin#0003", chars: [{ name: "Squid", surname: "Zero", id: 1, level: 60, playable_class: { name: "Druid" } }] },   // can post news
});
const env = makeEnv({ SITE_ORIGIN: SITE, OFFICER_SUBS: "2000", WEB_ADMIN_SUBS: "3000", OAUTH_AUTHORIZE_URL: `http://localhost:${PORT}/mock-oauth/authorize` });
// A stand-in for the Battle.net login screen: it "signs in" as whichever pretend account was chosen last
// (open /mock-oauth/as?code=codeB first to switch; use code=cancel to pretend the player pressed Cancel).
let as = "codeA";
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/mock-oauth/as") { as = u.searchParams.get("code") || "codeA"; res.writeHead(200); return res.end("now signing in as " + as); }
  if (u.pathname === "/mock-oauth/authorize") {
    const q = u.searchParams, to = new URL(q.get("redirect_uri"));
    if (as === "cancel") to.searchParams.set("error", "access_denied"); else to.searchParams.set("code", as);
    to.searchParams.set("state", q.get("state"));
    res.writeHead(302, { Location: to.href }); return res.end();
  }
  const chunks = []; for await (const c of req) chunks.push(c);
  const r = new Request("http://localhost:" + PORT + req.url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
  const out = await worker.fetch(r, env);
  res.writeHead(out.status, Object.fromEntries(out.headers));
  res.end(Buffer.from(await out.arrayBuffer()));
}).listen(PORT, () => console.log("dev worker on :" + PORT));
