# Other voices and whispers

A clip recorded in a crowd holds other people's words, and a report may be whispered. This file says what the app does about both, what is untested, and how to test it.

## The report that started it

On 20 November a report in the demo mission came back as "and I couldn't cover anything. - Heading towards the cemetery. - Many people came up and I was able to explain them." Only the middle sentence was the speaker. The model read it correctly; it was not placed because the gazetteer had no cemeteries [115]. It took about 17 s, almost all of it Whisper on the phone; the coordinator took under 1 s.

The risk it shows: another voice names a different place, and the app places that one without asking.

## Voice turns [154]

Whisper on the phone writes a dash where it hears the voice change. `lib/geo/voices.ts` splits the transcript there into voice turns.

| Turns in the transcript | What happens |
|---|---|
| One | Read once, as before |
| Several, at most one looks like a report | Read once, as before; the log notes how many voices were heard |
| Two or more look like reports | Each is read on its own, at the same time |
| ... and they place the same thing | Placed, no question |
| ... and they name different places, one of them out of reach of the last position | Placed from the voice left, no question (`voices_context`) [188] |
| ... and they name different places | "I heard more than one voice. Which place is yours: A or B?" Each choice is one voice's place |
| ... and one is about a track, or none can be offered | "Say your position again" |
| More than four look like reports | "Say your position again", without reading each |

"Looks like a report" is a check with no model: a type word ("church", "rue", "кладовище"), a word from a place name of the area, a number, a distance or compass word, a capitalised word mid-sentence, or a word for a track. It errs towards yes: a wrong yes costs one more reading, a wrong no could let another voice's place through unasked.

Measured 21 November, offline (`ministral-3:3b` on the MacBook), typed reports through the coordinator: one voice 0.7 s; the logged report 1.5 s; two voices naming places 1.3 to 1.6 s.

Limits:

- The app cannot tell whose voice is whose. It only notices when two voices name places, and then asks, unless all but one put the speaker out of reach.
- Out of reach means farther from the last position than 15 m/s for the time since it, plus its uncertainty and 100 m [188]. Only a position at a known place is checked: a movement, an open question or an unplaced voice is always kept, so the speaker's own voice is never dropped by this check.
- It finds turns only where Whisper marks them. A missed mark reads the clip as one voice, as before.
- Mistral's speech-to-text is asked to tell speakers apart (`diarize`, with segment timestamps) [175]. Where the speaker label changes, the transcript gets ">>", which splits voice turns like Whisper's dash. If Mistral refuses the option (400 or 422), the clip is transcribed again without it, so a report is never lost to it; `MISTRAL_STT_DIARIZE=0` turns it off. Not yet checked on real two-person clips: how reliably it labels a short report, and what it adds to the time.

## Whispers and closeness to the microphone [156]

A voice fingerprint taken from a normal voice matches the same person's whisper poorly, and whispers from different people sound more alike. A whisper clear enough to transcribe, though, was spoken into the phone. So the check for the speaker's own voice is closeness to the microphone: how loud each stretch is, and whether it is voiced or whispered.

- **iPhone first.** iOS 26 offers Voice Isolation (Control Center, Mic Mode) to some third-party recording apps. To check on the demo phone: is it offered while the transmitter records, and does it keep a whisper?
- **Android** has no equivalent an app can count on. Samsung's "Voice focus" is for calls.
- **Not built yet:** a check of our own on the phone. The clips below decide whether loudness and voicing are enough.
- **Untested:** how well Whisper on the phone, and Mistral, transcribe whispers. Place names are likely to suffer first.

## Test clips [155]

1. Start the coordinator so it keeps clips: `KEEP_CLIPS=1 PROVIDER_MODE=local npm run dev -- -p 3117` (drop `PROVIDER_MODE=local` in hosted mode).
2. On the phone, in Setup, pick speech-to-text on the phone and turn on **Send clips for testing**.
3. Record reports. Each clip and a JSON record of how it was heard and read go to `.data/clips/`. The phone's feed shows "clip kept". With the switch on, a clip the phone heard no words in is sent too.
4. Measure: `npx tsx scripts/clip-levels.ts`, or name one or more `.json` files.

```
2026-11-21T10-02-11-430Z-alpha-1-7.wav  phone, 4.3 s, floor -61.2 dB
  heard: "and I couldn't cover anything. - Heading towards the cemetery."
  read:  resolved (category_unique)
  time          level    voiced  words
  0.0–1.6 s     -41.0 dB    78 %  and I couldn't cover anything.
  1.6–4.2 s     -24.5 dB     6 %  Heading towards the cemetery.
```

(An illustration of the layout, not a measurement.)

