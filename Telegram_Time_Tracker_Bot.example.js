/**
 * Telegram Time-Sampling Bot for Google Apps Script
 * Version: 1.4.0
 *
 * Automatically tracks activities in Google Sheets via periodic Telegram check-ins.
 */

const APP_VERSION = "1.4.0";
const LAST_UPDATED = "2026-09-19 11:50 Kyiv";

// Telegram Bot API Token (obtained via @BotFather)
const BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN";

// Timezone used for timestamps and wakeup calculations
const TIMEZONE = "Europe/Kyiv";

// Morning wakeup schedule after sleep command (09:30)
const MORNING_WAKEUP_HOUR = 9;
const MORNING_WAKEUP_MINUTE = 30;

// Snooze interval if ping is ignored (minutes)
const IGNORE_RETRY_MINUTES = 30;

// Default tracking interval if not specified (minutes)
const DEFAULT_INTERVAL_MINUTES = 30;

/**
 * Diagnostic HTTP GET endpoint.
 * Returns JSON with system status, active triggers, and runtime properties.
 * Append ?ping=1 to trigger an immediate ping to Telegram.
 */
function doGet(e) {
  const props = PropertiesService.getScriptProperties();

  if (e && e.parameter && e.parameter.ping) {
    sendPing();
  }

  const triggers = ScriptApp.getProjectTriggers().map(t => ({
    handler: t.getHandlerFunction(),
    id: t.getUniqueId()
  }));

  const info = {
    status: "ok",
    appName: "Telegram Time-Sampling Bot",
    version: APP_VERSION,
    lastUpdated: LAST_UPDATED,
    currentTime: Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd HH:mm:ss"),
    chatIdSaved: props.getProperty("MY_CHAT_ID") || "NONE",
    lastReceivedText: props.getProperty("LAST_TEXT") || "NONE",
    lastTask: props.getProperty("LAST_TASK") || "NONE",
    lastMins: props.getProperty("LAST_MINS") || "NONE",
    nextPingTime: props.getProperty("NEXT_PING_TIME") || "NONE",
    activeTriggersCount: triggers.length,
    activeTriggers: triggers.map(t => t.handler),
    lastApiResponse: props.getProperty("LAST_API_RESPONSE") || "NONE",
    lastError: props.getProperty("LAST_ERROR") || "NONE"
  };

  return ContentService.createTextOutput(JSON.stringify(info, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Telegram Webhook HTTP POST handler.
 * Processes incoming messages and inline keyboard callback queries.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return HtmlService.createHtmlOutput("No data");
    }

    const contents = JSON.parse(e.postData.contents);

    if (contents.callback_query) {
      handleCallback(contents.callback_query);
      return HtmlService.createHtmlOutput("OK");
    }

    if (contents.message && contents.message.text) {
      handleTextMessage(contents.message);
      return HtmlService.createHtmlOutput("OK");
    }
  } catch (err) {
    PropertiesService.getScriptProperties().setProperty("LAST_ERROR", "doPost: " + err.toString());
  }
  return HtmlService.createHtmlOutput("OK");
}

/**
 * Checks if the user message indicates an intent to sleep.
 */
function isSleepIntent(rawText) {
  const t = rawText.toLowerCase().trim();
  const sleepTriggers = [
    "сон", "спати", "спать", "сплю", "засинаю", "на добраніч",
    "спокійної ночі", "ліг спати", "лягаю", "лягаю спати",
    "іду спати", "йду спати", "пішов спати", "спать ліг"
  ];
  return sleepTriggers.some(trigger => t === trigger || t.includes(trigger));
}

/**
 * Handles incoming text messages from Telegram.
 */
