# 🕒 Telegram Time Tracker & Habit Sampling Bot

A lightweight, serverless Telegram bot for automated habit and activity tracking using the **Time Sampling** technique. Powered by **Google Apps Script** and logging directly into **Google Sheets**, it runs **100% free, 24/7** without requiring any VPS, Docker, or self-hosted server.

---

## ✨ Features

- ⏱️ **Time Sampling Check-ins**: Periodically prompts you with *“What are you working on right now?”* to keep you focused and accountable.
- ⚡ **Flexible Time & Task Input**:
  - `coding 45` or `coding 45m` — logs "coding" for 45 minutes.
  - `thesis 1h` or `thesis 2h` — logs hours automatically converted to minutes.
  - `reading` — omitting the duration automatically reuses your last duration interval (default: 30 minutes).
- 🎛️ **Interactive Inline Keyboards**:
  - Quick adjustment buttons: `⏱️ 15 min`, `⏱️ 30 min`, `⏱️ 45 min`, `⏱️ 1 hr`, `⏱️ 1.5 hr`.
  - Repeat previous task: `🔄 Continue «...»`.
  - Bedtime snooze: `🌙 Sleep mode`.
- 🌙 **Smart Sleep Mode**:
  - Automatically recognizes sleep intents from natural language text (*"sleep"*, *"going to sleep"*, *"good night"*, etc.) or the sleep button.
  - Logs sleep to your sheet and schedules a silent snooze until your designated morning wake-up time (default: **09:30**).
  - Calculates wake-up time independently of Google Cloud server timezones.
- 🔕 **Anti-Spam Snooze**: Automatically pauses pings after 2 consecutive ignored notifications so it never spams you while you are away.
- 📊 **Automatic Google Sheets Logging**:
  - Creates and formats a `Time Tracker Log` spreadsheet on your Google Drive automatically upon first launch.
  - Formats columns: `Date`, `Time`, `Activity`, and `Duration`.
- 🔍 **Diagnostics & CLI Tool**:
  - Built-in HTTP GET diagnostic endpoint returning live JSON status and trigger health.
  - CLI script ([`scripts/check_version.py`](scripts/check_version.py)) to verify deployment status from your local terminal.

---

## 📁 Repository Structure

```text
├── Telegram_Time_Tracker_Bot.example.js   # Production-ready Apps Script bot template
├── .gitignore                             # Protects credentials and local data
├── scripts/
│   └── check_version.py                   # Local CLI diagnostic tool
├── LICENSE                                # MIT License
└── README.md                              # Documentation & setup guide
```

> [!IMPORTANT]
> Your real bot tokens and credentials should never be committed. The repository includes `.gitignore` rules for `Telegram_Time_Tracker_Bot.js` and local credentials.

---

## 🚀 Step-by-Step Setup Guide

