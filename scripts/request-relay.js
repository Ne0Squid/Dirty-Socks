// Draft relay for the Raid Roster "Request a Raid Spot" form (Cloudflare Worker).
// It checks the request and forwards it to the officers' Discord channel, so the webhook address stays secret.
// Set the secret DISCORD_WEBHOOK_URL in the Worker settings, then put the Worker's address in REQUEST_URL in raid-roster.html.
const ORIGIN = "https://ne0squid.github.io";
const cors = { "Access-Control-Allow-Origin": ORIGIN, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
const clip = (v, n) => String(v ?? "").replace(/[@`]/g, "").slice(0, n);

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST" || req.headers.get("Origin") !== ORIGIN) return new Response("Not allowed", { status: 403, headers: cors });
    let b;
    try { b = await req.json(); } catch { return new Response("Bad request", { status: 400, headers: cors }); }
    const nights = (Array.isArray(b.nights) ? b.nights : []).filter((n) => n === "Wednesday" || n === "Thursday");
    if (!b.character || !nights.length) return new Response("Missing fields", { status: 400, headers: cors });
    const text = `**Raid spot request**\nCharacter: ${clip(b.character, 60)}\nRaid: ${clip(b.raid, 40)}\nRole: ${clip(b.role, 10)}\nNights: ${nights.join(" & ")}` + (b.note ? `\nNote: ${clip(b.note, 300)}` : "");
    const r = await fetch(env.DISCORD_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: text, allowed_mentions: { parse: [] } }) });
    return new Response(r.ok ? "ok" : "Failed", { status: r.ok ? 200 : 502, headers: cors });
  },
};
