# Stage test plan

How we test the demo before the pitch on Sunday 22 November, and which lines go on stage. Passes 0 to 2 were run on the night of 21 to 22 November, with nobody speaking: typed reports and synthetic voices. Passes 3 to 5 need Alex's voice and the team.

## What is fixed

Decided by Alex on 22 November [236]:

- **Offline.** The Mac is the coordinator, in offline mode: Whisper large-v3-turbo for speech, Ministral 3 3B through Ollama for the words. No internet. We are the only team that runs offline, so we show that.
- **One phone is every radio.** The native app, hold to talk. It sends no call sign: the coordinator reads the sender from the words [202]. Alex speaks every unit.
- **Vincennes, in English.**
- **The roster:** ALPHA 1 and BRAVO 2 on foot, CHARLIE 3 the drone team. The command post marks CHARLIE 3 as a drone team before the demo [235].
- **The call sign is said right, and said first.** We do not test wrong or unknown call signs for the stage. We do test that Whisper writes the three call signs as said.

## What the night's tests changed

Six things were not as the first plan assumed. Each is in [Results](#results).

1. **"The town hall" and "the castle" make the app ask.** From the start point and from Vincennes station, the two town halls are not far enough apart for the nearer one to win, and the castle shares its name with the metro station. The script is now ordered so that "the town hall" is said by a unit standing near it, and the other lines use a station name, a bearing or a grid.
2. **Say whose it is and what it is.** "Alpha 1, vehicle, bearing 60 degrees, 300 metres" and "contact at 2 o'clock" were read as ALPHA 1 itself moving. "Unknown vehicle, bearing 060, 300 metres" was read right every time.
3. **", over" at the end lost the position.** The offline model read "at Vincennes station, over." as no place at all. Closing words are now cut before the model reads a radio report [237].
4. **A call sign at the end is a question for the operator, not a sender** [237]. Alex asked for it to count as the sender, as a sign-off. Held-out tests showed that speaking to a unit ("Push up to the station, Bravo 2") looks the same, and the first two versions moved the wrong unit. So the report waits in the tray with "Was that ALPHA 1?", and one tap confirms it.
5. **The far guard is real.** "Alpha 1, at Mairie de Vincennes" straight after "Alpha 1, at Vincennes station" was held as "moved 461 m in 0 s". After 25 seconds it went through.
6. **A spoken answer to a question does not answer it.** "Bravo 2, the metro station" asked again. On stage the operator answers on the command post. Since decision 251 a short answer like that one is heard instead: the command post shows choice 1 picked, and the operator presses Enter. Checked with a typed report on 22 Nov, not with a voice and not in the passes below.

## What can fail on stage

| # | Risk | Why we expect it | Where it is tested |
|---|---|---|---|
| 1 | Whisper mishears a French name said in English | Offline, Whisper takes no hint names [195, 205] | Passes 2 and 3. The script has one French name, "château" |
| 2 | A unit's report is held as "moved too far" | One person speaks three units, fast [204]. Seen in pass 1 | [Pacing](#pacing-the-far-guard); pass 4 |
| 3 | The small model reads a line wrong | It gives the same answer every time, so a line that passes typed keeps passing. But one word can change the reading | Pass 1: every stage line three times, and other wordings. Say the lines as written |
| 4 | Whisper writes a call sign oddly | "Alpha won", "Bravo to", "Charlie tree" are read as near matches, when one roster unit is close | Passes 2 and 3 |
| 5 | Hall noise, the PA, or a second voice in the clip | Offline Whisper does not tell voices apart | Pass 3 with noise; hold to talk only while speaking |
| 6 | The phone cannot reach the Mac | The venue's Wi-Fi blocks phone to Mac. The cable works; the phone's hotspot should | Pass 4 on both links; pre-flight |
| 7 | A report takes too long | Typed, a report took 2 to 3.5 s on the M1 Pro; speech adds Whisper's time. While other programs were using the Mac, typed reports took 5 s, spoken ones 3 to 11 s, and Whisper's voice-activity step alone once took 5.8 s for a 2.6 s clip | Pass 4, timed, with the projector set-up. Nothing else may be running: no second coordinator, no eval, no game |
| 8 | The first report is slow | The first report after a start took 16 s: the model loads on first use | Pre-flight: one warm-up report |
| 9 | A report with no call sign answers an open question | With one question open in the last 2 minutes, such a report goes to that unit [204] | Drill: the operator answers every question before the next report |
| 10 | The language is not pinned to English | Sent with no language, "Bravo 2, at the château." got its question in French | Pre-flight: the phone's language is English |
| 11 | Old missions on the screen | The command post shows a banner when another open mission gets a report | Pre-flight: end every other mission |

## The passes

A line goes on stage only when it has passed every pass, in this order.

| Pass | What | Who and when | A line passes when | Status |
|---|---|---|---|---|
| 0 | Code: `npm test`, with the call-sign and request evals | Claude | Everything is green | Done, green |
| 1 | **Typed, offline model.** Each line is sent as a radio report (text, no call sign field) to a fresh mission, the stage lines three times. Then other ways of saying it | Claude | 3 of 3 give the expected result | Done: [results](#pass-1-typed) |
| 2 | **Synthetic voices, offline Whisper.** Each line as a clip in macOS voices (`say` writes a file; nothing plays), sent as audio | Claude | Not a gate: it shows which words Whisper cannot write, before Alex spends voice time on them | Done: [results](#pass-2-synthetic-voices) |
| 3 | **Alex's voice,** through the phone to the Mac, the real path. The [voice sheet](#the-voice-sheet-for-the-morning) | Alex, in the morning | 5 of 5 for a stage line; 3 of 3 for an alternate | To do |
| 4 | **Dress rehearsal.** The whole script, with the projector, on the link we will use, timed. Twice in a row without a restart. Then the [drills](#drills) | The team, before leaving for the venue | Two clean runs; every drill done once | To do |
| 5 | **Pre-flight** at the venue | Alex and the operator, 10 minutes before | The [checklist](#pre-flight) | To do |

Passes 1 and 2 are one command, `npm run eval:stage`, against a running coordinator. The lines and what each must do are in `evals/stage.cases.json`; the runs are saved in `evals/results/stage-*.json`. To run it again after a change:

```bash
PROVIDER_MODE=local REPORT_STORE=file REPORT_STORE_DIR=.data/stage-check npm run dev -- -p 3147
npm run eval:stage -- --repeat 3 --variants          # pass 1
npm run eval:stage -- --stage --voices Samantha,Daniel,Karen,Moira   # pass 2
```

## The stage script

Every line here passed typed, three times of three. Alex's voice decides the final words.

**Before the pitch starts**

- The operator opens a mission: Vincennes, start point Château de Vincennes, roster ALPHA 1, BRAVO 2, CHARLIE 3.
- The operator picks **Drone team** under CHARLIE 3.
- "Charlie 3, at grid 586 101." CHARLIE 3 is placed at the castle. This is also the warm-up report.

**On stage, about 90 seconds**

| # | Who | Said, or done | What the command post shows | The point |
|---|---|---|---|---|
| 1 | Alex | "Alpha 1, at Vincennes station." | ALPHA 1's marker at the station, ±30 m | Speak, and the map moves |
| 2 | Alex | "Bravo 2, at the château." | A question: the castle and the metro station, numbered 1 and 2 on the map | We ask instead of guessing |
| 3 | Operator | Taps **2**, the metro station, then **Choose** | BRAVO 2's marker at the metro station | A person answers |
| 4 | Alex | "Bravo 2, moving towards the town hall." | The marker moves half way, with an arrow on to the town hall | Natural phrasing, a path |
| 5 | Alex | "Alpha 1, unknown vehicle, bearing 060, 300 metres, send the drone." | Track 1, an unknown vehicle, 300 m from ALPHA 1 on 060. A request in the Decisions list, with "Send CHARLIE 3 · drone team · free" | What a unit sees, and a request in one call |
| 6 | Operator | **Send CHARLIE 3**, then **Send** | A blue line from CHARLIE 3 to Track 1 | A person decides |
| 7 | Alex | "Charlie 3, Track 1 is hostile." | Track 1 turns hostile. CHARLIE 3 does not move | The drone team reports back |
| 8 | Operator | **Replay** from the start | The same minute again, with times | History |

Leave about 8 seconds between lines 3 and 4: the answer gives BRAVO 2 a fix, and the next report is checked against it ([Pacing](#pacing-the-far-guard)).

**Longer, if there is time,** each passed typed: "Alpha 1, I see a drone about 300 metres north of me." (D2); "Bravo 2, unknown vehicle at the town hall, send the drone." (F3b, once BRAVO 2 is near the town hall); "Alpha 1, two enemy vehicles on Avenue de Paris, moving east." (D1).

### Say it this way

| Say | Not | Because |
|---|---|---|
| "Vincennes station" | "the station", "Vincennes train station", "Vincennes metro station" | "The station" was not placed. The other two asked which one |
| "unknown vehicle", "enemy vehicle" | "vehicle" alone, "contact" | Without whose it is, the report was read as the speaker moving |
| "bearing 060" or "bearing zero six zero" | "bearing 60 degrees" with no "unknown" before it | The same |
| "the town hall", only when the unit is near it | "the town hall" from the station or the start | From far, it asks which town hall |
| "at grid 586 101" | "at the castle" | "The castle" asks: castle or metro station |
| "send the drone", "request eyes on", "requesting recon" | | All three were read as a request |
| The call sign first | The call sign last | Said last, the report waits for the operator's tap [237] |

"Over" at the end is fine now. So are "I'm at …", "now at …" and "position …".

## Results

### Pass 0, code

`npm test`: 509 tests in 36 files, none failing. The call-sign eval: 220 of 220, no wrong unit. The request eval: 84 of 84.

### Pass 1, typed

Offline mode on the M1 Pro, Ministral 3 3B, each line in a fresh mission with its scene set by typed reports. Blocks A to F: 107 of 112 runs. The stage lines:

| ID | Line | Result, 3 runs | Other wordings |
|---|---|---|---|
| A1 | "Alpha 1, at Vincennes station." | 3 of 3: Vincennes station, ±30 m | 5 of 5, once ", over" was cut [237] |
| A7 | "Charlie 3, at grid 586 101." | 3 of 3: the castle's cell, ±71 m | 5 of 5: digits said one by one, "grid 586101", "my position is grid …", "grid Delta Quebec …" |
| C1 | "Bravo 2, at the château." | 3 of 3: asks, castle or metro station | 4 of 5. "At the shadow", as Whisper may write château, was not placed: say it again |
| B1 | "Bravo 2, moving towards the town hall." | 3 of 3: towards Mairie de Vincennes, the marker half way | 5 of 5: "moving to", "heading towards", "on my way to", "I moved towards", "advancing on" |
| F3 | "Alpha 1, unknown vehicle, bearing 060, 300 metres, send the drone." | 3 of 3: Track 1, unknown vehicle, "300 m, bearing 060, from ALPHA 1", and a request on Track 1 | 5 of 5: "request eyes on", "requesting recon", "bearing zero six zero", "I see an unknown vehicle …" |
| F5 | "Charlie 3, Track 1 is hostile." | 3 of 3: Track 1 hostile; CHARLIE 3 and ALPHA 1 did not move; CHARLIE 3 still looking | 5 of 5: "track one", "confirm Track 1 is hostile", "eyes on Track 1, it is hostile" |
| D2 | "Alpha 1, I see a drone about 300 metres north of me." | 3 of 3: Track, unknown drone, 300 m north of ALPHA 1 | 3 of 3 |
| E1 | "Alpha 1, unknown vehicle, bearing 060, 300 metres." | 3 of 3 | 4 of 5: "vehicle, bearing 60 degrees" was read as ALPHA 1 moving, and held |
| F3b | "Bravo 2, unknown vehicle at the town hall, send the drone." with BRAVO 2 at the metro station | 3 of 3: Track 1 at Mairie de Vincennes, and a request | 4 of 4 |

The other lines, once each:

| ID | Line | What happened |
|---|---|---|
| A2 | "Bravo 2, at the town hall." from the start point | Asks: Mairie de Vincennes or Mairie de Saint-Mandé |
| A3 | "Charlie 3, at the castle." | Asks: castle or metro station |
| A4 | "Alpha 1, at Bérault metro." | Bérault, ±30 m. Also "Berault" and "at Bérault" |
| A4b | "Alpha 1, at Bayrold Metro.", as Whisper wrote it from synthetic voices | "I can't find “Bayrold”. Which station: Château de Vincennes, Vincennes, or Bérault?" |
| A5 | "Bravo 2, in front of the town hall." from the metro station, 16 s later | Mairie de Vincennes, ±80 m |
| A6, B2 | "Alpha 1, at the church." and "south of the church." | Asks which of three churches. Lysk's "south of the church" needs a unit near one church |
| A8 | "Alpha 1, at Mairie de Vincennes." | Placed, ±31 m. The French name works from anywhere, if Whisper writes it |
| A9 | "Bravo 2, at Château de Vincennes metro station." | The metro station, with no question |
| B3 | "Bravo 2, 200 metres south of the town hall." | Placed 200 m south of it |
| B4 | "Alpha 1, moved 300 metres east." 15 s after its last report | 300 m east, as an estimate, ±150 m |
| B5, B6 | "On Avenue de Paris, heading east." and "moving towards Avenue de Paris." | On the avenue; towards it, the marker half way |
| C2 | "Alpha 1, enemy patrol near the cemetery." | Track, hostile people; asks which cemetery |
| C3 | "Bravo 2, the metro station.", said as an answer to the château question | Asks again, "Which station: …". It first read "I can't find “null”"; that is fixed. A spoken answer does not answer the question. Since decision 251 this line is heard as choice 1 and waits for the operator's confirm; the pass was not run again |
| C4 | "Alpha 1, enemy vehicle to the east." | Not placed: "How far east is it? Or name a place near it." |
| D1 | "Alpha 1, two enemy vehicles on Avenue de Paris, moving east." | Track, hostile vehicle ×2, on the avenue |
| D3 | "Alpha 1, suspicious vehicle on Avenue de Paris." | Track, suspect vehicle |
| D4 | "Alpha 1, Track 1 moved to Avenue de Nogent." | Track 1 moved |
| D5 | "Alpha 1, Track 1 is hostile." | Track 1 hostile, still a drone |
| D6 | "Alpha 1, I see Bravo 2 at the church." | "Is that where you are, or something you see?" Nobody moved |
| E2 | "Bravo 2, at grid Delta Quebec 586 101." | The castle's cell, ±71 m |
| E4 | "Alpha 1, enemy vehicle at grid 588 106." | Track, hostile vehicle, "grid DQ 588 106" |
| E5 | "Alpha 1, drone 200 metres north of grid 586 101." | **Wrong:** read as about a Track 2 that does not exist. Not placed |
| E6 | "Alpha 1, unknown vehicle, 1600 mils, 400 metres." | Track, "400 m, bearing 090, from ALPHA 1" |
| E7 | "Alpha 1, facing north, contact at 2 o'clock, 300 metres." | **Wrong:** read as ALPHA 1 moving 300 m; held by the far guard |
| F7 | "Alpha 1, Track 1, request eyes on." | A request on Track 1; nothing placed |
| F8 | "Bravo 2, send the drone." | A request with no track |
| F9 | "Alpha 1, enemy drone up north." and "Charlie 3, getting eyes on Track 1." | No request read. The first asks how far; the second asks where Track 1 is |
| F10 | "Charlie 3, friendly drone 200 metres north of me." | Track, friendly drone, 200 m north of CHARLIE 3 |

The call sign last, and the far guard: 24 of 24 runs. A line with the call sign last is held with a question. The runner then gives it to the unit, as the operator's tap does, and reads the log.

| ID | Line | Held with | After the operator's tap |
|---|---|---|---|
| G1 | "At Vincennes station, Alpha 1." | "Heard “Alpha 1” at the end. Was that ALPHA 1?" | ALPHA 1 at Vincennes station. The same with a full stop before the call sign, with ", over" and with "out" |
| G2 | "Moving towards the town hall, Bravo 2, over." | "Was that BRAVO 2?" | BRAVO 2 half way to the town hall |
| G3 | "Unknown vehicle, bearing 060, 300 metres, send the drone, Alpha 1, out." | "Was that ALPHA 1?" | Track 1, an unknown vehicle, and a request on it. ALPHA 1 did not move |
| G4 | "Track 1 is hostile, Charlie 3." | "Was that CHARLIE 3?" | Track 1 hostile. CHARLIE 3 did not move |
| G8 | "Send the drone to Track 2, Alpha 1, over." | "Was that ALPHA 1?" | A request on Track 2 |
| G7 | "Push up to Vincennes station and hold there, Bravo 2.", an order to BRAVO 2 | "Was that BRAVO 2?" | Not given. BRAVO 2 did not move: this is the case the question is for |
| G6 | "I'm at the church with Bravo 2." | "No call sign heard. Which unit sent this?" | BRAVO 2 did not move |
| G9 | "Moving towards Avenue de Paris Alpha 1 over", with no pause written | "No call sign heard. Which unit sent this?" | No unit is suggested |
| P1 | "Alpha 1, at Mairie de Vincennes." straight after "Alpha 1, at Vincennes station." | "ALPHA 1 moved 461 m in 0 s. Is that right?" | |
| P2 | The same, 25 seconds later | Not held | ALPHA 1 at Mairie de Vincennes, ±31 m |

By hand on the command post, in headless Chrome: the question for "Bravo 2, at the château." shows both places numbered on the map and "Answer for BRAVO 2: 1 2"; tapping 2, then Choose, placed BRAVO 2 at the metro station. A call sign at the end showed in the Unassigned tray with **Give to ALPHA 1**; Give, then the confirm, placed ALPHA 1 at Vincennes station.

### Pass 2, synthetic voices

Each line as a 16 kHz clip in macOS voices, Samantha (American), Daniel (British) and Karen (Australian), sent as audio through Whisper large-v3-turbo; the scene before it was typed. These are clean synthetic voices in a silent room, so this is the easy case: it shows what Whisper cannot write at all, not what it will do with Alex's voice in a hall. The seconds are slower than a stage run would be: another program on the Mac was using Ollama at the time.

The stage lines, three voices each: 27 of 27.

| ID | Line | Passed | What Whisper wrote | Median |
|---|---|---|---|---|
| A1 | "Alpha 1, at Vincennes station." | 3 of 3 | "Alpha One, at Vincennes Station." or "Alpha 1, …" | 4.7 s |
| A7 | "Charlie 3, at grid 586 101." | 3 of 3 | "Charlie 3, at grid 586-101." | 3.2 s |
| C1 | "Bravo 2, at the château." | 3 of 3 | "Bravo to, at the chateau." Read as BRAVO 2, a near match | 4.4 s |
| B1 | "Bravo 2, moving towards the town hall." | 3 of 3 | As said | 3.1 s |
| F3 | "Alpha 1, unknown vehicle, bearing 060, 300 metres, send the drone." | 3 of 3 | As said twice; once "a known vehicle", still read as an unknown vehicle | 11.1 s |
| F5 | "Charlie 3, Track 1 is hostile." | 3 of 3 | "Charlie 3, track 1 is hostile." | 4.0 s |
| D2 | "Alpha 1, I see a drone about 300 metres north of me." | 3 of 3 | "Alpha-1, …", "Alpha 1. I see …" | 7.9 s |
| E1 | "Alpha 1, unknown vehicle, bearing 060, 300 metres." | 3 of 3 | Once "a known vehicle"; once "Unknown vehicle. Bearing 060. 300 meters." | 8.4 s |
| F3b | "Bravo 2, unknown vehicle at the town hall, send the drone." | 3 of 3 | Once "a known vehicle"; twice "… the town hall. Send the drone." | 9.7 s |

"A known vehicle" for "unknown vehicle" is the one to listen for. Typed, it is still read right, and so are "unidentified vehicle", "enemy vehicle", "I see a vehicle", "bearing 60" and "300 meters".

Other lines, two voices each: 23 of 30.

| ID | Line | Passed | What Whisper wrote | What happened |
|---|---|---|---|---|
| A4 | "Alpha 1, at Bérault metro." | 0 of 2 | "Bayreault Metro", "Bayrold Metro" | "I can't find “Bayrold”. Which station: …", with Bérault offered |
| A8 | "Alpha 1, at Mairie de Vincennes." | 0 of 2 | "Mary de Vincennes", "Admeri de Vincenis" | Not placed |
| A9 | "Bravo 2, at Château de Vincennes metro station." | 2 of 2 | "Chateau de Vincennes metro station" | The metro station, no question |
| A5, B3 | "in front of the town hall", "200 metres south of the town hall" | 4 of 4 | As said; once "Bravo to" | Placed |
| B4, B6 | "moved 300 metres east", "moving towards Avenue de Paris" | 4 of 4 | As said, "Alpha 1. Moved …", "Alpha 1: Moving …" | Placed |
| D1, D5 | "two enemy vehicles on Avenue de Paris, moving east", "Track 1 is hostile" | 4 of 4 | As said | Track opened; track turned hostile |
| E2, E4 | "at grid Delta Quebec 586 101", "enemy vehicle at grid 588 106" | 4 of 4 | "Grid Delta Quebec 586 101", "grid 588-106" | Placed in the cell |
| F7 | "Alpha 1, Track 1, request eyes on." | 1 of 2 | Once "Request ISON" | That one was not read as a request: it asked where Track 1 is. **Say "send the drone"** |
| F8 | "Bravo 2, send the drone." | 2 of 2 | Once "Bravo too. Send the drone." | A request with no track |
| G1 | "At Vincennes station, Alpha 1." | 0 of 2 | "at Vincent Station, Alpha 1.", "at Vincenna's station, Alpha 1." | The question "Was that ALPHA 1?" came up, but the place was lost. With the call sign first, "Vincennes" was written right every time |
| G4 | "Track 1 is hostile, Charlie 3." | 2 of 2 | "Track 1 is Hostile, Charlie 3.", "Track 1 is hostile. Charlie 3." | Held with "Was that CHARLIE 3?"; after the tap, Track 1 hostile. Whisper wrote the pause both times |

What this says for the morning: the two French names an English speaker would reach for, Bérault and Mairie de Vincennes, do not survive Whisper, and the script has neither. "Château" does, as "chateau".

### The call-sign reader

Two rounds of held-out cases for a call sign at the end, each written by a separate agent from the rule alone. The first rule named a wrong unit in 9 of 10 cases written to get past it. With a written pause as a condition, a second round still named one in 12 of 12 where an order or a reply ended with who it was for. As the reader is now, a question for the operator, no case in either round names a unit by itself where none was wanted. The table is in [callsigns.md](../callsigns.md#the-sign-off-rounds-22-nov).

## By hand, in the dress rehearsal

The runner does not look at the screen. These are checked by a person in pass 4.

| ID | Step | Expected |
|---|---|---|
| H1 | Before CHARLIE 3 is marked, open a request in the Decisions list | CHARLIE 3 is not offered: its call sign proves nothing |
| H2 | Pick Drone team under CHARLIE 3 | The feed says "CHARLIE 3 is a drone team." |
| H3 | After line 5, the request in the Decisions list | "Send CHARLIE 3 · drone team · free", offered first |
| H4 | After line 6, CHARLIE 3's row | "Looking at Track 1 since …" and **Recon done** |
| H5 | While CHARLIE 3 is looking, pick People under it | Refused: "CHARLIE 3 is looking at Track 1. End that first." |
| H6 | Recon done under CHARLIE 3 | The line goes; CHARLIE 3 is free |
| H7 | After the script, look at each unit | A marker with its call sign, a trail of where it was, the time of each report |
| H8 | Replay from the mission's start | Units appear in order. The request is open before the send; the line appears at the send |
| H9 | Stop mission, then replay | The same picture; every task ended, nothing still open |
| H10 | Reload the command post in the middle of a mission | The same picture as before the reload |

## Pacing: the far guard

A radio report is held when it would move a unit farther than this since that unit's last fix:

```
15 m/s × seconds since the fix  +  the fix's circle  +  100 m
```

A unit that has only the start point has no fix, so its first report is never held. The operator's answer to a question is a fix.

| Hop | Metres | Seconds the same unit must wait, from a ±30 m fix |
|---|---|---|
| Château metro to half way to the town hall (line 4) | 174 | 3 |
| Château metro to the town hall | 347 | 15 |
| Vincennes station to the town hall | 461 | 23 |
| Vincennes station to the château metro | 500 | 25 |
| Castle to the town hall | 613 | 33 |

Checked in pass 1: "Alpha 1, at Mairie de Vincennes" straight after "Alpha 1, at Vincennes station" was held, "ALPHA 1 moved 461 m in 0 s. Is that right?"; after 25 seconds it was placed.

The rule for the script: never give one unit two far places back to back. Go round the three units. In the script above only line 4 follows a fix of the same unit, and it needs 3 seconds.

## A call sign at the end

Built on the night of 21 to 22 November, in `lib/geo/callsigns.ts`, with no model [237]. The rule and its scores are in [callsigns.md](../callsigns.md#a-call-sign-at-the-end).

"At Vincennes station, Alpha 1, over." does not go to ALPHA 1 by itself. It waits in the Decisions list with "Heard “Alpha 1” at the end. Was that ALPHA 1?" and **Give to ALPHA 1** as option 1 [240]. After the confirm it is read as if ALPHA 1 had said its call sign first.

That is less than Alex asked for, and the tests are why. A call sign at the end is also how you speak to a unit: "Push up to the station and hold the north entrance, Bravo 2." No rule we tried told the two apart, and a wrong unit moving is the worst thing the app can do. A person can tell at a glance.

**On stage the call sign comes first.** A line with the call sign last costs two taps. If it is shown at all, it is to show the question: say the report, stop for a beat, then the call sign.

## Grids and bearings on the radio

Adam's work [223, 229 to 233], sorted by whether a soldier would say it, with what pass 1 found.

| What | On the radio? | Typed | For the stage |
|---|---|---|---|
| A bearing and a distance from the speaker: "unknown vehicle, bearing 060, 300 metres" | Yes. It is how a contact is reported | Right every time, with "unknown" said. The label keeps the bearing | **In the script, line 5.** It has no place name for Whisper to miss |
| A grid for a position: "at grid 586 101" | Yes. It is the usual way to give a place | Right every time, in six ways of saying it | **Before the pitch, for CHARLIE 3.** On stage only if Alex's voice passes 5 of 5: six digits are six chances for Whisper |
| A grid for a sighting: "enemy vehicle at grid 588 106" | Yes | Right | An alternate for line 5 |
| A distance from a grid: "drone 200 metres north of grid 586 101" | Sometimes | **Wrong:** read as about a track that does not exist | No. A gap, in [known-gaps.md](../known-gaps.md) |
| Mils: "1600 mils, 400 metres" | Yes, by mortar and artillery observers | Right: "bearing 090" | No: one more number format to explain |
| Clock directions: "contact at 2 o'clock" | Yes, but from the way the speaker faces [224] | **Wrong** with "contact": read as the speaker moving | No |
| The grid lines, the ruler and the grid box on the map page and the command post [232, 245] | The operator's tools. The phone hears nothing back [208] | | Not on stage. To check that a spoken grid landed in the right cell, read the grid after the unit's position on the command post [245], or the grid box on the map page |

The six-figure grids of the stage places, from `toGrid`: town hall and church DQ 588 106, castle DQ 586 101, château metro DQ 588 103, Vincennes station DQ 584 106, Bérault DQ 581 104.

## The voice sheet for the morning

For Alex, through the phone to the Mac in offline mode, so the path is the stage's. In a quiet room first. Then again with crowd noise playing from another device at about arm's length. Hold the phone as on stage, and nothing else may be using Ollama.

Use a fresh mission with the stage roster and start point, and mark CHARLIE 3 as a drone team. Each clip is one hold of the button, at stage pace. The mission's log keeps what Whisper wrote and what happened, so it can be scored afterwards.

About 95 clips, 15 to 20 minutes.

1. **Call signs, 5 times each.** "Alpha 1, radio check." "Bravo 2, radio check." "Charlie 3, radio check."
2. **The stage lines, 5 times each,** in the script's order, the operator answering the question each time:
   - "Charlie 3, at grid 586 101."
   - "Alpha 1, at Vincennes station."
   - "Bravo 2, at the château."
   - "Bravo 2, moving towards the town hall."
   - "Alpha 1, unknown vehicle, bearing 060, 300 metres, send the drone."
   - "Charlie 3, Track 1 is hostile."
3. **Alternates, 3 times each,** for when a stage line fails in Alex's voice:
   - "Charlie 3, at grid five eight six, one zero one."
   - "Bravo 2, at Château de Vincennes metro station."
   - "Alpha 1, at Mairie de Vincennes."
   - "Alpha 1, unknown vehicle, bearing zero six zero, three hundred metres, send the drone."
   - "Alpha 1, unknown vehicle, bearing 060, 300 metres, request eyes on."
   - "Bravo 2, unknown vehicle at the town hall, send the drone."
   - "Alpha 1, I see a drone about 300 metres north of me."
   - "Alpha 1, two enemy vehicles on Avenue de Paris, moving east."
4. **Names Whisper may miss, 3 times each,** in "Alpha 1, at …": the château, Vincennes station, the town hall, Avenue de Paris, Bérault metro.
5. **With "over", 3 times each.** "Alpha 1, at Vincennes station, over." "Bravo 2, moving towards the town hall, over."
6. **The call sign last, 3 times each,** with a beat before it, to see whether Whisper writes the pause: "At Vincennes station, Alpha 1, over." "Track 1 is hostile, Charlie 3."

What to look at for each clip: the words as Whisper wrote them, the call sign read, what was placed or asked, and the seconds from letting go of the button to the marker. `npm run eval:stage -- --read <mission code> --base http://localhost:3117` prints the first three for every report in the mission, oldest first.

This list is also the input for the speech-recognition session: the same clips, kept, become its regression set.

## Drills

Things that will happen on stage at least once. Each is done once in pass 4, by the people who will be on stage.

| Drill | What to do |
|---|---|
| A report is held in the Decisions list | The operator gives it to the unit there: its number, then Enter |
| A report is held as moved too far | The operator gives it to the unit named, or dismisses it and the speaker repeats after a few seconds |
| Whisper garbled the place; nothing was placed, or the wrong question came up | The operator taps **None of these** if a question is open; the speaker says the line again |
| A question is open | The operator answers it on the command post before the next report |
| A track has the wrong kind | **Change**, on the track card |
| The phone loses the Mac | Cable in; reopen the app |
| Speech fails for good | The backup video. Sending the stage lines from the phone's developer controls is not tested yet |

## Pre-flight

Ten minutes before, at the venue.

1. The Mac is on power. On the cable, its Wi-Fi is off, to show offline. On the phone's hotspot, the phone's mobile data is off instead.
2. The servers are up in offline mode ([setup.md](../setup.md)): the coordinator, Ollama with `ministral-3:3b`, and Whisper. Nothing else is using Ollama: no second coordinator, no eval. The map's corner says "Map saved on this computer" [239]. If it says "Base map not available", the map was not fetched on this Mac: with internet, run `npm run basemap -- vincennes`, then Start again; the units draw on a plain background meanwhile.
3. The phone reaches the Mac, on the cable or the hotspot. Reopen the app after any change of link. The phone's language is English.
4. Every other mission is ended. Then a fresh one: Vincennes, start point Château de Vincennes, roster ALPHA 1, BRAVO 2, CHARLIE 3.
5. CHARLIE 3 is marked Drone team.
6. The warm-up report, spoken: "Charlie 3, at grid 586 101." The first report after a start can take 16 seconds. Say it again if it took more than 5.
7. The command post is on the projector, at a zoom where Vincennes station, the town hall and the castle are all in view.

## Done when

- Every stage line: 3 of 3 typed (done), 5 of 5 in Alex's voice, and clean in two dress rehearsals in a row.
- No stage line is held, asks an unplanned question, or takes more than 5 s.
- Every drill has been done once by the people on stage.
