# Voice-to-Map: instructions for coding agents

Read `README.md`, `docs/architecture.md`, `docs/contracts.md` and `DECISIONS.md` before changing behaviour.
The README is a user guide. Keep implementation history and decision records out of it.

## Layout

- `src/main.js`: application entry point.
- `src/http.js`: the small HTTP interface and static browser pages.
- `src/controller.js`: missions, joins, report processing and answers.
- `src/state.js`, `src/store.js`: event folding and durable local storage.
- `src/ollama.js`, `src/intent.js`: local model interface, intent schema and validation.
- `src/geo/`: deterministic geographic resolver and place matching.
- `web/`: controller map and phone transmitter. Plain HTML, CSS and JavaScript.
- `data/`: committed OpenStreetMap gazetteers.
- `tests/`: Node's built-in test runner. No testing packages or live models are required.

## Commands

```bash
npm start
npm run build
npm test
npm run scenarios -- vincennes
```

Run `npm test` and `npm run build` for code changes.
For documentation-only changes, review the changed text; do not run the code tests.
No package installation, compiler, bundler or native SDK is required for the application.

## Rules

- The language model extracts intent. It never supplies coordinates.
- Every position comes from the gazetteer or stated movement from the last position.
- Do not read the phone's GPS.
- Ask when a place is ambiguous. Do not silently choose.
- Keep Ollama as the default and only model service. Do not add a hosted provider or API-key requirement.
- Phone input is text, typed or dictated through the phone keyboard. Do not add custom audio capture without discussing its setup cost.
- Keep received, processing, result, question and failure feedback visible on the phone.
- Keep both reports and clarification answers in the shared event log.
- Protect unit credentials. Phone requests cannot use controller-only endpoints or answer another unit's question.
- Keep controller operations restricted to loopback. This application is for a trusted local network.
- Use built-in Node and browser APIs. Discuss the installation and runtime cost before adding dependencies.
- Keep all project documentation in this repository. Update it with the code it describes.
- Append decisions to `DECISIONS.md`. Check the last number first.
- Preserve unrelated user changes and local mission data.
- Do not commit, push, deploy, or move the `prior-work-fri-1800` tag unless the user asks for that action.
