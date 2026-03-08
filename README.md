# 🚀 LinkedIn Automator

> Automate repetitive LinkedIn tasks — job applications, connections, catch-ups, unfollows and more — with human-like safety built in.

[![Edge Add-on](https://img.shields.io/badge/Microsoft%20Edge-Add--on-blue?logo=microsoftedge)](https://microsoftedge.microsoft.com/addons/detail/linkedin-automator/icgaieefobmonhlencgjjgijiogcankf)
**Version:** 1.0.7 &nbsp;|&nbsp; **Manifest:** v3 &nbsp;|&nbsp; **Browser:** Chrome & Edge

---

## 🔗 Install from Store

| Browser | Link |
|---|---|
| **Microsoft Edge** | [LinkedIn Automator on Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/linkedin-automator/icgaieefobmonhlencgjjgijiogcankf) |
| **Chrome** | Load unpacked (see Installation Guide below) |

---

## ✨ Features

### 🎂 Catch Up — Auto-Greetings
- Sends personalized birthday & work anniversary messages to connections
- Filter by: All / Birthday only / Anniversary only
- Tracks **This Week** and **Overall** stats

### 🤝 Connect — Auto-Connect
- Bulk sends connection requests on the "Grow" page
- Configurable daily limit and random delays for safety
- Tracks **This Week** and **Overall** sent requests

### 💼 Apply — Auto-Apply
- Automates LinkedIn Easy Apply job applications
- Remembers your keywords, location, and experience level filters
- Set a session target to stay within safe limits

### 🗑️ Withdraw — Auto-Withdraw
- Withdraws sent connection requests older than **2 weeks**
- Scrolls automatically to load older requests (up to 10 scroll attempts)
- Confirmation modal handled automatically

### 🏢 Pages — Mass Unfollow/Follow
- Processes company pages in bulk from your Following list or search results
- Automatically clicks "Show more results" before scrolling
- Confirmation modal handled automatically

---

## ⚙️ Settings

| Tab | What it does |
|---|---|
| **Analytics** | View daily & weekly stats per feature (Applied, Connects, Catch-Up, Pages, Withdraw) |
| **Limits** | Set daily connect limit, weekly max, and distribution strategy |
| **Filters** | Job search keywords, location, experience level |
| **Profile** | Name, email, phone — used to fill application forms |
| **Library** | Store answers to common job application questions |

---

## � Dark Mode

- Auto-detects your system theme (`prefers-color-scheme`)
- Toggle manually with the **🌙 / ☀️** button in the header
- Preference is remembered across sessions

---

## 🛠️ Manual Installation (Chrome / Developer Mode)

1. Download or clone this repository
2. Open `chrome://extensions/` (Chrome) or `edge://extensions/` (Edge)
3. Enable **Developer mode**
4. Click **Load unpacked** → select the `linkedin_extension` folder
5. Pin the extension icon for quick access

---

## 📖 Quick Start

1. **Auto-Fill your profile**: Go to `Settings → Profile` → click **✨ Auto-Fill Info from Profile** on your LinkedIn profile page
2. **Fill the Library**: Answer the seeded questions (years of experience, etc.) in `Settings → Library`
3. **Set Filters**: Define your job targets in `Settings → Filters`
4. **Start any feature**: Open the relevant tab and hit **Start**

---

## 🛡️ Safety & Privacy

- **All data stays local** — stored in `chrome.storage` only, nothing sent to external servers
- **Human-like delays** — random wait times between every action
- **Security checkpoint detection** — pauses if LinkedIn shows a CAPTCHA
- **Single-task mode** — only one automation runs at a time

---

## 📂 Architecture

```
linkedin_extension/
├── content.js              # Central orchestrator
├── features/               # Core automation logic (apply, connect, catchup, pages, withdraw)
├── popup_scripts/          # Popup UI logic per feature
├── utils.js                # Shared utilities & helpers
├── popup.html / popup.js   # Extension popup UI
└── manifest.json           # Extension config (Manifest v3)
```

---

*Found a bug or have a suggestion? Open an issue or reach out!*
