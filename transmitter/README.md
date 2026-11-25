# Transmitter

A small native app (Expo, React Native) that stands in for a field radio: it sends spoken
position reports to the coordinator (`POST /api/report` on the web app in the folder above).
Like a radio on a net, it does not join or name itself, and it does not answer questions
([decision 208](../DECISIONS.md)). The speaker says the call sign ("Alpha 1, at the château"),
the coordinator reads it from the words against the mission's roster, and the operator on the
command post (`/cp`) places what it is unsure of and answers questions.

## One path, several sources

Everything the app sends is an **utterance** (`src/types.ts`): audio or text, start and end
times and a sequence number. Only a scenario step names a call sign, since a script speaks for
several units; a report from the microphone has none. What produces an utterance can change; nothing
after it does.

| Source | What it is | Status |
|---|---|---|
| Scenario clip | A prepared clip bundled with the app, sent as if it had just been recorded. Silent, repeatable, works in the simulator. | built |
| Microphone | Hold the button, speak, release. | built |
| Open microphone | Listens continuously and cuts at pauses. | later |

## The screen

The phone detects reachable coordinators from the USB/Metro host, its LAN Bonjour
service directory and, on an iPhone, its own search of the local network. Tap Connect beside
a server; multiple servers appear as separate rows. After Connect it follows that server, by
its id, to a new address between reports, so a renamed Mac or a new network does not strand it.
The phone automatically follows the newest running mission and follows newer missions
between reports. There is no mission picker or Join/Leave control. With no running mission,
it shows Waiting for mission and joins when the server starts one.

- **Where:** the mission's name, the area, the language, and the coordinator with a dot
  (green when it answers, red when it does not). Tapping it, or the gear, opens Setup.
- **Automatic mission:** after Connect, the phone follows the newest running mission,
  switching between reports. It waits when none is running.
- **A notice** when the coordinator is offline or no mission is running.
- **The talk button** and, under it, one status line: listening, sending, sent, held for the
  operator, or not sent and why. While recording it turns red, counts the seconds, and a bar
  shows how much of the 15 seconds is used. The phone shows no answer: a question, and a report
  the coordinator could not give to a unit, wait for the operator on the command post at `/cp`
  [178, 203].
- **Scenarios** for the mission's area: pick one, play it all, or tap one report. Each step
  shows whether the coordinator answered as the script expects. A question stays open for the
  operator: a step that expects one passes when the expected choice was offered. A later step
  that depends on the answer passes only once the operator gives it.

**Setup** has language, discovered Hosts and Developer tools. The mission supplies the area.
Scenario selection, sound/timing and a manual host override are under Developer tools.
There is no phone model setup or transcription selector. The radio screen reports sent,
held for the operator, or not sent; questions stay on the command post.

## Run it

