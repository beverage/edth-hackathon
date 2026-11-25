# Setup

Setting up a computer step by step, with a check after each step. The coordinator runs in one of two modes: hosted, which calls Mistral and needs a key, or offline, where everything runs on this computer. The phone app is optional: typed reports and `npm run demo` need no phone.

Do not install large tools or download models on someone's computer without asking first. Agents never read `.env` files or print keys.

## 1. The coordinator

You need Git, Node.js 24.3 or later with npm, and a current browser.

```bash
git clone https://github.com/beverage/edth-hackathon.git
cd edth-hackathon
npm ci
npm run build
```

The build copies the map's worker, prepares the browser's speech runtime and tries to fetch a 77 MB Ukrainian voice for questions; without it the browser uses its own voice.

Check: the build ends with a list of routes that includes `/cp`.

Then start it in one of the two modes below. Each serves the command post at `http://localhost:3117/cp` and keeps missions in `.data/sessions/`.

### Hosted mode

Put your Mistral key in `.env.local` (copy `.env.example`), or export `MISTRAL_API_KEY` in the console. Never paste a key into chat or into a file in git.

```bash
npm start
```

Check: `curl -s localhost:3117/api/health` answers with `"ready":true`.

### Offline mode

Nothing leaves this computer. Intent extraction runs on Ollama with `ministral-3:3b`, speech-to-text on whisper.cpp. Install the tools once; ask first, since the downloads come to about 4 GB:

```bash
brew install ollama whisper.cpp ffmpeg
```

That is macOS. On Linux or Windows, install Ollama from ollama.com and put whisper.cpp's `whisper-server` and `ffmpeg` on the PATH. Only macOS has been checked.

Then use three consoles.

**Ollama.** If the Ollama app is already running, skip this line.

```bash
OLLAMA_NO_CLOUD=1 OLLAMA_KEEP_ALIVE=-1 OLLAMA_CONTEXT_LENGTH=8192 ollama serve
```

Once, in another console: `ollama pull ministral-3:3b` (about 3 GB on disk, about 4 GB of memory when running).

Check: `ollama list` shows `ministral-3:3b`.

The coordinator asks for a context of 8,192 tokens on every call, so the extraction prompt (about 4,560 tokens) is never cut, however Ollama was started. Starting Ollama at the same size saves one reload of the model at the first report. At 4,096, Ollama cut the prompt to 2,051 tokens without an error (decision 254).

**Speech-to-text.**

```bash
npm run stt
```

The first run downloads Whisper large-v3-turbo (574 MB) and the Silero voice-activity model into `models/`, and checks their checksums. `WHISPER_MODEL_FILE` copies the turbo model from a file already on disk instead.

Check: it prints `Starting whisper-server on 127.0.0.1:3118`. Typed reports work without it; spoken ones need it.

**The coordinator.**

```bash
PROVIDER_MODE=local npm start
```

In PowerShell, set the variable first: `$env:PROVIDER_MODE="local"`, then `npm start`.

Check: `curl -s localhost:3117/api/health` answers with `"ready":true`. At start the coordinator warms the model and each area's prompt, which takes up to a minute.

**A computer short of memory** (8 GB): `WHISPER_PROFILE=light npm run stt` uses Whisper base (60 MB) instead of turbo, and `OLLAMA_KEEP_ALIVE=30s` in the Ollama line lets the model go after 30 seconds idle. The next report loads it again, a few seconds slower. Base hears less well.

`LOCAL_EXTRACT_MODEL` picks another model (for example `ministral-3:8b`), `OLLAMA_URL` another address, `WHISPER_URL` another speech-to-text address.

## 2. See it work

With the coordinator running, in either mode:

```bash
npm run demo
```

It opens a mission in Vincennes and sends it 20 typed radio reports, through the same pipeline as spoken ones. Watch them arrive at `http://localhost:3117/cp`, or slow them down with `npm run demo -- --pace 4`. `kyiv`, `izium` or `all` picks other areas. The plans are in `scenarios/missions/`; what each one shows is in [showcase.md](showcase.md).

Check: the command post shows seven units, the tracks they saw, and questions waiting in the Decisions list.

## 3. The map with no internet

```bash
npm run basemap -- vincennes
```

This saves the Vincennes tiles, fonts and icons from OpenFreeMap into `public/basemap/`, which is not in git: 28 MB of download. Run it once on each computer, with internet, then restart the coordinator. Run it again for `kyiv` (13 MB) and `izium` (6 MB), one area a run; the three take 75 MB on disk.

Check: each run ends with "Done" and the areas saved so far, and the map's corner says "Map saved on this computer".

