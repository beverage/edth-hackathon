# Contributing

Follow the installation and running instructions in [README.md](README.md).
Node.js is the only application runtime. Ollama is needed for live language-model processing.

Use `npm test` for the geographic, controller, persistence and HTTP tests.
Use `npm run build` to check JavaScript syntax. Neither command needs Ollama.
The integration test uses a temporary directory and a loopback HTTP port.

Use `npm run scenarios -- vincennes` or `npm run scenarios -- kyiv` to exercise Ollama.
These commands print a result and elapsed time for each example. They do not change saved missions.

Keep the README focused on the program's purpose, requirements, installation and use.
Put architecture and interface details in `docs/`. Record decisions in `DECISIONS.md`.
Read `AGENTS.md` for the rules that apply to coding agents.
