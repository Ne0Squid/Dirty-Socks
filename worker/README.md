# Battle.net login + raid sign-up

The site is static, so the login lives in a small free service on Cloudflare Workers (`worker/src/index.js`).
Players press **Sign in with Battle.net**, come back to `/signup` with their characters, and sign up for a raid.
Sign-ups are stored in the worker's own database (a Durable Object). Nothing sensitive is kept in this repo.

## One-time setup (about 15 minutes, all free)

1. **Cloudflare account.** Sign up at cloudflare.com. In the dashboard open *Workers & Pages* once so it asks you to pick a
   `workers.dev` name (this becomes part of the service address). Copy your **Account ID** (right-hand side of the Workers & Pages page).
2. **Cloudflare API token.** *My Profile -> API Tokens -> Create Token -> "Edit Cloudflare Workers" template.* Copy the token.
3. **GitHub secrets** (repo *Settings -> Secrets and variables -> Actions*). `BLIZZARD_CLIENT_ID` and `BLIZZARD_CLIENT_SECRET`
   already exist for the hourly roster job and are reused. Add three new ones:
   - `CLOUDFLARE_API_TOKEN` : the token from step 2
   - `CLOUDFLARE_ACCOUNT_ID` : the account id from step 1
   - `SESSION_SECRET` : any long random text (40+ characters). It signs login sessions. Keep it private.
4. **Deploy.** Pushing anything in `worker/` runs the *Deploy login worker* action (or open the failed/skipped run and press
   *Re-run all jobs*). The log ends with the service address: `https://dirty-socks-login.<your-name>.workers.dev`.
5. **Tell Battle.net about it.** At <https://develop.battle.net/access/clients> open your client and add this to *Redirect URLs*:
   `https://dirty-socks-login.<your-name>.workers.dev/auth/callback`
6. **Turn it on.** Put the service address into `auth-config.js` (`window.DS_API = "..."`). Until then `/signup` runs in demo mode.

## Officers
Signed-in players see an *account ID* next to their BattleTag. Put officers' ids in `OFFICER_SUBS` in `wrangler.toml`
(comma separated) and push. Officers get Approve / Decline / Remove buttons for each raid separately and can see BattleTags and notes.

## Discord sign-up alerts (optional)
With a Discord webhook the worker posts a short message to one channel when a player signs up for a raid. Nothing is sent until the secret exists.

1. In Discord: *channel settings -> Integrations -> Webhooks -> New Webhook*, name it, copy the **Webhook URL**. Use a channel only the officers can see:
   the message shows the character, class and level, raid, roles, nights and the player's note (never the BattleTag).
2. In GitHub (repo *Settings -> Secrets and variables -> Actions -> New repository secret*) add `DISCORD_WEBHOOK_URL` with that address. Keep it private: anyone with it can post to the channel.
3. *Actions -> Deploy login worker -> Run workflow.* It uploads the secret and posts one "connected" test message to the channel.

What gets announced: a brand-new sign-up, a player withdrawing, and a player leaving one raid of a Both-raids sign-up.
Not announced: edits to an existing sign-up, and officers approving, declining, placing or removing players.
Messages cannot ping anyone (mentions are switched off and player text is escaped), and each account can trigger at most 8 alerts an hour.
If Discord is down or the address is wrong the sign-up itself is unaffected. To stop the alerts, delete the secret and the webhook, then re-run the deploy.

## News on the home page (Web Admins)
The home page has a **News** section above Race to 60 (latest 3 posts, older ones behind a button; it hides itself while there are none).
Everyone can read it. Only **Web Admins** can post, edit or delete, from the form that appears on the home page when they are signed in.
Officers are a separate group: being an officer does not allow posting, and being a Web Admin does not give officer powers (someone can be both).

The Web Admin group is deliberately invisible. The people in it live in the `WEB_ADMIN_SUBS` **secret** (Blizzard account ids, comma separated, same ids
as `OFFICER_SUBS`), not in the repo. The site and the public feed never show a rank, a label, an author or who posted; the post form and Edit/Delete buttons
simply appear for those accounts.
- To add or remove a Web Admin: change the `WEB_ADMIN_SUBS` secret in GitHub (*Settings -> Secrets and variables -> Actions*), then *Actions -> Deploy login worker -> Run workflow*.
- Posts can be formatted and carry pictures (below). 120 characters for the title and 8000 for the message. Pinned posts stay on top.
- API: public `GET /api/news` and `GET /api/news/img/<id>`; Web Admins only: `POST /api/news`, `PUT /api/news?id=...`, `DELETE /api/news?id=...`, `POST /api/news/image`.