function handleTextMessage(msg) {
  try {
    const chatId = msg.chat.id;
    const rawText = (msg.text || "").trim();

    PropertiesService.getScriptProperties().setProperty("MY_CHAT_ID", chatId.toString());
    PropertiesService.getScriptProperties().setProperty("LAST_TEXT", rawText);
    PropertiesService.getScriptProperties().setProperty("IGNORE_COUNT", "0");

    if (rawText === "/start" || rawText === "/ping") {
      sendMessage(chatId, "👋 Привіт! Бот на зв'язку.\nНапиши чим зараз займаєшся, або чекай нагадування.");
      sendPing();
      return;
    }

    if (rawText === "/version" || rawText === "/ver") {
      sendMessage(chatId, `🤖 Версія бота: v${APP_VERSION}\n📅 Збірка: ${LAST_UPDATED}\n✅ Працює стабільно!`);
      return;
    }

    if (isSleepIntent(rawText)) {
      activateSleepMode(chatId);
      return;
    }

    const parsed = parseTextAndMinutes(rawText);
    let minutes = parsed.minutes;

    if (!minutes) {
      minutes = parseInt(PropertiesService.getScriptProperties().getProperty("LAST_MINS") || DEFAULT_INTERVAL_MINUTES.toString(), 10);
    } else {
      PropertiesService.getScriptProperties().setProperty("LAST_MINS", minutes.toString());
    }

    const taskName = parsed.task;
    PropertiesService.getScriptProperties().setProperty("LAST_TASK", taskName);

    logActivity(taskName, minutes);
    scheduleNextPing(minutes);
    const nextTime = getFutureTimeStr(minutes);

    const adjustKeyboard = {
      inline_keyboard: [
        [
          { text: "⏱️ 15 хв", callback_data: "t:15" },
          { text: "⏱️ 30 хв", callback_data: "t:30" },
          { text: "⏱️ 45 хв", callback_data: "t:45" }
        ],
        [
          { text: "⏱️ 1 год", callback_data: "t:60" },
          { text: "⏱️ 1.5 год", callback_data: "t:90" },
          { text: "🌙 На ніч", callback_data: "action:sleep" }
        ]
      ]
    };

    sendMessage(chatId, `✅ Зафіксовано: «${taskName}» на ${minutes} хв.\n⏱️ Наступний пінг о ${nextTime} ⏳\n\n(Якщо потрібен інший час — оберіть кнопку нижче)`, adjustKeyboard);
  } catch (err) {
    PropertiesService.getScriptProperties().setProperty("LAST_ERROR", "handleTextMessage: " + err.toString());
  }
}

/**
 * Handles callback queries from inline buttons.
 */
function handleCallback(callback) {
  try {
    const chatId = callback.message.chat.id;
    const messageId = callback.message.message_id;
    const data = callback.data;

    PropertiesService.getScriptProperties().setProperty("IGNORE_COUNT", "0");
    PropertiesService.getScriptProperties().setProperty("MY_CHAT_ID", chatId.toString());

    if (data === "action:sleep") {
      logActivity("🌙 Сон / Відпочинок", 0);
      const wakeUpStr = scheduleMorningPing();
      editMessage(chatId, messageId, `🌙 На добраніч! Записав сон у таблицю.\nНаступний пінг буде вранці о ${wakeUpStr} ☕`, null);
      return;
    }

    if (data === "action:same") {
      const lastTask = PropertiesService.getScriptProperties().getProperty("LAST_TASK") || "Попередня справа";
      const lastMins = parseInt(PropertiesService.getScriptProperties().getProperty("LAST_MINS") || DEFAULT_INTERVAL_MINUTES.toString(), 10);

      logActivity(lastTask, lastMins);
      scheduleNextPing(lastMins);
      const nextTime = getFutureTimeStr(lastMins);

      editMessage(chatId, messageId, `🔄 Продовжуємо: «${lastTask}» ще на ${lastMins} хв.\n⏱️ Наступний пінг о ${nextTime} ⏳`, null);
      return;
    }

    if (data.startsWith("t:")) {
      const minutes = parseInt(data.substring(2), 10);
      const taskName = PropertiesService.getScriptProperties().getProperty("LAST_TASK") || "Поточна справа";

      PropertiesService.getScriptProperties().setProperty("LAST_MINS", minutes.toString());
      updateOrLogActivity(taskName, minutes);

      scheduleNextPing(minutes);
      const nextTime = getFutureTimeStr(minutes);

      editMessage(chatId, messageId, `✅ «${taskName}» скориговано на ${minutes} хв.\n⏱️ Наступний пінг о ${nextTime} ⏳`, null);
      return;
    }
  } catch (err) {
    PropertiesService.getScriptProperties().setProperty("LAST_ERROR", "handleCallback: " + err.toString());
  }
}

