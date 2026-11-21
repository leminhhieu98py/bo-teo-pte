# Bo cố lên

A private Chrome extension for learning English words.

- **Save:** highlight a word on any web page and press **Command+B**. Gemini writes the
  Vietnamese meaning, a short explanation, an example and the IPA, and the word is stored in a
  Google Sheet.
- **Save from a picture:** press **Command+B** with nothing highlighted, then drag a box around
  the word explanation (for example the popup of your learning site). Gemini reads the picture
  and saves its meaning. If the picture is not clear, you get "Not enough information".
- **Practice:** every day, practice the 30 newest words + 20 random older words (+ words you
  skipped yesterday). Read the Vietnamese meaning, type the English word, then say it out loud.
  Gemini grades the pronunciation with a strong focus on word stress. Pass with 70+ points and
  correct stress. After 3 failed tries you may skip; the word comes back tomorrow.

- **Practice again + History:** after finishing, press "Practice again" to try to beat your best
  score of the day. The History page (calendar icon in the top-left corner) shows a month calendar of your best
  result each day. History is saved in the Google Sheet tab `History`.

- **Money ($):** every learner has a wallet (starts at $2,000). A practice round is worth $200,
  split evenly over its words; a passed word earns its part. You can earn at most $200 a day
  (practice again keeps earning until then). A hint costs $5 (at most $15 per word); with an empty
  wallet the hint is paid from what you earn in that practice, so hints never stop you. The History
  calendar is colored by the money earned that day. The admin can give money by editing the
  `xp` column of the learner in the Sheet tab `Users`; every change made by the app is listed in
  the tab `Ledger`.

- **Achievements:** the medal icon in the top-left corner shows 8 kinds of achievements (Hard-working,
  Sharp, Flawless, Fashion, Word hunter, Golden voice, Full charge, Big earner). Each has several medals
  (Bronze $50, Silver $100, Gold $200, Platinum $400, Diamond $800); the money is paid once when you reach
  it. Unlocked medals are in the Sheet tab `Achievements`.

- **Shop:** the bag icon opens the Shop. Buy one of 20 pets (10 personalities, each as a boy and a
  girl, $1,500) to replace Mochi everywhere, or one of 5 themes ($4,000) that recolor the whole app.
  Things you own can be switched any time for free and are never sold to you twice. The owned items
  are in the Sheet tab `Users` (columns `owned`, `pet`, `theme`).

Mochi the cat (or the pet you chose) cheers you on with confetti, stars, combos, money and a daily streak.

### Review pages for the owner (not part of the app)

- `dev/pets.html`: every pet in every mood with the real animations, in every theme. It needs a local
  web server: run `python3 -m http.server 8765` in this folder, then open
  <http://127.0.0.1:8765/dev/pets.html>.
- Theme pictures: `"mac/dist/Bo cố lên.app/Contents/MacOS/BoCoLen" --selftest-themes "$PWD/dev/review/themes"`
  makes pictures of every page in every theme and `dev/review/themes/index.html` to look at them.

## For the learner: the Mac app (recommended)

The Mac app shows the same pages as the Chrome extension, works in every app (not only Chrome)
and **updates itself**. No git, no terminal.

1. Open the newest release: <https://github.com/leminhhieu98py/bo-teo-pte/releases/latest> and
   download `BoCoLen-<version>.zip`.
2. Double-click the zip, then drag **Bo cố lên** into **Applications**.
3. The first time only, macOS says it "could not verify" the app (it is not from the App Store).
   Press **Done** (not Move to Trash), open **System Settings > Privacy & Security**, scroll down to
   *"Bo cố lên.app" was blocked* and press **Open Anyway**, then confirm with your password.
   Or run once in Terminal: `xattr -dr com.apple.quarantine "/Applications/Bo cố lên.app"`.
   Updates installed by the app itself are not blocked.
4. Settings opens: paste the Apps Script URL, the token and the Gemini key (ask your brother), press
   **Save**, then **Test Google Sheet**.
5. In the **Mac app** box of Settings, press **Allow** for Accessibility, Screen Recording and
   Microphone, and switch the app on in each System Settings list.

Daily use:

| What | How |
|---|---|
| Save a word | Highlight it in a web browser and press **Command+B** (other apps keep Command+B for bold; Settings offers shortcuts that work in every app) |
| Save from the site's explanation | Press Command+B with nothing highlighted, drag a box around the explanation |
| Practice | Click Mochi in the menu bar > **Start practice**, or click the app in the Dock |
| History, Settings | Icons in the top-left corner of the app window (hover for the name). While practicing, the app asks before leaving |

Updates: the app checks GitHub every few hours. When a new version is out, Mochi's menu shows
**Update to vX**; one click installs it and restarts the app. Settings > **Check for updates**
does the same on demand. The app only installs updates signed by the same publisher.

## For the learner: the Chrome extension (alternative)

Requirements: macOS, Google Chrome, git.

```bash
git clone https://github.com/leminhhieu98py/bo-teo-pte.git
cd bo-teo-pte
./start.sh
```

`start.sh` asks for 3 values the first time (Apps Script URL, Sheet token, Gemini API key),
then opens Chrome and walks you through "Load unpacked". After that, Bo cố lên lives in Chrome;
you do not need to run anything every day.

The first time you practice, Chrome asks for microphone access: click **Allow**. If macOS blocks
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

### Updating Code.gs later (the URL never changes)

When `apps-script/Code.gs` changes (for example the History tab was added), paste the new file
into Apps Script, keep your own `TOKEN` (and `SHEET_ID`) values, save, then
**Deploy > Manage deployments > Edit (pencil) > Version: New version > Deploy**. The URL stays the same, so the app settings never need a new link.
Only **New deployment** creates a new URL: never use it for updates. If you have several
deployments, update the one whose URL is in the app settings (compare the URLs in Manage
deployments) and archive the others.

### 2. Gemini API key

Create a key at <https://aistudio.google.com/apikey>. Bo cố lên only uses **flash / flash-lite** models
(cheap, high free quota). It uses gemini-3.1-flash-lite by default (fast: about 2s per word); you can choose
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

## Releasing a new Mac version (owner)

Needs the Swift command line tools (no Xcode) and a code signing identity. Always use the SAME
identity: macOS keeps the permissions, and the app accepts updates, only from the same signer.

```bash
BOCOLEN_SIGN_IDENTITY="Otis Self Signed" mac/scripts/release.sh 1.0.1 "What changed"
```

It builds `mac/dist/BoCoLen-1.0.1.zip` and publishes it with `gh` when gh is logged in as
`leminhhieu98py` (otherwise it prints the `gh release create` command to run).
Quick checks: `mac/scripts/build-app.sh` builds an ad-hoc test app;
`"mac/dist/Bo cố lên.app/Contents/MacOS/BoCoLen" --selftest /tmp/bocolen-selftest` loads every page,
reports JavaScript errors and saves screenshots (it uses its own storage when
`BOCOLEN_STORE_DIR` is set).

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
| `start.sh` | One-command setup / update for the Chrome extension |
| `mac/` | Native macOS app (Swift): hosts the same pages, shortcut, screen capture, self-update |
| `native/` | Web helpers used only by the Mac app (chrome API shim, worker, toast) |
