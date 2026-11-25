# Kickoff: Saturday 21 November, 08:00

For the two teammates who join today. About fifteen minutes; one section per screen. Written on Saturday at 02:00 from the other docs, and each section links to the file with the detail. Nothing here assigns anyone: section 9 is the part to settle together.

---

## 1. What we are building

**Voice-to-Map.** A soldier says where they are. A marker with their call sign moves on a shared map within seconds. When a report could mean two places, the app asks which one instead of guessing.

EDTH Paris 2026, challenge 01, set by Lysk. Their brief: teams report their position by voice ("I am behind the church", "I moved towards 35th street"), and someone updates the map by hand, which is slow and error-prone.

- Nine teams took this challenge. 39 teams are registered in all.
- Lysk's mentors are Henry Heinemann and Florent Ogès.
- The jury is military representatives, mentors and partner companies. It counts only what was built during the event.

More: [overview.md](../overview.md).

---

## 2. What the jury looks at

From Lysk's deck. All three come first; what is ours comes on top.

| Judged item | Where we stand |
|---|---|
| It works live: speak, and the map updates within seconds | Works. About 1 to 3 s from the end of speech to the marker. |
| Natural phrasing is understood ("south of the church", "towards 35th street") | Works for both of the deck's sentences. |
| Marker and path, with timestamps and a browsable history, on a shared map anyone can replay | Built on Friday night: call signs, trails, a feed, a replay. It runs on a laptop. Not yet tried with real phones or on a projector. |

---

## 3. What is ours

- **It asks back.** A report that could mean more than one place gets a question, aloud, with up to three choices. A silently wrong marker is worse than a question.
- **The model never makes a coordinate.** It only reads the intent: place, kind of place, relation, distance, direction. Plain code places that against a local list of real places from OpenStreetMap.
- **No GPS.** The app never reads the phone's location, so jamming does not matter.
- **It works with the uplink off.** A laptop runs the whole pipeline. This demo is mandatory for us and not finished.
- **Ukrainian, English and French.** A report in Russian is answered in Ukrainian.
- **European providers only.**

---

## 4. How it works

```
transmitter                 coordinator (Next.js, on a Mac or hosted in Paris)        receiver
───────────                 ──────────────────────────────────────────────────        ────────
phone app, web page,   ──►  1. speech-to-text    Mistral, or Whisper on the phone
or a scripted clip          2. intent            Mistral, or a small model on the Mac
(a stand-in for             3. resolver          plain code + the gazetteer: no AI
 a field radio)             4. log               one append-only file per mission   ──►  shared map,
                       ◄──  a marker, or a question with up to three choices              units, feed,
                                                                                          replay
```

Five words to learn: **transmitter**, **coordinator**, **receiver**, **mission** (one run, one log) and **gazetteer** (our list of places for one area). The rest are in [glossary.md](../glossary.md); the parts are in [architecture.md](../architecture.md).

---

## 5. See it

Two minutes, on the Mac that runs the coordinator.

1. Open `http://localhost:3117/receiver` on the big screen.
2. Missions → New mission: Vincennes, any name, start point "Château de Vincennes".
3. Join from the transmitter app and play the Vincennes scenario. Or send typed reports, with the mission's code from the top bar:

```bash
curl -s -X POST http://localhost:3117/api/report --form-string session=vincennes-1 --form-string callsign=ALPHA1 --form-string "text=I'm at Bérault metro."
```

