# Handoff: tuning the intent-extraction prompt

Written Saturday 21 November, late morning (Paris time), updated after the compass-only tune, for whoever picks up the prompt work next, person or coding agent. The work is ongoing, not a one-off: when it settles, fold what is still true into [evals/README.md](../../evals/README.md) and delete this file and its row in [README.md](../README.md).

## What this work is

The extraction prompt (`systemPrompt()` in [lib/providers/extractor.ts](../../lib/providers/extractor.ts)) turns a transcript into an intent: what kind of report, which landmark, which relation, how far, which way. The resolver then places the intent against the gazetteer. The model never gives coordinates [AGENTS.md rules].

The goal is fewer **wrong pins**: a pin or a heading on the map at a place the speaker did not mean. A question back is safe; a wrong pin is not, because the operator has nothing to tell them it is wrong. Every change is measured on a fixed set of cases, on both models, before and after.

## Read first, in this order

1. [evals/README.md](../../evals/README.md): the eval, the case format, how to read a run, the scores so far, the open questions.
2. [evals/journal.md](../../evals/journal.md): every attack and tune so far, what it found, what was accepted.
3. [.agents/skills/prompt-attack/SKILL.md](../../.agents/skills/prompt-attack/SKILL.md) and [.agents/skills/prompt-tune/SKILL.md](../../.agents/skills/prompt-tune/SKILL.md): the two procedures. A coding agent loads them as skills (`prompt-attack`, `prompt-tune`); a person follows them by hand.
4. Decisions [153], [159], [169] and [179] in [DECISIONS.md](../../DECISIONS.md): why the eval works the way it does, and the two tunes.

## Where things are

| Path | What |
|---|---|
| `lib/providers/extractor.ts` | The prompt (`systemPrompt`), the schema (`INTENT_SCHEMA`), `sanitizeIntent` |
| `evals/extraction.cases.json` | The cases, one per line: transcript, expected fields, expected outcome, start position |
| `evals/baselines/<model>.json` | The accepted reference run per model; every run is compared with it |
| `evals/results/*.jsonl` | Every saved run: a header with the prompt id and summary, then one line per case and round with the full intent and the resolver's answer |
| `evals/journal.md` | The working log of attacks and tunes |
| `lib/evals/extraction.ts` | Scoring: fields, outcomes, wrong pins, flaky cases, baselines, comparison (pure, unit-tested) |
| `lib/evals/resolve.ts` | Runs the resolver for a case, from its start position |
| `scripts/eval-*.ts` | The commands below |
| `tests/evalCases.test.ts` | Runs in `npm test` with no model: every case is well formed and can pass |
| `.agents/skills/` | The skills; `.claude/skills` is a link to it |

## Setup

