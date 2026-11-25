# Open questions

Six questions are for the team to settle; seventeen are for Lysk's mentors. When one is answered, record the answer in [DECISIONS.md](../DECISIONS.md) and remove it here.

## For the team

To settle at the Saturday 08:00 kickoff ([kickoff.md](hackathon/kickoff.md)) where we can.

1. **Priority for Saturday.** The shared map and replay are built, so the old choice is gone. Now: local mode (mandatory for the demo) against runs with real phones, evidence, and the pitch. A proposal is in [work-split.md](hackathon/work-split.md).
2. **Who owns the pitch.** One person on presentation and pitch from Saturday midday, or shared. Pre-selection starts on Saturday evening ([work-split.md](hackathon/work-split.md#role-4-evidence-then-pitch)).
3. **Deploy access.** Dropped on 23 November: the live site is paused, so nothing deploys [261].
4. **Mistral key.** One shared team key, or each person their own.
5. **Licence.** The repo is public with no licence file. The hackathon's FAQ says all IP stays with the team, and that a partner company may set other terms for its own challenge; Lysk's are unknown (question 15 below).
6. **The command post's open decisions.** The Saturday-night review left a list for Alex ([receiver-review.md](hackathon/receiver-review.md)). Decision 1, who answers an open question, is settled: the command post can [178]. Several of the rest wait on question 1 below.

## For Lysk

Mentors: Henry Heinemann and Florent Ogès (edth@lysk.ai). Alex looks for them from 08:00 on Saturday 21 November. Each question was checked against the code and docs that night: "today" says what the app does now, "it decides" says what we change on the answer.

### Open with this (30 seconds)

> We are on Voice-to-Map. It works today: you speak, and a marker with your call sign moves on a shared map in one to three seconds, with a replay of the whole mission. When a report could mean two places it asks which one instead of guessing. It runs in English, French and Ukrainian, and the model never makes a coordinate. Three answers from you decide what we build today.

Have the command post open on the laptop: a mission with three call signs and one question waiting. Show it before you describe it.

### If there are two minutes

1. **How does a report reach the map today?** A voice radio net heard at the command post, a phone, something else? What does the speaker hold, and can it show or play anything back to them?
   - *Today:* the phone app is a stand-in for a radio [58]. Since 21 Nov it behaves as one: it picks a mission's net, does not join or name itself, and does not show or speak our question; the operator answers on the command post [208].
   - *It decides:* almost everything on the speaker's side. On a shared radio net nobody joins, the call sign has to come from the words, the question goes to the operator to ask over the radio, and noise and overlapping voices become the main risk ([plan](plan.md#not-covered)).

2. **How will you judge it, on Saturday evening and on Sunday?** Your sentences and places, or ours? In which area? Live, or a video? Would a demo set in a Ukrainian town near the front mean more to you than one in Paris?
   - *Today:* our own scripts, in Vincennes, central Kyiv and Izium, a town about 30 to 45 km from the front. A new area takes one command.
   - *It decides:* the demo area, and whether we rehearse sentences we have never seen.

3. **When a report is unclear today, what happens?** Which is worse: a marker in the wrong place, or no marker until someone clarifies? Could the system ask back itself, and whom: the speaker or the operator?
   - *Today:* it asks back, with up to three choices, and never guesses. The question goes to the operator on the command post, who answers for the unit [178, 208]; the web page still asks aloud. The unit shows "awaiting answer" on the shared map until it is answered.
   - *It decides:* whether our main difference from the other teams is one you want. If a best guess shown as uncertain is better, we add that.

### If there are ten minutes

The people:

4. **Who looks at the map, and what is on that screen today?** A paper map, a battle-management system? Do the speakers ever see it? Would a feed into the existing system matter more than our own map?
   - *Today:* one operator at a base station watches our map on a laptop or projector. Speakers do not see it.
   - *It decides:* how much goes into the command post, and whether an export (GeoJSON, Cursor-on-Target) is worth a few hours.

5. **How many units report on one net, and how often?** How old can a position be before it is useless?
   - *Today:* checked with three call signs. A unit fades after 3 minutes of silence.
   - *It decides:* how dense the map and the feed must stay readable, and the fade time.

6. **Do speakers say their call sign in each report?** Is there a standard phrasing, with pro-words such as "over"?
   - *Today:* the phone names no one, as a radio would [208]. A report with no call sign is a radio report: the sender is read from the words against the mission's roster, and the operator settles any the reader is not sure of [202, 203] ([callsigns.md](callsigns.md)). The reader expects the sender first or after "this is".
   - *It decides:* whether we read the call sign from the transcript. On a shared radio net there is no other way.

The words:

7. **How do people name places?** Landmarks, streets, grid references, distance and bearing? Nicknames that are on no map, such as "checkpoint 3"?
   - *Today:* named places, kinds of place ("the church"), relations ("behind", "south of"), "towards", crossings, and a distance with one of eight compass directions or a clock direction [198]. No grid references, no spoken coordinates, no nicknames.
   - *It decides:* which of those three gaps to close first.

8. **For "I moved towards 35th street", where should the marker end up?**
   - *Today:* half way, with a circle that spans the whole leg and an arrow to the street [46]. A stated distance replaces the half.
   - *It decides:* that rule.

9. **Which languages do reports come in?** Ever mixed in one sentence?
   - *Today:* English, French and Ukrainian, pinned on the device [106]. A report in Russian is answered in Ukrainian [38]. In one test of a mixed clip the English half was lost.
   - *It decides:* whether mixed speech is worth a day, and which language leads the demo.

10. **What else is said on the net besides positions?** Should the system listen to everything and pick out the position reports, or only hear what is addressed to it?
    - *Today:* one report is one push-to-talk clip. An open microphone is planned, not built.
    - *It decides:* whether the open microphone, and dropping what is not a report, move up the plan.

The conditions:

11. **Is there internet where this is used?** Must audio stay on the device, or in Europe? What computer is at the command post?
    - *Today:* European providers only [42]. Offline, a laptop does the extraction and the phone does the speech-to-text; the offline network and map are not proven yet.
    - *It decides:* how much of Saturday goes to local mode.

12. **Is "web app" a requirement for capturing the voice, or only for the map?**
    - *Today:* both exist, a phone web page and a native app. We plan to drop the phone web page and keep the web app for the map.
    - *It decides:* whether we may.

13. **Do you have sample recordings, ideally real radio audio?**
    - *Today:* scripted clips with synthetic voices, and our own voices tried by hand. Real Ukrainian speech is untested.
    - *It decides:* what we tune against. Without samples we record our own in the hall.

History, and the rest:

14. **What do you want from history?** A replay, a log, an export?
    - *Today:* a log of every report and a replay with a time slider, at 1×, 10× and 30×.
    - *It decides:* whether an export is worth building.

15. **Does Lysk have its own IP terms for this challenge?** The hackathon's FAQ says IP stays with the team unless a partner says otherwise. Is a public repo fine?

16. **What would make one team stand out among the nine on this challenge?** What do you expect most teams to get wrong?

17. **Can we show you a working version this afternoon?** Ask for a time, around 15:00, for 15 minutes.

### After the talk

- Write each answer down in their words, then add one line per answer to [DECISIONS.md](../DECISIONS.md) and remove the question here.
- Tell the team the answer to question 1 at once: it moves people between roles ([work-split.md](hackathon/work-split.md#when-to-switch-people)).
- Note what they reacted to when they saw the command post. That goes into the pitch.