### Formatting and pictures
The post form has a toolbar (bold, italic, heading, bullet and numbered lists, quote, link, divider, picture) and a Write / Preview switch. Under the hood a post is a small,
safe Markdown: `**bold**`, `*italic*`, `~~strike~~`, `` `code` ``, `## heading`, `- list`, `1. list`, `> quote`, `---`, `[text](https://link)`, bare `https://` links and
`![caption](img:ID)`. `news-format.js` (in the site root) turns it into HTML and escapes everything else, so a post cannot run script or load anything from another site; the same
file renders the editor preview. `node scripts/test-news-format.mjs` checks it, including a fuzz run of hostile input. Posts written before formatting existed stay plain text.
- **Pictures:** the Picture button (or paste / drag into the box) shrinks the picture in the browser (longest side 1600px, WebP under about 780 KB; small ones and GIFs are kept as they are),
  uploads it, and adds a `![](img:ID)` line. Type a caption between the `[ ]`. The Worker accepts JPEG, PNG, WebP and GIF only, checks the real file bytes, caps a picture at 800 KB,
  a post at 12 pictures, the library at 120 pictures and an admin at 40 uploads an hour, and serves them publicly (cached for a year, no scripts possible). SVG is refused.
- **Cleanup:** taking a picture out of the text, or deleting the post, deletes the picture. A picture that never made it into a post is removed after a day.
- Unposted work is kept as a draft in that browser, so a refresh does not lose it.

### Discord alert for new posts (optional)
Same idea as the sign-up alerts, with its own channel: create a webhook in the channel that should get the announcements, add it as the GitHub secret
`DISCORD_NEWS_WEBHOOK_URL`, then run the deploy workflow (it posts one "connected" message). Each **new** post is sent as a message with the title and text (Discord shows the bold, lists, quotes and links) and a link
to the news section; the post's first picture is shown in the message. Edits and deletes are not sent. Nobody can be pinged (mentions are off), only http(s) links go across, nothing identifies the author,
and one admin can send at most 10 messages an hour (posts are still saved). It is separate from `DISCORD_WEBHOOK_URL`, so the two can go to different channels.

## Roster slots (the Raid Roster on Recruitment)
In the Raid line-up on /signup, officers get a slot picker on every row: Main Tank, Off Tank, Healer, DPS, or a
Backup tagged Tank / Healer / DPS (so a healer on the bench shows as "Backup · Healer"). Picking a slot also approves that raid,
and a slot type that is full (for example 2 Healers in Barrow) cannot be picked. Declining a player, or the player editing
their sign-up, frees the slot again.

The Recruitment page reads the public, read-only feed `GET /api/roster` (names and slots only, no BattleTags or notes) and
drops each placed player into the first free row of that kind. Names pinned by hand in `raid-roster.json` still win, so clear that
file's entries once you place everyone from the sign-up page, otherwise a pinned name and a placed name can clash.
If the feed cannot be reached the page simply shows the pinned names. Slot counts live in `LAYOUT` in `src/index.js` and in
`RAIDS` in `recruitment.html`; change both together if a raid size changes.

## What it stores
BattleTag, Blizzard account id, the character list Battle.net shares (kept 7 days), and each player's sign-ups
(character, raid, roles, nights, note, and an approval status for each raid they asked for). Players can withdraw a sign-up themselves at any time.
No passwords, no Battle.net tokens are stored: the Battle.net access token is used once during login and then discarded.

## Characters: verified or claimed
At login the worker asks Battle.net for the player's characters (`/profile/user/wow`, namespace `profile-forever-us`).
- If Battle.net answers, only characters on that account can be signed up (marked verified).
- If it does not answer for this game, the page falls back to a roster picker and the sign-up is marked **unverified**
  so officers know to double-check. The page handles both cases automatically.

## Testing without any accounts
- `node worker/test.mjs` runs over 100 checks against a pretend Battle.net (no network needed).
- `node worker/dev.mjs` starts the worker locally with pretend accounts. Serve the site (`python3 -m http.server 8123`) and open
  `http://localhost:8123/signup?api=http://localhost:8787`. Visit `http://localhost:8787/mock-oauth/as?code=codeB` first to
  sign in as a different pretend player (`codeA` has characters, `codeB` has none shared, `codeO` is an officer, `cancel` presses Cancel).
- `http://localhost:8123/signup?demo=1` shows the page with pretend data and no service at all (add `&demo=officer` for the officer view).
