# Showcase pictures

The four pictures at the top of the [README](../README.md#in-pictures), in [images/showcase/](images/showcase/). Taken on 23 November 2026, after the hackathon, on the command post as of PR 66 (strips in lanes, the Decisions card over the map).

## How they were made

- **A coordinator of its own,** in offline mode: `PROVIDER_MODE=local REPORT_STORE=file npx next dev -p 3131`, with Ollama and `ministral-3:3b`.
- **Typed radio reports,** sent to `POST /api/report` with `text`, `session` and `language` and no call sign, as the stage eval sends them ([stage-test-plan.md](stage-test-plan.md)). The coordinator reads the call sign from the words. Every report went through the model and the resolver; nothing was written to a log by hand.
- **One mission at a time:** open it, send its lines, take its pictures at once, end it. Two live missions at once put a "Reports received in …" note on the page. Units fade after 3 minutes of silence, so each mission's lines took under a minute.
- **Headless Chrome** at 1600 × 1000 and 2× pixel density, over the DevTools protocol, about 10 s after the page opens.
- **Reduced to 1600 px wide JPEG,** quality 88, no colour subsampling. Each is under 600 KB. These are JPEG, not PNG as [the docs](README.md#how-these-docs-work) ask: at 256 colours or fewer, BRAVO 2's purple turned into CHARLIE 3's pink [260].

## The missions

**Vincennes, patrol net** (`vincennes.jpg`, `vincennes-question.jpg`). Start point Château de Vincennes (`way/23032971`). Roster ALPHA 1, ALPHA 2, BRAVO 1, BRAVO 2, CHARLIE 3, DELTA 1, ECHO 2.

1. CHARLIE 3 marked a drone team (`POST /api/sessions/<code>/units`).
2. "Charlie 3, at grid 586 101."
3. "Alpha 1, at Vincennes station."
4. "Alpha 2, at Bérault metro."
5. "Bravo 1, je suis à la mairie de Vincennes." (French)
6. "Echo 2, at Château de Vincennes metro station."
7. "Delta 1, at the castle." It asks castle or station; the operator answers the castle.
8. "Alpha 1, two enemy vehicles on Avenue de Paris, moving east." Track 1.
9. "Alpha 2, I see a drone about 300 metres north of me." Track 2.
10. "Bravo 1, suspicious vehicle near the church." Track 3.
11. "Bravo 1, voiture civile devant la mairie." (French) Track 4.
12. "Delta 1, unknown people, bearing 120, 300 metres." Track 5.
13. "Alpha 1, unknown vehicle, bearing 060, 300 metres, send the drone." Track 6, and a request. The operator sends CHARLIE 3 (`POST /api/sessions/<code>/tasks`).
14. "Echo 2, enemy patrol near the cemetery." Track 7.
15. "Alpha 2, moving towards Avenue de Paris."
16. "Charlie 3, Track 6 is hostile."
17. "Alpha 1, Track 1 moved to Avenue de Nogent."
18. "Delta 1, Track 3, request eyes on." Waits in the Decisions list.
19. "At the town hall, Bravo 2, over." A call sign said last: waits for the operator.
20. "Moving towards the château, over." No call sign: waits for the operator.
21. "Alpha 2, at the church." Asks which of three churches.

`vincennes.jpg` is the page as it opens, with the oldest decision on top. `vincennes-question.jpg` is the same page after clicking ALPHA 2's question in the Decisions list.

**Kyiv, centre** (`kyiv.jpg`). No start point. Roster ALPHA 1, BRAVO 2, CHARLIE 3, DELTA 4, ECHO 5. Language Ukrainian, except the fourth line.

1. «Браво 2, я на Майдані Незалежності.»
2. «Чарлі 3, я біля станції метро Хрещатик.»
3. «Дельта 4, я біля Софійського собору.»
4. "Echo 5, I'm at the Golden Gate." (English)
5. «Браво 2, ворожий дрон приблизно за 300 метрів на північ від мене.» Track 1.
6. «Дельта 4, підозріла машина біля Софійського собору.» Track 2.
7. «Чарлі 3, дві ворожі машини на Хрещатику.» Track 3.
8. «Ехо 5, невідомі люди за 200 метрів на захід від мене.» Track 4.
9. «Браво 2, рухаюсь до Софійського собору.»
10. «Альфа 1, я біля Золотих воріт.» Asks which of three.

**Izium, river line** (`izium.jpg`). No start point. Roster CHARLIE 1, DELTA 2, ECHO 3, FOXTROT 4. Language Ukrainian, except the first line.

1. "Charlie 1, I'm at Izium station." (English)
2. «Дельта 2, я на Центральній площі.»
3. «Ехо 3, я біля Центральної районної лікарні.»
4. «Фокстрот 4, я на південь від Свято-Вознесенського собору.»
5. «Дельта 2, ворожа техніка на Європейській вулиці.» Track 1.
6. «Ехо 3, бачу дрон приблизно за 200 метрів на схід від мене.» Track 2.
7. «Фокстрот 4, ворожий патруль біля собору.» Track 3.
8. «Чарлі 1, рухаюсь до Сіверського Дінця.» Asks whether it means Сіверський Донець.
9. «Дельта 2, я біля церкви.» Asks which of two churches.

## Taking them again

Retake them when the command post changes. Run the lines above in order against a coordinator of its own, one mission at a time, and take each picture within a minute of the last line. A different model, or a change to the prompt, can read a line differently: check that each track and question comes out as listed before taking the picture.
