<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# R4: Slack platform

Spike date: 2026-10-12. Output: this note and the draft manifest `slack/manifest.yml`.

## Question

Can the bridge's Slack side be built the way PLAN.md §3 describes, with the smallest set of permissions? Specifically:

1. Does Bolt for JavaScript in Socket Mode work for an internal app (one used only in NTARI's workspace, not listed in the Slack Marketplace)? What is the current Bolt version, and does it support Node 24?
2. What are the minimal bot scopes (permissions the app's bot token holds)?
3. What app-level token does Socket Mode need?
4. Can ephemeral messages (visible only to one person) carry URL buttons?
5. Do modals (pop-up forms) work for opening and closing rounds?
6. Do user groups need a paid plan, does Slack for Nonprofits give Pro for free, and what plan is NTARI on?
7. How do URL buttons open on iOS and Android, and what does that mean for cookies?
8. How do slash commands and button clicks behave in Socket Mode, including the 3-second rule?

Jargon used below:
- **Socket Mode**: the app opens an outgoing, always-on connection (a WebSocket) to Slack, and Slack sends events down it. Nothing on our host has to accept incoming connections.
- **Request URL**: the public web address Slack would otherwise call. Socket Mode replaces it.
- **Payload**: the data Slack sends when someone runs a command or taps a button. It includes their Slack user ID.
- **Ack (acknowledge)**: the app's quick "got it" reply to a payload.
- **Scope**: one named permission granted to a token.
- **Block Kit**: Slack's JSON format for message layout, including buttons.

## Method

- Downloaded and read the official Slack developer docs at docs.slack.dev (the current home of api.slack.com content) on 2026-10-12, and searched the text for the exact rules quoted below.
- Read Slack Help Center articles (slack.com/help) on user groups, the nonprofit program, and mobile browsers, on 2026-10-12.
- Checked the npm registry for the current `@slack/bolt` and `@slack/socket-mode` releases, then read Bolt's source and CI settings at the exact release commit.
- Ran read-only searches in NTARI's Slack (message and channel search) to find the workspace plan and the federation channels. Nothing was posted, no app was created.
- Drafted the manifest and checked that it parses as YAML. It has not been uploaded to Slack.

## Findings

### 1. Bolt for JavaScript, Socket Mode, internal apps, Node 24

- **Verified.** Socket Mode is allowed for internal apps; the only restriction is the public Marketplace: "Apps using Socket Mode are not currently allowed in the public Slack Marketplace." NTARI's app is internal, so this does not apply. (Socket Mode doc.)
- **Verified.** The current Bolt for JavaScript release is **5.1.0**, published 2026-09-02, from commit `ffbe0b6c03a6b1e16b3d5d3c5c9a8ab3effcbc1d`. It requires Node `>=20` and depends on `@slack/socket-mode` ^3.0.1 (latest 3.1.0, also Node `>=20`). (npm registry; Bolt `package.json` at that commit.)
- **Verified.** Bolt's own test suite runs on Node 20.x, 22.x and **24.x** at that commit (`.github/workflows/ci-build.yml`). So Node 24 LTS, chosen at Gate 0, is a tested version.
- **Verified (code).** In Bolt, setting `socketMode: true` requires an `appToken`, or startup fails with "You must provide an appToken when socketMode is set to true." (`src/App.ts` lines 1257–1260.)

### 2. Minimal bot scopes

- **Verified.** `commands` is what lets an app add slash commands (standard scope; required for any `slash_commands` entry).
- **Verified.** `chat:write` covers both `chat.postMessage` and `chat.postEphemeral` (the `chat:write` scope page lists both).
- **Verified.** `chat:write` alone does **not** let the bot post into channels it hasn't joined. The `chat.postMessage` doc says: "New Slack apps do not begin life with the ability to post in all public channels. For your new Slack app to gain the ability to post in all public channels, request the chat:write.public scope." The separate `chat:write.public` scope ("Send messages to channels your Slack app isn't a member of") requires `chat:write` as well.
- **Verified.** `chat.postEphemeral` has two membership traps: the bot must be in the channel ("Workspace apps will receive a `no_permission` error when they are not a member of the specified channel"), and so must the person ("If the target user is not in the given channel… we'll return a `user_not_in_channel` error").
- **Verified.** There is a way around both traps for the "Take part" reply: answer through the button click's `response_url` (a one-time reply address included in the payload). The interactivity doc says a `response_url` reply "will bypass any channel posting permissions", is ephemeral by default, and can be used "up to 5 times within 30 minutes". In Bolt this is the `respond()` helper. It needs no extra scope.
- **Verified.** `usergroups.users.list` (read who is in a user group) needs `usergroups:read`.
- **Verified.** `conversations.members` (read who is in a channel) needs one of `channels:read`, `groups:read`, `im:read`, `mpim:read`. It pages through results (`limit` under 1000, 200 recommended) and is rate-limit Tier 4 (100+ calls per minute).
- **Verified (NTARI Slack, read-only search).** All five federation channels are **public**: #federation-substrate, #federation-record, #federation-covenent (spelled that way in Slack), #federation-governance, #federation-economy-information. So `groups:read` (private channels) is not needed.
- **Inferred.** Reading the member list of a public channel with `channels:read` works whether or not the bot has joined. The method page does not say so explicitly; confirm on a test workspace in Phase 3.

### 3. App-level token

- **Verified.** Socket Mode uses an **app-level token** (shown as `xapp-…` in Slack's examples) with the scope **`connections:write`**, which "Grants permission to generate websocket URIs and connect to Socket Mode". Its only method is `apps.connections.open`, which returns a fresh WebSocket address. (connections:write scope page; apps.connections.open page.)
- **Verified.** The token is generated in the app settings under Basic Information > App-level tokens. The manifest reference has no field for it. (Socket Mode doc; manifest reference.)
- **Verified.** Connections refresh "once every few hours", and an app may hold up to 10 open connections. Bolt reconnects on its own. (Socket Mode doc.)
- So the host holds two secrets: the bot token (`xoxb-…`) and the app-level token (`xapp-…`). Neither goes in the repo.

### 4. Ephemeral messages with URL buttons

- **Verified.** A Block Kit button may have a `url` (up to 3000 characters) that opens "in the user's browser when the button is clicked". (Button element reference.)
- **Verified.** Clicking a URL button still sends the app a payload that must be acked: "If you're using `url`, you'll still receive an interaction payload and will need to send an acknowledgement response." In Bolt, register an `app.action(...)` handler for that button's `action_id` that only calls `ack()`.
- **Verified.** Ephemeral messages can carry `blocks`, and a `response_url` reply can too. (chat.postEphemeral doc; interactivity doc.)
- **Verified.** Ephemeral messages are fragile: "ephemeral messages do not persist across reloads, desktop and mobile apps, or sessions." A member who taps "Take part" on their laptop won't see the link on their phone. That suits a 10-minute single-use link; tapping "Take part" again simply mints a new one.

### 5. Modals for open and close

- **Verified.** The slash command payload includes a `trigger_id`. Passing it to `views.open` opens a modal. A `trigger_id` "will expire 3 seconds after it's sent to your app" and can be used only once (`exchanged_trigger_id`, `expired_trigger_id` errors). (Modals doc; views.open reference.)
- **Verified.** When the convener presses Submit, the app gets a `view_submission` payload and has 3 seconds to respond. An empty ack closes the modal. Replying with `response_action: "errors"` shows field errors (for example, "close time is in the past"); `update` or `push` change the form. Up to 3 views can be stacked. (Modals doc.)
- **Inferred.** A good pattern: `/deliberate` opens the "open round" modal; `/deliberate close` opens a "close round" modal with a list of open rounds and a confirm step. In both cases call `views.open` first, before any slow work, to beat the 3-second limit.

### 6. User groups, plans, and NTARI's plan

- **Verified.** User groups are "Available on paid plans" (Help Center, Create and edit user groups). The API returns `plan_upgrade_required` with: "that feature is only available on Standard and above plans" ("Standard" is the old name for Pro). By default only Workspace Owners and Admins can create and edit user groups, though they can open this up to everyone. Guests cannot be added to user groups.
- **Verified.** Slack for Nonprofits gives the Pro plan **free** to workspaces with 250 or fewer members, and 85% off above that. Business+ is 85% off at any size. Eligibility is valid IRS charitable status (NTARI is a 501(c)(3)), with exclusions. One exclusion reads "An organization that attempts to influence public opinion". (Help Center, Apply for the Slack for Nonprofits discount.)
- **Verified (NTARI Slack, read-only search).** NTARI's workspace (ntari.slack.com) **is on Pro, free of charge, since 2025-07-21**. The evidence is a Slack Support email that Jodson reposted in #federation-volunteers that day, plus the "Welcome to Slack's Pro plan" notice. So user groups are available now.
- **Not determined.** The current member count against the 250 cap, and whether creating user groups is still limited to admins. A search for "user group" found no messages, so NTARI probably has no user groups yet.

### 7. URL buttons on iOS and Android

- **Inferred (third-party sources; no official Slack page found).** By default, both Slack mobile apps open links in an **in-app browser**. Each person can switch this off: on Android it is You > Preferences > Advanced > "Open web pages in app"; iOS reports describe a similar setting under Advanced > Web Browser. With it off, links open in the phone's default browser. (Atlassian Jira Android help; Notejoy help.)
- **Verified.** Enterprise plans can force a "mandatory mobile browser" (Edge or BlackBerry Access) for links. This is Enterprise-only, so it does not apply to NTARI on Pro. (Help Center.)
- **Inferred.** What that means for the bridge:
  - On iOS, every browser, including any in-app one, runs on WebKit, which blocks third-party cookies by default. An in-app browser also does not share Safari's cookies. The bridge's flow does not depend on existing cookies (the join page sets a fresh session cookie from the token), so this is fine **as long as** Pol.is's cookies inside the iframe count as first-party. That is the plan's same-site layout (`vote.<domain>` and `polis.<domain>` under one registrable domain). R1 should test Playwright's WebKit with exactly that layout.
  - On Android, the in-app view is typically Chrome-based. Chrome is phasing out third-party cookies more slowly, but the same-site layout makes this moot.
  - Link scanners or previewers could open the URL before the member does and use up a single-use token. Slack does not unfurl button URLs (inferred), but corporate email or security tools might if someone forwards the link. The join page should spend the token only on a deliberate action (for example, a "Continue" POST) rather than on a plain page load. This is a Phase 3 design note.

### 8. Slash commands and buttons in Socket Mode; the 3-second rule

- **Verified.** With Socket Mode on, the app settings do not "require or even allow you to enter a Request URL"; slash commands and interactivity payloads arrive over the WebSocket. In the manifest, the slash command's `url` and interactivity's `request_url` are optional, so they are left out. (Socket Mode doc; manifest reference.)
- **Verified.** Every payload must be acked: Slack needs the ack "within 3000 milliseconds… otherwise an operation_timeout error will be displayed to the user" (slash commands). For interactions, "the Slack user who interacted with the app will see an error message". In Socket Mode the ack is a message sent back with the payload's `envelope_id`; Bolt's `ack()` does this.
- **Verified (code).** Bolt's Socket Mode receiver has **no** automatic 3-second timeout or warning. The source carries the TODO "a Timeout should be used to acknowledge the request after 3 seconds" (`src/receivers/SocketModeResponseAck.ts`). Docs and code agree that the ack is the app's job; the code shows Bolt won't warn us when we're late. Handlers should call `ack()` first, then do the slow work (Pol.is admission, minting a token) and reply through `respond()`.
- **Verified (code), privacy.** At DEBUG log level, Bolt in developer mode logs every payload body (`src/App.ts` line 900, commented "this may contain sensitive info like tokens"). The Socket Mode client logs "Received a message on the WebSocket: ${payload}" (`packages/socket-mode/src/SocketModeClient.ts` line 317, node-slack-sdk commit `a98047a7f27149812664c78e2dccfe4155b0e145`). Payloads contain Slack user IDs, so DEBUG logging would break the privacy floor. Production must run at INFO or above, and must never use `developerMode`.

## Sources

Slack developer docs (docs.slack.dev, read 2026-10-12):
- Socket Mode: https://docs.slack.dev/apis/events-api/using-socket-mode
- connections:write scope: https://docs.slack.dev/reference/scopes/connections.write
- apps.connections.open: https://docs.slack.dev/reference/methods/apps.connections.open
- chat:write scope: https://docs.slack.dev/reference/scopes/chat.write
- chat:write.public scope: https://docs.slack.dev/reference/scopes/chat.write.public
- chat.postMessage: https://docs.slack.dev/reference/methods/chat.postMessage
- chat.postEphemeral: https://docs.slack.dev/reference/methods/chat.postEphemeral
- usergroups.users.list: https://docs.slack.dev/reference/methods/usergroups.users.list
- conversations.members: https://docs.slack.dev/reference/methods/conversations.members
- Button element: https://docs.slack.dev/reference/block-kit/block-elements/button-element
- Handling user interaction (ack, response_url): https://docs.slack.dev/interactivity/handling-user-interaction
- Implementing slash commands: https://docs.slack.dev/interactivity/implementing-slash-commands
- Modals: https://docs.slack.dev/surfaces/modals
- views.open: https://docs.slack.dev/reference/methods/views.open
- App manifest reference: https://docs.slack.dev/reference/app-manifest

Slack Help Center (read 2026-10-12):
- Create and edit user groups: https://slack.com/help/articles/212906697
- Apply for the Slack for Nonprofits discount: https://slack.com/help/articles/204368833
- Require a mandatory mobile browser (Enterprise): https://slack.com/help/articles/360037780633

Code and packages:
- `@slack/bolt` 5.1.0 on npm (published 2026-09-02): https://registry.npmjs.org/@slack/bolt
- bolt-js at commit `ffbe0b6c03a6b1e16b3d5d3c5c9a8ab3effcbc1d` ("chore: release (#3020)"): `package.json`, `.github/workflows/ci-build.yml`, `src/App.ts`, `src/receivers/SocketModeResponseAck.ts`
- `@slack/socket-mode` 3.1.0, node-slack-sdk commit `a98047a7f27149812664c78e2dccfe4155b0e145`: `packages/socket-mode/src/SocketModeClient.ts`

Third-party (mobile behavior, lower confidence):
- Atlassian, open Jira from Slack links (Android "Open web pages in app"): https://support.atlassian.com/jira-cloud-android/docs/open-jira-directly-from-slack-deep-links
- Notejoy help, Slack iOS in-app browser: https://notejoy.com/help/how-do-i-make-the-slack-ios-app-open-notejoy-links-in-the-app

NTARI Slack (read-only search, 2026-10-12):
- Slack Support "moved to the Pro plan, free of charge" email, reposted in #federation-volunteers on 2025-07-21.
- Channel search: federation channels C0BJV2W0QPQ, C0BJTNWFT5K, C0BJX25P5J6, C0BJV1Q1X1C, C0BKRE634FJ, all public.

Repo files: `PLAN.md` §3 and R4; `CLAUDE.md`; draft `slack/manifest.yml`.

## Recommendation

Build the Slack side as planned: Bolt for JavaScript 5.x in Socket Mode on Node 24, using the draft `slack/manifest.yml`. Nothing found blocks the design. NTARI already has Pro, so user groups are available as the roll source.

**Scope rationale**

| Token / scope | Needed for | Keep? |
|---|---|---|
| bot `commands` | `/deliberate` and `/deliberate close` | Yes |
| bot `chat:write` | Post the announcement and closing summary (`chat.postMessage`) | Yes |
| bot `usergroups:read` | Eligibility if the roll is a user group per federation (`usergroups.users.list`) | Yes, if Gate 1 picks user groups |
| bot `channels:read` | Eligibility if the roll is channel membership (`conversations.members`, public channels) | Yes, if Gate 1 picks channel membership; drop the unused one after Gate 1 |
| bot `groups:read` | Same, for private channels | No: all federation channels are public |
| bot `chat:write.public` | Post to channels without joining | No: invite the bot to the five federation channels instead. It is fewer permissions, and a visible member is more honest. |
| bot `users:read` | Looking up profiles | No: eligibility needs only IDs |
| app-level `connections:write` (`xapp-`) | Opening the Socket Mode connection | Yes (made in settings, not in the manifest) |
| Event subscriptions | — | None: commands and buttons arrive without them |

**Design notes for Phase 3**
- Reply to "Take part" through `respond()` (the click's `response_url`), not `chat.postEphemeral`. This works even when the member is only previewing the channel and hasn't joined, and it needs no extra scope.
- In every handler, call `ack()` first. For `/deliberate`, open the modal right away, inside the 3-second `trigger_id` window.
- Add an ack-only `app.action` handler for the URL button inside the ephemeral reply.
- Pin Bolt's log level to INFO or above and never use `developerMode`. Add a test that fails if it is set to DEBUG. Don't log the `respond()` body: it contains the join URL.
- The join page should spend the single-use token on a POST or "Continue" click, not on a plain page load, so link scanners can't use it up.

**Open questions for Gate 1**
1. Roll source: a user group per federation (needs `usergroups:read`; admins maintain it) or channel membership (needs `channels:read`; anyone can join a public channel, so it is self-selected)? Channel membership in a public channel is a weak eligibility check.
2. Who may edit user groups in NTARI's workspace? If it is open to all members, anyone could add themselves to a roll. It should be Owners and Admins only (an admin setting; not checked here).
3. Member count against the nonprofit cap: free Pro covers 250 or fewer. If the workspace grows past that, the price becomes 85% off, not free. If Pro lapses, user groups stop working (`plan_upgrade_required`).
4. Nonprofit eligibility wording: the program excludes "an organization that attempts to influence public opinion". NTARI was approved in 2025, so no action is needed. Just note it before describing NTARI publicly in ways that might prompt a re-review.
5. Who may convene: enforce it with a convener user group (also `usergroups:read`) or with a list of user IDs in config?
6. App name and bot display name ("Deliberation" / `deliberation` in the draft).
7. Mobile behavior is not confirmed by an official Slack source. Test it on a real iPhone and Android phone during staging (Phase 5), with "Open web pages in app" both on and off.
8. Should #federation-covenent be renamed to #federation-covenant before the bridge maps federations to channel IDs? The bridge should key on channel IDs, so a rename is harmless either way.
