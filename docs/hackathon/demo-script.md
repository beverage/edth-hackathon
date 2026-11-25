# Demo script

One sheet to run the live demo from, on Sunday 22 November. The demo has no slide: after the benefits slide, switch to the command post. The lines and why they are worded this way come from [stage-test-plan.md](stage-test-plan.md); when a line changes there, change it here.

Alex speaks every unit into one phone. The operator works the command post. The laptop runs everything, with no internet.

## Ten minutes before

1. The Mac is on power. On the cable, its Wi-Fi is off. On the phone's hotspot, the phone's mobile data is off instead.
2. The servers are up, with nothing else using the Mac: no second coordinator, no eval. The map's corner says "Map saved on this computer".
3. The phone reaches the Mac. Reopen the app after any change of link. The phone's language is English.
4. Every other mission is ended.
5. The command post, `localhost:3117/cp`, is on the projector, zoomed so Vincennes station, the town hall and the castle are all in view.

## Set the stage

Before the pitch starts.

1. Open a new mission: Vincennes, start point Château de Vincennes, roster **ALPHA 1, BRAVO 2, CHARLIE 3**.
2. Under CHARLIE 3 in the units list, pick **Drone team**.
3. Say: **"Charlie 3, at grid 586 101."** CHARLIE 3 appears at the castle. This warms the model up: the first report can take 16 seconds. Say it again if it took more than 5.

## The run

About 90 seconds. Say the call sign first, and say each line as written.

| # | Alex says | The command post shows | The operator |
|---|---|---|---|
| 1 | **"Alpha 1, at Vincennes station."** | ALPHA 1 at the station, ±30 m | |
| 2 | **"Bravo 2, at the château."** | A question in the Decisions list: the castle is 1, the metro station is 2, both numbered on the map | |
| 3 | | BRAVO 2 at the metro station | Presses **2**, then **Enter** |
| | *Wait about 8 seconds.* | | |
| 4 | **"Bravo 2, moving towards the town hall."** | BRAVO 2 moves half way, with an arrow on to the town hall | |
| 5 | **"Alpha 1, unknown vehicle, bearing 060, 300 metres, send the drone."** | Track 1, an unknown vehicle, 300 m from ALPHA 1. A request in the Decisions list: "Send CHARLIE 3 · drone team · free" | |
| 6 | | A blue line from CHARLIE 3 to Track 1 | **Send CHARLIE 3**, then **Send** |
| 7 | **"Charlie 3, Track 1 is hostile."** | Track 1 turns hostile. CHARLIE 3 does not move | |
| 8 | | The same minute again, with its times | **Replay**, from the start |

What to say over each step:

| # | The point |
|---|---|
| 1 | Speak, and the map moves. |
| 2, 3 | It is not sure, so nothing moves. The operator decides. |
| 4 | Natural phrasing, and a path. |
| 5, 6 | What a unit sees, and a request for an effector, in one call. A person sends it. |
| 7 | The drone team reports back. |
| 8 | History anyone can replay. |

## Pacing

- **Go round the three units.** Never give one unit two far places back to back: the report is held as "moved too far".
- **About 8 seconds between steps 3 and 4.** The operator's answer places BRAVO 2, and its next report is checked against that.
- **Answer every question before the next report.** A report with no call sign goes to the unit whose question is open.
- **Hold to talk only while speaking.** A second voice or the PA in the clip is read as part of the report.

## Say it this way

| Say | Not | Because |
|---|---|---|
| "Vincennes station" | "the station", "Vincennes train station" | "The station" is not placed; the other asks which one |
| "unknown vehicle" | "vehicle" alone, "contact" | Without whose it is, it is read as the speaker moving |
| "bearing 060" or "bearing zero six zero" | "bearing 60 degrees" | The same |
| "send the drone" | "request eyes on" | Whisper once wrote "Request ISON" |
| "the town hall", only from near it | "the town hall" from the station | From far, it asks which town hall |
| The call sign first | The call sign last | Said last, the report waits for the operator's confirm |

Listen for "a known vehicle" on the screen where you said "unknown vehicle". It is still read right.

## If something goes wrong

| What happens | What to do |
|---|---|
| A report waits in the Decisions list ("Which unit?") | The operator gives it to the unit: its number, then Enter |
| A report is held as "moved too far" | The operator gives it to the unit named. Or dismisses it, and Alex repeats after a few seconds |
| Whisper garbled the place: nothing placed, or the wrong question | The operator presses **N**, None of these, if a question is open. Alex says the line again |
| "At the shadow" for "at the château" | Say it again |
| A track has the wrong kind | **Change**, on the track's card |
| A report takes long | Wait. Do not repeat before the first one lands |
| The phone loses the Mac | Cable in; reopen the app |
| Speech fails for good | The backup video |

## Longer, if there is time

Each passed typed, three times of three.

- **"Alpha 1, I see a drone about 300 metres north of me."** A second track, an unknown drone.
- **"Bravo 2, unknown vehicle at the town hall, send the drone."** Once BRAVO 2 is near the town hall.
- **"Alpha 1, two enemy vehicles on Avenue de Paris, moving east."** A hostile track with a count and a heading.