- **Hosted model** (Mistral Small): `MISTRAL_API_KEY` in `.env.local`. The script loads it itself.
- **Local model** (Ministral 3 3B): Ollama running with `ministral-3:3b` ([setup.md](../setup.md#install-once)). No key.
- Check both: `npm run eval:extract -- --only s-v1 --no-save --no-compare`, and the same with `PROVIDER_MODE=local` in front. Each should print `ok s-v1`.

## Commands

```bash
npm run eval:extract -- --resolve --repeat 3                      # the full check, hosted (about 3 min)
PROVIDER_MODE=local npm run eval:extract -- --resolve --repeat 3  # the full check, local (about 9 min)
npm run eval:extract -- --tag two-places --resolve --no-save      # one rule's cases, quick
npm run eval:extract -- --cases <draft.json> --resolve --repeat 3 --no-save --no-compare   # an attack's draft
npm run eval:outcomes -- <file>            # add expected outcomes to cases that have none
npm run eval:outcomes -- --check           # outcomes still match the resolver (no model)
npm run eval:format                        # one case per line, after editing the cases file
npm run eval:baseline -- evals/results/<run>.jsonl   # an accepted run becomes the baseline
```

A full run exits 1 on a regression or a new wrong pin against the baseline.

## The cycle

Work one rule at a time, in this loop:

1. **Attack** the rule (`prompt-attack <rule>`): 5 to 10 reports built to break it, each with a start position so a misreading can pin. A second, independent reading of the rules checks every expected answer; only fields both readings agree on are scored. Confirmed cases go into the corpus tagged `adversarial`. The prompt is not touched.
2. **Tune** the rule (`prompt-tune <rule>`): check the baseline is for the current prompt, diagnose, change only the lines the diagnosis names, run the full corpus on both models, and keep the change only with no regression or with the person's yes in their own words.
3. **Record**: new baselines from the accepted runs, a decision line, a journal entry, the scores table in `evals/README.md`, and `docs/known-gaps.md` if a gap opened or closed.
4. **Commit** when the person asks: the prompt change, the baselines, the run files, and the records together.

## Where it stands (21 Nov, prompt `300d5e0a2d`, 119 cases)

| Model | Case results passed | Wrong pins | Median |
|---|---|---|---|
| Mistral Small (hosted) | 319 of 357 | 2 | 0.8 s |
| Ministral 3 3B (local) | 237 of 357 | 9 | 3.4 s (shared GPU) |

Done: the eval, the skills, two attacks, two sets of cases from code changes, and three tunes (two places in one report; a side word alone, "Friendly at the town hall.", is a track; a thing given only a compass way, "Enemy vehicle to the east.", is a track). The offline model is the target of the last one; its hosted costs were accepted [196].

## Next, in order

1. **Example names leak into the 3B model's answers.** It writes "Bérault", from two of the prompt's examples ("Moving towards Bérault", "Track 3 moved to Bérault"), for "Two blocks past the church" and "Je suis derrière l'hôtel de ville", and pins the unit at Bérault metro (`fr-hdv` until the compass-only tune; `p-blocks` until the side-word tune). It also reads "From Bérault metro, moving towards the town hall." as going to Bérault, like the example (`a-two-places-2`). Tune: rewrite the examples' Vincennes and Kyiv names to names in no gazetteer, then check the hosted model did not lose anything. This also touches decision [104] (the 3B model labelling English as Ukrainian after Kyiv examples).
2. **Generic words written as names:** "pharmacy", "park", "cimetière" come back as `landmark_name` (`a-two-places-3`, `-4`, `-5`). Attack and tune the `landmark_name` rule.
3. **"Outside" read as near** (`p-outside`) and **«за» read as near** on the 3B model (`uk-behind`): the relation rule.
4. **"Copy that, moving out" read as a movement** (`o-moving-out`): the rule for `other`.
5. **Attack the rules with few cases:** crossings, lemmas on the 3B model, distances in words.
6. **Two compass words in one track report on the 3B model:** a way and a heading ("Two trucks to the north, moving west.", `t-compass-heading`; `a-compass-*`), and `t-trucks`, which lost its heading in the compass-only tune. Code checks the words since [186], so this is about the fields, not the pin. On hosted, `a-compass-6` asks instead of placing since that tune [196].

Not a prompt cycle, but waiting on one: "I'm at Vincent station." pins a school named Vincent d'Indy through the resolver ([known-gaps.md](../known-gaps.md)). Add it as a case once the resolver asks back there ([evals/README.md](../../evals/README.md#open) has the details).

Questions for Alex before they are acted on, also in [evals/README.md](../../evals/README.md#open):
- May the model repair a misheard name ("bear oh" to "Bérault")?
- Should `p-two-places` and `fr-leaving` get a start position, which changes their expected outcome?

## Things that will trip you up

- **One prompt for everything.** Every area, every language and both models share it. A fix for one rule can move any other case, which is why every tune runs the full corpus on both models.
- **The two models behave differently.** Mistral is not deterministic at temperature 0: a case that passes 2 of 3 is flaky, not fixed, so tune with `--repeat 3`. The 3B model gives the same answer every round, so its misses are real, but it is fragile: a change anywhere in the prompt can move a case elsewhere (the Bérault leak appeared after the two-places tune).
- **Mistral follows negative framing** ("never", WRONG/RIGHT pairs) well. Do not reword prohibitions into positive-only form; levelang measured a drop when that was done on Mistral.
- **Examples leak into the 3B model.** Use places in no gazetteer (a bakery, a post office, a market) and never a case's own words. The eval marks a case whose words are in the prompt `[in prompt]`.
- **A case with no start position can only ask back,** so it can never show a wrong pin. Give attack cases a `from` at the place the speaker names, as a mission would.
- **A timeout counts as a failed result,** not a model answer (`ERR`, "aborted due to timeout"). Rerun before reading anything into it.
- **The baseline must match the prompt.** Each run prints a prompt id. If it differs from the baseline's, the prompt changed since: ask before tuning, or the comparison mixes two changes.
- **Do not run two local runs at once;** they share one Ollama and both slow down. Other sessions may use Ollama or the GPU too (speech-to-text work runs Whisper on it): compare speed back to back on the same cases, not with the baseline's median.
- **Three rounds miss rare hosted flakes.** `a-two-places-10` was 3 of 3 in the side-word baseline and pins 1 to 6 times in 20 on that same prompt. Before reading a flagged hosted case as a regression, run it 10 to 20 times on both prompts (`--only <id> --repeat 20 --no-save --no-compare`).
- **Mistral's rate limit is shared** with every session using the key. A 429 can outlast the retries [191] and shows as `ERR`; it is not a model answer.
- **Other sessions commit to `main` as you work.** Check `git log` before committing, stage only your files, and if your decision number is taken, keep both lines and renumber yours.
- **Outcomes depend on the resolver.** After a resolver change, run `npm run eval:outcomes -- --check`; `--refresh` rewrites the outcomes it derived itself, never a scenario's.

## Definition of done for a cycle

- The full corpus on both models, 3 rounds, compared with the baselines: no regression and no new wrong pin, or each one accepted by the person in their own words.
- `npm test`, `npx tsc --noEmit` and `npm run lint` pass.
- Baselines, the decision line, the journal entry and the scores table updated.
