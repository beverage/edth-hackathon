# Documentation

Everything the team needs to know about Voice-to-Map, as plain Markdown in this repo. It reads the same on GitHub, in any editor and to any coding agent, so nobody needs a particular tool or account. This folder is the one store: there is no other copy to keep in step.

## Start here

To see it work, follow [Setup](setup.md) to step 2: `npm run demo` fills the command post with no phone.

New to the project? Read these in order:

1. [Overview](overview.md): the challenge, what the jury looks at, our approach, the timeline.
2. [Architecture](architecture.md): the parts, where each step runs, what is built.
3. [Plan](plan.md): the work ahead, part by part.
4. [CONTRIBUTING.md](../CONTRIBUTING.md): set up, run the checks, how we work together.
5. [Setup](setup.md): every step to run it, with a check after each.

## What is where

| File | What it holds | Update it when |
|---|---|---|
| [overview.md](overview.md) | The challenge, judged items, our approach, timeline | Scope or schedule changes |
| [architecture.md](architecture.md) | The parts and their block diagrams, where each step runs, what is built, the resolver in brief | A part is built, moved or deployed |
| [contracts.md](contracts.md) | Report endpoint, intent, resolution, utterance, scenario and gazetteer files, provider interfaces | A contract changes, on purpose, with a decision line |
| [plan.md](plan.md) | Command post, missions (start, join, check in, end), local mode, transmitter, evaluation, demo | Work starts, finishes or changes scope |
| [gazetteer.md](gazetteer.md) | How place data is built, same-name streets, adding an area, scaling | The build or the data changes |
| [open-questions.md](open-questions.md) | Questions for the team and for Lysk | A question is asked, answered or dropped |
| [known-gaps.md](known-gaps.md) | Known limits and risks | One is found or fixed |
| [glossary.md](glossary.md) | Terms we use | A new term comes up |
| [ask-back.md](ask-back.md) | Taking the answer to a question by voice: the kinds of reply, telling an answer from a new report, the reply reader and its measured scores | Spoken answers are built, or the reply eval is run again |
| [voices.md](voices.md) | Other voices in a clip, whispers, and how to record test clips | The voice rules change, or clips are measured |
| [tracks.md](tracks.md) | Tracks: screenshots of the receiver and the phone, the symbols, and diagrams of how a report becomes a track | The track rules or the screens for them change; retake the pictures |
| [stt-comparison.md](stt-comparison.md) | Speech-to-text options measured on the scenario clips: Whisper base and small, Parakeet, Voxtral; the failures seen and a recommendation | An option is measured again, on real clips or a real phone |
| [callsigns.md](callsigns.md) | Call signs read from a radio report's words and matched against the mission's roster: the rules, the eval and its scores, the limits; a call sign said last, and why it is a question for the operator; the roster, held reports in the Decisions list and the guards in the coordinator | The reader's rules change, or the eval is run on new cases |
| [tracks.md](tracks.md) | Tracks: screenshots of the command post and the phone, the symbols, diagrams of how a report becomes a track, placing tracks by hand, recon requests and tasking with their eval, and what moves on the map | The track rules or the screens for them change; retake the pictures |
| [setup.md](setup.md) | Setting up a computer and phone, with a check after each step | A tool, version, command or port changes |
| [showcase.md](showcase.md) | The four command post pictures at the top of the README: the missions, every line sent, and how they were taken | The command post changes; retake the pictures |

## The hackathon (archive)

Working papers from the weekend of 20 to 22 November 2026, in [hackathon/](hackathon/). They say what was true then and are not kept up to date. The code at the deadline is the tag `deadline-sun-1200` [262].