/**
 * Activates overnight sleep mode and schedules morning wakeup.
 */
function activateSleepMode(chatId) {
  logActivity("🌙 Сон / Відпочинок", 0);
  const wakeUpStr = scheduleMorningPing();
  sendMessage(chatId, `🌙 На добраніч! Записав сон у таблицю.\nНаступний пінг буде вранці о ${wakeUpStr} ☕`);
}

/**
 * Sends a regular time-sampling ping with interactive action buttons.
 */
function sendPing() {
  try {
    const chatId = PropertiesService.getScriptProperties().getProperty("MY_CHAT_ID");
    if (!chatId) return;

    let ignoreCount = parseInt(PropertiesService.getScriptProperties().getProperty("IGNORE_COUNT") || "0", 10);

    // Stop pinging after 2 consecutive unanswered pings to avoid spamming
    if (ignoreCount >= 2) {
      return;
    }

    PropertiesService.getScriptProperties().setProperty("IGNORE_COUNT", (ignoreCount + 1).toString());
    scheduleNextPing(IGNORE_RETRY_MINUTES);

    const timeStr = Utilities.formatDate(new Date(), TIMEZONE, "HH:mm");
    const lastTask = PropertiesService.getScriptProperties().getProperty("LAST_TASK");
    const isWakingUpFromSleep = (lastTask === "🌙 Сон / Відпочинок");

    const buttons = [];
    if (lastTask && !isWakingUpFromSleep) {
      buttons.push([{ text: `🔄 Продовжую «${lastTask}»`, callback_data: "action:same" }]);
    }
    buttons.push([
      { text: `🌙 Йду спати (до ${String(MORNING_WAKEUP_HOUR).padStart(2, "0")}:${String(MORNING_WAKEUP_MINUTE).padStart(2, "0")})`, callback_data: "action:sleep" }
    ]);

    let prefix = "🔔";
    if (ignoreCount > 0) {
      prefix = "🔔 Нагадую ще раз:";
    } else if (isWakingUpFromSleep) {
      prefix = "🌅 Доброго ранку!";
    }

    sendMessage(chatId, `${prefix} [${timeStr}] Що робиш прямо зараз?\n(напиши відповідь у чат або обери кнопку)`, { inline_keyboard: buttons });
  } catch (err) {
    PropertiesService.getScriptProperties().setProperty("LAST_ERROR", "sendPing: " + err.toString());
  }
}

/**
 * Schedules the next ping after the given number of minutes.
 */
function scheduleNextPing(minutes) {
  try {
    deleteTriggersByName("sendPing");

    const future = new Date(new Date().getTime() + minutes * 60 * 1000);
    const nextStr = Utilities.formatDate(future, TIMEZONE, "yyyy-MM-dd HH:mm");
    PropertiesService.getScriptProperties().setProperty("NEXT_PING_TIME", nextStr);

    ScriptApp.newTrigger("sendPing")
      .timeBased()
      .after(minutes * 60 * 1000)
      .create();
  } catch (err) {
    PropertiesService.getScriptProperties().setProperty("LAST_ERROR", "scheduleNextPing: " + err.toString());
  }
}

/**
 * Schedules morning ping based on target wakeup time, independent of server timezone.
 */