### Step 1. Create a Telegram Bot
1. Open Telegram and search for [@BotFather](https://t.me/BotFather).
2. Send the `/newbot` command.
3. Choose a display name (e.g., `My Time Tracker`).
4. Choose a username ending in `bot` (e.g., `my_sample_tracker_bot`).
5. Copy the generated **HTTP API Token** (format: `1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ`). Keep this private.

---

### Step 2. Create a Google Apps Script Project
1. Navigate to [script.google.com](https://script.google.com) (make sure you are signed into your Google account).
2. Click **"New project"** in the top-left corner.
3. Rename the project to `Time Tracker Bot` (or any name you prefer).

---

### Step 3. Add the Bot Script
1. Open [`Telegram_Time_Tracker_Bot.example.js`](Telegram_Time_Tracker_Bot.example.js) in this repository.
2. Copy the entire file content.
3. In the Google Apps Script editor, replace all code in `Code.gs` with the copied script.

---

### Step 4. Configure Your Token & Preferences
At the top of the script, insert your Telegram bot token and customize your configuration if desired:

```javascript
// Paste your Telegram Bot API token from @BotFather:
const BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN";

// Your local timezone:
const TIMEZONE = "Europe/Kyiv";

// Morning wake-up time after sleep mode (09:30):
const MORNING_WAKEUP_HOUR = 9;
const MORNING_WAKEUP_MINUTE = 30;

// Retry interval if a ping is ignored (minutes):
const IGNORE_RETRY_MINUTES = 30;

// Default check-in interval if not specified (minutes):
const DEFAULT_INTERVAL_MINUTES = 30;
```

Click **Save** (`Ctrl + S` or the floppy disk icon).

---

### Step 5. Authorize Google Permissions
1. In the toolbar at the top of the editor, select the **`testSetup`** function from the dropdown list.
2. Click **Run**.
3. A popup titled **"Authorization required"** will appear:
   - Click **Review permissions**.
   - Select your Google account.
   - Click **Advanced** (bottom-left) ➔ **Go to Time Tracker Bot (unsafe)**.
   - Click **Allow**.
4. In the Execution log at the bottom, you should see:
   `All setup checks passed successfully.`
   *(A new `Time Tracker Log` spreadsheet will automatically be created in your Google Drive).*

---

### Step 6. Deploy as a Web App
1. In the top-right corner, click **Deploy** ➔ **New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Configure the deployment settings:
   - **Description**: `v1.4.0`
   - **Execute as**: **Me** (`your-email@gmail.com`)
   - **Who has access**: **Anyone**
     *(⚠️ This is required so Telegram servers can reach your webhook endpoint).*
4. Click **Deploy**.
5. Once deployed, you will see the **Web app URL** (ending with `/exec`). You do not need to manually copy it anywhere — the script can connect itself in the next step!

---

### Step 7. Connect Telegram Webhook (1-Click)
No need to concatenate URLs or use curl:
1. In the Apps Script toolbar function dropdown, select **`setWebhook`**.
2. Click **Run**.
3. In the execution log, you will see:
   ```json
   setWebhook response: {"ok": true, "result": true, "description": "Webhook was set"}
   ```
4. Done! The bot has automatically registered its deployed URL with Telegram.

*(Optional: You can verify your connection at any time by selecting the `getWebhookInfo` function and clicking **Run**).*

---

### Step 8. Start Using Your Bot!
1. Open your bot in Telegram and send `/start`.
2. The bot will welcome you and immediately send your first activity check-in.
3. Reply with your current task:
   - `coding 30`
   - or `reading 1h`
   - or select an action from the inline keyboard.
4. Check your [Google Drive](https://drive.google.com) — open the newly generated **`Time Tracker Log`** sheet to view your logged activities in real time!

---

## 🛠️ Commands & Diagnostics

### Bot Chat Commands
- `/start` or `/ping` — Manually trigger an immediate check-in prompt.
- `/version` (or `/ver`) — Display currently deployed bot version and build date.
- Message with *"sleep"*, *"going to bed"*, or *"night"* — Triggers Sleep Mode until your scheduled morning hour.

### Local Python CLI Diagnostics (Optional)
You can optionally monitor the bot and inspect active cloud triggers directly from your terminal:
```bash
python scripts/check_version.py https://script.google.com/macros/s/<YOUR_DEPLOYMENT_ID>/exec
```
To trigger an immediate Telegram ping from your terminal:
```bash
python scripts/check_version.py https://script.google.com/macros/s/<YOUR_DEPLOYMENT_ID>/exec --ping
```

---

## ❓ Frequently Asked Questions (FAQ)

<details>
<summary><b>1. I updated the script code in Apps Script, but the bot is still running old logic?</b></summary>
When updating code in Google Apps Script, you must create a new deployment version:
1. Click <b>Deploy</b> ➔ <b>Manage deployments</b>.
2. Select your active Web App deployment and click the <b>Edit</b> (pencil) icon.
3. In the <b>Version</b> dropdown, select <b>New version</b>.
4. Click <b>Deploy</b>.
</details>

<details>
<summary><b>2. The bot does not respond to messages in Telegram?</b></summary>
1. Ensure that <code>Who has access</code> was set to <b>Anyone</b> during deployment. If set to "Only myself", Telegram cannot access the webhook.<br>
2. Run the <code>setWebhook</code> function in the editor to make sure Telegram points to the correct deployment URL.<br>
3. Open your Web App URL (<code>https://script.google.com/macros/s/.../exec</code>) in your browser — it should return a JSON status report with diagnostic information and error details.
</details>

<details>
<summary><b>3. Can I use an existing Google Sheet instead of the automatically generated one?</b></summary>
Yes! Open your existing spreadsheet, copy its ID from the browser URL (the long string between <code>/d/</code> and <code>/edit</code>). Then in Google Apps Script:
1. Go to <b>Project Settings</b> (gear icon on the left panel).
2. Under <b>Script Properties</b>, click <b>Add script property</b>.
3. Property: <code>SPREADSHEET_ID</code>, Value: <code>your_sheet_id</code>.
4. Click <b>Save script properties</b>.
</details>

<details>
<summary><b>4. How do I change the wake-up time or timezone?</b></summary>
Modify the constants at the top of the script:
- <code>TIMEZONE = "Europe/Kyiv"</code> (or your timezone, e.g. <code>"America/New_York"</code>).
- <code>MORNING_WAKEUP_HOUR = 9</code> and <code>MORNING_WAKEUP_MINUTE = 30</code>.
</details>

---

## 📄 License

This project is licensed under the [MIT License](LICENSE). Feel free to use, modify, and distribute it as needed.
