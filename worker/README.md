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

## News (Web Admins post, everyone reads)
Every post has **its own page** at `dirtysocks.net/news/<title>` (the title turned into a web address: `Raid night: moved!` becomes `/news/raid-night-moved`), and the home page has a
**News slider** above Race to 60: the latest 5 posts as big slides (cover photo, bold title, the first ~280 characters of the message and a white **Read More** button that opens the
post's page), with dots, arrows, swipe and arrow keys. It moves on its own every 7 seconds, stops when you hover, focus or touch it (or press the pause button) and never moves for
people who ask for reduced motion. It hides itself while there are no posts. `/news` lists every post as a card.
Everyone can read the news. Only **Web Admins** can post, edit or delete, on the **Post-News page** (`/post-news`, files `post-news.html` + `news-admin.js`). Web Admins get a
**Post news** item in the account menu (the dropdown under their name, top left); nobody else sees it, and for everyone else, signed in or not, `/post-news` shows the normal
"page not found" screen. The page is not in the sitemap or the footer and is set to `noindex`. The home page news is read-only for everybody.
Officers are a separate group: being an officer does not allow posting, and being a Web Admin does not give officer powers (someone can be both).

The Web Admin group is deliberately invisible. The people in it live in the `WEB_ADMIN_SUBS` **secret** (Blizzard account ids, comma separated, same ids
as `OFFICER_SUBS`), not in the repo. The site and the public feed never show a rank, a label, an author or who posted; the post form and Edit/Delete buttons
simply appear for those accounts.
(The page's files are public, as on any static site, but nothing in them works without a Web Admin login: the Worker refuses every post, edit, delete and upload from anyone else.)
- To add or remove a Web Admin: change the `WEB_ADMIN_SUBS` secret in GitHub (*Settings -> Secrets and variables -> Actions*), then *Actions -> Deploy login worker -> Run workflow*.
- Posts can be formatted and carry pictures (below). 120 characters for the title and 8000 for the message. Pinned posts stay on top.
- API: public `GET /api/news` (optional `?limit=`), `GET /api/news/post/<title-address>` and `GET /api/news/img/<id>`; Web Admins only: `POST /api/news`, `PUT /api/news?id=...`, `DELETE /api/news?id=...`, `POST /api/news/image`.

### Post pages, addresses and the cover photo
- **Addresses:** a new post gets its address from the title when it is created (lower case, accents and symbols dropped, at most 60 characters; two posts with the same title get `-2`, `-3`, ...).
  **Editing the title does not change the address**, so links that were already shared keep working. Posts from before this existed use the title plus the last 5 characters of their id.
  The lookup ignores capital letters and stray characters, so `/news/Raid-Night-Moved` also opens it.
- **Real pages, built every night.** The GitHub Action **Build news pages** (`.github/workflows/build-news-pages.yml`) runs at midnight Eastern, reads the posts from the Worker and writes
  `news/<title>.html` for each one with `scripts/build-news.mjs`. Those pages answer with a normal 200, carry the post's own title, teaser and cover photo for link previews (Discord, Google,
  Facebook) and are listed in `sitemap.xml`. The same job also keeps the sitemap's "last changed" dates up to date. Deleted posts lose their page, edited posts are rewritten.
  **A brand-new post** does not have a page until the next build, so right after posting you can build it at once: GitHub -> Actions -> *Build news pages* -> *Run workflow* (about a minute).
  Until then `/news/<title>` still works, but through the fallback below.
- **The fallback, and keeping built pages honest.** A post with no built page falls through to `404.html`, which loads `news-post.js`; that recognises `/news/<title>`, fetches the post from the Worker and
  draws it in place (so it works the second you post it). Side effect: that fallback is served with status 404, so search engines skip it and link previews show the generic site card until the page is built.
  Built pages also run `news-post.js`: it asks the Worker whether the post changed since the build and, if so, shows the new version; if the post was deleted it says so.
  The layout of a built page is `404.html` itself and the post is drawn by `news-format.js` (`page()`), so the menu, footer and holiday theme never drift. If `404.html` is rearranged so the builder can
  no longer find its markers, the job fails loudly (GitHub emails you) instead of writing broken pages. Tests: `node scripts/test-build-news.mjs`.
- **Cover photo:** a separate section under the title on the Post-News page. Pick or drag in a wide photo (shrunk to at most 1920px / 800 KB), see the slide exactly as it will look on a computer
  or on a phone, and use the two sliders to choose which part stays in view (the site crops the picture to fit; the choice is saved as `fx`/`fy`, 0-100). Without a cover the slide shows the guild crest.
  A replaced or removed cover is deleted from storage. The cover is also the picture in the Discord alert (if there is none, the first picture in the text).
- **Teaser:** the slide and the cards show the first ~280 characters of the message with the formatting marks stripped, cut at a word and ending in "…" (`excerpt()` in `news-format.js`).

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
to the post's own page (`/news/<title>`); the cover photo (or else the post's first picture) is shown in the message. Edits and deletes are not sent. Nobody can be pinged (mentions are off), only http(s) links go across, nothing identifies the author,
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

## BiS checklist (private ticks on the Pre-Raid BiS page)
When a player is logged in, every BiS item, enchant and alternative on /bis gets a tick box, with progress bars on top
(BiS items, Enchants, and Slots covered by a BiS item or an alternative).
- **Private.** Ticks are stored under the player's own login and `GET /api/bis` only ever returns the caller's own data. Officers and Web Admins cannot see them either.
- **Saved as you tick.** `PUT /api/bis` with `{spec, have:[keys]}` replaces one spec's list (an empty list removes it). Keys are `i:<slot>` (BiS item), `e:<slot>` (enchant) and `a:<slot>:<alternative name>`. Limits: 40 specs per player, 150 ticks per spec, 300 saves an hour, 40 KB per save.
- **Gear that is worn ticks itself.** The page reads the character files the site already publishes (`characters/<name>.json`, refreshed about every hour) for the logged-in player's characters (level 10+, in the guild roster) and ticks any BiS item or alternative that matches by name. Those boxes are locked and show an "Equipped" badge. It can lag by up to an hour, and items sitting in the bank or bags are ticked by hand.
- **Enchants are always by hand.** The Armory only gives enchants as stat text ("Enchanted: Agility +4"), which cannot be matched to the enchant names on the list.
- **Clear my ticks** removes the manual ticks for the open spec after an inline "Yes, clear" confirm; worn gear stays ticked.

## What it stores
BattleTag, Blizzard account id, the character list Battle.net shares (kept 7 days), and each player's sign-ups
(character, raid, roles, nights, note, and an approval status for each raid they asked for). Players can withdraw a sign-up themselves at any time.
Their BiS checklist ticks are stored too (private to them, see above).
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
