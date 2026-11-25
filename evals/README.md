# Extraction eval

Checks how well the model turns a transcript into an intent and, with `--resolve`, what the resolver then answers. It does not check speech-to-text. It is layer 2 of the [evaluation plan](../docs/plan.md#evaluation-harness).

The call-sign eval (`callsigns.cases.json`, `npm run eval:callsigns`) is separate and needs no model: see [docs/callsigns.md](../docs/callsigns.md#the-eval). So is the recon-request eval (`requests.cases.json`, `npm run eval:requests`): see [docs/tracks.md](../docs/tracks.md#recon-requests-and-tasking). `callsigns.signoff-limits.json` holds the held-out cases for a call sign at the end that the reader cannot tell apart; it is a record, not a gate.

The stage eval (`stage.cases.json`, `npm run eval:stage`) is the other way round: it checks the whole pipeline on a few lines. It sends each line of the pitch's script to a running coordinator as a radio report, typed or as a clip in a synthetic voice, and scores the reply and the mission's log. It needs a coordinator in offline mode, so it is not in `npm test`: see [docs/stage-test-plan.md](../docs/hackathon/stage-test-plan.md#the-passes).

```bash
npm run eval:extract                              # hosted Mistral, needs MISTRAL_API_KEY in .env.local
PROVIDER_MODE=local npm run eval:extract          # the local model through Ollama
npm run eval:extract -- --resolve --repeat 3      # the full check: outcomes, wrong pins, flaky cases
npm run eval:extract -- --area kyiv               # one area
npm run eval:extract -- --tag track,fr            # cases with any of these tags
npm run eval:extract -- --only s-k1,s-k5          # named cases
npm run eval:extract -- --cases <file>            # another cases file, such as an attack's draft
npm run eval:extract -- --save-baseline           # write evals/baselines/<model>.json from this run
npm run eval:extract -- --no-compare --no-save    # no comparison, no results file
npm run eval:outcomes                             # add outcomes to cases that have none
npm run eval:outcomes -- --check                  # check outcomes still match the resolver
npm run eval:format                               # one case per line, after editing the file
npm run eval:baseline -- evals/results/<run>.jsonl  # a saved full run as the baseline, no rerun
```

The script calls the same `getExtractor()` and `systemPrompt()` as the coordinator, so it scores whatever prompt and model the app would use. The language is not pinned, so the model's own label is scored after the check on the letters [104]. It is not part of `npm test`, because it needs a key or Ollama. `tests/evalCases.test.ts` checks the cases file in `npm test`, with no model: every case's expected fields must score clean and get their own outcome from the resolver.

## Cases

`extraction.cases.json` holds one case per line:

```
{ "id": "p-street", "area": "vincennes", "tags": ["paraphrase"],
  "text": "I'm on rue de Fontenay.",
  "expect": { "kind": "position", "landmark_name": "rue de Fontenay", "landmark_category": "street", "relation": "at" },
  "outcome": { "status": "resolved", "feature_id": "street/rue-de-fontenay" }, "outcome_from": "resolver",
  "from": { "feature": "node/9415191169" },
  "note": "why, when it is not obvious" }
```

- **`expect`**: only these fields are scored. Leave a field out when the prompt's rules allow more than one answer. A list means any of these: `"direction": ["west", null]`. Text is compared without case, extra spaces, end punctuation or curly apostrophes.
- **`outcome`**: what the resolver should answer, scored with `--resolve`. `status` (a list is any of these), `feature_id` for the place, `heading_to` for a movement's target. `["ambiguous", "unresolved"]` means "asks back"; the kind of question is not compared.
- **`outcome_from: "resolver"`**: the outcome was worked out by `eval:outcomes` from the case's own `expect`, so `--refresh` may rewrite it after a resolver change. Scenario cases carry the outcome from their scenario file instead.
- **`from`**: where the speaker was before, as the coordinator would know it: a gazetteer id or a crossing id, and optionally `street` and `heading_deg`. Without it the speaker has no last position.
- **`area`** picks the place given to the prompt ("Vincennes, France") and the gazetteer.
- **Tags:** `scenario` (the scenario scripts' sentences), `paraphrase`, `filler`, `fr`, `uk`, `mixed`, `stt_error`, `distance`, `other`, `track`, `trap` (built to catch one rule), `adversarial` (added by an attack, below), `compass` (a track's place and heading as two compass words), `blocks` (a count of blocks or streets, counted in code [184]), `contact` (a contact, a track whatever the model reads [180]).

A case whose words are already one of the prompt's examples is marked `[in prompt]`. Its score is shown apart, because a pass there proves little.

## Reading a run

Each failed case lists the fields that were wrong. `PIN!` marks a **wrong pin**: the answer put a pin or a heading on the map where the case wanted a question, or at another place. That is the worst miss, because the operator sees a wrong position with nothing to say it is wrong. A question where a pin was wanted is a plain miss: the speaker is asked.

The summary gives:
- cases passed, overall, held out and in prompt (with `--repeat`, one count per round);
- outcomes passed and wrong pins (with `--resolve`);
- flaky cases, which pass in some rounds and fail in others, and the fields that changed between rounds (with `--repeat`; temperature 0 is not deterministic);
- the median and 90th-percentile time;
- the share passed by field and by tag. The by-field table says which rule of the prompt to work on.

Each run prints a **prompt id**, a hash of every area's prompt and the schema. Two runs with the same id scored the same prompt.

## Baselines

`baselines/<model>.json` is the committed reference run for each model: each case's verdict by majority over its rounds, and its wrong pins. When a baseline exists, every run is compared with it and lists regressions (passed, now fails), new wrong pins, improvements, and cases the baseline does not have. The run **exits 1 on a regression**, or on a new wrong pin when both runs used `--resolve`.

Save a baseline only from a full run (`--resolve --repeat 3`, no filters), and only when a prompt change has been accepted. `prompt-tune` says when. `--save-baseline` writes it from the run in progress; `npm run eval:baseline -- <results file>` writes it from a run already saved, and refuses one that used filters, missed a case or scored another prompt.

Runs are saved to `results/<model>-<time>.jsonl`: one header line with the prompt id and the summary, then one line per case and round with the full intent and the resolver's answer.

## Growing and tuning: the skills

Two skills, adapted from levelang's, drive the work. They live in `.agents/skills/` (Claude Code reads them through the `.claude/skills` link; Codex reads `.agents/skills`):

- **`prompt-attack <rule>`** writes 5 to 10 reports built to break one rule, has a second, independent reading check the expected answers, runs them three times, and adds the confirmed ones as `adversarial` cases. It never edits the prompt.
- **`prompt-tune <rule>`** takes the baseline, diagnoses the rule's failures, edits `systemPrompt()`, runs the full corpus on both models, refuses regressions, and records the change in `DECISIONS.md` and the journal.

Both write to [`journal.md`](journal.md): what was attacked or tuned, what was found, what was accepted as a model limit. [docs/handoff-prompt-tuning.md](../docs/hackathon/handoff-prompt-tuning.md) has the whole process, where it stands and what is next.

## Scores

Full corpus, `--resolve --repeat 3`, on the MacBook (M1 Pro). The baselines hold the latest row for each model.

| Date | Prompt | Cases | Model | Case results passed | Wrong pins | Flaky | Median |
|---|---|---|---|---|---|---|---|
| 21 Nov | `a6871d1ee3` | 65 | Mistral Small (hosted) | 182 of 195 (93%) | 0 | 1 | 0.7 s |
| 21 Nov | `a6871d1ee3` | 65 | Ministral 3 3B (local) | 150 of 195 (77%) | 0 | 0 | 2.6 s |
| 21 Nov | `a6871d1ee3` | 75 | Mistral Small (hosted) | 199 of 225 (88%) | 7 | 2 | 0.7 s |
| 21 Nov | `a6871d1ee3` | 75 | Ministral 3 3B (local) | 156 of 225 (69%) | 15 | 0 | 2.7 s |
| 21 Nov | `5f066fb66b` | 75 | Mistral Small (hosted) | **209 of 225 (93%)** | **0** | 1 | 0.7 s |
| 21 Nov | `5f066fb66b` | 75 | Ministral 3 3B (local) | 156 of 225 (69%) | **9** | 0 | 2.6 s |
| 21 Nov | `4c9ef72e73` | 85 | Mistral Small (hosted) | **237 of 255 (93%)** | **0** | 3 | 0.7 s |
| 21 Nov | `4c9ef72e73` | 85 | Ministral 3 3B (local) | 174 of 255 (68%) | 12 | 0 | 2.3 s |
| 21 Nov | `300d5e0a2d` | 119 | Mistral Small (hosted) | 319 of 357 (89%) | 2 | 11 | 0.8 s |
| 21 Nov | `300d5e0a2d` | 119 | Ministral 3 3B (local) | 237 of 357 (66%) | **9** | 0 | 3.4 s |

The 75-case rows add the two-places attack; `5f066fb66b` is the two-places tune. The 85-case rows add 10 side-word cases ("Friendly at the town hall."); `4c9ef72e73` is the side-word tune. The 119-case rows add `e-vincent-station`, the 25 compass, contact and blocks cases [186], [187] and 8 `compass-only` cases ("Enemy vehicle to the east."); `300d5e0a2d` is the compass-only tune [196]. All are in the journal. In that hosted run 6 results were refused by Mistral's rate limit, so 6 of its 11 flaky cases are refusals; each passed its other two rounds. The local median of that run is from a GPU shared with two other sessions; back to back on the same cases the two prompts were within each other's noise.

Hosted misses now, every round: "outside" read as near (`p-outside`); "Copy that, moving out" as a movement (`o-moving-out`); generic words written as names ("pharmacy", "park", "cimetière" in `a-two-places-3`, `-4`, `-5`, and `t-side-ennemis-cimetiere` once), which asks back but is against the name rule. Since the compass-only tune, "Hostel drone 1 km east" (`a-compass-6`) loses its distance and gets "east" as its heading 9 times in 10, so it asks instead of placing; «біля» in `uk-pharmacy` is read as at about half the time. `a-two-places-10` pins now and then on every prompt so far: 1 to 6 times in 20 on the side-word prompt, whose baseline had it 3 of 3.

The 3B model gives the same answer in every round, so its misses are not noise. It still fails names in the wrong script ("Golden Gate", "Khreshchatyk" in Cyrillic), some Ukrainian lemmas, «за» as near, "I'm on rue de Fontenay" as a movement, and generic words as names. Its 9 wrong pins: `a-two-places-4` (the street it is on, not the pharmacy); `a-two-places-2`, where it goes to Bérault, the place being left, as in the example "Moving towards Bérault"; and `t-side-friendlies-castle`, where it writes "castle de Vincennes" and pins the track at the metro station of that name. `fr-hdv`, where it wrote "Bérault", a name from the prompt's examples that was not said, no longer pins since the compass-only tune. It also reads the control "This is a friendly unit, we're at the town hall." as a track, loses the heading of "Three trucks on avenue de Paris, moving north." (`t-trucks`), and with both a way and a heading ("Two trucks to the north, moving west.") keeps only the heading.

## Open

- **The eval does not see whose marker moved.** A wrong pin compares places only. "Friendly at Vincennes Metro." read as the speaker moves the unit to the right station, so only the `subject` field catches it, and only in cases that score `subject`.
- **The 3B model copies example names.** "Bérault" is in two of the prompt's examples and turned up in two reports that never said it, once the two-places tune changed the prompt. The next tune: swap the Vincennes names in the examples for names in no gazetteer.
- **May the model repair a misheard name?** Asked "I'm at bear oh metro.", hosted Mistral writes "Bérault", the right station, though the prompt says to copy only what was said. The case accepts both a question and Bérault. Repairing names helps with speech-to-text errors but is a guess the resolver cannot see.
- **`p-two-places` and `fr-leaving` have no start position,** so they can never show a wrong pin. Giving them one changes their expected outcome: the person's call.
- **The expected answers were written by agents and checked only against the rules.** The Ukrainian and Russian cases need a native speaker.
- **A misheard name pinned through the resolver** (fixed [185]): "I'm at Vincent station." is read right (name "Vincent", a metro station), and the resolver used to pin Collège Germaine Tillion, the one match for the name. Now a type said outright against a lone match of another type asks among the places of that type; the case is `e-vincent-station`. The model still does not repair "Vincent" to "Vincennes", which bears on the question above.
- **Layer 3 has one data point.** Hosted speech-to-text wrote "Vincennes" for all 14 American-voiced synthetic clips (macOS voices), including ones spelled to sound American ("Vin Senz station"). No real voice yet. `KEEP_CLIPS=1` keeps each clip and its transcript in `.data/clips/`, which is how to collect real ones. Otherwise the eval is typed text only.

## Reply eval

Checks the reply reader (`lib/providers/replies.ts`): what a unit's reply to an open question does, such as pick a choice, say none, say where instead, or ask to hear it again. Measured, not used by the app yet. The design and the latest scores are in [docs/ask-back.md](../docs/ask-back.md).

The same cases also measure the code reader that is in the app (`readPick` in `lib/geo/replies.ts`, decision 251): `tests/replyPick.test.ts` runs it on every case, with no model, and fails on a wrong pick. Its counts are in [docs/ask-back.md](../docs/ask-back.md#built-the-code-reader). `replies.heldout.cases.json` holds 80 more replies, written on 22 Nov by an agent that had not seen the reader, for the same 15 questions: `expect` is `pick` or `none`, and `ambiguous` marks the ones a person could argue either way. `replies.heldout2.cases.json` is a second round by another agent, 110 replies, with ten `questions` of its own whose choices give `name`, `category`, `town` and `distance_m`. The same test runs both.

```bash
npm run eval:replies                              # hosted Mistral
PROVIDER_MODE=local npm run eval:replies          # the local model through Ollama
npm run eval:replies -- --repeat 3                # the full check: flaky cases
npm run eval:replies -- --tag tail,trap --lang uk # cases with any of these tags, in these languages
npm run eval:replies -- --only e-two,f-deux       # named cases
npm run eval:replies -- --save-baseline           # write evals/baselines/replies-<model>.json
```

`replies.cases.json` has `questions`, each taken from the resolver (who it is about, the words, the numbered choices with their ids), and `cases`, each a reply to one of them:

```
{ "id": "e-two-blocks", "question": "chateau-en", "tags": ["trap"], "reply": "Two blocks east.",
  "expect": { "kind": ["new_report", "rephrase"] }, "note": "a count, not choice 2" }
```

- **`expect.kind`**: `pick`, `none`, `rephrase`, `repeat`, `stand_by`, `dont_know`, `disregard`, `new_report` or `unclear`. A list means any of these. `choice` (from 1) is scored only when the reader says pick.
- **Tags:** every case is `fast` (code alone could settle it), `tail` (needs a reading) or `trap` (built to catch one mistake). Also `stt_error` and `ru`.
- **Costly misses** are marked in the output: `PICK!` a choice the speaker did not mean, `SUBJ!` a track's place read as the speaker's or the other way round, `DROP!` a disregard nobody said. A run compared with a baseline exits 1 on a regression or a new costly miss.

The reply prompt is separate from the extraction prompt, so changing it does not move the extraction baselines. Runs are saved as `results/replies-<model>-<time>.jsonl`. `tests/replyCases.test.ts` checks the cases file in `npm test`, with no model. On a 429 from Mistral the runner waits and tries again, up to five times.
