# Work split: four people, four roles

A proposal to agree on together, not a decision. Each role says who it fits, not who takes it.

Rewritten on Saturday 21 November at 10:40. The first version, written at 02:00 for the kickoff, had five streams, which read as five people. There are four of us, so the five streams are now four roles. Nothing was dropped without saying so: what each role leaves out is under [What lets four people cover it](#what-lets-four-people-cover-it).

Two things changed since 02:00. The extraction eval is built: 65 cases, no wrong pins on either model ([evals/README.md](../../evals/README.md#scores)). So evidence is now mostly recording and measuring, not building. And tracks are built ([tracks.md](../tracks.md)).

## The dates that shape it

Times are Paris.

| When | What | Source |
|---|---|---|
| Sat 08:00 | Kickoff with the two new teammates. Alex starts looking for Lysk's mentors. | [kickoff.md](kickoff.md) |
| Sat 13:00 | Local mode proven in the hall, or a second person joins it. Role 4 moves from evidence to the pitch. | below |
| Sat 18:00 | **Presentable:** a timed 3-minute run-through of the live demo, and a first deck. Our own target. | below |
| Sat evening, Sun morning | Pre-selection: the organisers pick the teams that pitch on Demo Day. 39 teams are registered. | Organisers' email, 20 Nov: "exact time and details coming soon" |
| Sat 22:00 | Feature freeze | [overview.md](../overview.md#timeline) |
| Sun 00:00 | The earliest a pitch decision is made, as a later notice says (Alex, 20 Nov: "12am Sunday"). We read that as midnight; check the notice. | Notice, via Alex |
| Sun 10:00, 11:00, 11:30 | Video done, deck done, submit. The deadline is 12:00. | [overview.md](../overview.md#timeline) |
| Sun 13:00 to 16:00 | Demo Day | Event page |

So we must look finished on Saturday evening, not on Sunday morning. Someone may ask to see it at any time from then on.

## Four roles

| Role | Fits | Owns | Starts with |
|---|---|---|---|
| 1. Core | Alex | The receiver, missions and tracks. The extraction prompt, through the `prompt-tune` skill. Deploys. Turning the mentors' answers into changes. | The mentors, then the decisions in [receiver-review.md](receiver-review.md) |
| 2. Phones | Whoever already builds the app on a phone. A Mac with Xcode for iOS, or the Android phone. | The transmitter. The Android microphone ([handoff](handoff-android-microphone.md)). Speed on a real phone. The run with three phones and a projector. Then whatever the mentors' answer on hardware calls for. | The Android microphone. Local mode has no speech-to-text on the server, so without it an Android phone cannot report with the uplink off. |
| 3. Local mode | Anyone, on any computer. Self-contained, so it suits someone new. | A Wi-Fi network with no internet, the offline map, and proof in the hall: phones on that network, mobile data off, reports reaching the receiver ([plan](../plan.md#local-mode)) | The network, then the offline map (2 to 3 hours) |
| 4. Evidence, then pitch | Whoever presents best. No code needed after midday. | Until 13:00, the numbers. From 13:00, the story, the demo script, the deck, the rehearsals and the submission. Detail [below](#role-4-evidence-then-pitch). | Sit in on Alex's talks with the mentors. Record the first real clips. |

One move from the five streams: the run with three phones goes from the receiver to role 2, who holds the phones. That keeps role 1 building.

Roles 1, 3 and 4 run on any computer and suit any tool, Codex included. Role 2 needs a Mac with Xcode for iOS builds.

## What lets four people cover it

Three cuts in scope. Each is Alex's call.

- **Local mode without HTTPS and without Whisper on the Mac.** Our phones run the native app, which may use plain HTTP and transcribes on the phone, so neither is needed. They matter only if a judge's own phone must send a report through the web page with the uplink off. This takes local mode from 1.5 to 2 person-days to under one: the network, the map, and a proof in the hall.
- **No hosted store.** The demo runs from the Mac. The live site stays a showcase and keeps no reports.
- **After the freeze, if at all:** the open microphone, tracks steps 4 and 5 ([plan](../plan.md#tracks-what-a-unit-sees)), and stress scenarios beyond one laptop script.

## Role 4: evidence, then pitch

Why give the pitch a person. Pre-selection decides who pitches at all, and it starts while we are still building. Nine teams took this challenge. The jury is military representatives, mentors and partner companies, in person, and it counts only what was built during the event. A good build shown badly at 23:00 on Saturday does not get to Sunday.

Why the same person does the evidence first. The numbers are the pitch's content, so nothing is handed over. And the text eval already gives the first numbers, so the morning is recording and measuring.

Until 13:00, the numbers:

- **Real voices,** layer 3 of the [evaluation plan](../plan.md#evaluation-harness): ten clips from the team on phones, some with hall noise, scored on whether the right place comes back. A native Ukrainian speaker checks the Ukrainian cases.
- **Timings:** seconds from the end of speech to the marker, local against hosted, on a real phone.
- **A field walk** with role 2, if there is time: hosted mode over mobile data, GPS logged silently as ground truth, for an error in metres. GPS only scores; the app never reads it.
- **The text eval,** run again after each prompt change: `npm run eval:extract -- --resolve --repeat 3`, then the same with `PROVIDER_MODE=local`. It runs on its own; start it and keep working.

From 13:00, the pitch:

- **The story.** The problem in Lysk's words, then the three judged items, then what is ours on top: asking back, no invented coordinates, no GPS, working with the uplink off, Ukrainian.
- **The demo script,** three minutes, with who holds which phone and who runs the receiver. And its fallbacks: typed reports if the hall is too loud, a recorded video if the network fails. Live and recorded demos are both accepted.
- **Rehearsals.** One timed run-through at 18:00 on Saturday with the whole team, one after the freeze.
- **The mentors.** Sitting in when Alex talks to them, writing the answers down ([open-questions.md](../open-questions.md#for-lysk)), and booking the afternoon showing.
- **The evidence slide,** from the morning's numbers: seconds from speech to marker, the wrong-pin rate, the offline run, the error in metres.
- **Prior work, stated plainly.** The organisers ask every team to say what it had before the event. The tag `prior-work-fri-1800` marks it; `git log prior-work-fri-1800..main` lists what was built here.
- **What comes next.** The organisers' stated goal is deployment. One slide: a country-sized gazetteer ([gazetteer.md](../gazetteer.md#scaling-the-gazetteer)), real radio audio, a feed into the map system a unit already has.
- **The submission.** A PDF or PPTX with clickable links, the file named with the team number, sent by 11:30 on Sunday. No handouts.
- **The questions the jury will ask,** with a short answer each: what if OpenStreetMap is wrong, why no GPS, how it scales, what leaves the device, which providers, what a wrong marker costs. Most answers are already in [known-gaps.md](../known-gaps.md) and [gazetteer.md](../gazetteer.md).

Its day:

| When | What |
|---|---|
| Sat morning | With Alex and the mentors. Real clips and timings. Draft the story in ten lines. |
| Sat 13:00 | The numbers are in. From here, the pitch only. |
| Sat 14:00 | Demo script, first version. Deck outline, six slides. |
| Sat afternoon | Show the mentors a working version. Collect screenshots. |
| Sat 18:00 | Timed run-through with the team. This is "presentable". |
| Sat 22:00 | Freeze. Record the backup video straight after, with the whole team, so Sunday is editing only. |
| Sun 10:00 to 11:30 | Video, deck, submit. |

## When to switch people

- **Local mode not proven by 13:00.** It is mandatory. Role 2 joins it: they hold the phones it has to be proven on.
- **The mentors say "radio"** ([question 1](../open-questions.md#if-there-are-two-minutes)). If reports come over a shared radio net, role 2 moves to radio audio in: the call sign from the words, noise, an open microphone. Role 1 adds answering a question from the receiver, since no phone is there to tap. The Android microphone drops unless Android phones are in the demo.
- **Their answer on the test area.** A new area is one command for role 1; a new demo script is an hour for role 4.
- **18:00 and after 22:00.** Everyone stops for the run-through, and for the backup video: it needs phones, the receiver and a speaker at the same time.

## Why not the other options

The 02:00 version gave three ways to fit five streams to four people. This split is the first of them, evidence and pitch together. The other two:

- **A full-time pitch person from 08:00.** It leaves three builders while local mode is unproven, and the pitch has little to show before midday.
- **Alex pitches.** Alex is also the mentor contact, the deploy gate and the one who knows the code best. Taking Alex off building at midday costs the most.

Even with this split, Alex is on the most paths that cannot wait: the mentors, the core code, deploys. Deploys could pass to more people ([team question 3](../open-questions.md#for-the-team)).
