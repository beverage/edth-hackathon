// Speech-to-text on the coordinator in offline mode: prepares regular turbo and light base models
// and the Silero voice-activity model once into models/ (git-ignored), checksums checked, then runs
// whisper.cpp's whisper-server on this computer only.
// npm run stt starts it, and fetches its model the first time (internet needed once).
// npm run stt:prepare fetches both models ahead, for a computer that will be offline.
// WHISPER_PROFILE=light uses Whisper base (about 60 MB) instead of turbo, for a computer short of memory.
// WHISPER_MODEL_FILE copies the regular turbo model from a file already on disk instead of downloading it.
// WHISPER_URL sets the port, as the coordinator reads it (default http://127.0.0.1:3118).
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const MODELS = {
  regular: {
    name: "Whisper large-v3-turbo",
    file: "ggml-large-v3-turbo-q5_0.bin",
    bytes: 574041195,
    sha256: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin",
    from: process.env.WHISPER_MODEL_FILE,
  },
  light: {
    name: "Whisper base",
    file: "ggml-base-q5_1.bin",
    bytes: 59707625,
    sha256: "422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin",
  },
};
const WHISPER = MODELS[process.env.WHISPER_PROFILE === "light" ? "light" : "regular"];
// Finds the speech in a clip, so silence comes back as no words instead of Whisper's "Thank you."
const VAD = {
  name: "Silero VAD",
  file: "ggml-silero-v6.2.0.bin",
  bytes: 885098,
  sha256: "2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987",
  url: "https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin",
};
const directory = new URL("../models/", import.meta.url);
const port = new URL(process.env.WHISPER_URL || "http://127.0.0.1:3118").port || "80";

async function valid(model, file) {
  try {
    if ((await stat(file)).size !== model.bytes) return false;
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return hash.digest("hex") === model.sha256;
  } catch {
    return false;
  }
}

/** True when the command runs; the flag only prints and exits. */
function has(command, flag) {
  return spawnSync(command, [flag], { stdio: "ignore", timeout: 10_000 }).error == null;
}

/** The model's path in models/, fetched or copied first when it is missing or wrong. */
async function prepare(model) {
  const target = new URL(model.file, directory);
  if (await valid(model, target)) return fileURLToPath(target);
  const temporary = new URL(`${model.file}.${process.pid}.part`, directory);
  await mkdir(directory, { recursive: true });
  try {
    if (model.from) {
      // A clone where the disk allows it (APFS), so a second copy takes no space.
      await copyFile(model.from, temporary, constants.COPYFILE_FICLONE);
    } else {
      console.log(`Downloading ${model.name} (${Math.round(model.bytes / 1e6) || 1} MB, once)…`);
      const response = await fetch(model.url, { signal: AbortSignal.timeout(1_800_000) });
      if (!response.ok || !response.body) throw new Error(`${model.name} download failed: HTTP ${response.status}`);
      await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
    }
    if (!(await valid(model, temporary))) throw new Error(`${model.name} checksum failed; run it again.`);
    await rename(temporary, target);
    return fileURLToPath(target);
  } finally {
    await rm(temporary, { force: true });
  }
}

try {
  const preparing = process.argv.includes("--prepare");
  if (preparing) {
    for (const model of [...Object.values(MODELS), VAD]) await prepare(model);
    console.log("Coordinator speech models ready: regular and light (checksums verified).");
    process.exit(0);
  }
  // The tools first, so a missing one is said before a 574 MB download.
  if (!has("whisper-server", "--help")) throw new Error("whisper-server not found. Install whisper.cpp (macOS: brew install whisper.cpp); see docs/setup.md.");
  if (!has("ffmpeg", "-version")) throw new Error("ffmpeg not found. Install ffmpeg (macOS: brew install ffmpeg); see docs/setup.md.");
  const whisper = await prepare(WHISPER);
  const vad = await prepare(VAD);
  console.log(`${WHISPER.name} and Silero VAD ready (checksums verified). Starting whisper-server on 127.0.0.1:${port}.`);
  // --convert: ffmpeg turns the browser's webm and the phone's m4a into the WAV Whisper reads.
  const args = ["-m", whisper, "--host", "127.0.0.1", "--port", port, "--convert", "--vad", "--vad-model", vad];
  const server = spawn("whisper-server", args, { stdio: "inherit" });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
  server.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
  server.on("exit", (code, signal) => process.exit(code ?? (["SIGINT", "SIGTERM"].includes(signal) ? 0 : 1)));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
