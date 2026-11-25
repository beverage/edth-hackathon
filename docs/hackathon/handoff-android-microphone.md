# Handoff: the Android microphone, transcribed on the phone

**Status, 21 Nov:** the local Expo-module fallback below is implemented and installed on a
Galaxy S10. It records PCM WAV and sends Whisper's text to the offline coordinator. Do not
install the PCM-stream library proposed below. Current setup is in the root README's
[USB daily startup](../../README.md#run-locally); Studio can stay closed.
Two live town-hall reports reached the receiver correctly with base. Remaining runtime work:
recognition accuracy, stale question cards and warm transcription timings with base and small;
iOS was not tested in this change. The proposal below is retained until those checks finish.

Written Friday 20 November, evening (Paris time), for the coding agent on the teammate's computer: an 8 GB MacBook Air with an Android phone. When the work is done, fold what is still true into `transmitter/README.md` and delete this file and its row in [README.md](../README.md).

## Read this first: no Mistral key is needed

A microphone report from Android does not need a Mistral key. It fails today because the phone sends audio, and offline mode has no speech-to-text on the computer, so the coordinator answers HTTP 501. The fix is to make the phone send text, as the iPhone already does. Do not ask for a key, do not wait for one, and do not add a speech-to-text service.

## Goal

On Android, in the phone modes ("Phone: base" and "Phone: small"), hold-to-talk is transcribed on the phone by the same Whisper model as on iOS, and the phone sends the text. A spoken report then works in offline mode (`PROVIDER_MODE=local`), with no key and no internet.

## Why it fails today

- [transmitter/App.tsx:419](../../transmitter/App.tsx): `const phoneStt = sttMode !== "server" && Platform.OS === "ios";`. On Android the microphone always takes the server path.
- The server path records AAC with expo-audio (`SPEECH_RECORDING`, [transmitter/src/sources.ts:43](../../transmitter/src/sources.ts)) and sends it as `audio/mp4`. Offline mode answers 501; hosted mode needs a key.
- expo-audio records on Android with MediaRecorder, which writes only compressed audio (AAC, AMR, Opus). It cannot write WAV, so `SPEECH_RECORDING_WAV` ([sources.ts:57](../../transmitter/src/sources.ts)) is iOS only [75].
- Whisper needs 16 kHz, mono, 16-bit PCM. The model is not the problem: the same `ggml-base-q5_1` and `ggml-small-q5_1` files run on Android, and scenario clips (WAV files) already transcribe on Android in the phone modes.

## The fix

Record raw PCM on Android with `@fugood/react-native-audio-pcm-stream`, keep it in memory, and hand it to Whisper with `transcribeData`.

Why this library:

- It is by the author of `whisper.rn`, and `whisper.rn`'s own live transcription uses it. Read `transmitter/node_modules/whisper.rn/src/realtime-transcription/adapters/AudioPcmStreamAdapter.ts` first: it shows every call.
- It uses Android's `AudioRecord`, so it gives 16 kHz mono 16-bit PCM directly. No decoding, no resampling.
- MIT, version 1.1.4, last published October 2025. It runs on the phone and calls nothing, so the rule on European providers [42] is not touched.
- The risk: it has no `codegenConfig`, so it is an old-style native module. React Native 0.88 runs those through the New Architecture's interop layer. If it does not build or does not load, go to [Fallbacks](#fallbacks).

### Steps

1. **Pull first:** `git pull --rebase`, then `git log --oneline -15 -- transmitter/` to see Android work since this file was written.

2. **Install** from `transmitter/`, with Expo's installer, never `npm install <package>`:

   ```bash
   npx expo install @fugood/react-native-audio-pcm-stream
   ```

   The next `npx expo run:android` regenerates `android/`. The microphone permission is already there, from the expo-audio plugin in `app.json`.

3. **A small recorder,** new file `transmitter/src/pcm.ts`, used on Android only. A sketch; check it against the adapter above:

   ```ts
   // @ts-ignore: the package ships no types (whisper.rn's adapter imports it the same way)
   import LiveAudioStream from "@fugood/react-native-audio-pcm-stream";
   import { Buffer } from "buffer";

   let chunks: Buffer[] = [];
   let ready = false;

   export function startPcm(): void {
     if (!ready) {
       // VOICE_RECOGNITION (6): no call-style gain control or noise suppression
       LiveAudioStream.init({ sampleRate: 16000, channels: 1, bitsPerSample: 16, audioSource: 6, bufferSize: 16 * 1024, wavFile: "" });
       LiveAudioStream.on("data", (b64: string) => chunks.push(Buffer.from(b64, "base64")));
       ready = true;
     }
     chunks = [];
     LiveAudioStream.start();
   }

   /** 16-bit little-endian PCM, 16 kHz mono: what Whisper reads. */
   export async function stopPcm(): Promise<ArrayBuffer> {
     await LiveAudioStream.stop();
     const all = Buffer.concat(chunks);
     chunks = [];
     return all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength) as ArrayBuffer;
   }
   ```

   - Set up the `data` listener once. The library has no way to remove it, so calling `on` on every press would add a listener each time.
   - `buffer` is already a dependency.
   - 15 s of audio is 480 KB, so memory is not a concern.

4. **Transcribe the buffer.** In [transmitter/src/stt.ts](../../transmitter/src/stt.ts), add `transcribePcmOnPhone(mode, pcm, opts)` beside `transcribeOnPhone` (line 69). It should share the model loading and return the same `PhoneTranscript`, but call `loaded.context.transcribeData(pcm, { language, prompt, maxThreads: 4 })`.
   - Pass the 16-bit buffer as it is. `whisper.rn`'s doc comment says "float32 PCM", but the native code reads 16-bit little-endian PCM (`decodePcm16` in `node_modules/whisper.rn/cpp/jsi/RNWhisperJSI.cpp`, line 1034), and its own live transcriber passes 16-bit buffers.
   - If `transcribeData` gives trouble, put a 44-byte WAV header in front of the PCM and write it to the cache with expo-file-system's `File` [64]. Then call the existing `transcribeOnPhone` with that file. It costs one file write and uses the path already proven on scenario clips.

5. **Wire it into `App.tsx`.**
   - `phoneStt` (line 419): drop the `Platform.OS === "ios"` condition.
   - `onPressIn` (line 473): keep the permission request (`requestRecordingPermissionsAsync`). On Android with `phoneStt`, call `startPcm()` instead of `recorder.prepareToRecordAsync(...)` and `recorder.record()`.
   - `stopAndSend` (line 438): on Android with `phoneStt`, call `stopPcm()` instead of `recorder.stop()`. Treat an empty buffer like a clip that is too short. Then transcribe, and send the text with `handleUtterance({ ...base, text })` and `phoneMs`, exactly like the iOS branch at line 453.
   - **iOS keeps its path** (WAV through expo-audio [75]). Change it only if you can test on an iPhone.
   - Keep the 15 s limit, the minimum length, and the "released while the microphone was still opening" case working as they do now.
   - **One send path:** the result is an `Utterance` with `source: "mic"` and `text`, through `handleUtterance` (transmitter/AGENTS.md). `POST /api/report` already takes `text`, so no contract changes.
   - **Check after a recording** that the spoken question still plays through the loudspeaker. `stopAndSend` calls `setAudioModeAsync({ allowsRecording: false })` for that.

### Fallbacks

1. **If the library does not build or load:** write a small local Expo module (`npx create-expo-module --local`) in Kotlin. It should record with `AudioRecord` at 16 kHz, mono, PCM 16-bit, source `VOICE_RECOGNITION`, write a WAV file to the cache and return its path. Then use the existing `transcribeOnPhone`. That is about 100 lines. Read the Expo SDK 58 modules docs first; the Expo of your training data has changed.
2. **Whisper on the Mac** instead of on the phone: not on this computer. With 8 GB it would compete with Ollama and the Gradle build for memory. Leave it.

Do not decode the AAC file into PCM on the phone. That needs a decoder module, which is more work than recording PCM.

## Building and testing on the 8 GB MacBook Air

- **One real Android phone** over USB, with USB debugging on. No emulator: it needs 2 to 4 GB more.
- **Free memory for the first build.** The first Gradle build needs 3 to 5 GB. Stop Ollama during it, then start it again.
- **Ollama with the small model and a short context:**

  ```bash
  OLLAMA_NO_CLOUD=1 OLLAMA_KEEP_ALIVE=-1 OLLAMA_CONTEXT_LENGTH=8192 ollama serve
  ```

  The prompt was about 2,200 tokens when this was written; on 22 Nov it is about 4,560, and at 4,096 Ollama cut it in the middle (decision 254). The coordinator now asks for 8,192 on every call; starting Ollama at the same size saves a reload. Do not use the 8B model.
- **Connect the phone to the Mac over the cable:**

  ```bash
  adb reverse tcp:8081 tcp:8081
  adb reverse tcp:3117 tcp:3117
  ```

  The app finds the coordinator at the address it loaded its code from (`coordinatorOnThisComputer` in `App.tsx`), so over `adb reverse` both are `localhost`. Run these again after reconnecting the cable. Same Wi-Fi with the Mac's address also works. Plain `http://` is already allowed on Android (`usesCleartextTraffic` in `app.json`).
- **Daily use:** `npm run build`, `npm start`, `npm stop`. Direct component commands remain in [setup.md](../setup.md#advanced-console-use).
- **The Whisper model downloads once** when a phone mode is first chosen (56 MB for base, 181 MB for small), so the phone needs the internet that one time.
- **Open a mission** on the receiver (`http://localhost:3117/receiver`, Missions menu, Vincennes) and join it from the phone. Reports need a mission [114].

## Done means

- On Android, in "Phone: base", with the coordinator in offline mode and a Vincennes mission joined: hold the button and say "I'm at Bérault metro." The unit appears at Bérault on the receiver, or the app asks back. It never puts a wrong pin. The coordinator answers 200, not 501, and `timings_ms.stt` is 0 because the phone sent text.
- The same works in "Phone: small".
- Measured on that phone and written down: the phone's model, and the time to transcribe a 2 to 3 s report with base and with small (the app shows `phoneMs`).
- iOS unchanged. Say whether it was checked on an iPhone.
- `npx tsc --noEmit` passes in `transmitter/`. `npm test`, `npx tsc --noEmit` and `npm run lint` pass at the root.
- Docs updated in the same commit as the code:
  - `transmitter/README.md`: the "iOS only for now" lines under the speech-to-text results.
  - [plan.md](../plan.md), Transmitter: remove "record uncompressed audio on Android" from Still to do.
  - [setup.md](../setup.md): the Android installation instructions. Also write down what it took to build on Android on this computer, with a check after each step.
  - [architecture.md](../architecture.md): "Not yet on Android" in the transmitter row.
- New lines at the end of `DECISIONS.md`: the library (or the fallback) and why, and the measured phone times. Check the last number first, because other sessions append too.
- This file deleted, and its row in [README.md](../README.md) removed.

## Rules that apply here

From `AGENTS.md` and `transmitter/AGENTS.md`:

- The app never reads the phone's GPS, and the model never produces coordinates.
- Providers stay European; nothing US-hosted in the request path [42]. On-device code is fine.
- Add packages with `npx expo install`. Read the Expo SDK 58 docs before touching an Expo or React Native API.
- No EAS. Build locally with `npx expo run:android`. Never edit `android/` by hand: it is generated. Configure through `app.json` and config plugins.
- Every source makes an `Utterance` and goes down one send path.
- Do not push, deploy or move the `prior-work-fri-1800` tag unless the person you work for asks. Other people commit to `main` at the same time: pull before you start, and stage only your own files.


## Ollama setup on this Mac

Local mode needs two separate things: the web coordinator and an Ollama server with the
`ministral-3:3b` model. Starting Next.js does not install or start Ollama. No Mistral API key
or Ollama account is needed. Internet is needed for the one-time installation and model download.

### One-time installation

Install the current Homebrew version of Ollama. The model download below is about 3 GB;
ask before installing packages or downloading it.

```bash
eval "$(/opt/homebrew/bin/brew shellenv)"
brew install ollama
ollama --version
```

If Ollama is already installed, check its version first; use `brew upgrade ollama` if it is
too old to load the model. If the Ollama desktop app is running, quit it before using
`ollama serve`, so the server below can use port 11434 and the intended settings.

### Terminal 1: start Ollama

This command can run from any folder. Leave it running.

```bash
OLLAMA_NO_CLOUD=1 OLLAMA_KEEP_ALIVE=-1 OLLAMA_CONTEXT_LENGTH=8192 ollama serve
```

These settings disable cloud features, keep the model loaded between reports, and set
the context to 8,192 tokens, the size the coordinator asks for (decision 254). Use the 3B model, not the 8B model.

### Terminal 2: download and check the model

Keep Terminal 1 running while these commands run. The download is needed only once.

```bash
curl --fail --show-error http://127.0.0.1:11434/api/version
ollama pull ministral-3:3b
ollama list
ollama run ministral-3:3b "Reply with OK"
```

Check: the version endpoint returns JSON, `ollama list` includes `ministral-3:3b`, and
the last command answers. If port 11434 is already occupied, identify the existing
Ollama app or server; do not start a second copy.

### Terminal 2: start the web coordinator

After the model check, run from the repo root, not `transmitter/`:

```bash
cd ~/Projects/edth-hackathon
PROVIDER_MODE=local npm run dev -- -p 3117
```

If the coordinator is already running, stop that copy with Ctrl+C first. Wait for both
`ready for` lines before sending reports. Open http://localhost:3117/receiver, create a
Vincennes mission, and join it from the physical Android phone.

Check from another terminal:

```bash
curl --fail --show-error http://localhost:3117/api/report \
  --form-string area=vincennes \
  --form-string "text=I'm at Bérault metro."
```

Expect `resolution.status` to be `resolved` and `evidence.feature_id` to be
`node/9415191169`. This text check does not create a mission report.

### If warm-up says "fetch failed"

Next.js can be ready while Ollama is unreachable. Check the version endpoint above first.
The default address is `http://127.0.0.1:11434`; `OLLAMA_URL` in the shell or
`.env.local` overrides it. If that address is wrong, correct it and restart the coordinator.
If the model is missing, pull it, then restart the coordinator so warm-up runs again.
No `.env.local` is required for the defaults; do not overwrite an existing one.

For daily use, start Ollama in Terminal 1, then the coordinator in Terminal 2. No repeated
installation or download is needed. For the first Android build, stop the coordinator,
run `ollama stop ministral-3:3b`, and stop `ollama serve` with Ctrl+C to free memory;
build first, then restart Ollama and the coordinator. The live Android microphone still
needs the PCM fix described above; installing Ollama alone does not implement that fix.

References: [Homebrew formula](https://formulae.brew.sh/formula/ollama),
[Ollama configuration](https://github.com/ollama/ollama/blob/main/docs/faq.mdx),
[model](https://ollama.com/library/ministral-3:3b).

