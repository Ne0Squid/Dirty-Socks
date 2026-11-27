// Temporary: prints what Blizzard returns for a few character endpoints (PvP, reputation) so the parsers can be written to match.
const { BLIZZARD_CLIENT_ID: id, BLIZZARD_CLIENT_SECRET: secret } = process.env;
const API = "https://us.api.blizzard.com", NS = "profile-forever-us";
const t = await (await fetch("https://oauth.battle.net/token", { method: "POST", headers: { Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" })).json();
const get = async (p) => {
  const r = await fetch(`${API}${p}?locale=en_US`, { headers: { Authorization: `Bearer ${t.access_token}`, "Battlenet-Namespace": NS } });
  let body = null; try { body = await r.json(); } catch {}
  return { status: r.status, body };
};
const show = (label, v, n = 2600) => console.log(`\n=== ${label}\n` + (typeof v === "string" ? v : JSON.stringify(v, null, 1).slice(0, n)));
for (const slug of ["capo-shoots", "canigeta-summon", "scott-frost"]) {
  const base = `/profile/wow/character/${slug}`;
  for (const ep of ["", "/pvp-summary", "/reputations", "/honor", "/pvp-bracket/2v2"]) {
    const r = await get(base + ep);
    show(`${slug}${ep} -> ${r.status}`, r.body ?? "(no body)", ep === "" ? 900 : 3000);
  }
  const st = await get(base + "/achievements/statistics");
  if (st.body) {
    const out = [];
    const walk = (c, path) => {
      const here = [...path, c.name];
      const hit = /pvp|honou?r|battleground|arena|warsong|arathi|alterac|rank|reputation/i.test(here.join("/"));
      if (hit) for (const s of c.statistics ?? []) out.push(`${here.join(" > ")} :: ${s.name} = ${s.quantity}`);
      for (const sub of c.sub_categories ?? []) walk(sub, here);
    };
    for (const c of st.body.categories ?? []) walk(c, []);
    show(`${slug} statistics (pvp/honor/rep related) -> ${st.status}`, out.join("\n") || "(none)", 3500);
    show(`${slug} statistics top-level categories`, (st.body.categories ?? []).map((c) => `${c.name} [${(c.sub_categories ?? []).map((s) => s.name).join(", ")}]`).join("\n"), 1500);
  } else show(`${slug} statistics -> ${st.status}`, "(no body)");
}
