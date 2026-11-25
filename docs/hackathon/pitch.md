# Pitch

The Demo Day deck, in full: every slide's words in reading order, and its speaker notes. First draft on Saturday 21 November. Reshaped on Sunday 22 November to the order of a teammate's rewritten deck, then cut by Alex at about 10:30: seven slides to present, then six appendix slides for questions. Square brackets mark what is not known yet.

## Where the deck lives

The deck is a Slides artifact on claude.ai, in Alex's account: <https://claude.ai/artifact/8wp2T9NU3zjWqdy6uV5gMm>. Anyone with the link can open it. It exports to PPTX or PDF, which the submission needs.

This file holds every word of the deck. The deck adds only the layout, the pictures and the motion. Change a slide's words here and in the deck in the same change, so the two always match; the [look](#the-look) is enough to lay out a new slide the same way.

The live demo has no slide. The sheet to run it from is [demo-script.md](demo-script.md); its lines and their tests are in [stage-test-plan.md](stage-test-plan.md). The dates for the finished deck and the submission are in [overview.md](../overview.md#timeline).

## The story

The seven slides to present follow the teammate's deck, in the customer's terms: the name and the team, the request, how a radio call becomes a marker, where a position comes from, the benefits, then the live demo, then what we tune next, and the close.

The six appendix slides are the detail, for questions: asking back, the operator's list, tracks, effectors on request, the field, and the evidence.

Five rules for the wording, each from Alex or from a Lysk mentor on 22 November:

- **Nothing about hosted mode.** The deck shows what we demo: everything on one laptop, with no internet. It has no link to the live site.
- **"If unclear" asks the operator, not the speaker.** The phone is a radio and shows no question [208]. The map shows only what is certain, and the operator asks back. A report the system does not understand is usually the system's fault, not the soldier's.
- **Effectors on request are built, not a stretch goal.** The path from a unit's request to a person's tasking is general. The one effector built is a recon drone, and the app's own rule does not change [234].
- **No claim that the AI does one half and code the other.** Code reads words too: call signs, grids, bearings. The claim we make is where a position comes from, and that the model never writes a coordinate.
- **The title stays Voice-to-Map.** GROUNDTRUTH, from the teammate's cover, is the line above it.

## Slides

Each slide gives its background, then its words in reading order, then its picture and its speaker notes. The eyebrow is the small line in capitals above the title. Every slide except the cover and the close has a footer and the page number. The footer reads "Voice-to-Map · EDTH Paris 2026" unless the slide gives another; on an appendix slide it starts with "Appendix ·".

### Part 1. Open: the name, the team, and the customer's request

#### 1. Cover

Dark. No footer.

- **Eyebrow:** GROUNDTRUTH
- **Title:** Voice-to-Map
- **Tagline:** Radio position reports on a shared map.
- **Spoken line:** “Alpha 1, at Vincennes station.”
- **Team line:** Boris · Adam · Brian · Alex
- **Bottom line:** EDTH Paris 2026 · Challenge 01 · Lysk · Team [#__]
- **Picture:** on the right half, a stylised street map drawn in the deck: an amber unit marker with its dotted trail and dashed accuracy ring, labelled "ALPHA 1 · 14:16:45 · ±30 m", and a blue unit labelled "BRAVO 2".

**Notes:** Open on the request, not the tech. One sentence: a unit says where it is on the radio, and a marker with its call sign moves on a shared map within seconds. The line under the tagline is the demo’s first line. The slides to present follow the team’s rewritten deck: name and team, request, design, trust, benefits, then the live demo, then the follow-up. The demo has no slide: its script is docs/demo-script.md. The slides after the close are backup, for questions. [Pitch length from the organisers: __ min.] [Team number for the file name: __.]

#### 2. The request

Light.

- **Eyebrow:** The request
- **Title:** Automate radio position reports, for troop commanders.
- **Radio log** (left, dark panel):

  | Time | Call sign | Said |
  |---|---|---|
  | 14:16 | ALPHA 1 | “At the church.” |
  | 14:18 | BRAVO 2 | “Moving west.” |
  | 14:21 | ALPHA 1 | “Vehicle spotted.” |

- **By hand:** Staff update the situation map by hand.
- **A whole staff:** “Building an operational picture” keeps the whole staff busy.
- **Bottom line:** **Lysk’s ask:** speak, and a shared map updates within seconds, with a history anyone can replay.

**Notes:** The request is Lysk’s: teams report their position by voice, and someone updates the map by hand, which is slow and error-prone. Their own example sentences are “I’m behind the church” and “I moved towards 35th street”. What a Lysk mentor added on 22 Nov: in active combat, hundreds of messages land on top of each other, probably all urgent. Nothing should stay unanswered, though it does all the time today, and operators track what is open in spreadsheets. Helping the operator through that flood is the point of the system.

Source: [overview.md](../overview.md#the-challenge).

### Part 2. The design: how a radio call becomes a marker, where a position comes from, and the benefits

#### 3. New design

Dark.

- **Eyebrow:** New design
- **Title:** How a radio call becomes a marker.
- **Five boxes, left to right, joined by arrows** (the fourth box, ours, has an amber edge):

  | Tag | Box | Text |
  |---|---|---|
  | IN | Radio voice | Report 1, report 2, … each with its call sign |
  | AI | AI text | Whisper, running on the laptop |
  | AI | AI reads intent | Place, relation, distance, direction. Never a coordinate. |
  | PLAIN CODE | Finds the place | Reads call sign, grid and bearing. Finds the place, or asks. |
  | OUT | Situation map | Place markers, move markers, show tracks, make corrections |

- **Two cards under the boxes:**

  | Tag | Text |
  |---|---|
  | If unclear | Nothing moves. The operator is asked, and confirms. |
  | On request | A person sends an effector. Shown with a recon drone. |

**Notes:** The customer’s workflow, box for box: radio voice, AI text, AI reads intent, the situation map. We added one box, in amber: plain code finds the place. The language model extracts intent: which place, which relation (at, near, south of, towards), a stated distance, a compass or clock direction. The resolver is deterministic code that places that against a local gazetteer built from OpenStreetMap. Plain code also reads what must be exact: who spoke (the call sign, against the mission’s roster), a grid reference, a bearing in degrees or mils, a clock direction, and a request for an effector. If unclear: the operator is asked, not the speaker. That is what is built, and what a Lysk mentor asked for on 22 Nov. On request: a unit asks by radio, and a person at the command post decides and sends. The effector we built and show is a recon drone. Lysk's requirement slide says landmarks and streets are geocoded into real coordinates with OpenStreetMap APIs: say it in those words. We geocode each area once, through the Overpass API, when the area is built. So no report waits on a public server, and no unit's words leave the laptop.

Source: [architecture.md](../architecture.md), [callsigns.md](../callsigns.md), [gazetteer.md](../gazetteer.md#how-it-is-built), decisions 208 and 234.

#### 4. Where a position comes from

Dark.

- **Eyebrow:** Trust
- **Title:** Where a position comes from.
- **Under the title:** Every marker is a real place, geocoded with OpenStreetMap’s Overpass API, a grid reference, or a stated distance and direction from the last known position.
- **Four numbers:**

  | Number | Label |
  |---|---|
  | 0 | coordinates written by the AI model |
  | 0 | reads of the phone’s GPS |
  | 0 | internet needed: it all runs on one laptop |
  | 3–5 s | from speech to marker, on that laptop |

**Notes:** The trust slide. A position has three sources and the language model is not one of them: a named place from OpenStreetMap data, a grid reference read in code, or a stated distance and direction worked out from the unit’s last known position. The operator can also place a unit or a track by hand. The three zeros are rules we never break: the model never makes a coordinate, the app never reads GPS, and nothing needs the internet. Speech, intent and the map itself run on one laptop: Whisper large-v3-turbo, Ministral 3B through Ollama, and a saved base map. Nothing leaves the laptop. 3 to 5 s is a short report on the M1 Pro; a long one took 8 to 11 s in the night’s tests, with other programs running. [Replace 3–5 s with the figure timed at the dress rehearsal.]

Source: [overview.md](../overview.md#our-approach), [stage-test-plan.md](stage-test-plan.md#pass-2-synthetic-voices), decisions 223, 236, 239 and 243.

#### 5. The benefits

Light.

- **Eyebrow:** For the command post
- **Title:** The benefits
- **Three cards:**

  | Card | Text |
  |---|---|
  | Less manpower | Clear reports place themselves. One operator decides the rest. |
  | Saves space | A crowded command post needs less communications gear. |
  | Better situational awareness | A more current view of positions and reports. |

- **Statement:** Nothing waits unanswered: every open report is in one list.

**Notes:** Three benefits, in the customer’s terms. Less manpower: the reports that are clear place themselves, and one operator works the rest from one list, oldest first. Saves space: the whole chain runs on one laptop, so a crowded command post carries less gear. Better situational awareness: the map moves seconds after the call, with who said it and when. The last line is the mentor’s point: today open reports are tracked in spreadsheets and some stay unanswered. [The team’s deck also has the line “The gold standard” here; say what it stands for, or leave it out.] After this slide, switch to the command post for the live demo. Its script is docs/demo-script.md.

Source: decision 240.

The live demo comes here. It has no slide: [demo-script.md](demo-script.md).

### Part 3. What we tune next, and the close

#### 6. Technical follow-up

Dark.

- **Eyebrow:** Technical follow-up
- **Title:** What we tune next.
- **Two cards, each a short list:**

  | Card | Points |
  |---|---|
  | Speech and intent | Tune the voice models. Smarter intent, more options: “I’m still moving north”. Smarter speech recognition. |
  | Deployment | Better hardware, for faster and more accurate inference. |

**Notes:** The organisers’ stated goal is deployment, so end on the path to it. Speech and intent: the small model on the laptop is weaker on free wording, which is why the stage lines were tested one by one. Deployment: everything already runs on one laptop, an M1 Pro; better hardware runs larger speech and language models, so reports are read faster and more accurately. Effectors on request are built, not a stretch goal: the slide is in the backup. Also next: audio from a real radio set, a country-sized gazetteer, and sending markers and tracks to the map system a unit already uses. [Name the map system if the mentors name one.]

Source: [gazetteer.md](../gazetteer.md#scaling-the-gazetteer).

#### 7. Close

Dark. No footer.

- **Eyebrow:** GROUNDTRUTH · Voice-to-Map · Team [#__]
- **Title:** Say where you are. The map moves.
- **Links:**
  - Code: [github.com/beverage/edth-hackathon](https://github.com/beverage/edth-hackathon)
  - Video: [link]
- **Team line:** Boris · Adam · Brian · Alex
- **Small line:** Built at EDTH Paris, 20 to 22 November. Before the event: the stage-1 web app, tagged prior-work-fri-1800 in the repo.

**Notes:** Close on the one line from the cover. The organisers ask every team to say what it had before the event: the tag prior-work-fri-1800 marks it, and git log prior-work-fri-1800..main lists what was built here. The submitted PDF keeps these links clickable.

### Part 4. Appendix, for questions

These six slides come after the close and are not presented. Each one's footer starts with "Appendix ·". Their pictures are four of the twelve command post screenshots of 22 November, in [images/pitch/](../images/pitch/) ([the pictures](#the-pictures)).

#### 8. Asking back

Light.

- **Eyebrow:** Asking back
- **Title:** Not sure? Nothing moves.
- **Body:** “Bravo 2, at the château.” The castle and the metro station share that name. The marker waits, both are numbered on the map, and the operator picks one or asks by radio.
- **Statement:** The map shows only what is certain.
- **Picture:** on the right, the command post in Vincennes: the Decisions list shows BRAVO 2’s question, the castle and the metro station are numbered 1 and 2 on the map, and BRAVO 2 is awaiting an answer (`02-bravo-question.png`).

**Notes:** Our main difference from the other teams, and what a Lysk mentor asked for on 22 Nov: the map shows only what is certain, and with no certainty it waits for a confirmation. The operator asks back, not the app. Real radio calls tend to be clear; when the system does not understand, that is usually the system’s fault, not the soldier’s, so never present this as fixing an unclear report. A wrong marker has nothing on it that says it is wrong. The picture is step 2 of the demo: keys 1 and 2 pick, N is none of these, Enter confirms.

Source: [ask-back.md](../ask-back.md), decisions 178 and 240.

#### 9. The operator's list

Light.

- **Eyebrow:** The operator’s list
- **Title:** One list for the operator.
- **Points:**
  - 24 units on the net. Clear reports place themselves.
  - What is unsure waits here, oldest first: which place, which unit, send an effector.
  - Keys 1 to 9 pick, Enter confirms.
- **Picture:** on the right, the command post with a busy net: 24 units on the map of Vincennes and six decisions waiting in the Decisions list, the oldest for 2 minutes 53 seconds, with tags such as Which one, Ask and Unit (`11-decisions-under-load.png`).

**Notes:** Units report by radio to a live operator, so every question goes to the operator. With 20 to 40 units on the net the clear reports place themselves, and the operator’s job is the decision points, so those have to be fast: one list at the top of the side panel, oldest first, each line with how long it has waited, red after two minutes. What waits: which place (“at the château”), which unit (a call sign said last, or not heard), a move too far too fast (“ALPHA 1 moved 461 m in 0 s”), and a request for an effector. Keys 1 to 9 pick, Enter confirms, the next one opens. The number waiting shows in the browser tab. A unit’s next report closes the question it left open. This is the mentor’s flood: nothing stays unanswered, and no spreadsheet.

Source: decisions 203, 204, 237 and 240 to 242; [callsigns.md](../callsigns.md).

#### 10. Tracks

Dark.

- **Eyebrow:** Beyond position
- **Title:** It maps what a unit sees, too.
- **Points:**
  - “Unknown vehicle, bearing 060, 300 metres” becomes Track 1.
  - A standard APP-6 symbol: who saw it, when, ± metres.
  - Hostile only when the speaker says so.
  - A fresh track shows motion; an old one goes still.
- **Picture:** on the right, the command post in Vincennes: Track 1, a hostile vehicle with its accuracy circle, 300 metres on bearing 060 from ALPHA 1, with a line from the drone team CHARLIE 3 that reported it hostile (`08-track-hostile.png`).

**Notes:** Lysk asked only for the speaker’s own position. A unit also reports what it sees, so the same pipeline turns those reports into tracks: a numbered symbol, who saw it, when, and how sure. A report about a track never moves the speaker. Nothing is marked hostile unless the speaker said so: in the picture CHARLIE 3 said “Track 1 is hostile”. The bearing is kept exact, 060 and not “north-east”. Motion on the map means one thing: the report is fresh. After ten minutes a track’s arrow stops flowing, because the way it was moving is what was said then, not what is known now. The operator can also place, move and close tracks by hand.

Source: [tracks.md](../tracks.md), decisions 229 and 238.

#### 11. Effectors on request

Dark.

- **Eyebrow:** Beyond the map
- **Title:** Effectors on request.
- **Points:**
  - A unit asks by radio, in the same call as its report.
  - The request waits in the operator’s list. A person decides and sends.
  - Built with one effector, a recon drone. The path from request to tasking is general.
- **Picture:** on the right, the command post in Vincennes: a blue line runs from the drone team CHARLIE 3 to Track 1, an unknown vehicle, and the feed says the command post sent CHARLIE 3 after ALPHA 1 asked (`07-drone-sent.png`).

**Notes:** Effectors on request, built on Saturday night. A unit asks by radio, in the same call as its report (“unknown vehicle, bearing 060, 300 metres, send the drone”) or on its own. The request waits in the operator’s list with the free asset offered first. Only a person sends, with a confirm every time, and only a person ends the task. The asset reports back by radio: “Charlie 3, Track 1 is hostile.” What we built and show is one effector, a recon drone or drone team sent to look at a track. The path is the general part: the request read from the words, the operator’s decision, the tasking drawn on the map, the report back. The app itself works out nothing between things on the map, no range, no “nearest”, no ranking: a person decides. The request words are read in code, in English, French, Ukrainian and Russian: 84 of 84 in its eval.

Source: [tracks.md](../tracks.md#recon-requests-and-tasking), decisions 234 and 235.

#### 12. Built for the field

Dark.

- **Eyebrow:** Built for the field
- **Title:** Works where the network doesn’t.
- **Four cards, two by two:**

  | Card | Text |
  |---|---|
  | No GPS | Never reads the phone’s location, so jamming changes nothing. |
  | No internet | Speech, intent and the map itself all run on one laptop. |
  | Soldiers’ words | Grids, bearings in degrees or mils, clock directions, in three languages. |
  | European models | Mistral’s small model, from France, runs on the laptop. |

- **Bottom line:** Any area in one command, geocoded from OpenStreetMap: Vincennes, central Kyiv, Izium.

**Notes:** Position comes from named places, and from a stated distance and direction off the last known position, never from GPS. The whole chain runs on one laptop: Whisper large-v3-turbo through whisper-server and Ministral 3B through Ollama; the phone reaches it over a cable or a local network. Nothing leaves the laptop. Izium is a town in Kharkiv Oblast near the front. The stage demo itself runs with no internet, and the base map draws from a copy saved on the laptop. The three languages are English, French and Ukrainian; a report in Russian is answered in Ukrainian. A grid is an MGRS reference, read in code, also when its letters are spelled in French or Ukrainian. [Say when the offline run was last proven: the dress rehearsal.]

Source: [overview.md](../overview.md#our-approach), decisions 223, 229, 236 and 239.

#### 13. Evidence

Light. The footer is the source line below, not the usual one.

- **Eyebrow:** Evidence
- **Title:** Tested the way we demo: line by line, with no internet.
- **Three numbers:**

  | Number | Label |
  |---|---|
  | 27/27 | stage lines placed right, spoken in three synthetic voices |
  | 0 | wrong units in 220 call-sign cases |
  | 84/84 | test calls read correctly: an effector request, or not |

- **Under them:** Every stage line also passed typed, three times of three, on the laptop’s own model.
- **Footer:** Appendix · Source: docs/stage-test-plan.md · 21 and 22 Nov

**Notes:** All of this is the path we demo, on one laptop. 27 of 27: nine stage lines, each as a clip in three macOS voices, through Whisper large-v3-turbo and the 3B model. Clean synthetic voices in a silent room, so this is the easy case: say so if asked. Other lines scored 23 of 30; the French names Bérault and Mairie de Vincennes did not survive Whisper, so the script has neither. The call-sign reader never named a wrong unit in 220 cases. 84 of 84: test radio calls in four languages; 48 ask for an effector (“Request eyes on”, “send our drone to track five”) and 36 only sound as if they do (“No need to send the drone”). The reader got every one right. Twenty of the 84, 12 requests and 8 that are not, were written separately, from the rules alone, by someone who had not seen the code, and scored before anyone looked at them: 20 of 20. The small model is weaker on free wording, which is why the stage lines are tested one by one. [Add Alex’s own voice, 5 of 5 for each line, and the timed dress rehearsal, when done.]

Source: [stage-test-plan.md](stage-test-plan.md#results).

## The pictures

Twelve pictures of the command post for the deck, in [images/pitch/](../images/pitch/), taken on Sunday 22 November between 10:27 and 10:29 (frames 01 to 10), and at about 10:13 and 10:16 (frames 11 and 12). Each is 1920 × 1080, the size of a slide. Four are in the deck, on appendix slides 8 to 11; the rest are spare.

| File | What it shows | Slide |
|---|---|---|
| `01-alpha-placed.png` | "Alpha 1, at Vincennes station.": the marker, its time and ±30 m | |
| `02-bravo-question.png` | "Bravo 2, at the château.": the castle and the metro station numbered on the map, nothing moved, the question open in the Decisions list | 8 |
| `03-operator-picks.png` | The operator picked 2: "Choose Château de Vincennes for BRAVO 2?" | |
| `04-bravo-placed.png` | BRAVO 2 at the metro station, "CP answered" in the feed | |
| `05-track-and-request.png` | "…unknown vehicle, bearing 060, 300 metres, send the drone.": Track 1 on its bearing line, and the request with "Send CHARLIE 3 · drone team · free" | |
| `06-operator-sends.png` | The confirm: "Send CHARLIE 3, drone team, to look at Track 1?" | |
| `07-drone-sent.png` | The blue line from CHARLIE 3 to Track 1 | 11 |
| `08-track-hostile.png` | "Charlie 3, Track 1 is hostile.": the track turns hostile | 10 |
| `09-bravo-moves.png` | "Bravo 2, moving towards the town hall.": the arrow, the path, "≈ Estimate" | |
| `10-replay.png` | The replay at 10:28:34, before the track turned hostile, with the replay bar | |
| `11-decisions-under-load.png` | 24 units, two tracks, and six decisions of four kinds waiting, the oldest one late | 9 |
| `12-kyiv-ukrainian.png` | Kyiv: «Альфа 1, я біля Золотих воріт.» asks which of three, in Ukrainian; «Браво 2, я на Майдані Незалежності.» is placed | |

What a reader should know about them:

- **Frames 01 to 10 are one run of the stage script,** typed, through the offline model, in mission `vincennes-69` on a coordinator of its own. Every position has its grid after it [245], and Track 1 has no heading [246].
- **Frames 05 to 10 were taken twice.** The first run, at about 10:10, drew Track 1 with an arrow and "moving east, as said", which nobody had said. That was fixed [246] and the frames taken again at 10:28. The deck took `07-drone-sent.png` and `08-track-hostile.png` from the first run, so its slides 10 and 11 still show the arrow until the files here are put in ([to fill in](#to-fill-in)).
- **The run has BRAVO 2's move last,** after the three drone beats, not fourth as in [the demo script](demo-script.md#the-run). That order fills the 8-second wait the far guard needs after the operator's answer. It passed typed three times of three, and has not been spoken. The demo script and the stage script keep the tested order, with the wait.
- **Frame 11 is staged.** Its reports are made up and were written straight to the log with canned places, by a script that is not kept; no model read them. It is the real screen with a made-up net.
- **Frame 12 is two typed reports** through the offline model, in mission `kyiv-1`.
- **The operator turned Follow units back on** after picking BRAVO 2's place. A pick switches it off, and without that click the track of frame 05 appears off the screen.
- **Frame 11 is 692 KB,** over the 600 KB the other pictures keep to: with fewer colours the units' colours ran together.

To take them again: run the coordinator in offline mode on a port of its own, open a mission in Vincennes with the start point Château de Vincennes and the roster ALPHA 1, BRAVO 2, CHARLIE 3, mark CHARLIE 3 a drone team, and send the lines as typed reports to `POST /api/report` (text, session, language, no call sign). Take each frame in headless Chrome at 1600 × 900 and 2× pixel density, about 4 s after the line, then reduce it to 1920 × 1080 and 240 colours without dithering. Do the operator's steps on the page: 2 then Enter, **Follow units**, **Send CHARLIE 3** then **Send**, and **Replay** with the bar dragged back.

## To fill in

| What | Slides | Where it comes from |
|---|---|---|
| Team number | 1, 7 | The organisers give the number; the submitted file is named with it. |
| Pitch length | all | The organisers. Seven slides are presented; the appendix slides are not. |
| "The gold standard" | 5 | The teammate's deck has this line on its benefits slide. Say what it stands for, or leave it out. |
| Seconds from speech to marker, timed | 4 | The dress rehearsal, pass 4 of [stage-test-plan.md](stage-test-plan.md#the-passes). 3 to 5 s is a short report [195]. |
| The map system's name | 6 | The mentors, if they name one |
| Video link | 7 | The backup video |
| Two pictures, put in the deck again | 10, 11 | `08-track-hostile.png` and `07-drone-sent.png` were taken again at 10:28, after the fix of decision 246. The deck took its copies before that, with an arrow on Track 1 that the app no longer draws. Put in the files of [images/pitch/](../images/pitch/) ([the pictures](#the-pictures)). |
| Alex's own voice, and the dress rehearsal | 13 | Passes 3 and 4 of [stage-test-plan.md](stage-test-plan.md#the-passes) |

Cut on 22 November, on purpose: the team slide (the names are on the cover), the live demo slide (the demo has its script), Lysk's three tests (Lysk knows them), and the questions we expect. The hosted-mode figures went with them.

## The look

- Dark slides like the command post, light slides like paper, so the screenshots sit at home.
- Amber means a question or a signal; blue means a friendly unit, as on the command post.
- Headings in Oswald, text in Inter, spoken lines and call signs in JetBrains Mono. All three have Cyrillic, and all three travel in a PPTX file.
- Type sizes on the 1920 × 1080 slide: 120 px for the cover title and big numbers, 72 px for slide titles, 44 px for card titles and statements, 32 px for text, 24 px for eyebrows, footers and small lines.
- Colours: ink `#12181D`, panel `#1D272F`, paper `#EEEBE3`, card `#E1DCD0`, amber `#F2B33D`, dark amber for text on paper `#8A5600`, blue `#5B97F2`, dark blue for text on paper `#2557A8`.
- Screenshots are 1920 × 1080, shown 1040 px wide beside a 560 px column of text. They are in [docs/images/pitch/](../images/pitch/) ([the pictures](#the-pictures)). Retake them there when the screen changes, then put them in the deck again.

## Submitting

Export a PDF, or a PPTX, from the deck's Share menu, with the links still clickable. Name the file with the team number. The deadline is in [overview.md](../overview.md#timeline).