Six clips are enough to start: a normal voice alone; a whisper alone; a whisper at the phone with someone talking 2 m away; a normal voice with someone talking 2 m away; two people at the same distance; and the third one again with Voice Isolation on.

On the synthetic signals in `tests/clips.test.ts`, a close "whisper" measured −18.5 dB and 0 % voiced, and a distant voice −42.6 dB and 100 % voiced. Real recordings will be closer than that; that is what the clips are for.

Clips are recordings of people's voices. They stay on the computer, git ignores them, and they should be deleted when the test is done: `rm -r .data/clips`.

## Noise [185]

21 November, hosted mode, through the coordinator: the scenario clips (synthetic voices; 8 reports in English, French and Ukrainian, Vincennes, Kyiv and Izium) mixed with real field noise from ESC-50 (CC BY-NC, not kept in the repo) at a signal-to-noise ratio of 5 and 0 dB, 128 clips in all.

| Noise | Placed as expected |
|---|---|
| Wind, engine, siren, footsteps, crackling fire | 64 of 64 |
| Helicopter | 15 of 16 |
| Rain | 10 of 16 |
| Fireworks (bangs) | 8 of 16 |

Steady noise barely hurts, even as loud as the voice: the place names sent as hints carry badly heard words ("Явиля Центральна районна лікарня" still placed). Rain and bangs mask syllables, and some clips came back empty. An empty transcript gets "I didn't catch that. Speak closer to the microphone and try again." (in the report's language) since [192]. 13 of the 14 misses asked or placed nothing. One pinned a wrong place: "I'm at Izium station" under rain at 0 dB came back as "А на Ізюмській станції" and pinned the weather station 3.3 km away; since [185] that asks between the station and the weather station. An earlier run with artificial noise (63 clips: pink noise, radio band, clipping, a very quiet voice) placed every clip down to 5 dB.

Not covered: real voices, wind on the microphone itself, and noise that starts or stops mid-sentence.

## Mixed languages

21 November, hosted mode, through the coordinator: two scenario clips in different languages (synthetic voices, 0.4 s apart) joined into one, 3 clips for each of the 6 orders of English, French and Ukrainian, sent with the first clip's area and language. A half counts as kept when most of its words are in the transcript.

| Order | Both halves kept |
|---|---|
| Ukrainian then English | 3 of 3 |
| French then English, English then French, French then Ukrainian | 9 of 9 |
| English then Ukrainian | 2 of 3 |
| Ukrainian then French | 0 of 3 |

- After Ukrainian, French is not transcribed as French: it comes back spelled in Cyrillic ("Ватюр-цивіль, де вон ла мері" for "Voiture civile devant la mairie") or as made-up Ukrainian ("Я сидів на мурі", "I sat on the wall", for "Je suis devant la mairie"; "Я живу в місті Вінниця" for "Je suis à la mairie de Vincennes").
- One English half before Ukrainian was dropped, with nothing in the transcript to show it.
- The area's place names, sent to Mistral as hints, pull the clip towards the area's language: the Ukrainian-then-French clip sent in the Vincennes area came back with its French intact. So a speaker who does not speak the area's language is the one at risk.
- The two halves are two synthetic voices, so diarization usually marks them as two speakers (">>"). A real speaker switching language is one voice; not tested.

### Hints in the speaker's language [190]

When the speaker's language button is not the area's language, ten report phrases in the speaker's language ("je suis devant", "la mairie", "I'm near", "я біля"...) go first in the hints, ahead of the area's report words and place names (`SPEAKER_PHRASES` in `lib/geo/areas.ts`). Measured on 21 November with the same clips, before and after, one run each:

| Clips | Before | After |
|---|---|---|
| French with Ukrainian, Kyiv map, button on FR | 0 of 6 | 4 of 6 |
| Ukrainian or French alone, button left on EN (the default) | 6 of 6 | 6 of 6 |
| Ukrainian then English, button on EN | 3 of 3 | 3 of 3 |
| French or English alone, Kyiv and Izium maps | 8 of 8 | 8 of 8 |

The two left both start with "Voiture civile devant la mairie", which has no phrase from the list and no place name of the area. The button is on EN by default, so most reports on the Ukrainian maps now carry the English phrases; no clip got worse, but 23 clips are few.

## Answering a question by voice [194]

While a question waits on the map page, the next clip can answer it: "the second one", "number three", "the last one", "Bérault", "the castle, Château de Vincennes", "none of these", and the same in French ("la deuxième", "aucun") and Ukrainian ("перша", "жоден"). The page sends the choices with the clip; the coordinator matches the words against them, with no model, in `lib/geo/answers.ts`, and the page applies the answer as if it were tapped. A clip of more than six words, a name that fits two choices equally, or a place and a name that disagree are read as a new report, as before. The native transmitter does not send its choices yet.

