# Nebula Mail — AI-Powered Mail Web Application

A Gmail client with an assistant panel that **controls the interface directly** — it
opens Compose and visibly fills in the fields, updates the inbox with search
results, opens specific emails, and pre-fills replies using the email you
currently have open. It is not a chatbot bolted onto a mail app: every
assistant action is a typed command the frontend executes through the same
state and reducers a manual click would use.

Built for the Nebula KnowLab hiring task.

---

## Contents

- [Quick start](#quick-start)
- [Architecture](#architecture)
- [How the assistant controls the UI](#how-the-assistant-controls-the-ui)
- [Google Cloud / credentials setup](#google-cloud--credentials-setup)
- [Real-time sync](#real-time-sync)
- [Security](#security)
- [Testing](#testing)
- [Deployment](#deployment)
- [Trade-offs and what I'd improve with more time](#trade-offs-and-what-id-improve-with-more-time)
- [Demo script](#demo-script)

---

## Quick start

Prerequisites: Node 20+, a Google Cloud project with the Gmail API enabled,
an xAI API key, and a PostgreSQL database (a free
[Neon](https://neon.tech) or [Supabase](https://supabase.com) instance takes
under a minute to create — copy its connection string as `DATABASE_URL`).

```bash
# Backend
cd backend
cp .env.example .env        # fill in the values — see "Google Cloud setup" below
npm install
npx prisma generate
npx prisma db push          # creates the tables in your Postgres database
npm run dev                 # http://localhost:4000

# Frontend (new terminal)
cd frontend
cp .env.example .env        # VITE_API_URL=http://localhost:4000
npm install
npm run dev                 # http://localhost:5173
```

Open `http://localhost:5173`, sign in with Google, and talk to the assistant
panel on the right.

> **Sanity check before wiring any credentials:** you can run
> `cd frontend && npm install && npm run dev` on its own right now — no
> backend, no `.env` values needed yet. It boots on `http://localhost:5173`
> and renders the real Login screen (the app's `/api/auth/me` check fails
> gracefully to "logged out" with no backend running), which confirms the
> UI layer itself builds and runs correctly before you touch Google/xAI
> credentials at all. Verified while preparing this build: `npx vite` starts
> in ~250ms and serves HTTP 200.
>
> The backend needs a reachable Postgres `DATABASE_URL` to fully boot —
> `prisma generate` downloads a query-engine binary from Prisma's CDN on
> first run, which requires normal outbound internet access. If you're
> running this from a network-restricted environment and the backend fails
> at `new PrismaClient()` with "did not initialize yet," that's this binary
> download being blocked, not an application bug — it will succeed on a
> normal developer machine or a standard cloud host.

> **Note on this repository as delivered:** all integration code (Gmail API,
> Google OAuth, Grok tool calling, Pub/Sub) is real and complete — nothing
> is mocked. It cannot run end-to-end until you supply your own Google OAuth
> client, a Gmail-enabled Google Cloud project, a Postgres database, and an
> xAI API key, because those require your own accounts. Exact steps
> are below.

---

## Architecture

```
┌──────────────────────────────┐        ┌──────────────────────────────────┐
│  Frontend (React + TS + Vite) │        │  Backend (Express + TS)           │
│                                │  REST  │                                    │
│  Zustand store (single source │◄──────►│  routes/  auth, mail, assistant   │
│  of truth for view/filters/   │  WS    │  services/ gmailService,           │
│  open email/compose draft)    │◄──────►│           authService, watchService│
│                                │        │  assistant/ tools.ts,              │
│  actionExecutor.ts applies    │        │             orchestrator.ts        │
│  UIDirective -> store, same   │        │  websocket/ gateway.ts             │
│  path as manual clicks        │        └──────────────┬─────────────────────┘
└──────────────────────────────┘                       │
                                                          │ googleapis
                                              ┌───────────▼───────────┐    ┌────────────────┐
                                              │ Gmail API              │◄──►│ Google Cloud    │
                                              │ (list/get/send/watch)  │    │ Pub/Sub         │
                                              └────────────────────────┘    └────────────────┘
```

**Clean separation, on purpose:**

- `services/gmailService.ts` is the only file that talks to the Gmail *mail*
  API (list/get/send/watch/history) — everything else, including routes and
  the assistant, works with plain `EmailSummary`/`EmailDetail` types
  (`types/mail.ts`). `services/authService.ts` also imports `googleapis`,
  but only for the OAuth token exchange and fetching the signed-in user's
  own email/id — a distinct concern from mail operations, kept in its own
  file. If a second mail provider were ever needed, `gmailService.ts` is
  the one file that would change.
- `assistant/tools.ts` + `assistant/orchestrator.ts` own the entire
  Grok tool-calling loop. The orchestrator calls `GmailService` the same
  way the REST routes do — it has no special access, no shortcuts.
- `types/directives.ts` (mirrored in the frontend) is the actual contract
  between "the AI decided to do something" and "the UI changed." The
  assistant never emits HTML, JS, or freeform instructions — only one of a
  fixed set of typed directives: `OPEN_COMPOSE`, `UPDATE_COMPOSE_FIELD`,
  `OPEN_EMAIL`, `SHOW_SEARCH_RESULTS`, `APPLY_FILTER`, `OPEN_REPLY`,
  `NAVIGATE_VIEW`, `SEND_CONFIRMATION_REQUIRED`.
- `store/actionExecutor.ts` on the frontend is the single place a directive
  becomes a state change, and it calls the *exact same* Zustand actions
  (`openCompose`, `setOpenEmail`, `setFilters`, …) that manual UI event
  handlers call. There is no parallel "AI state" — the assistant drives the
  real app state.

Database (Prisma/PostgreSQL) is used only for auth (refresh tokens, Gmail
`historyId`/watch bookkeeping) and assistant conversation history. Email
content, threads, and labels are never cached — Gmail is the single source
of truth, fetched live on every request. This avoids ever showing stale
data and avoids building a second store to keep in sync.

> **Schema sync uses `prisma db push`, not `prisma migrate`.** There is no
> committed migration history in this repo — generating one requires
> downloading Prisma's engine binaries, which wasn't possible from the
> sandboxed environment this project was built in, and for a single-schema,
> single-environment 5-day build, migration history isn't pulling its
> weight over just pushing the schema directly. `db push` is idempotent and
> is what both local dev and the Render deploy use (see `render.yaml`). If
> this grows into a project with multiple contributors/environments to keep
> in sync, switching to `prisma migrate dev` to generate real migration
> files is the natural next step — see `prisma/schema.prisma` for the same
> note in context.
>
> **Postgres for both local dev and production**, rather than SQLite
> locally and something else in production: a free Neon/Supabase instance
> is just as fast to set up as a local SQLite file, and using the same
> engine everywhere means there's no dev/prod behavioral divergence to
> reason about (and no separate migration path to maintain for each).

---

## How the assistant controls the UI

1. The frontend sends the user's message **plus a snapshot of what they're
   currently looking at** (`UIContext`: current view, open email, active
   filters) to `POST /api/assistant/message`.
2. The backend calls Grok (`grok-4.6`, via xAI's OpenAI-compatible Chat
   Completions API at `https://api.x.ai/v1`) with a fixed set of tools
   (`assistant/tools.ts`): `fill_compose`, `send_email`, `search_emails`,
   `apply_filter`, `open_email`, `reply_to_open_email`, `forward_open_email`.
3. Grok decides which tool(s) to call and with what arguments — it never
   generates UI markup. The orchestrator executes each tool call against
   `GmailService` for real (a real Gmail search, a real send, a real fetch),
   and turns the result into one typed `UIDirective`.
4. The backend returns `{ reply, directives[] }`. The frontend's
   `actionExecutor.ts` applies each directive to the Zustand store.
5. For `OPEN_COMPOSE` / `OPEN_REPLY`, the fields are filled **one at a time
   with a short delay** (`animateComposeFill`) rather than snapped to their
   final values, specifically so the field population is visible — this is
   the detail the hiring task calls out explicitly ("the fields visibly fill
   in"). Each field also gets a brief highlight (`.ai-glow`) using the app's
   one reserved accent color, so it's visually obvious the assistant (not
   the user) made the change.

**Human-in-the-loop for sending (bonus), enforced structurally, not just by
prompting:** the `send_email` tool handler in `orchestrator.ts` never calls
`gmail.sendEmail()`. It only returns a `SEND_CONFIRMATION_REQUIRED`
directive, which fills the compose form and sets an `awaitingSendConfirmation`
flag in the store. `ComposeView` then shows an explicit "The assistant
drafted this and is waiting on you to confirm" banner and relabels the Send
button "Confirm send." The actual Gmail send only ever happens from that
button, via `POST /api/mail/send` — the exact same endpoint a fully manual
compose uses. This means the guarantee holds regardless of how the model
reasons about the conversation; there's no prompt-injection or ambiguous-
phrasing path that results in mail going out without a real click in the UI.

**Context awareness:** the `UIContext` sent on every turn includes the
currently open email. `reply_to_open_email` reads that id, fetches the
original message for its `from`/`subject`, and returns an `OPEN_REPLY`
directive — this is what makes "reply to this" work without the user
repeating which email they mean. If nothing is open, the tool's description
tells the model to ask the user which email first rather than guessing.

**Filters vs. search, as two distinct tools:** `apply_filter` mutates the
persistent Inbox filter state (the same one the dropdown controls write to)
and re-fetches through the same `GET /api/mail` path manual filtering uses.
`search_emails` is for one-off lookups ("find the email from Sarah about the
project update") and renders as a dismissible overlay above the inbox
(`SHOW_SEARCH_RESULTS`) without disturbing the persistent filter state.

---

## Google Cloud / credentials setup

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com).
2. **APIs & Services → Library** → enable **Gmail API**.
3. **APIs & Services → OAuth consent screen** → External, add your own
   Google account as a test user (no verification needed for a demo).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   → type "Web application" → Authorized redirect URI:
   `http://localhost:4000/api/auth/google/callback` (and your deployed
   backend URL + `/api/auth/google/callback` once deployed).
   Copy the client ID/secret into `backend/.env`.
5. For real-time sync: **Pub/Sub → Topics → Create Topic** (e.g.
   `gmail-inbox`), then **Create Subscription** on that topic (type: Pull).
   Grant publish rights on the topic to `gmail-api-push@system.gserviceaccount.com`
   (Gmail's own service account — required by the Gmail API for `users.watch`).
   Put the topic and subscription full resource names into
   `GOOGLE_PUBSUB_TOPIC` / `GOOGLE_PUBSUB_SUBSCRIPTION` in `.env`.
6. Create a service account with Pub/Sub Subscriber role, download its JSON
   key, and point `GOOGLE_APPLICATION_CREDENTIALS` at it (or set
   `GOOGLE_CLOUD_PROJECT_ID` and use Application Default Credentials if
   running on GCP infrastructure).
7. Get an xAI API key from the [xAI Console](https://console.x.ai)
   and set `XAI_API_KEY`. Leave `XAI_BASE_URL` (`https://api.x.ai/v1`) and
   `XAI_MODEL` (`grok-4.6`) at their `.env.example` defaults unless you have
   a reason to change them.

None of this can be created from inside a coding sandbox — it requires your
own Google Cloud and xAI accounts. The integration code for all of it
is complete and untouched by placeholders.

---

## Real-time sync

Gmail supports two notification delivery modes: a **push** HTTPS webhook
(needs a domain-verified, publicly reachable endpoint registered in advance)
or a **pull** subscription, where our own backend drains a Pub/Sub queue
that Gmail publishes into.

This project uses **pull** (`services/watchService.ts`,
`startGmailPushListener`). It's still genuinely event-driven — the backend
isn't polling the Gmail API on a timer, it's reacting to messages Gmail
pushes into the queue — but it skips the domain-verification step a push
webhook needs, which is a meaningful simplification for a demo deployed to
a Railway/Render URL rather than a verified custom domain.

Flow: `users.watch()` registers the topic on login → Gmail publishes
`{emailAddress, historyId}` on any mailbox change → our pull subscriber asks
Gmail `history.list(startHistoryId)` for exactly what changed (message
content is never carried over Pub/Sub, by Gmail's own design) → new
messages are pushed to the frontend over WebSocket (`NEW_EMAIL` event) →
`useSocket.ts` prepends them into the inbox with no manual refresh.

**Watch renewal:** `users.watch()` registrations expire after ~7 days.
`scheduleWatchRenewal()` (`services/watchService.ts`) runs an in-process
sweep every 6 hours — plus once at startup — that finds any user whose
`watchExpiry` is within the next 24 hours and re-registers their watch. This
is intentionally a simple `setInterval`, not a separate worker/queue, since
a single backend instance is the right scope for this build; a
multi-instance deployment would want this as a dedicated scheduled job
instead so it doesn't run once per instance.

---

## Security

- Google refresh/access tokens are stored server-side only (Prisma `User`
  table) and never sent to the frontend. The frontend holds a signed,
  httpOnly, `SameSite=Lax` session cookie (`jsonwebtoken`) — not a Google
  token — and the backend resolves that to a per-request, auto-refreshing
  `OAuth2Client`.
- The WebSocket gateway authenticates each socket against that same session
  cookie rather than a separate token scheme.
- All Gmail calls happen server-side; the frontend never talks to Google
  directly.
- The assistant can only call the fixed tool set in `assistant/tools.ts` —
  there is no "run arbitrary code" or "render this HTML" tool, so a
  prompt-injected or adversarial user message cannot make the model do
  anything beyond compose/search/filter/open/reply.
- `helmet()` + scoped CORS (`FRONTEND_URL` only, `credentials: true`).
- Rate limiting via `express-rate-limit` on `/api/assistant/message`
  (20/min) and `/api/mail/send` (10/min), per-IP — the two endpoints that
  either cost LLM tokens or take an externally-visible action.
- Email bodies are rendered as plain text in the Detail view
  (`bodyText`, not `bodyHtml`) specifically to avoid needing to sanitize and
  render arbitrary email HTML for this build — a pragmatic scope cut, noted
  below.
- Input validation with `zod` on every mutating route (`/api/mail/send`,
  `/api/assistant/message`, etc).
- Stored assistant conversation history is trimmed with a turn-boundary-aware
  algorithm (`services/conversationTrim.ts`), not a raw message-count slice —
  a naive slice can cut in the middle of a `tool_calls`/tool-result pair,
  which the xAI API (OpenAI-compatible) rejects outright on the next turn.
  See that file's header comment and `__tests__/conversationTrim.test.ts`
  for the failure mode this avoids.
- Assistant errors are classified (`assistant/errors.ts`) into clear,
  user-facing messages rather than leaking raw API errors: a missing
  `XAI_API_KEY` fails fast with an actionable message, invalid keys and
  rate limits are distinguished from generic failures, and network errors
  reaching the xAI API are called out specifically. A single failing tool
  call (e.g. a transient Gmail API error) is reported back to the model as
  a tool result rather than crashing the whole assistant turn.

---

## Testing

```bash
cd backend && npm test    # 37 tests: Gmail query builder, tool→directive mapping, conversation-history
                           #           trimming, xAI client config, tool schema, error classification
cd frontend && npm test   # 10 tests: Action Executor + FilterBar against the real Zustand store
```

Backend tests cover `buildGmailQuery` (the filter → Gmail search-syntax
translation), `executeTool` (every assistant tool → the directive it
produces, using a mocked `GmailService` so no live credentials are needed —
this is the part of the app doing the "AI controls the UI" work, so it's
the part most worth unit-testing without needing a live Grok/Gmail call),
`trimConversation` (guards against the trimmer ever producing an invalid
tool-call/tool-result message sequence — see Security above), `xaiClient`
(client construction and the missing-key fail-fast path, without a live
network call), `assistantTools` (the OpenAI/xAI function-calling schema
shape), and `classifyAssistantError` (every error-handling case: missing
key, invalid key, rate limit, malformed request, provider outage, network
failure). None of these tests make a live call to the xAI API — API
responses and tool calls are constructed/mocked directly.

Frontend tests exercise `executeDirective` against the actual app store, to
confirm each directive type mutates state the same way a manual action
would (e.g. `OPEN_EMAIL` both sets `openEmail` *and* flips `isUnread` in the
shared list, exactly like clicking an email manually does), plus a rendered
`FilterBar` regression test (`@testing-library/react`) confirming the
visible filter controls update when a filter arrives via an assistant
`APPLY_FILTER` directive rather than a manual edit.

Not included, given the 5-day scope: end-to-end browser tests (e.g.
Playwright) and integration tests against a live Grok/Gmail sandbox.

---

## Deployment

- **Frontend → Vercel.** `frontend/vercel.json` is included. Set
  `VITE_API_URL` to your deployed backend URL as a Vercel environment
  variable.
- **Backend → Render.** `backend/render.yaml` is included as a Render
  Blueprint and provisions a managed Postgres database automatically
  (`databases:` block) — no separate database setup step needed for a
  Render deployment specifically. Needs a long-lived process (not
  serverless functions) because it holds a WebSocket server and a Pub/Sub
  pull-subscriber loop — Railway works equally well if you prefer it, in
  which case point `DATABASE_URL` at any Postgres instance (Railway's own,
  Neon, Supabase).
- The blueprint's `startCommand` runs `prisma db push` before `npm start`
  on every deploy — see the note in `prisma/schema.prisma` for why this
  project uses `db push` instead of `prisma migrate deploy`.
- Set `GOOGLE_REDIRECT_URI` and the Google Cloud OAuth client's authorized
  redirect URI to your deployed backend's `/api/auth/google/callback` once
  live, and `FRONTEND_URL` on the backend to your deployed frontend origin.

---

## Trade-offs and what I'd improve with more time

Already closed out beyond the original 5-day scope:
- **Gmail `watch()` renewal** — `scheduleWatchRenewal()` in `watchService.ts`
  sweeps every 6h (in-process) for any user whose watch expires within 24h
  and re-registers it, using the `watchExpiry` column.
- **Send confirmation is structural, not prompt-based** — see
  "How the assistant controls the UI" above; `send_email` cannot reach
  `gmail.sendEmail()` without a real button click in `ComposeView`.
- **Forward via assistant** (bonus) — `forward_open_email` tool, quotes the
  open email into a new `OPEN_COMPOSE` draft the same way reply does.
- **Rate limiting** on `/api/assistant/message` (20/min) and
  `/api/mail/send` (10/min) via `express-rate-limit`.
- **Filter-control sync** — `FilterBar`'s visible controls now re-derive
  from the store on every change, so an assistant-applied `APPLY_FILTER`
  directive updates the dropdowns/checkbox, not just the underlying state
  and the inbox list.
- **Safe conversation trimming** — history capping can no longer split a
  `tool_calls`/tool-result pair in the xAI/OpenAI-format message history
  (see Security above).

Still open, in priority order if continuing:
- **HTML email rendering.** Detail view currently renders `bodyText` only.
  With more time I'd sanitize `bodyHtml` with DOMPurify and render it in a
  sandboxed iframe, which is what real inbox HTML rendering needs.
- **Thread/conversation view.** Each email currently opens as a single
  message; grouping by `threadId` into a conversation view is a natural
  next step and was intentionally deprioritized as a bonus item.
- **Pagination** on Inbox/Sent — currently fetches the most recent 25–30 and
  stops; `nextPageToken` is already returned by `listEmails` and wiring up
  "load more" is a small, contained addition.
- **Per-user rate limiting** — current limits are per-IP, which is fine for
  a single-tenant demo; a multi-tenant deployment should key off the
  authenticated `userId` instead.
- **Multi-conversation assistant history** — right now there's one ongoing
  assistant conversation per user; a real product would let you branch/reset
  per mailbox session more granularly.
- **Committed Prisma migration history** — this build uses `prisma db push`
  (see above); moving to `prisma migrate dev`-generated migration files
  would be worthwhile if the project grows past a single environment.

---

## Demo script

With OAuth and Pub/Sub configured and both servers running:

1. Sign in with Google.
2. In the assistant panel: *"Send an email to `<your test address>` with
   subject 'Meeting Tomorrow' and body 'Let's meet at 3pm'"* — watch Compose
   open and each field fill in with the signal-blue highlight, then confirm
   send from the UI.
3. *"Show me emails from the last 10 days"* — the inbox updates with the
   filtered set and a labeled overlay.
4. *"Find the email from `<name>` about `<topic>`"* — a one-off search
   result renders as cards in both the assistant panel and the inbox
   overlay.
5. *"Open the latest email from `<name>`"* — the Detail view opens directly
   to that message.
6. With that email open: *"Reply to this saying I'll be there"* — Compose
   opens pre-filled with the recipient, `Re:` subject, and body already
   resolved from the open email, with no need to repeat which email.
7. Send a real email to the connected account from another address and
   watch it appear in the inbox with no refresh (Pub/Sub → WebSocket).

(Screenshots/video: record this sequence locally once your own Google/
xAI credentials are wired in — the app can't produce a live recording
from inside this sandboxed build environment.)
