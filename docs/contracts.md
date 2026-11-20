# Interfaces

The browser and controller exchange JSON. POST requests use `Content-Type: application/json`.
Phone requests after joining send `Authorization: Bearer <unit token>`.
Every failure returns `{ "error": "message" }` with an appropriate HTTP status.

## Controller endpoints

These are accessible only from the computer running the controller, through loopback.

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Ollama availability, model availability and phone network addresses |
| `POST /api/missions` | Open a mission with `{ name, area, start? }`. `start` is a gazetteer feature id. |
| `POST /api/missions/:id/end` | End a mission; preserve its history |
| `GET /api/state?mission=:id&at=:epochMs` | Mission state; omit `at` for the live state |
| `GET /api/places?area=:area&q=:text` | Up to eight matching starting places |
| `GET /api/map?area=:area` | Bundled street lines and landmarks |
| `GET /api/export?mission=:id` | Mission events without join codes or unit credentials |

## Phone endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/missions` | Mission names, identifiers, areas and open/ended state; no join codes |
| `POST /api/join` | `{ mission, invite, callsign, device, language? }` → `{ token, mission, callsign }` |
| `GET /api/unit` | The authenticated unit's current position, latest report, pending question and recent feedback |
| `POST /api/reports` | `{ text, requestId, language }` → HTTP 202 with `{ id, status }` |
| `POST /api/answers` | `{ report, choice }`, where `choice` is an offered candidate id or null |

Reports are limited to 500 characters. Call signs are limited to 24 characters.
Report identifiers are generated on the phone and reused when retrying the same send.
The controller caps its waiting report queue at 20.

## Feedback states

- `queued`: saved and waiting for the model.
- `processing`: intent extraction is in progress.
- `resolved`: the resolver placed the report or identified its heading target.
- `ambiguous`: a question and candidate placements are available.
- `unresolved`: more location information is required.
- `answered`: a candidate was selected.
- `rejected`: all candidates were rejected.
- `superseded`: a newer report or mission ending made the result obsolete.
- `error`: processing failed; a user-visible explanation is present.

## Intent and resolution

`src/intent.js` contains the JSON schema and sanitizer. Intent contains kind, landmark name,
dictionary-form name, category, relation, stated distance, direction, language and confidence.
It does not contain coordinates.

The pure resolver returns status, pin, radius, estimated state, heading target, candidates,
question and evidence. Each candidate includes its precomputed placement.
Selecting a candidate uses that placement without another model call.

## Event log

Each line of `events.jsonl` is an event with `kind`, `id`, `ts` and `mission`.
Kinds are `mission`, `join`, `accepted`, `progress`, `result`, `answer` and `end`.
The internal log includes credentials for recovery. The export removes them.
Do not publish the internal data directory.