function scheduleMorningPing() {
  try {
    deleteTriggersByName("sendPing");

    const now = new Date();
    const currentHour = parseInt(Utilities.formatDate(now, TIMEZONE, "HH"), 10);
    const currentMin = parseInt(Utilities.formatDate(now, TIMEZONE, "mm"), 10);
    const currentSec = parseInt(Utilities.formatDate(now, TIMEZONE, "ss"), 10);

    const currentSeconds = currentHour * 3600 + currentMin * 60 + currentSec;
    const targetWakeupSeconds = MORNING_WAKEUP_HOUR * 3600 + MORNING_WAKEUP_MINUTE * 60;

    let diffSeconds = 0;
    if (currentSeconds < targetWakeupSeconds) {
      diffSeconds = targetWakeupSeconds - currentSeconds;
    } else {
      diffSeconds = (86400 - currentSeconds) + targetWakeupSeconds;
    }

    const wakeUpDate = new Date(now.getTime() + diffSeconds * 1000);
    const wakeUpStr = Utilities.formatDate(wakeUpDate, TIMEZONE, "HH:mm");
    const fullDateStr = Utilities.formatDate(wakeUpDate, TIMEZONE, "yyyy-MM-dd HH:mm");

    PropertiesService.getScriptProperties().setProperty("NEXT_PING_TIME", fullDateStr);
    PropertiesService.getScriptProperties().setProperty("LAST_TASK", "🌙 Сон / Відпочинок");

    ScriptApp.newTrigger("sendPing")
      .timeBased()
      .at(wakeUpDate)
      .create();

    return wakeUpStr;
  } catch (err) {
    PropertiesService.getScriptProperties().setProperty("LAST_ERROR", "scheduleMorningPing: " + err.toString());
    return `${String(MORNING_WAKEUP_HOUR).padStart(2, "0")}:${String(MORNING_WAKEUP_MINUTE).padStart(2, "0")}`;
  }
}

/**
 * Returns the active sheet or opens/creates "Time Tracker Log" spreadsheet.
 */
function getOrCreateSheet() {
  try {
    let ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) return ss.getActiveSheet();

    const props = PropertiesService.getScriptProperties();
    const sheetId = props.getProperty("SPREADSHEET_ID");
    if (sheetId) {
      try {
        ss = SpreadsheetApp.openById(sheetId);
        if (ss) return ss.getActiveSheet();
      } catch (e) {}
    }

    ss = SpreadsheetApp.create("Time Tracker Log");
    props.setProperty("SPREADSHEET_ID", ss.getId());
    return ss.getActiveSheet();
  } catch (err) {
    PropertiesService.getScriptProperties().setProperty("LAST_ERROR", "getOrCreateSheet: " + err.toString());
    return null;
  }
}

/**
 * Appends a new activity log entry to Google Sheets.
 */
function logActivity(activityText, allocatedMinutes) {
  try {
    const sheet = getOrCreateSheet();
    if (!sheet) return;

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["Дата", "Час", "Що робив", "Виділено часу"]);
      sheet.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground("#1e293b").setFontColor("#ffffff");
    }

    const now = new Date();
    const dateStr = Utilities.formatDate(now, TIMEZONE, "yyyy-MM-dd");
    const timeStr = Utilities.formatDate(now, TIMEZONE, "HH:mm:ss");

    sheet.appendRow([dateStr, timeStr, activityText, allocatedMinutes > 0 ? `${allocatedMinutes} хв` : "—"]);
  } catch (err) {
    PropertiesService.getScriptProperties().setProperty("LAST_ERROR", "logActivity: " + err.toString());
  }
}

/**
 * Updates the last activity row duration or logs a new row.
 */
function updateOrLogActivity(activityText, allocatedMinutes) {
  try {
    const sheet = getOrCreateSheet();
    if (!sheet) return;

    const lastRow = sheet.getLastRow();
    if (lastRow > 1 && sheet.getRange(lastRow, 3).getValue() === activityText) {
      sheet.getRange(lastRow, 4).setValue(`${allocatedMinutes} хв`);
    } else {
      logActivity(activityText, allocatedMinutes);
    }
  } catch (err) {
    PropertiesService.getScriptProperties().setProperty("LAST_ERROR", "updateOrLogActivity: " + err.toString());
  }
}

