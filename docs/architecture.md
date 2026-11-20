# Architecture

Voice-to-Map has a small local controller, a local language model and two browser screens.

```text
Phone keyboard dictation or typing
              ↓ text
Phone browser ⇄ Node controller → Ollama intent extraction
                    ↓                     ↓
             mission event log ← deterministic resolver + gazetteer
                    ↓
             controller browser map and replay
```

## Runtime

The Node process uses built-in modules. It serves static files and JSON on one port.
It has no bundler, framework, package dependencies or native application build.
Ollama runs separately. Each extraction requests a 4,096-token context and the 3B model.
Only one report is interpreted at a time, which limits memory use.

The phone uses the keyboard's dictation facility. Its provider, offline support and language
availability are controlled by the phone. The program handles the resulting text.
It has no audio recording, streaming or speech-recognition model on the phone.

## Phone feedback

The phone receives an immediate report identifier. It polls for received, processing and final states.
Resolved reports show the place and uncertainty. Unresolved reports show a prompt.
Ambiguous reports show a question and numbered place buttons. The user can reject all choices.
Answers are saved and move the same unit on the controller map.
Network failures retain the draft and offer a retry with the same request identifier.
Model failures show an actionable message and permit a new attempt.

## Positions

Ollama returns a validated intent schema without coordinates.
The resolver uses the selected area's committed gazetteer, the latest authoritative unit position,
the named place, relation, compass direction and any distance stated by the speaker.
The resolver retains explicit uncertainty, ambiguity handling, named-place matching and dead reckoning.
No phone GPS is accessed.

## Missions and ordering

A mission has an area, a name, a random join code and an optional gazetteer start point.
Each joined unit has a call sign, a device identifier and a private bearer token.
The join code is visible only to the local controller. A unit token is returned only when joining.
After three minutes without a report, a different device can take over a call sign.

Report submissions are persisted before receipt. Request identifiers prevent repeated submissions.
The latest accepted report supersedes an older unanswered question or in-flight result for that unit.
Ending a mission prevents subsequent reports, answers and in-flight results from moving units.
The first clarification answer stands.

## Storage and recovery

`EventStore` appends JSON lines to `DATA_DIR/events.jsonl`.
Missions, joins, report receipts, progress, results, answers and endings are events.
`foldEvents` reconstructs the live state or a replay up to a selected time.
Only one process may use a data directory. A lock file enforces this.
An incomplete final line from an interrupted write is removed on recovery.
An invalid complete line stops startup rather than discarding history.
Unfinished reports become explicit retryable errors after a restart.

## Map

The browser draws bundled OpenStreetMap streets and landmarks with SVG.
It draws unit markers, uncertainty circles, trails, heading arrows and candidate numbers over them.
The map has pan, zoom, unit focus and timestamped replay. It requires no tile server or internet.
It is an area map, not a global navigation or satellite map.

## Network boundary

The phone and controller use one trusted local network. No messaging account or external relay is required.
Controller operations are accepted only from loopback. Phones use join codes and unit tokens.
JSON requests from other browser origins are rejected.
The default HTTP transport is not encrypted. Do not expose it directly to the public internet.
The only model request is to the configured Ollama address, which defaults to loopback.
