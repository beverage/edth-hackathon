# Receiver review

Saturday 21 November, about 01:00 to 02:00 Paris time. A UI and UX review of the receiver at `/receiver`, read as an operator at a command post would use it. The page has since been renamed the command post, at `/cp` [176]; the file names below are the old ones. The clear problems are fixed. The choices that are not clear are listed at the end for Alex.

## What was reviewed, and how

- **The page:** `components/Receiver.tsx`, `components/Receiver.module.css`, `components/MissionPanel.tsx`, `app/receiver/page.tsx`.
- **The lens:** a laptop and a projector three metres away, possibly in low light, read at a glance by someone under stress. A state must be clear without relying on colour. Times are 24-hour, with seconds in a log and an age in a status. The speaker may have no screen, so an open question has to be readable in full on the receiver.
- **Content:** a test mission "UI review" in Vincennes with a start point, four call signs and typed reports through `POST /api/report`: a fix, an estimate with an arrow, two open questions, an answered question, a report that could not be placed, and units left silent for more than 3 minutes. A second test mission with no start point gave the "Not placed" state and a 23-character call sign. Yesterday's ended mission "Test 1" gave the ended and replay states. Both test missions were ended and deleted afterwards; "Test 1" was not touched.
- **Sizes:** 1440 × 900, 1920 × 1080, 2560 × 1440, 1024 × 768 and 820 × 1100, in the built-in Chromium browser.
- **Measured, not judged by eye:** contrast for every text and background pair on the page, by script, in the live, replay, ended and menu states. Font sizes and button sizes the same way. Keyboard focus by pressing Tab.

Not checked: a real projector, a real three-metre read, low light, real phones and voice, a screen reader, Firefox and Safari. The contrast of the labels on the map itself was not computed, because they are drawn on a canvas. In the review browser the map took 6 to 12 seconds to appear on each load, while one tile downloads in 0.1 s; this is probably the review browser's hidden pane, but time it on the demo laptop.

## Findings

Before the fixes. "By code" means read in the code, not seen on screen.

### Would mislead an operator

1. **An ended mission looked live.** The bar said "Live" with a running clock. Every unit read "Silent for 4 h 44 min" and was faded, because silence was counted to the present.
2. **A unit waiting for an answer was dimmed.** After 3 minutes a unit with an open question was faded like any silent unit, to a contrast of 3.8:1. The row that most needs the operator was the hardest to read.
3. **Silent meant unreadable.** A silent unit's row was at 55% opacity (text at 2.7:1) and its label on the map at 35%. From across a room you could see that something had faded, not which unit.
4. **Lost contact was nearly invisible.** If the coordinator stopped answering, a small "Reconnecting…" showed in the header and the map still looked live.
5. **The clock followed the browser's language.** By code: a browser set to US English would show 12-hour times. The review browser was set to British English, so it showed 24-hour.
6. **Choices on the map were told apart by colour only.** Two units with open questions each had a "1", a "2" and a "3", in different colours. When two units had the same question, one unit's markers hid the other's.
7. **The accuracy was cut off.** A unit's line ended in "…" before the radius: "≈ towards Mairie de Vincennes · ±402…".

### Hard to read

8. **Contrast under 4.5:1:** white on the orange button 2.84, on the red button 3.06, on the blue replay badge 2.87; the "Answered" pill 3.85; the "Not placed" pill 4.21; white choice numbers on a unit's colour 2.84 to 4.92 for seven of the eight colours; placeholder text 3.1; the border of a text field 1.2.
9. **Too small on a projector.** The side panel stayed 400 px wide with 12 to 15 px type at any window size. At 1920 × 1080 a 13 px line is 1.2% of the screen's height.
10. **No age.** A unit showed the time it was last heard, not how long ago.
11. **Fix and estimate looked the same in the lists.** Only a "≈" told them apart. In the feed both carried the pill "Placed", and so did a report that placed nothing.
12. **The focus ring was cut off** in both scrolling lists: only its bottom edge showed.
13. **Replay wording:** time left read "−118:45"; the first minutes of a replay said "Nobody joined this mission."; a mission that ended yesterday showed a time with no day.
14. **Nothing said "live".** A live mission was marked only by the lack of an "Ended" chip.

### Small

15. Header buttons 29 px tall and speed buttons 24 px tall.
16. The mission menu's "Could not reach the coordinator." stayed after the coordinator came back.
17. The mission on screen was marked in the menu by a blue border only.
18. "Reports 0" had no text under it. The page had no `h1`.
19. While the map loaded, or with no network, the map area was blank with no word.
20. With no mission on screen: the bar still said "Live", and by code the connection light went to "Reconnecting…" after a minute with nothing wrong.
21. What ending a mission does was in a tooltip only.

