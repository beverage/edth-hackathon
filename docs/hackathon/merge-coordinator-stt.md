# Coordinator transcription merge

Branch: `codex/merge-coordinator-stt`. Work stays in the existing project directory.
The previous local refactor is checkpointed at `fb5d7f5`.

Selected upstream sources:

- PR #23: `b6486aa` adds local whisper-server; `a3810b8` avoids the extra language pass when the phone pins its language.
- PR #26: `ab6bb76` restores audio transport from the phone. This merge uses coordinator transcription without restoring phone mode/model controls.

The daily commands remain Build, Start and Stop. The merge adds host-model preparation,
Whisper lifecycle/readiness and orphan cleanup, while retaining host discovery and automatic
newest-mission joining. Whisper uses 3118; the private controller moves to 3116.

Unrelated remote main changes (command-post UI, resolver, extraction prompt and eval data)
are excluded. This is a selective functional integration, not a merge of all remote main.
No upstream extraction prompt is changed or evaluated as part of this task.

The original turbo integration needed whisper.cpp’s whisper-server, ffmpeg and about
575 MB of pinned host models. They are not installed or downloaded without approval. Focused provider and
start/stop checks use stubs; a live phone-to-coordinator microphone check follows setup.

Setup on Brian’s Mac, 21 November: host tools installed and turbo/VAD model checksums
verified after approval. The two obsolete Android document models were removed (238 MB),
keeping app settings. Model preparation runs independently of the runtime binaries; Start
checks the binaries. The real CPU Whisper startup/health/shutdown check passed. A GPU
startup attempt inside the coding tool failed allocating Metal memory. Normal Terminal
Build/Start then succeeded with GPU Whisper and extraction warm-up; coordinator health
returned `ready: true`. The updated phone app loaded and its old model directory stayed
empty. A real microphone report is still unmeasured. An unexpected
Whisper signal exit now reports failure instead of exit code zero.

Temporary RAM workaround [218]: use the already available Whisper base model on the
coordinator (about 61 MB of model files including VAD), retain Ollama’s resident model,
and restore remembered local mode. Hosted inference was declined. A live model reload
succeeded and health stayed ready. Whisper’s reported model/working buffers fell from
about 891 MB to 267 MB; these figures are not total process memory. The existing base
file was checksum-verified and copied on the Mac, with no download or phone model install.

Model selection [219]: `npm start` restores the regular turbo default and keeps Ollama
resident. `npm start light` uses base and unloads Ollama after 30 seconds idle. Build
prepares both models. Each start chooses its own mode; no remembered light default.

Main catch-up before PR [222] preserves the radio sender/held-report pipeline and command-post
features. Native phones keep Connect, automatic newest missions and coordinator-only speech;
the older phone join/answer UI is not restored.
