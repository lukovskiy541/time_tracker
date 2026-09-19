# AGENTS.md

Instructions and guidelines for AI coding assistants and autonomous agents (Cursor, Antigravity, Claude Code, ChatGPT, Devin, Copilot Workspace) working on or deploying this repository.

---

## 1. Project Overview & Architecture

- **Project**: Telegram Time-Sampling & Habit Tracker Bot.
- **Runtime Environment**: **Google Apps Script (GAS)** (V8 JavaScript engine).
- **Backend Infrastructure**: 100% serverless, zero hosting costs. Google Cloud hosts and executes the script 24/7.
- **Database**: **Google Sheets** (auto-creates or links to a `Time Tracker Log` spreadsheet on user's Google Drive via `SpreadsheetApp`).
- **Communication**:
  - **Inbound**: Telegram Webhook -> Google Apps Script HTTP POST endpoint (`doPost(e)`).
  - **Outbound**: Telegram Bot API via `UrlFetchApp.fetch()`.
  - **Timers**: Background scheduling via Google Apps Script Time-driven Triggers (`ScriptApp.newTrigger()`).

---

## 2. Security & Credential Rules

> [!CAUTION]
> **CRITICAL**: Never commit real bot tokens, Google deployment URLs, or personal sheet IDs to git!

- **Local Working File**: [`Telegram_Time_Tracker_Bot.js`](Telegram_Time_Tracker_Bot.js) is ignored by `.gitignore` and may contain the user's live tokens on disk. Do NOT force-track it.
- **Public Template**: [`Telegram_Time_Tracker_Bot.example.js`](Telegram_Time_Tracker_Bot.example.js) is the committed reference template and MUST always contain the placeholder `YOUR_TELEGRAM_BOT_TOKEN`.
- When updating bot logic, apply edits to both [`Telegram_Time_Tracker_Bot.example.js`](Telegram_Time_Tracker_Bot.example.js) (sanitized) and [`Telegram_Time_Tracker_Bot.js`](Telegram_Time_Tracker_Bot.js) (if present locally).

---

## 3. How to Deploy This Bot for a User (Agent Workflow)

When a user asks an AI agent to set up this bot, execute or guide the following workflow:

### Step 1: Obtain Credentials
- Request the user's Telegram Bot API token from `@BotFather` (format: `1234567890:ABC...`).
- Determine the user's local timezone (default: `"Europe/Kyiv"`).

### Step 2: Prepare the Code
- Copy code from [`Telegram_Time_Tracker_Bot.example.js`](Telegram_Time_Tracker_Bot.example.js).
- Replace `BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN"` with the actual token.
- Update `TIMEZONE` if the user is in a different region.

### Step 3: Google Apps Script Setup
- Direct the user (or automate via browser/clasp if available) to [script.google.com](https://script.google.com).
- Create a **New project** and paste the prepared code into `Code.gs`.
- Select function **`testSetup`** in the top toolbar and click **Run**.
  - This initializes `PropertiesService`, creates the Google Sheet log, and requests standard Google permissions (`Drive`, `Spreadsheets`, `External Requests`, `Triggers`).

### Step 4: Web App Deployment
- Click **Deploy** ➔ **New deployment** ➔ Type: **Web app**.
- Settings:
  - **Execute as**: `Me` (`user-email@gmail.com`)
  - **Who has access**: `Anyone` *(mandatory for Telegram Webhook)*
- Click **Deploy**.

### Step 5: 1-Click Webhook Registration
- In the function dropdown, select **`setWebhook`** and click **Run**.
- The script automatically calls `ScriptApp.getService().getUrl()` and binds the `/exec` URL to Telegram.
- Verify that the execution log returns `{"ok": true, "result": true, "description": "Webhook was set"}`.

### Step 6: Verify
- Send `/start` to the bot in Telegram.
- Check that the welcome message and check-in prompt appear.

---

## 4. Key Functions & Code Map

All bot logic is intentionally self-contained within a single file to make copy-pasting into the Google Apps Script editor seamless without requiring npm or build steps.

| Function | Description |
| :--- | :--- |
| `doGet(e)` | Diagnostic HTTP GET endpoint. Returns live JSON status. Supports `?ping=1` to trigger an immediate ping. |
| `doPost(e)` | Webhook receiver. Routes incoming updates to `handleTextMessage` or `handleCallback`. |
| `handleTextMessage(msg)` | Parses text commands (`/start`, `/version`), detects sleep intents, extracts task & duration (`code 45`, `study 1h`). |
| `handleCallback(callback)` | Processes inline keyboard actions: time adjustments (`t:15`, `t:30`), repeat task (`action:same`), bedtime (`action:sleep`). |
| `isSleepIntent(rawText)` | Natural language matching for sleep phrases (*"сон"*, *"sleep"*, *"night"*, etc.). |
| `activateSleepMode(chatId)` | Logs sleep to sheet and schedules morning wake-up ping via `scheduleMorningPing()`. |
| `sendPing()` | Checks `IGNORE_COUNT` (snoozes after 2 missed pings to prevent spam), formats prompt, sends interactive inline keyboard. |
| `scheduleNextPing(mins)` | Deletes old triggers and sets next time-based trigger using `ScriptApp.newTrigger("sendPing")`. |
| `scheduleMorningPing()` | Calculates exact seconds until `MORNING_WAKEUP_HOUR:MORNING_WAKEUP_MINUTE` in `TIMEZONE`, independent of Google server timezone. |
| `getOrCreateSheet()` | Resolves or creates `Time Tracker Log` spreadsheet on user's Google Drive. Formats headers automatically. |
| `setWebhook()` | Automated 1-click webhook registration using `ScriptApp.getService().getUrl()`. |
| `getWebhookInfo()` | Queries Telegram API for current webhook configuration and health. |
| `testSetup()` | Self-test and permission granter for initial deployment. |

---

## 5. CLI Verification Tool

The repository includes a Python diagnostic script: [`scripts/check_version.py`](scripts/check_version.py).

```bash
# Query live deployed bot status
python scripts/check_version.py https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec

# Query status and trigger a test Telegram ping
python scripts/check_version.py https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec --ping
```

It returns:
- Local vs Cloud version matching
- Saved Chat ID & last received text
- Last logged task & duration
- Next scheduled ping time
- Active background triggers count & handlers
- Last Telegram API response and error strings

---

## 6. Coding Constraints for AI Agents

1. **No Node.js / NPM Modules**: Code runs inside Google Apps Script V8 runtime. Do not introduce `require()`, `import`, or Node modules. Use Google Apps Script built-ins (`UrlFetchApp`, `SpreadsheetApp`, `PropertiesService`, `ScriptApp`, `Utilities`).
2. **Execution Time Limit**: Apps Script has a 6-minute hard timeout per execution. Never write synchronous wait/sleep loops; always use `ScriptApp.newTrigger()` for deferred execution.
3. **No AI-Fluff Comments**: Maintain concise, idiomatic JSDoc comments. Do not add numbered comment blocks, banner emojis, or redundant explanations of obvious code.
4. **Timezone Awareness**: Always format timestamps using the configured `TIMEZONE` constant via `Utilities.formatDate(date, TIMEZONE, format)` rather than relying on `new Date().getHours()`, because Google servers run in US timezones (UTC/PST).
