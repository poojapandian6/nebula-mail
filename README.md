# Nebula Mail — AI-Powered Gmail Client

Nebula Mail is an AI-powered Gmail web application built for the **Nebula KnowLab hiring task**.

The core idea is:

> **Natural Language → AI Agent → Typed Action → Application State → Visible UI / Gmail Action**

The AI assistant does not simply answer questions in a chat window. It can control the actual mail application by opening Compose, visibly filling fields, searching emails, applying filters, opening specific emails, and using the currently open email as context for replies.

The application integrates directly with **Gmail, Google OAuth, PostgreSQL, Groq, Google Cloud Pub/Sub, and WebSockets**.

---

## 🚀 Live Demo

👉 **[Open Nebula Mail Live](https://nebula-mail-8mja.onrender.com)**

The live application requires Google OAuth authentication and Gmail access.

### 🎥 Live Demo Video

**[Watch the Nebula Mail Demo](YOUR_VIDEO_LINK_HERE)**

> The demo video will be added here after recording.

---

## 📌 Project Overview

Nebula Mail combines a real Gmail client with an AI assistant that can perform actions on the application's actual UI.

Instead of treating the assistant as a separate chatbot, natural-language requests are converted into typed actions that update the same application state used by manual UI interactions.

For example:

> "Send an email to Alex about tomorrow's meeting."

The assistant can open Compose and visibly populate:

- Recipient
- Subject
- Message body

The user can then review the generated email and confirm the send.

Similarly:

> "Open the latest email from Rosiee."

opens the corresponding email in the application's detail/conversation view.

---

# Features

## Core Mail Features

- Google OAuth authentication
- Real Gmail Inbox
- Sent mail
- Drafts
- Email detail view
- Compose email
- Send real emails through Gmail
- Mark emails as read
- Basic mailbox filtering
- Date filtering
- Sender filtering
- Keyword filtering
- Read / unread filtering
- Combined filters
- Real-time email synchronization

---

# 🤖 AI Assistant

The assistant understands natural-language commands and performs actions directly inside the application.

## Compose and Send

Example:

> "Send an email to Alex with subject Meeting Tomorrow and tell them we'll meet at 3 PM."

The assistant:

1. Opens the Compose interface.
2. Fills the recipient.
3. Fills the subject.
4. Fills the message body.
5. Shows the fields being populated visibly.
6. Prepares the message for user confirmation.

The assistant-generated compose action uses the same application state as manual Compose.

---

## Search and Display

Users can search Gmail using natural language.

Example:

> "Find emails from Sarah about the project."

The assistant performs a real Gmail search and displays the matching messages in the application.

Search supports:

- Sender
- Keywords
- Date ranges
- Read / unread state
- Combined conditions

Search results are displayed using email preview cards.

---

## Navigate and Open

Example:

> "Open the latest email from Rosiee."

The assistant identifies the appropriate Gmail message and opens it directly in the application's detail/conversation view.

---

## Context-Aware Reply

When an email is currently open, the current UI context is provided to the assistant.

Example:

> "Reply to this saying I'll be there."

The assistant understands which email "this" refers to and prepares the reply using:

- The correct recipient
- `Re:` subject
- The requested reply body

The user does not need to repeat the sender or subject.

---

## Natural-Language Filters

The assistant can apply persistent mailbox filters.

Examples:

> "Show me unread emails."

> "Show emails from the last 10 days."

> "Show unread emails from Sarah."

Assistant-applied filters update the application's visible filter controls as well as the mail list.

---

# How AI Controls the UI

The assistant is implemented as an action-driven system rather than a chatbot-only interface.

## Flow

```text
User
  │
  │ Natural-language request
  ▼
Frontend
  │
  │ Message + UIContext
  ▼
Backend Assistant
  │
  │ Groq tool calling
  ▼
Assistant Tool
  │
  ├── search_emails
  ├── apply_filter
  ├── open_email
  ├── fill_compose
  ├── reply_to_open_email
  ├── forward_open_email
  └── send_email
  │
  ▼
GmailService
  │
  ▼
Typed UIDirective
  │
  ▼
Frontend actionExecutor
  │
  ▼
Zustand Store
  │
  ▼
Visible UI Update

The assistant never generates HTML or arbitrary frontend code.

Instead, it produces a fixed set of typed directives such as:

OPEN_COMPOSE
UPDATE_COMPOSE_FIELD
OPEN_EMAIL
SHOW_SEARCH_RESULTS
APPLY_FILTER
OPEN_REPLY
NAVIGATE_VIEW
SEND_CONFIRMATION_REQUIRED

The frontend's actionExecutor converts these directives into the same Zustand state changes used by manual UI interactions.

This keeps AI-controlled actions and manually triggered actions on the same application state path.

UI Context Awareness

Every assistant request includes a snapshot of the current UI state:

UIContext
├── current view
├── currently open email
└── active filters

This allows commands such as:

"Reply to this."

to work without requiring the user to identify the email again.

If no email is open, the assistant is instructed to ask which email the user wants to reply to rather than guessing.

Human Confirmation Before Sending

Sending is intentionally protected by a UI confirmation step.

The AI send_email action does not directly call Gmail's send API.

Instead it produces:

SEND_CONFIRMATION_REQUIRED

The frontend then:

Opens/fills the Compose view.
Shows a confirmation message.
Changes the Send action to Confirm send.
Sends the actual email only after the user clicks the button.

Therefore, an assistant response cannot silently send an email.

🏗️ Architecture
┌──────────────────────────────────────────────────────────────┐
│                         Frontend                             │
│                    React + TypeScript + Vite                 │
│                                                              │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐ │
│  │ Mail Views  │   │ Zustand Store│   │ Assistant Panel  │ │
│  │             │   │              │   │                  │ │
│  │ Inbox       │   │ View         │   │ Natural Language │ │
│  │ Sent        │   │ Filters      │   │ Commands         │ │
│  │ Drafts      │   │ Open Email   │   │                  │ │
│  │ Trash       │   │ Compose      │   │                  │ │
│  │ Spam        │   │              │   │                  │ │
│  │ Favorites   │   │              │   │                  │ │
│  └─────────────┘   └──────────────┘   └──────────────────┘ │
│                              │                               │
│                      actionExecutor                          │
└──────────────────────────────┬───────────────────────────────┘
                               │
                         REST + Socket.IO
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                         Backend                              │
│                    Express + TypeScript                      │
│                                                              │
│  Routes                                                     │
│  ├── Authentication                                          │
│  ├── Mail                                                   │
│  └── Assistant                                              │
│                                                              │
│  Services                                                    │
│  ├── GmailService                                            │
│  ├── AuthService                                             │
│  └── WatchService                                            │
│                                                              │
│  Assistant                                                   │
│  ├── Tools                                                   │
│  └── Orchestrator                                            │
│                                                              │
│  WebSocket Gateway                                           │
└───────────────┬───────────────────────┬──────────────────────┘
                │                       │
                ▼                       ▼
       ┌────────────────┐      ┌──────────────────┐
       │   Gmail API    │      │   Groq API       │
       │                │      │                  │
       │ list/get/send  │      │ Tool Calling     │
       │ history/watch  │      │ AI Reasoning     │
       └───────┬────────┘      └──────────────────┘
               │
               ▼
       ┌────────────────────┐
       │ Google Cloud       │
       │ Pub/Sub            │
       │                    │
       │ Gmail notifications│
       └────────────────────┘

       ┌────────────────────┐
       │ PostgreSQL         │
       │ + Prisma           │
       │                    │
       │ Auth/session data  │
       │ Gmail watch state  │
       │ Assistant history  │
       └────────────────────┘
Technology Stack
Frontend
React
TypeScript
Vite
Zustand
Tailwind CSS
Socket.IO Client
DOMPurify
Backend
Node.js
Express
TypeScript
Prisma
PostgreSQL
Socket.IO
Zod
JSON Web Tokens
Helmet
Express Rate Limit
AI
Groq API
OpenAI-compatible tool/function calling interface
Configurable Groq model through GROQ_MODEL
Google
Google OAuth
Gmail API
Google Cloud Pub/Sub
Database
PostgreSQL
Prisma ORM
Neon PostgreSQL
Testing
Vitest
React Testing Library
Gmail Integration

The application uses the real Gmail API.

Gmail is the source of truth for:

Emails
Threads
Labels
Inbox state
Sent mail
Trash
Spam
Starred messages

Email content is not duplicated into a separate application mail database.

The backend fetches mail data from Gmail when required.

PostgreSQL is used for application-level data such as:

Authentication/session information
Gmail watch bookkeeping
Assistant conversation history
⚡ Real-Time Email Synchronization

Nebula Mail uses Gmail users.watch() together with Google Cloud Pub/Sub.

Flow
New Gmail message
      │
      ▼
Gmail users.watch()
      │
      ▼
Google Cloud Pub/Sub
      │
      ▼
Backend Pull Subscriber
      │
      ▼
Gmail history.list()
      │
      ▼
Fetch changed email
      │
      ▼
Socket.IO
      │
      ▼
Frontend
      │
      ▼
Inbox updates without refresh

The Pub/Sub message contains Gmail change information rather than the full email content.

The backend uses the Gmail History API to determine what changed and then retrieves the relevant message.

The frontend receives the new email through a WebSocket event and updates the inbox immediately.

📬 Mailbox Views

The application supports:

Inbox
Sent
Drafts
Favorites / Starred
Trash
Spam

The assistant can also navigate between these mailbox views.

Examples:

"Show my trash."

"Show spam emails."

"Show my starred emails."

Mailbox counts are also displayed in the application.

🔎 Filters

The application supports:

Date
Sender
Keyword
Read / unread
Combined filters

Filters can be applied manually using the UI controls or through the assistant.

Assistant-applied filters update the visible filter controls as well as the displayed mail list.

⭐ Bonus Features from the Hiring Task

The following features correspond to bonus items explicitly mentioned in the Nebula KnowLab hiring task.

Reply and Forward

The assistant can reply to the currently open email and forward the currently open email.

Example:

"Reply to this saying I'll send it tomorrow."

The assistant resolves the recipient and subject from the currently open email.

Forwarding creates a new Compose draft containing the relevant original email context.

Confirmation Before Sending

Assistant-generated emails require an explicit user confirmation before Gmail receives the message.

The confirmation is enforced through the application flow rather than relying only on an AI instruction.

Rich Email Preview Cards

Assistant search results are displayed as rich email preview cards rather than only plain-text responses.

Thread / Conversation View

Emails belonging to the same Gmail thread can be viewed together as a conversation.

This allows related messages to be viewed in their conversational context.

Automated Tests

The project includes automated frontend and backend tests.

Current results:

Backend:   37 / 37 passing
Frontend:  10 / 10 passing

Total:     47 / 47 passing
Polished UI

The application includes a polished mail-client interface with:

Consistent typography
Structured mailbox navigation
Clear unread indicators
Gmail-style date/time display
Assistant result cards
Compose interactions
Responsive visual feedback
AI field-fill highlighting
🚀 Additional Features Implemented Beyond the Task

The following features were implemented in addition to both the core hiring-task requirements and the explicitly listed bonus items.

Favorites / Starred Mailbox

The application provides a dedicated Favorites / Starred mailbox.

Users can:

View starred emails
Star emails
Unstar emails
Ask the assistant to show starred emails

Example:

"Show my favorite emails."

Trash and Delete Management

The application provides a dedicated Trash mailbox.

Users can move/delete emails and view the Trash mailbox.

The assistant can also navigate to Trash.

Example:

"Show me my trash."

Spam Mailbox

Spam is available as a dedicated mailbox view.

The assistant can navigate to Spam.

Example:

"Show my spam emails."

Mailbox and Search Result Counts

The application displays counts for mailbox views.

Search/filter results also display the number of matching messages.

This allows users to see the size of the current result set directly in the UI.

Assistant Navigation Across Mailboxes

The assistant can navigate beyond Inbox search and open different mailbox views, including:

Inbox
Sent
Drafts
Favorites
Trash
Spam

Examples:

"Show my starred emails."

"Show my trash."

"Show my spam."

Automatic Gmail Watch Renewal

Gmail watch registrations expire after a limited period.

The backend automatically checks watch expiry and renews the Gmail watch before it expires.

This allows real-time synchronization to continue without requiring the user to repeatedly reconnect the mailbox.

Assistant Filter-Control Synchronization

When the assistant applies a filter, the visible filter controls are updated as well.

This keeps:

Assistant state
      =
Application filter state
      =
Visible filter controls

rather than maintaining separate AI-only filter state.

Safe Conversation History Trimming

Assistant conversation history is trimmed at valid turn boundaries.

This prevents an AI tool-call/tool-result pair from being split when older conversation history is removed.

Rate Limiting

Rate limits are applied to important endpoints:

/api/assistant/message
/api/mail/send

This limits repeated assistant requests and externally visible mail actions.

Production WebSocket Authentication

Production Socket.IO connections use a short-lived server-issued socket token in addition to the normal authenticated web session.

This provides authenticated real-time connections while avoiding the need to expose the long-lived session cookie to the separate backend hostname.

🔐 Security
OAuth Tokens

Google access and refresh tokens are kept server-side.

The frontend does not receive Google's OAuth tokens.

Session Authentication

The application uses an HTTP-only authenticated session cookie.

WebSocket Authentication

Socket.IO connections are authenticated using a short-lived socket token issued by the authenticated backend session.

Server-Side Gmail Access

The frontend never directly calls Gmail.

All Gmail operations go through the backend.

AI Tool Restrictions

The assistant has access only to explicitly defined tools.

It cannot:

Execute arbitrary code
Generate frontend JavaScript
Modify arbitrary application state
Render arbitrary HTML
Input Validation

Mutating API routes use Zod validation.

Rate Limiting

Assistant and send endpoints are rate-limited.

Email HTML

Email HTML is sanitized with DOMPurify before rendering in the application.

📁 Project Structure
nebula-mail/
│
├── backend/
│   ├── src/
│   │   ├── assistant/
│   │   │   ├── tools.ts
│   │   │   ├── orchestrator.ts
│   │   │   └── errors.ts
│   │   │
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── mail.ts
│   │   │   └── assistant.ts
│   │   │
│   │   ├── services/
│   │   │   ├── gmailService.ts
│   │   │   ├── authService.ts
│   │   │   └── watchService.ts
│   │   │
│   │   ├── websocket/
│   │   │   └── gateway.ts
│   │   │
│   │   ├── types/
│   │   │   └── mail.ts
│   │   │
│   │   └── __tests__/
│   │
│   ├── prisma/
│   │   └── schema.prisma
│   │
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── assistant/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── store/
│   │   ├── views/
│   │   ├── types/
│   │   └── __tests__/
│   │
│   ├── tailwind.config.js
│   └── package.json
│
└── README.md
🛠️ Local Development
Prerequisites
Node.js 20+
Google Cloud project
Gmail API enabled
Google OAuth credentials
Google Cloud Pub/Sub
PostgreSQL database
Groq API key
Backend
cd backend
npm install
npx prisma generate
npx prisma db push
npm run dev

Backend:

http://localhost:4000
Frontend

Open another terminal:

cd frontend
npm install
npm run dev

Frontend:

http://localhost:5173
🔑 Environment Variables
Backend

Create:

backend/.env

Example:

DATABASE_URL=your_postgresql_connection_string

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:4000/api/auth/google/callback

GROQ_API_KEY=your_groq_api_key
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=openai/gpt-oss-120b

GOOGLE_CLOUD_PROJECT_ID=your_google_cloud_project_id
GMAIL_PUBSUB_TOPIC=projects/PROJECT_ID/topics/TOPIC_NAME
GMAIL_PUBSUB_SUBSCRIPTION=projects/PROJECT_ID/subscriptions/SUBSCRIPTION_NAME

SESSION_JWT_SECRET=your_session_secret
FRONTEND_URL=http://localhost:5173

Do not commit real credentials or service-account keys to Git.

☁️ Google Cloud Setup
Create a Google Cloud project.
Enable the Gmail API.
Configure the OAuth consent screen.
Add the Google account used for testing as a test user.
Create a Web Application OAuth client.
Add the appropriate OAuth redirect URI.
Create a Google Cloud Pub/Sub topic.
Create a Pull subscription.
Grant Gmail's publishing service account permission to publish to the topic.
Configure the backend with the Pub/Sub topic and subscription.
Configure a service account with the required Pub/Sub permissions.
Configure the service-account credentials for the backend.
🌐 Production Deployment

The current application is deployed using Render.

Frontend

Live Application:

https://nebula-mail-8mja.onrender.com

Backend

https://nebula-mail-backend-qawz.onrender.com

The frontend communicates with the backend through the /api rewrite configuration.

Production environment variables are configured through Render.

The backend runs as a long-running process because it maintains:

WebSocket connections
Gmail Pub/Sub subscription handling
Gmail watch renewal
🧪 Testing
Backend
cd backend
npm test

Current result:

Test Files  6 passed
Tests       37 passed
Frontend
cd frontend
npm test

Current result:

Test Files  2 passed
Tests       10 passed
Production Build
cd frontend
npm run build

The production TypeScript and Vite build completes successfully.

Current Test Summary
Backend tests:        37 / 37 ✅
Frontend tests:       10 / 10 ✅
Total automated tests: 47 / 47 ✅
Production build:      ✅
🎥 Demo Flow

The recommended demonstration sequence is:

1. Google Login

Sign in using Google OAuth.

2. Inbox

Show the real Gmail inbox and mailbox counts.

3. Assistant Search

Ask:

"Show me emails from the last 10 days."

Show that the main mail UI updates.

4. Search by Sender

Ask:

"Find emails from Rosiee."

Show the search results and count.

5. Open Email

Ask:

"Open the latest email from Rosiee."

Show that the correct email opens.

6. Context-Aware Reply

With the email open:

"Reply to this saying I'll be there."

Show the Compose UI being populated.

7. Assistant Compose

Ask:

"Send an email to [test address] with subject Meeting Tomorrow and say Let's meet at 3 PM."

Show the fields being filled visibly.

8. Confirmation

Show that the assistant prepares the email and waits for user confirmation.

9. Send

Click the confirmation button and show the real email being sent through Gmail.

10. Additional Mailbox Features

Demonstrate:

"Show my starred emails."

"Show my trash."

"Show my spam."

11. Real-Time Sync

Send an email to the connected Gmail account from another address.

Show the new email appearing in the application without refreshing the page.

12. Thread View

Open a conversation and show the messages grouped by Gmail thread.

⚙️ Engineering Decisions and Trade-offs
Gmail as the Source of Truth

Email data is not duplicated into PostgreSQL.

This avoids maintaining a second mail database and reduces synchronization problems.

Typed AI Directives

The AI does not directly manipulate React state.

Instead:

AI Tool
  ↓
Typed Directive
  ↓
Frontend Action Executor
  ↓
Zustand
  ↓
UI

This makes AI actions deterministic and easier to test.

Human Confirmation

Sending requires an explicit user click.

This provides a stronger guarantee than relying only on an AI prompt instruction.

Pub/Sub Pull Subscription

The implementation uses a Pub/Sub pull subscriber rather than an HTTPS webhook.

This keeps the deployment simpler while still using Gmail's event-driven notification mechanism.

PostgreSQL

PostgreSQL is used in both development and production to avoid differences between local and deployed database engines.

In-Process Watch Renewal

Watch renewal is handled inside the backend process.

For a larger multi-instance production system, this could be moved into a dedicated scheduled worker.

🔮 Known Limitations / Future Improvements

The current implementation is intentionally scoped for the hiring task.

Potential future improvements include:

More extensive end-to-end browser testing
Per-user rate limiting instead of IP-based rate limiting
Dedicated background worker for Gmail watch renewal
More advanced mailbox pagination
Multiple assistant conversation sessions
More granular permissions and auditing
More advanced Gmail label management
🏆 Submission Highlights

The implementation focuses on the main requirement of the task:

The AI assistant should control the mail application rather than functioning as a separate chatbot.

The completed system follows:

Natural Language
      ↓
AI Tool Calling
      ↓
Real Gmail Operation
      ↓
Typed UI Directive
      ↓
Actual Application State
      ↓
Visible UI Update

In addition to the required functionality, the project includes the bonus features specified in the hiring task and a separate set of additional features implemented beyond the stated task scope.

🔗 Links
Live Application

👉 https://nebula-mail-8mja.onrender.com

Demo Video

🎥 Watch the Nebula Mail Demo

GitHub Repository

https://github.com/poojapandian6/nebula-mail
