import urllib.request
import json
import re
import os
import sys

# Ensure UTF-8 output on Windows console
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def get_script_path():
    primary = os.path.join(BASE_DIR, "Telegram_Time_Tracker_Bot.js")
    fallback = os.path.join(BASE_DIR, "Telegram_Time_Tracker_Bot.example.js")
    if os.path.isfile(primary):
        return primary
    if os.path.isfile(fallback):
        return fallback
    return primary

def get_local_version():
    path = get_script_path()
    try:
        if os.path.isfile(path):
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
                m = re.search(r'const APP_VERSION = ["\'](.*?)["\'];', content)
                if m:
                    return m.group(1)
    except Exception as e:
        print(f"Error reading local version: {e}")
    return "Unknown"

def check_deployed_version(url=None, trigger_ping=False):
    local_ver = get_local_version()
    print(f"[*] Local code version: v{local_ver}")

    if not url:
        print("[!] Google Apps Script Web App URL is required.")
        print("    Usage: python scripts/check_version.py <YOUR_WEB_APP_URL> [--ping]")
        return

    print(f"[*] Checking deployed version on Google servers...")

    if trigger_ping:
        separator = "&" if "?" in url else "?"
        url += f"{separator}ping=1"

    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0"}
        )
        with urllib.request.urlopen(req, timeout=12) as response:
            data = json.loads(response.read().decode("utf-8"))
            deployed_ver = data.get("version", "Unknown")
            build_time = data.get("lastUpdated", "Unknown")
            kyiv_time = data.get("currentTime", data.get("currentTimeKyiv", "Unknown"))
            chat_id = data.get("chatIdSaved", "NONE")
            last_text = data.get("lastReceivedText", "NONE")
            last_task = data.get("lastTask", "NONE")
            last_mins = data.get("lastMins", "NONE")
            next_ping = data.get("nextPingTime", "NONE")
            active_triggers = data.get("activeTriggersCount", 0)
            triggers_list = data.get("activeTriggers", [])
            last_api = data.get("lastApiResponse", "NONE")
            last_err = data.get("lastError", "NONE")

            print(f"[+] Deployed version in cloud: v{deployed_ver} ({build_time})")
            if deployed_ver == local_ver:
                print(f"[OK] STATUS: Versions match (v{local_ver})! Deployment is up to date.")
            else:
                print(f"[WARN] STATUS: Deployed version (v{deployed_ver}) differs from local (v{local_ver}).")

            print("\n📊 BOT STATUS DIAGNOSTICS:")
            print(f"  • Current time: {kyiv_time}")
            print(f"  • Chat ID: {chat_id}")
            print(f"  • Last user message: «{last_text}»")
            print(f"  • Last logged task: «{last_task}» ({last_mins} min)")
            print(f"  • Next scheduled ping: {next_ping}")
            print(f"  • Active background triggers: {active_triggers} ({', '.join(triggers_list) if triggers_list else 'none'})")
            print(f"  • Last Telegram API response: {last_api[:80]}...")
            print(f"  • Errors: {last_err}")
    except Exception as e:
        print(f"[!] Failed to fetch status via GET request ({e}).")

if __name__ == "__main__":
    ping = "--ping" in sys.argv
    args = [a for a in sys.argv[1:] if a != "--ping"]
    target_url = args[0] if args else os.environ.get("TIME_TRACKER_WEB_APP_URL")
    check_deployed_version(url=target_url, trigger_ping=ping)