## What was changed

All in `components/Receiver.tsx` (TSX), `components/Receiver.module.css` (CSS) and `components/MissionPanel.tsx` (panel). No API, no type in `lib/`, no change to `app/globals.css` or the phone page.

| Finding | Change | Where |
|---|---|---|
| 5, 13 | One 24-hour clock with seconds for the whole page, and the day in front when it is not today. Time left in a replay as `h:mm:ss left`. | TSX 51 to 83, 765; panel 23 to 28 |
| 1 | An ended mission is shown as it was when it ended. The bar says "At end" with a square and "Ended · time". | TSX 276 to 279, 608, 725 to 735, 768; CSS 308 to 321 |
| 14, 4 | A chip after the mission's code says what is on screen: Live, Replay, Ended, or No contact. A replay puts a blue frame round the map. Lost contact puts a red note on the map with the time of the last answer. | TSX 603 to 605, 626 to 645, 687, 702 to 722; CSS 163 to 220, 763 to 800 |
| 2, 3, 7, 10, 11 | Each unit row has a pill with its state in a word (Placed, ≈ Estimate, Awaiting answer, Not placed, Silent), its line in full, and "2 min ago" above the time. A silent row keeps full contrast: dashed border, faded dot. An open question wins over silence. The feed uses the same words, and "Placed" only when something was placed. | TSX 115 to 131, 813 to 841, 867 to 880; CSS 413 to 529, 592 to 634 |
| 3 | On the map the call sign is bold, a silent unit's label says "silent" and stays at 70%. | TSX 376 to 394, 441 to 448 |
| 6, 8 | A choice is a white disc with a dark number, ringed in the unit's colour, with the call sign under it ("BRAVO 2?"). Two units with the same choice share one marker. The same disc numbers the choices in the feed. | TSX 489 to 521, 900; CSS 222 to 258, 668 to 683 |
| 8 | Dark text on the orange, red and blue; lighter text on two pills; a visible border and placeholder for text fields. | CSS 190 to 207, 592 to 634, 826 to 848, 971 to 987 |
| 9 | From 1700 px of window width the header, side panel and replay bar are drawn 1.25 times larger, from 2300 px 1.6 times; the map's labels, markers and choice discs grow by the same steps. The smallest type on the page went from 12 to 13 px. | TSX 86 to 93, 464 to 472; CSS 1092 to 1139 |
| 12 | The focus ring is drawn inside a row in the lists. | CSS 692 to 708 |
| 15 | Header buttons 36 px tall, speed buttons 32 px, a taller slider. | CSS 96 to 100, 334 to 344, 800 to 848 |
| 16, 17 | The menu's "no answer" note clears when the coordinator answers again. The mission on screen carries the words "On screen". Each mission's line shows units and reports. | panel 43, 55 to 59, 244 to 249, 277 to 282, 306 to 310; CSS 1071 to 1080 |
| 18, 19, 20 | Text under an empty "Reports"; an `h1`; "Loading the map…", and after 12 s a note that it needs the network; no "Live" with no mission, and the list of missions is read every 5 s so a mission opened elsewhere shows up. | TSX 174 to 206, 405 to 411, 614, 706 to 710, 727 to 728, 771, 850 |
| 21 | The confirmation reads "End this mission? Reports stop. It stays here for replay." The header wraps to a second line instead of squeezing the mission's name away at 1024 px. | TSX 656; CSS 22 to 33 |

Also: an open question in the feed is larger and at full contrast, to be read out; the unit's colour in the feed is the same ringed dot as in the units list; the map keeps more room at its edges so a label is not cut off.

After the changes the script found no text under 4.5:1 in the live, replay, ended and menu states; the lowest was 5.12:1.

## Decisions for Alex

"Hardware" marks a decision that waits on what the mentors say about how reports reach the base ([open-questions.md](../open-questions.md), question 1 for Lysk).