Then say or type, in order: "Now I'm at the château de Vincennes" (it asks: castle or station?), "Moving towards the town hall" (the marker moves half way, with an arrow), "Je suis devant la mairie". Drag the slider to replay. The scripts are in the [README](../../README.md#demo-script).

---

## 6. Where we stand

Checked on Friday night, 20 November.

| Built | Not done |
|---|---|
| One speaker's path, end to end, on the live site: Vincennes and central Kyiv | The live site keeps no reports, so its receiver is empty. |
| Shared map, call signs, replay; missions that open, are joined and end | A run with two or three real phones and a projector |
| Native app on an iPhone, with speech-to-text on the phone | The Android microphone ([handoff](handoff-android-microphone.md)) |
| Offline mode: intent on the Mac through Ollama, no key needed; the map, saved on the Mac by `npm run basemap` (22 Nov) | The offline network and HTTPS |
| Crossings, distance and compass direction, same-name streets in two towns | Grid references, spoken coordinates, nicknames that are on no map |
| Unit tests for the resolver, and two scripted scenarios | The evaluation harness; real Ukrainian speech; an error figure from a field walk |
| A third area: Izium, a town near the front, built on Saturday night with its own 9-step script ([gazetteer.md](../gazetteer.md#izium-added-saturday-21-november)) | The pitch: story, deck, video |

The known limits are in [known-gaps.md](../known-gaps.md).

---

## 7. What we do not know yet

Alex looks for Lysk's mentors from 08:00. Three answers can move the plan ([all seventeen questions](../open-questions.md#for-lysk)):

1. **How does a report reach the map today?** A radio net heard at the command post, or a device per speaker? Our phone app is only a stand-in for a radio. If it is radio, nobody "joins", the call sign has to come from the words, and noise becomes the main risk.
2. **How will they judge it?** Their sentences and places, or ours? Which area? Live or a video?
3. **A marker in the wrong place, or no marker until someone clarifies?** Asking back is our main difference. We want to hear that they want it.

Expect the plan below to change once by midday.

---

## 8. The two days

Times are Paris.

| When | What |
|---|---|
| Sat 08:00 | This kickoff. Set up your computer ([section 10](#10-get-set-up)). |
| Sat morning | Mentors. Local mode starts. First runs with real phones. |
| Sat 13:00 | Local mode works in the hall, or a second person joins it. |
| Sat afternoon | Show the mentors a working version. Field walk for an error figure. |
| Sat 18:00 | **Presentable:** a timed 3-minute run-through of the demo, and a first deck. |
| Sat evening, Sun morning | Pre-selection: the organisers pick who pitches. It can start while we still build. |
| Sat 22:00 | Feature freeze. Record a backup video. |
| Sun 10:00, 11:00, 11:30 | Video done, deck done, submit. The deadline is 12:00. |
| Sun 13:00 | Demo Day |

---

## 9. The work: four roles

There are four of us, so the work is four roles. Pick one; nobody is assigned. The detail, and what we leave out to fit, are in [work-split.md](work-split.md). The plan behind each part is in [plan.md](../plan.md).

| Role | A first task |
|---|---|
| 1. Core: receiver, missions, tracks | Alex keeps it, and turns the mentors' answers into changes. |
| 2. Phones | The Android microphone ([handoff](handoff-android-microphone.md)), then a mission with three phones and a projector: write down what breaks. |
| 3. Local mode | A Wi-Fi network with no internet, then the offline map: save the tiles, fonts and icons for our areas and serve them from the Mac. Self-contained. |
| 4. Evidence, then pitch | Ten real clips from the team, scored on the place that comes back. From 13:00, the story in ten lines and a 3-minute demo script. |

Roles 1, 3 and 4 need no Xcode. Role 4 needs no code after midday.

---

## 10. Get set up

About thirty minutes. No Mistral key is needed.

```bash
git clone git@github.com:beverage/edth-hackathon.git
cd edth-hackathon
```

Then ask your coding agent: "set up this computer by following docs/setup.md". It works through [setup.md](../setup.md) with a check after each step: the web app, offline mode with Ollama, and the transmitter on a phone if you have a Mac with Xcode. Claude Code and Codex both read [AGENTS.md](../../AGENTS.md).

The app runs on port 3117, not 3000. Before you push:

```bash
npm test && npx tsc --noEmit && npm run lint
```

---

## 11. How we work

- **Every choice gets one numbered line** at the end of [DECISIONS.md](../../DECISIONS.md). A rule that looks odd usually has a line there.
- **Docs change in the same commit as the code.** [README.md](../README.md) says which file covers what.
- **Contracts change on purpose.** `lib/geo/types.ts` and the fields of `POST /api/report` are shared with the transmitter and the receiver ([contracts.md](../contracts.md)).
- **Secrets live in env vars.** The repo is public.
- **Deploys go through Alex** for now.

Four rules of the product, which agents follow too:

1. The language model never produces coordinates.
2. The app never reads GPS.
3. When a report is ambiguous, ask back. No silent guesses.
4. Providers stay European.

---

## 12. To settle before 08:30

1. Who takes which role, and who owns the pitch ([work-split.md](work-split.md#four-roles)).
2. Git: everyone on `main` with small commits and `git pull --rebase`, or short branches with pull requests.
3. One shared Mistral key, or each person their own. Offline mode needs none.
4. The demo area: Vincennes, central Kyiv, or Izium. The mentors' answer may decide it.

The full list is in [open-questions.md](../open-questions.md#for-the-team).