| File | What it held |
|---|---|
| [merge-coordinator-stt.md](hackathon/merge-coordinator-stt.md) | Selected PRs, merge scope and first-time speech setup |
| [stage-test-plan.md](hackathon/stage-test-plan.md) | The test plan for the pitch: what can fail on stage, the passes each line must clear, the scenarios, the voice sheet for Alex, the drills, the candidate stage script and the pre-flight |
| [kickoff.md](hackathon/kickoff.md) | The Saturday 08:00 opening for the two new teammates: what we build, where we stand, the two days, the streams of work |
| [work-split.md](hackathon/work-split.md) | A proposal, not a decision: four roles for the four of us, one of them evidence then pitch, and what we leave out to fit |
| [demo-script.md](hackathon/demo-script.md) | The one sheet to run the live demo from: the pre-flight, the eight steps with what each shows, the pacing, and what to do when a step fails |
| [pitch.md](hackathon/pitch.md) | The Demo Day deck in full: every slide's words and speaker notes, where the deck lives, its pictures, what is still to fill in, its look, and how to submit it |
| [receiver-review.md](hackathon/receiver-review.md) | The Saturday-night review of the receiver, now the command post: what was fixed, and the decisions left for Alex |
| [handoff-prompt-tuning.md](hackathon/handoff-prompt-tuning.md) | Handoff: tuning the extraction prompt with the eval and the two skills, where it stands, what is next |
| [handoff-android-microphone.md](hackathon/handoff-android-microphone.md) | Android PCM implemented; remaining recognition and timing checks |

Elsewhere in the repo:

| File | What it holds |
|---|---|
| [README.md](../README.md) | How the pipeline works, the resolver rules, demo scripts, how to run |
| [DECISIONS.md](../DECISIONS.md) | Every choice made, one numbered line each, append-only; an old line only gains a **Replaced by** or **Changed by** marker |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Setup, checks, working agreements |
| [AGENTS.md](../AGENTS.md) | Instructions for coding agents; Claude Code and Codex read the same file |
| [transmitter/README.md](../transmitter/README.md) | The native app: build, run, speech-to-text options |
| [scenarios/README.md](../scenarios/README.md) | Scripted reports and their file format |
| [evals/README.md](../evals/README.md) | The extraction eval and the reply eval: cases, how to run them, the latest scores |
| [evals/callsigns.cases.json](../evals/callsigns.cases.json) | The call-sign eval's cases; how to run it is in [callsigns.md](callsigns.md#the-eval) |
| [evals/requests.cases.json](../evals/requests.cases.json) | The recon-request eval's cases; how to run it is in [tracks.md](tracks.md#recon-requests-and-tasking) |
| [evals/journal.md](../evals/journal.md) | Every attack and tune of the extraction prompt |

## How these docs work

- **Docs say what is true now; DECISIONS.md says why.** A number in brackets, such as [46], is a decision there. Cite one when it explains a rule.
- **Change the docs in the same commit as the code they describe.** The table above says which file.
- **Give status a date.** "Built", "not started" and "measured" go stale. Say when something was checked, in Paris time.
- **Plain, short sentences,** in the same style as the README and DECISIONS.md. Write for a teammate who joined this morning.
- **Diagrams as text:** ASCII in a code block, or Mermaid, which GitHub draws. No images that only one tool can edit. In a block diagram, a dashed box or line is optional or not built yet, and the text under it says which. Draw top to bottom when a diagram gets wide, so it stays readable on GitHub. Start no label with a number and a full stop: Mermaid reads "1. Query" as a list and prints an error in the box. The block diagrams are in [architecture.md](architecture.md#block-diagrams), [contracts.md](contracts.md), [gazetteer.md](gazetteer.md#how-it-is-built) and [plan.md](plan.md#local-mode).
- **Screenshots as PNG** in `docs/images/<topic>/`, each under about 600 KB (reduced to at most 256 colours), with the date, the mission and how to take them again in the text. Retake them when the screen changes. [tracks.md](tracks.md) is the first page with them. When fewer colours make two units' colours run together, use JPEG instead, as [showcase.md](showcase.md) does [260].
- **Link, don't copy.** To share with someone outside the repo, send a GitHub link. Link to another file or heading instead of repeating it.
- **New topic, new file.** Add it to the table above in the same commit.