1. **Who answers an open question? (Hardware.)** Today the question waits until the speaker taps a choice on a phone. If speakers have only a radio, nobody can tap, and the question stays open for ever. Options: (a) leave it view-only; (b) let the operator click a choice on the receiver, which calls the existing `POST /api/answer`, and add who answered to the log (a change to `lib/reports/types.ts`); (c) take a spoken answer ("the second one") as the unit's next report. Recommendation: (b) if the answer is "radio". It is one afternoon, and it is the largest gap on this page for a radio net. **Settled, 21 Nov:** (b), built with the track tools [178]. The command post answers after a confirm, the answer entry keeps `by: "CP"`, and the feed says "CP answered".
2. **Where open questions sit. (Hardware.)** A question shows in its unit's row and in the feed, where newer reports push it down. Options: (a) leave it; (b) keep open questions at the top of the feed; (c) a "Questions" block of their own above the feed, with the choices in large type. Recommendation: (b) now, it is small; (c) together with decision 1 if the operator has to read questions out.
3. **Stepping through a replay.** A replay starts when the mission was opened. "Test 1" has 20 minutes with nothing before its first report: 2 minutes of empty map at 10×. Clicking a report moves the map, not the replay. Options: (a) leave it; (b) "previous report" and "next report" buttons; (c) clicking a report in a replay jumps to its moment; (d) marks on the slider where reports are. Recommendation: (b) and (c) before Sunday. "A browsable history" is on the jury's list.
4. **A night map.** The panels are dark; the map is OpenFreeMap's light style and is the brightest thing in the room. Options: (a) keep it; (b) a dark style behind a switch; (c) dark by default. The unit colours were picked for the light map. Recommendation: (b), light by default; decide after seeing both on the projector. It also has to work with the offline map.
5. **Zulu or local time.** Every time is the browser's local time, with no zone shown. The log keeps epoch milliseconds, so either is one formatter away. Options: (a) local; (b) Zulu with a "Z"; (c) a switch. Recommendation: ask the mentors which they log in; until then local, as now.
6. **Grid references.** A position reads "Bérault · ±30 m". There is no coordinate anywhere on the page. Options: (a) none; (b) MGRS under each unit and each report, computed in code from the resolver's pin, never by the model; (c) latitude and longitude. Recommendation: (b) if the mentors use grids. The plan put grid references out of scope, so this needs a yes. **Settled on 22 Nov [245]:** (b), as the square and six figures after each position, "Bérault · ±30 m · DQ 581 104", in the unit, track and report lines.
7. **Military symbols.** Units are coloured dots, one colour each. There are eight colours in `lib/reports/fold.ts`; a ninth unit gets the first colour again, and only its label tells it apart. Options: (a) keep the dots; (b) a friendly-unit frame (APP-6) round each call sign, same colours; (c) a symbol library. Recommendation: (a) for Sunday. Ask the mentors whether a jury member would expect (b). **Settled on 21 November [151]:** units keep their dots, because the trails need one colour per call sign; tracks, the things units see, are drawn with APP-6 symbols by `milsymbol`.
8. **Sound and alerts. (Hardware, partly.)** Nothing sounds or flashes when a question opens, a unit goes silent or contact is lost. Options: (a) none; (b) a short highlight on a row when it changes; (c) a tone for a new question and for lost contact, off until switched on. Recommendation: (b) now; (c) if the operator is also the one listening to the radio.
9. **How long is "silent"?** 3 minutes (`FADE_AFTER_MS`). In the test, three of four units read "Silent" within minutes of a normal pause. The same 3 minutes frees a call sign for another phone. Options: (a) keep 3 minutes; (b) a longer time; (c) two steps, quiet then silent; (d) set per mission. Recommendation: ask the mentors how often a unit reports; for the demo, keep reports coming or raise it to 5 minutes.
10. **Words that assume a phone. (Hardware.)** "Then join it from the phones." "On each phone: pick this mission, enter a call sign, and join." Recommendation: leave them until the mentors answer, then change them in one pass.
11. **Many units.** Units are listed in the order they joined, and the list scrolls at half the screen's height: about five rows on a laptop. Options: (a) keep join order; (b) open questions first, then silent units; (c) a wider or two-column list on a big screen. Recommendation: (a) for a demo of three or four units; (b) if a real mission has ten.
12. **Choices that sit on a unit.** A choice disc covers a unit's label when the choice is close to the unit: the Sainte-Chapelle is inside the château's start circle. Options: (a) leave it; (b) show the discs only for the unit picked in the list; (c) move labels aside. Recommendation: (a), and pick demo sentences that do not collide.
13. **The big-screen sizes are automatic.** The 1.25 and 1.6 steps follow the window's width, so a wide laptop screen gets them too. Options: (a) keep; (b) add a size control; (c) set it in the address. Recommendation: (a), and try it on the real projector on Saturday. The browser's own zoom still works on top.

## Seen, not fixed

- **Deleted test missions stay on disk.** Deleting moves a log to `.data/sessions/deleted/`, by design [112]; the two test logs are there as `vincennes-5~…` and `vincennes-6~…`.
- **The map is slow to appear** in the review browser, as noted above.
- **A receiver that shows an ended mission stays on it** when a new mission is opened from another screen. It moves to a new mission by itself only when no mission is on screen.
- **The "Reports" count leaves out joins,** though joins are listed in the feed under it.
