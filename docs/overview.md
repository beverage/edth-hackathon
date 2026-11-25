# Overview

EDTH Paris 2026, challenge 01 (Lysk). All three of Lysk's judged items are met on a coordinator that runs on one computer, in hosted or offline mode; `npm run demo` shows them with no phone ([setup](setup.md#2-see-it-work)). The live site was paused on 23 November, after the hackathon [261]. Status as of 25 November.

## The challenge

Lysk's brief: teams report their position by voice ("I am behind the church", "I moved towards 35th street"), and someone updates the map by hand, which is slow and error-prone. Build a web app that turns short spoken updates into live updates on a shared map, with timestamps and history. The suggested stack (OpenStreetMap, a speech-to-text API, Mistral) is "indicative only". The listed equipment is a headset. Mentors: Henry Heinemann and Florent Ogès (edth@lysk.ai). Eight other teams picked the same challenge.

What the jury will look at, from Lysk's deck ([PDF on Drive](https://drive.google.com/file/d/1RyyaEdsCgXme1-N0GpvC1ipxEhRZ7AZY/view)):

| Judged item | Where we stand |
|---|---|
| It works live: speak, and the map updates within seconds | Met: about 1 to 3 s from release to pin through hosted Mistral (20 Nov); offline, extraction takes a median of 2.0 s on an M1 Pro ([README](../README.md#run-locally)) |
| Natural phrasing is understood ("south of the church", "towards 35th street") | Met for both deck sentences, with a real street in place of "35th street" |
| Marker and path, with timestamps and a browsable history | Met: the command post at `/cp` shows each unit's marker, call sign, time and trail on a shared map, and replays a mission at 1×, 10× or 30× [98 to 103, 107 to 114, 206]. Checked with typed reports, the iPhone simulator, and real phones through the offline coordinator (21 and 22 Nov). |

Our own differentiators (asking back, Ukrainian, no invented coordinates) come on top of these three, not instead of them. The deck mentions none of them.

## Our approach

- **Ask back instead of guessing.** When a report could mean more than one place, the system asks which one, aloud, with up to three choices. A silently wrong pin is worse than a question.
- **The language model never produces coordinates.** It only extracts intent: place name, category, relation, a stated distance, a compass direction, language. Deterministic code resolves that against a local gazetteer built from OpenStreetMap. Nothing is invented.
- **No GPS.** The app never reads the phone's location, so jamming does not affect it. Position comes from named places, and from dead reckoning off the last known position when a report states a distance and a compass direction [54].
- **Three languages, three areas.** English and French in Vincennes; Ukrainian and English in central Kyiv and, since Saturday 21 November, in Izium, a town in Kharkiv Oblast near the front ([gazetteer.md](gazetteer.md#izium-added-saturday-21-november)). A report in Russian is answered in Ukrainian [38].
- **European providers.** Mistral for speech-to-text and extraction in hosted mode, called from a server in Paris when there was a live site [25]; offline mode calls no provider at all. ElevenLabs was removed because it is not EU-resident [42]. Vercel itself is a US company; we accept that for now, and moving later is small (plain Next.js, no Vercel-specific packages).
- **Works without a network.** Alex has made an uplink-off demo mandatory for Demo Day. See [Local mode](plan.md#local-mode).

## Timeline

Times are Paris.

| When | What |
|---|---|
| Fri, before 18:00 | Prior work: the stage-1 web app. The tag `prior-work-fri-1800` marks it; leave the tag where it is. The jury counts only work done during the event. |
| Fri evening | Shared map and replay ([plan](plan.md#command-post-shared-map-and-replay)). On-device speech-to-text in the transmitter (built). |
| Sat 08:00 | Two new teammates join ([kickoff.md](hackathon/kickoff.md)). Alex looks for Lysk's mentors ([questions](open-questions.md#for-lysk)). Local mode starts and needs at least two people. |
| Sat midday | Local mode working and tested in the hall |
| Sat afternoon | Field walk for an error figure; show Lysk's mentors a working version |
| Sat 18:00 | Presentable: a timed run-through of the demo and a first deck ([work-split.md](hackathon/work-split.md)) |
| Sat evening, Sun morning | Pre-selection: the organisers pick the teams that pitch on Demo Day (their email of 20 Nov; exact times to come) |
| Sat 22:00 | Feature freeze |
| Sun 10:00 | Demo video done |
| Sun 11:00 | Deck done, as a PDF or PPTX with clickable links ([pitch.md](hackathon/pitch.md)) |
| Sun 11:30 | Submit (deadline 12:00), file named with the team number |
| Sun 13:00 | Demo Day, until 16:00 |
