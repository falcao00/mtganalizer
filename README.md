# MTGA Stats

A desktop app for analyzing your **MTG Arena** matches: wins and losses in charts, performance by
format, most-played decks, card analysis (yours and your opponents') and win rate on the Play × Draw.

Everything runs locally: the app reads the log that Arena itself writes on your computer and keeps the
history in a SQLite database. No account data is sent anywhere.

---

## 1. Requirements

- **Windows 10 or 11** (the window uses WebView2, which ships with Windows).
- **MTG Arena** installed (Steam, Epic or the Wizards installer).
- **Python 3.10 or later**, only to run from source or build the executable.
  Download it from <https://www.python.org/downloads/> and check *"Add Python to PATH"* during setup.

## 2. Turn on detailed logs in Arena (required)

Without this, Arena doesn't write matches to the log and the app stays empty.

1. Open MTG Arena.
2. Go to **Options (gear) → Account**.
3. Check **Detailed Logs (Plugin Support)**.
4. **Close the game and open it again.**

Only matches played **after** turning the option on show up.

## 3. Installation

### With the installer (recommended)

Download **`MTGA-Stats-Setup-<version>.exe`** from the [latest release](https://github.com/falcao00/mtganalizer/releases/latest)
and run it. No Python or administrator rights needed: the app goes to
`%LOCALAPPDATA%\Programs\MTGA Stats` and gets a Start menu shortcut. To remove it, use
**Settings → Apps**; your history in `%APPDATA%\MTGAStats` is kept.

> The installer isn't digitally signed. If Windows shows "Windows protected your PC",
> click **More info → Run anyway**.

### From source

```bash
git clone https://github.com/falcao00/mtganalizer.git
cd mtganalizer
```

Then pick one of the options below.

### Option A: run directly (simplest)

Double-click **`run.bat`**. The first time, it creates a Python environment (`.venv`) and installs the
dependencies; after that it opens right away.

From a terminal, the equivalent is:

```bash
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python app.py
```

### Option B: build an executable

Double-click **`build_exe.bat`**. When it finishes you get **`dist\MTGA Stats.exe`**, a single file
that runs without Python. Copy it anywhere or create a desktop shortcut.

To also build the installer, install Inno Setup 6 (`winget install JRSoftware.InnoSetup`) and run
**`build_installer.bat 1.0.0`** (the number is the version). The output goes to `dist\installer\`; the
installer script is `installer\MTGAStats.iss`.

### Option C: from VS Code

Open the project folder in VS Code:

- **Ctrl+Shift+B** builds the executable (`dist\MTGA Stats.exe`). The first time it also creates the
  `.venv` and installs the dependencies.
- **F5** opens the app under the debugger (requires Microsoft's **Python** extension). Choose
  "MTGA Stats (com DevTools)" to inspect the interface.
- **Terminal → Run Task…** also has a **Rodar app** task.

> **Important:** keep the project folder in an ordinary location, such as Documents or Downloads.
> Internal folders of packaged apps (for example, inside `AppData\Local\Packages`) prevent the window
> from loading WebView2.

## 4. Usage

1. Play Arena as usual.
2. Open MTGA Stats. It reads the log automatically on startup.
3. If you leave the app open while you play, it checks the log every 15 seconds and adds new matches
   on its own. You can also click **Refresh data** at any time.

The interface opens in Portuguese. Use the **EN-US** button in the bottom-left corner to switch to
English; the choice is saved.

### Don't lose matches

**Arena wipes the log every time the game starts** and keeps only the current and previous sessions
(`Player.log` and `Player-prev.log`). MTGA Stats copies matches into its own database, so:

- open the app at least once every two play sessions, or
- leave the app open while you play.

Matches that have been imported are kept forever, even after Arena deletes the log.

### Filters

The bar at the top filters **every** screen at once:

| Filter | What it does |
|---|---|
| Format | Standard, Historic, Historic Brawl, Alchemy, Draft, Sealed… |
| Queue | Ranked, Play, Limited, Event, Direct challenge |
| Best of | Bo1 or Bo3 |
| Period | Today, last 7/30/90 days or all time |
| Deck | A specific deck |

### Screens

| Screen | What it shows |
|---|---|
| **Overview** | Matches, win rate, games, current streak, results per day, win rate over time, Play × Draw, win rate by format and most-played decks (excluding draft/sealed decks) |
| **Formats** | How much you play each format, wins and losses by format, summary by format and by event |
| **Decks** | Table of all your decks. **Click a deck** to see its trend, its performance against each color combination, the **change history** (cards added and removed between matches, with the W–L of each version) and the **decklist** with card images by mana value |
| **Cards** | Toggle between **My cards** and **Opponents' cards**: how many games they appeared in, your win rate and the mana curve. Use the search box and the minimum games to filter |
| **Opponents** | Your win rate against each color combination (Azorius, Golgari…), most-faced colors and every opponent you've faced (wins, losses, draws, win rate and last match) |
| **Matches** | Full history. **Click a match** to see each game's result and the cards seen on both sides |
| **Limited** | Your drafts and sealed events: date, set (code, e.g. FRA), type (Quick, Premier, Traditional), deck colors and W–L record. **Click a draft** to see its matches |
| **Can I craft this deck?** | Paste a decklist and see which cards you already own, how many are missing by rarity and whether your wildcards are enough to craft it (details below) |

Other tips:

- **Hover over a card name** to see its image (from Scryfall; needs internet).
- **Click a column header** to sort the table.
- The **◐** button in the bottom-left corner toggles light and dark themes.
- The **PT-BR** and **EN-US** buttons next to it switch the interface language (Portuguese or English).
  In English, card names and types are shown in the original too. The choice is saved.
- **Import log…** loads old logs you've kept (a `Player.log` from another date or another PC).

### Decklist

On a deck's screen, the **Decklist** shows images of the cards in the current version, in columns by
mana value from lowest to highest: the commander (in Brawl) comes first and lands come last. Duplicate
copies are stacked with the count (e.g. x4). Images come from Scryfall and need internet. Each image's
address is looked up only once per card and stored in the local database; after that the deck opens
instantly, even after restarting the app.

### Can I craft this deck?

1. Leave **MTG Arena open** (on the home screen, logged in).
2. Export or copy a decklist (in Arena: **Decks → Export**; lists from sites such as MTGGoldfish,
   Moxfield and 17lands also work) and paste it into the **Decklist** box.
3. Click **Check** (or `Ctrl+Enter`).

The app shows:

- a summary saying whether you **can craft it**, whether you **already own everything** or how many
  wildcards you're short;
- the **breakdown by rarity** (commons, uncommons, rares and mythics): how many cards are missing and
  how many wildcards you have of each kind;
- the **card list**, with how many the deck needs, how many you own and how many are missing. Check
  **missing only** to see just what you need to craft.

How it works:

- Arena's log no longer reports which cards you own. So the app reads the collection **directly from
  the memory of the running Arena client** (read-only, like Untapped.gg does). The last read is saved,
  so with Arena closed the app uses the collection from last time and shows its date.
- Wildcards come from the running Arena client or, when it's closed, from the log.
- Copies from any printing count: if you own a card from one set and the list asks for another
  printing, it isn't shown as missing. Basic lands and cards you own 4 copies of are never missing.
- When the list doesn't name the printing, the rarity used is that of the cheapest printing to craft.
- If Arena gets a major update, reading the collection may stop working until MTGA Stats is updated.
  The rest of the app keeps working.

## 5. Where data lives

| What | Path |
|---|---|
| Arena log (read by the app) | `%USERPROFILE%\AppData\LocalLow\Wizards Of The Coast\MTGA\Player.log` |
| MTGA Stats history | `%APPDATA%\MTGAStats\stats.db` |
| Card names and data | Arena's local database: `MTGA_Data\Downloads\Raw\Raw_CardDatabase_*.mtga` |

To back up your history, copy `stats.db`. To start over, delete it.

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| "No matches found yet" | Turn on detailed logs (section 2), restart Arena and play a match |
| "Detailed logs seem to be off" warning | Same thing: turn the option on and restart the game |
| Cards show up as `#12345` | Arena's card database wasn't found. Open Arena once so it downloads the data, then click **Refresh data** |
| The window doesn't open / WebView2 error | Move the project folder to Documents or Downloads (see section 3) |
| Old matches are missing | Arena had already wiped the log before they were imported (see "Don't lose matches") |
| "MTG Arena isn't open" in Can I craft | Open Arena, go to the home screen and click **Reread Arena collection** |
| "No permission to read MTG Arena" | Arena was started as administrator: run MTGA Stats as administrator too |
| Card listed as "not found" | The name doesn't exist in Arena (or is spelled differently). Check the spelling, in English or Portuguese |

## 7. Code layout

```
app.py                  desktop window (pywebview) and the API called by the interface
mtgastats/parser.py     Player.log parsing: matches, games, decks, cards seen, rank
mtgastats/store.py      SQLite database with the history and incremental import
mtgastats/carddb.py     reads Arena's card database (Portuguese names)
mtgastats/collection.py reads the collection and wildcards from Arena's memory (Windows)
mtgastats/craft.py      parses the pasted decklist and compares it with the collection
web/                    interface: index.html, style.css, app.js, i18n.js (English translations)
web/lib/                Chart.js 4.4.1 (charts, bundled to work offline)
run.bat                 opens the app (creates the environment the first time)
build_exe.bat           builds dist\MTGA Stats.exe with PyInstaller
build_installer.bat     builds the Windows installer with Inno Setup
installer/              Inno Setup script (MTGAStats.iss)
```

For development with the browser dev tools, run `python app.py --debug`.