/**
 * Parses user input for task name and optional duration (e.g. "code 45m", "study 2h").
 */
function parseTextAndMinutes(text) {
  const matchH = text.match(/^(.*?)\s+(\d+)\s*(h|год|годин|години)$/i);
  if (matchH) return { task: matchH[1].trim(), minutes: parseInt(matchH[2], 10) * 60 };

  const matchM = text.match(/^(.*?)\s+(\d+)\s*(m|хв|хвилин|хвилини)?$/i);
  if (matchM && parseInt(matchM[2], 10) > 0) return { task: matchM[1].trim(), minutes: parseInt(matchM[2], 10) };

  return { task: text, minutes: null };
}

/**
 * Calculates a future timestamp string (HH:mm) from the current time.
 */
function getFutureTimeStr(minutes) {
  const future = new Date(new Date().getTime() + minutes * 60 * 1000);
  return Utilities.formatDate(future, TIMEZONE, "HH:mm");
}

/**
 * Removes all project triggers assigned to a specific handler function.
 */
function deleteTriggersByName(funcName) {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === funcName) {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
  } catch (e) {}
}

/**
 * Sends a message via Telegram Bot API.
 */
function sendMessage(chatId, text, replyMarkup = null) {
  const payload = {
    chat_id: chatId,
    text: text
  };
  if (replyMarkup) payload.reply_markup = JSON.stringify(replyMarkup);
  sendApiRequest("sendMessage", payload);
}

/**
 * Edits an existing message text via Telegram Bot API.
 */
function editMessage(chatId, messageId, text, replyMarkup = null) {
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text: text
  };
  if (replyMarkup) payload.reply_markup = JSON.stringify(replyMarkup);
  sendApiRequest("editMessageText", payload);
}

/**
 * Executes an HTTP POST request to the Telegram Bot API.
 */
function sendApiRequest(method, payload) {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    const resp = UrlFetchApp.fetch(url, options);
    const respText = resp.getContentText();
    PropertiesService.getScriptProperties().setProperty("LAST_API_RESPONSE", respText);
  } catch (err) {
    PropertiesService.getScriptProperties().setProperty("LAST_ERROR", "sendApiRequest: " + err.toString());
  }
}

/**
 * Self-test function to initialize properties and grant Google Apps Script authorizations.
 * Run this function directly from the Apps Script editor after pasting code.
 */
function testSetup() {
  Logger.log("Testing PropertiesService...");
  PropertiesService.getScriptProperties().setProperty("TEST", "OK");

  Logger.log("Testing Google Spreadsheet access...");
  const sheet = getOrCreateSheet();
  if (sheet) {
    logActivity("Тестовий запуск бота", 30);
    Logger.log("Spreadsheet initialized successfully.");
  }

  Logger.log("Testing morning trigger calculation...");
  scheduleMorningPing();

  const chatId = PropertiesService.getScriptProperties().getProperty("MY_CHAT_ID");
  if (chatId) {
    Logger.log("Testing Telegram message delivery...");
    sendMessage(chatId, `🤖 Тестове повідомлення успішне! Версія: v${APP_VERSION}`);
  }

  Logger.log("All setup checks passed successfully.");
}

/**
 * Automatically binds the Telegram Webhook to this deployed Web App URL.
 * Run this function directly from the Apps Script dropdown after deploying.
 */
function setWebhook() {
  const url = ScriptApp.getService().getUrl();
  if (!url) {
    Logger.log("⚠️ Спочатку розгорніть скрипт як веб-додаток (Deploy -> New deployment -> Web app).");
    return;
  }
  const targetUrl = url.replace("/dev", "/exec");
  const resp = UrlFetchApp.fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${encodeURIComponent(targetUrl)}`);
  Logger.log("Результат setWebhook: " + resp.getContentText());
}

/**
 * Checks current Telegram Webhook registration status.
 */
function getWebhookInfo() {
  const resp = UrlFetchApp.fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
  Logger.log("Інформація про Webhook: " + resp.getContentText());
}

