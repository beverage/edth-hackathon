# Overview

EDTH Paris 2026, challenge 01 (Lysk). Two of Lysk's three judged items are met on the live site. The third, a shared map with a history anyone can replay, was built on Friday night and runs on a laptop; it is not on the live site yet and has not been run with real phones. The live site was paused on 23 November, after the hackathon [261].

## The challenge

Lysk's brief: teams report their position by voice ("I am behind the church", "I moved towards 35th street"), and someone updates the map by hand, which is slow and error-prone. Build a web app that turns short spoken updates into live updates on a shared map, with timestamps and history. The suggested stack (OpenStreetMap, a speech-to-text API, Mistral) is "indicative only". The listed equipment is a headset. Mentors: Henry Heinemann and Florent Ogès (edth@lysk.ai). Eight other teams picked the same challenge.

What the jury will look at, from Lysk's deck ([PDF on Drive](https://drive.google.com/file/d/1RyyaEdsCgXme1-N0GpvC1ipxEhRZ7AZY/view)):

| Judged item | Where we stand |
|---|---|
| It works live: speak, and the map updates within seconds | Met on the live site: about 1 to 3 s from release to pin |
| Natural phrasing is understood ("south of the church", "towards 35th street") | Met for both deck sentences, with a real street in place of "35th street" |
| Marker and path, with timestamps and a browsable history | Built on Friday 20 November, evening, where the coordinator runs on a computer [98 to 103, 107 to 114]. The deck shows a *shared* map, a marker labelled with a call sign (ALPHA 2), and a history "anyone can replay"; the command post at `/cp` has all three. Checked with typed reports and in the iPhone simulator, not yet with real phones or a projector. The live site keeps no reports, so its command post is empty [101]. |

Our own differentiators (asking back, Ukrainian, no invented coordinates) come on top of these three, not instead of them. The deck mentions none of them.

## Our approach

- **Ask back instead of guessing.** When a report could mean more than one place, the system asks which one, aloud, with up to three choices. A silently wrong pin is worse than a question.
- **The language model never produces coordinates.** It only extracts intent: place name, category, relation, a stated distance, a compass direction, language. Deterministic code resolves that against a local gazetteer built from OpenStreetMap. Nothing is invented.
- **No GPS.** The app never reads the phone's location, so jamming does not affect it. Position comes from named places, and from dead reckoning off the last known position when a report states a distance and a compass direction [54].
- **Three languages, three areas.** English and French in Vincennes; Ukrainian and English in central Kyiv and, since Saturday 21 November, in Izium, a town in Kharkiv Oblast near the front ([gazetteer.md](gazetteer.md#izium-added-saturday-21-november)). A report in Russian is answered in Ukrainian [38].
- **European providers.** Mistral for speech-to-text and extraction, with the server in Vercel's Paris region [25]. ElevenLabs was removed because it is not EU-resident [42]. Vercel itself is a US company; we accept that for now, and moving later is small (plain Next.js, no Vercel-specific packages).
- **Works without a network.** Alex has made an uplink-off demo mandatory for Demo Day. See [Local mode](plan.md#local-mode).

## Timeline

Times are Paris.

| When | What |
|---|---|
| Fri, before 18:00 | Prior work: the stage-1 web app. The tag `prior-work-fri-1800` marks it; leave the tag where it is. The jury counts only work done during the event. |
| Fri evening | Shared map and replay ([plan](plan.md#command-post-shared-map-and-replay)). On-device speech-to-text in the transmitter (built). |
| Sat 08:00 | Two new teammates join ([kickoff.md](kickoff.md)). Alex looks for Lysk's mentors ([questions](open-questions.md#for-lysk)). Local mode starts and needs at least two people. |
| Sat midday | Local mode working and tested in the hall |
| Sat afternoon | Field walk for an error figure; show Lysk's mentors a working version |
| Sat 18:00 | Presentable: a timed run-through of the demo and a first deck ([work-split.md](work-split.md)) |
| Sat evening, Sun morning | Pre-selection: the organisers pick the teams that pitch on Demo Day (their email of 20 Nov; exact times to come) |
| Sat 22:00 | Feature freeze |
| Sun 10:00 | Demo video done |
| Sun 11:00 | Deck done, as a PDF or PPTX with clickable links ([pitch.md](pitch.md)) |
| Sun 11:30 | Submit (deadline 12:00), file named with the team number |
| Sun 13:00 | Demo Day, until 16:00 |