Start the coordinator first ([setup](../docs/setup.md)). Tools and signing for each phone are
in [setup](../docs/setup.md#4-the-transmitter-on-a-phone). Then, once, from the repository root:

```bash
npm ci --prefix transmitter
```

Build the app and install it on the connected phone, from `transmitter/`:

```bash
LANG=en_US.UTF-8 npx expo run:ios --device
```

or `npx expo run:android`. CocoaPods fails without the UTF-8 locale (decision 66). iPhone
builds need a Mac with Xcode; free Apple provisioning expires after seven days. No EAS.

After that the app loads its code from Metro, the code server, on port 8082. From the
repository root:

```bash
npm run phone
```

Only native changes need a new build. Voice-to-text runs on the coordinator.

## Which coordinator it talks to

Both phones search the local network for coordinators (below). A development build can also
infer the host from Metro, and `EXPO_PUBLIC_SERVER_URL` overrides that default. Over USB, an
Android phone reaches the Mac's ports after `adb reverse tcp:3117 tcp:3117` and
`adb reverse tcp:8082 tcp:8082`. A manually selected host is remembered.
On a phone, sign with your own Apple ID: put `APPLE_TEAM_ID` and your own `TRANSMITTER_BUNDLE_ID`
in `transmitter/.env.local` (ignored by git), because `dev.voicetomap.transmitter` belongs to
Alex's team (`app.config.ts`). Expo's commands and `npm run phones` read that file; a value set in
the shell wins. Every step, with checks: [../docs/setup.md](../docs/setup.md).

## Advanced fleet helper

One command on the Mac, with Metro and the coordinator running:

```bash
cd transmitter && npm run phones
```

It updates every iPhone connected to the Mac, by cable or on the same network, and opens the
app on Metro there. A development build loads its code from Metro, so most updates need no
install: after a change to `App.tsx` or `src/`, or a pull, the script only reopens the app.

The app is built and installed again only when its native side changed: a native package,
`app.json`, `app.config.ts` and the variables it reads, or Expo itself. Expo's fingerprint of
those is kept in `.expo/phones.json`, so the script knows. After such a change it runs
`npx expo prebuild --platform ios --clean` once, then builds for each phone (decision 207). The
first build takes several minutes; each further phone takes less. A phone that does not have
the app yet gets it the same way, so a teammate's iPhone only needs to be plugged in, unlocked,
trusted, and in Developer Mode.

| Option | Does |
|---|---|
| `--check` | Says what it would do for each phone, and changes nothing |
| `--rebuild` | Builds and installs again. With a free Apple ID the app stops opening after 7 days; the script warns a day before |
| `--device "<name or UDID>"` | One phone only |

Android phones are not covered yet: use the root README's steps.

### An Android phone off the cable

A development build loads its code from Metro through the cable, so it stops working when
unplugged. Off the cable, install a release build: it carries its code inside [253].

1. Put the phone and the Mac on one network that lets them reach each other. The venue Wi-Fi
   does not; the phone's own hotspot, with the Mac joined, does.
2. Build it in `transmitter/`, with Android Studio's JDK. Only `arm64-v8a`, which every recent
   phone uses, so whisper.rn compiles once instead of four times:

   ```bash
   npx expo prebuild --platform android --no-install
   cd android && JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a
   ```

3. Install `android/app/build/outputs/apk/release/app-release.apk` with
   `adb install -r <file>`, or copy the file to the phone and open it.
4. Open the app. Setup → Hosts lists the coordinator it finds on the network. If none shows,
   type `http://<the Mac's address>:3117` under Host override; `ipconfig getifaddr en0` gives
   the address. If macOS asks, allow incoming connections for `node`.

## Which coordinator it talks to

A development build loads its code from the computer running the dev server, so it knows that
computer's address. It sends reports to the coordinator on that same computer, port 3117
(`npm run dev -- -p 3117` in the folder above). The dot beside the coordinator's name
shows whether it answers (re-checked every 5 seconds). `EXPO_PUBLIC_SERVER_URL` overrides the default.

Setup → Hosts lists discovered reachable coordinators. A manual override remains in
Developer tools. The Metro/USB host browses LAN advertisements, and the phone also browses
for them itself: `modules/coordinator-search` is a small local Expo module that looks for the
`_voicetomap._tcp` service each coordinator advertises. On iOS it uses `NetServiceBrowser`, with
the type listed under `NSBonjourServices` in `app.json`; on Android it uses `NsdManager`. The
phone verifies each candidate. The module is native, so a phone needs one rebuild to get it;
an older build finds coordinators through the addresses it already knows [248, 253].

## Speech-to-text on the coordinator

Microphone and scenario utterances send audio through the same report path. The phone
records 16 kHz mono AAC/m4a and sends it with the selected language; it does not load a
speech model or transcribe. In local mode, the coordinator uses Whisper turbo by default, base with `WHISPER_PROFILE=light`,
through whisper-server with Silero VAD and ffmpeg conversion. Hosted mode uses Mistral.
A report counts as successful only after the coordinator acknowledges saving it.

`npm run stt` runs the speech server on the coordinator, and fetches its model the first
time. The native package dependencies are retained for compatibility with installed
builds; the active recording and scenario paths no longer import the phone transcriber.
No speech mode, model download or test-clip selector is needed on the phone.

### Model comparison (20 Nov)

A newer comparison, on 21 Nov, with the language pinned and against Parakeet and
Voxtral, is in [../docs/stt-comparison.md](../docs/stt-comparison.md).

Measured on 20 Nov in the iPhone simulator, on the 9 scenario steps (synthetic voices, clean audio).
A step counts when the coordinator's answer is the expected one.

| Mode | Vincennes (4) | Kyiv (5) | Total |
|---|---|---|---|
| Server (Mistral) | 4 | 5 | 9 of 9 |
| Phone: small, with hints | 3 | 5 | 8 of 9 |
| Phone: small, no hints | 3 | 5 | 8 of 9 |
| Phone: base, with hints | 3 | 5 | 8 of 9 |
| Phone: base, no hints | 0 | 4 | 4 of 9 |

- Every miss was a question back or "could not place that"; none put a pin in the wrong place.
- The one step no phone mode got: "Bérault" was heard as "Bayreauld" or "Beiraud".
- Phone transcripts are rough ("Ruchaj z do Sofijskiego Soboru" for «Рухаюсь до Софійського собору»)
  and still resolve, because extraction and name matching tolerate the errors.
- Time per clip in the simulator was about 4 s (base) and 15 s (small). The simulator has no GPU, so
  this says nothing about a real phone; that still has to be measured. The server takes about 0.3 s.
- The raw results are in `../scenarios/results/stt-comparison-2026-11-20.jsonl`.

The measurements above describe the old on-phone path. They are not measurements of
the merged coordinator path. Live microphone recognition on this Mac/phone pair remains
to check after the coordinator tools and models are installed.
### The prompt for Whisper base (21 Nov)

Whisper keeps only the last 223 tokens of its prompt. The Vincennes list was 268 tokens, so its
first seven names (the stations and the château) never reached it. The list is now fitted to the
budget and ends with the area's report phrases ("hostile drone", "Track 2") [189].

Measured on the Mac with whisper.cpp built from `whisper.rn`'s own source, `ggml-base-q5_1`,
language on auto. Clips: the scenario steps and 61 synthetic reports in macOS voices.

| Vincennes, 51 clips | Word error rate | Report words heard |
|---|---|---|
| Before: 40 names, the first 7 cut | 0.345 | 33 of 66 |
| After: 29 names, then 8 report phrases | 0.223 | 56 of 66 |

- "Hostile" now comes back as said in every English voice. Before, one voice gave "Hospital drone" and
  "Hospital vehicle", and a real voice on the phone gave "Hostel Drone". "Enemy patrol" no longer
  comes back as "Avenue patrol". One clip got worse: "Hostiles at the Château de Vincennes" lost
  the château in one voice.
- Kyiv and Izium, 19 clips: the same or better on all but one ("Об'єкт 2 біля Золотих воріт" lost
  "Об'єкт 2"). All 24 Kyiv names still fit.
- French report clips in synthetic voices are poor with every prompt ("Véhicule hostile devant la
  mairie" came back as "avec une oscillation de la mérite"). Real French voices are not checked.
- Putting the most useful names last did worse: "devant la mairie" became "devant la mérie".
- The raw results are in `../scenarios/results/whisper-prompt-2026-11-21.jsonl`.

Phone modes transcribe both scenario clips and the microphone on Android and iOS. Android uses
the local Expo module in `modules/pcm-recorder` to write 16 kHz mono 16-bit PCM WAV with
`AudioRecord`; iOS uses expo-audio. Both call the same Whisper function and send text through
the existing report path. Rebuild the Android development app after adding the native module.

Checked on 21 Nov on a Samsung Galaxy S10 (SM-G973U): microphone audio reaches the offline
coordinator as text (`timings_ms.stt: 0`). Two live reports, "I am at the town hall in Vincennes",
placed the unit at Mairie de Vincennes (±31 m) on the command post. This verifies build and connections;
recognition accuracy, old question cards and transcription speed remain separate runtime work.
Small and the iOS path were not tested in this Android change.

## What you hear

A scenario sends its clips as data, so by default nothing is played: that is what makes it
usable in a quiet room. The phone speaks nothing: a radio hears the operator, not the
coordinator, and the operator's calls do not reach the phone yet [208]. "Play clips aloud"
(Setup, Scenarios) plays each clip through the phone's speaker before it is sent, for an audience. Sound comes out even with the ring switch on silent.

## Scenarios

`../scenarios/*.json` describe scripted reports and what the coordinator should answer.
`npm run scenarios` (in the folder above, on a Mac) makes the clips with synthetic voices and
writes `scenarios/index.ts` here. "Play scenario" sends every step and marks each one ✓ or ✗
against its expected answer.