Without it, the map uses OpenFreeMap when there is internet, and a plain background with the units and tracks when there is none. `BASEMAP=hosted` or `BASEMAP=local` picks the map whatever the mode.

To take a computer offline, run `npm run stt:prepare` and the three basemap runs first, with internet. `stt:prepare` fetches both speech models, turbo and base.

## 4. The transmitter on a phone

Optional. The phone app stands in for a radio: it records, and the coordinator does the rest. How to build and run it is in [transmitter/README.md](../transmitter/README.md).

| Phone | Tools |
|---|---|
| Android | Android SDK Platform 37, Build-Tools 37.0.0, Platform-Tools, Command-line Tools, NDK 27.1.12297006, CMake 3.22.1; a JDK, such as Android Studio's bundled JDK |
| iPhone | macOS, Xcode, Command Line Tools, CocoaPods, an Apple ID |

On Android, turn on Developer options → USB debugging, connect a USB data cable, unlock, and approve debugging. On Windows, set `ANDROID_HOME` and `JAVA_HOME` if they differ from Android Studio's usual paths.

Check: `adb devices -l` lists the phone as `device`.

On an iPhone, connect it to the Mac, tap Trust, turn on Developer Mode and allow local network access. Add your Apple ID in Xcode → Settings → Accounts. Export `APPLE_TEAM_ID` and your own `TRANSMITTER_BUNDLE_ID` before building; do not change `app.json` for your own signing. With a free account, trust the developer under Settings → General → VPN & Device Management after the install. The install expires after seven days.

Check: `xcrun devicectl list devices` lists the phone as available.

Then, from the repo root:

```bash
npm ci --prefix transmitter
npm run phone
```

`npm run phone` starts the app's code server on port 8082. Build and install the app itself once, as `transmitter/README.md` says.

On the phone, open Transmitter and tap **Connect** beside the coordinator. Both iPhone and Android search the local network for coordinators; after Connect the app follows that coordinator to a new address. On the command post, start a mission; the phone follows the newest running mission by itself, between reports. Developer tools on the phone has a manual address, scenarios, test clips and timings.

Check: a report spoken into the phone shows on the command post within a few seconds.

## Development

`npm run dev -- -p 3117` runs the coordinator with hot reload, with the same variables as `npm start` (`PROVIDER_MODE=local` for offline). Before calling a change done, run `npm test`, `npx tsc --noEmit` and `npm run lint` ([CONTRIBUTING.md](../CONTRIBUTING.md)).

| Port | What |
|---|---|
| 3117 | The coordinator and the command post |
| 3118 | Speech-to-text (whisper-server), offline mode |
| 11434 | Ollama, offline mode |
| 8082 | The phone app's code server |

## When something fails

- **`npm start` says there is no build:** run `npm run build` first, and again after changing code.
- **"Speech-to-text on the coordinator is not ready":** start `npm run stt`. Typed reports still work.
- **`whisper-server not found` or `ffmpeg not found`:** install whisper.cpp and ffmpeg (macOS: `brew install whisper.cpp ffmpeg`).
- **Every report fails in offline mode:** Ollama is not running, or `ministral-3:3b` is not pulled. `ollama list` shows which.
- **A port is taken:** `lsof -nP -iTCP:3117 -sTCP:LISTEN` shows by what. Stop that process in its own console.
- **A checkout from before 25 November still runs the old launcher:** end it with `pkill -9 -f scripts/launcher/supervisor.mjs`; its servers stop with it (decision 262).
- **No mission on the command post:** start one from the Missions menu, or run `npm run demo`.
- **Map is a plain background, "Base map not available":** no internet and no saved map. Run `npm run basemap -- vincennes` with internet, then restart the coordinator. Units and tracks draw meanwhile.
- **Map is coarse or empty away from the area:** only the tiles around the area are saved.
- **Phone not detected:** unlock it, reconnect, and accept trust or debugging. An iPhone counts as connected when `xcrun xctrace list devices` lists it under `== Devices ==`; one under `== Devices Offline ==` is only remembered by Xcode.
- **Phone build fails with `Undefined symbols` for `RCTReconnectingWebSocket` or `Sealable`:** the Debug app linked React Native's Release copy, left in `transmitter/ios/Pods` by a Release build before a `pod install` (decision 255). Run `LANG=en_US.UTF-8 npx expo prebuild --platform ios` in `transmitter/` once, then build the app again with `LANG=en_US.UTF-8 npx expo run:ios`. Prebuild makes `ios/` again from the config, so it takes a few minutes and downloads React Native's copies again.
