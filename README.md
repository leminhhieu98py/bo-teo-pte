# Bo cố lên

A private Chrome extension for learning English words.

- **Save:** highlight a word on any web page and press **Control+Shift+S**. Gemini writes the
  Vietnamese meaning, a short explanation, an example and the IPA, and the word is stored in a
  Google Sheet.
- **Review:** every day, review the 30 newest words + 20 random older words (+ words you
  skipped yesterday). Read the Vietnamese meaning, type the English word, then say it out loud.
  Gemini grades the pronunciation with a strong focus on word stress. Pass with 70+ points and
  correct stress. After 3 failed tries you may skip; the word comes back tomorrow.

Mochi the cat cheers you on with confetti, stars, combos, XP and a daily streak.

## For the learner: install (one time)

Requirements: macOS, Google Chrome, git.

```bash
git clone https://github.com/leminhhieu98py/bo-teo-pte.git
cd bo-teo-pte
./start.sh
```

`start.sh` asks for 3 values the first time (Apps Script URL, Sheet token, Gemini API key),
then opens Chrome and walks you through "Load unpacked". After that, Bo cố lên lives in Chrome;
you do not need to run anything every day.

The first time you review, Chrome asks for microphone access: click **Allow**. If macOS blocks
it, open **System Settings > Privacy & Security > Microphone** and turn on **Google Chrome**.

### Getting updates

```bash
cd bo-teo-pte
./start.sh
```

Answer `y` to "already added", then click the reload arrow on the Bo cố lên card in
`chrome://extensions`.

## For the owner: backend setup (one time)

### 1. Google Sheet + Apps Script

1. Open the Google Sheet, then **Extensions > Apps Script**.
2. Replace everything in `Code.gs` with [`apps-script/Code.gs`](apps-script/Code.gs).
3. Change `TOKEN` to your own random secret (for example the output of `openssl rand -hex 16`).
   If the script was not opened from the sheet, also set `SHEET_ID`.
4. **Deploy > New deployment > Web app**: Execute as **Me**, Who has access **Anyone**.
5. Authorize (Advanced > Go to project). Copy the **Web app URL** ending in `/exec`.
6. Open that URL in a browser: you should see `{"ok":true,"message":"Word Buddy backend is running."}`.

The sheet tab `Words` and its header row are created automatically on first use.

After editing `Code.gs` later, use **Deploy > Manage deployments > Edit > New version** so the
URL stays the same.

### 2. Gemini API key

Create a key at <https://aistudio.google.com/apikey>. Bo cố lên only uses **flash** models
(cheap, high free quota). It picks the newest stable flash model automatically; you can choose
another one in Settings.

### 3. Give the learner the values

Give these 3 values privately (not in git): Apps Script URL, TOKEN, Gemini API key. Or create
`config.local.json` (see [`config.example.json`](config.example.json)) and send the file; put it
in the project folder before running `start.sh`. `config.local.json` is git-ignored.

## Settings page

Right-click the Bo cố lên icon > **Options**. You can change the URL, token, key and model,
test the Sheet connection, and change the shortcut (`chrome://extensions/shortcuts`).
Values from `config.local.json` are only used when Settings is empty.

## Troubleshooting

| Problem | Fix |
|---|---|
| Shortcut does nothing | Check `chrome://extensions/shortcuts`; another extension may use it. Right-click a selection > "Save to Bo cố lên" also works. |
| "Wrong token" | TOKEN in Code.gs and in Settings must match. Redeploy after changing Code.gs. |
| "Gemini is busy (quota)" | Free quota per minute reached. Wait a minute. |
| "I could not hear you" | Speak closer to the mic; check the mic permission above. |
| Grading feels wrong | Gemini is a good but not perfect judge. Listen to the sample, try again, or skip after 3 tries. |

## Development

No build step and no dependencies. Logic lives in `lib/` and is unit-tested:

```bash
npm test
```

| Path | What |
|---|---|
| `manifest.json`, `background.js` | MV3 extension, shortcut + context menu saving |
| `lib/` | Pure logic (daily set, answer check, card state, Gemini, Sheet client, WAV) |
| `review/` | Flashcard review page, recorder, speech, effects |
| `popup/`, `options/`, `ui/` | Popup, settings page, shared theme and mascot |
| `apps-script/Code.gs` | Google Sheet backend |
| `start.sh` | One-command setup / update for macOS |
