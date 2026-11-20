# Voice-to-Map

Voice-to-Map turns spoken location descriptions into updates on a shared map.
People report from a phone browser. A controller watches their positions on a computer.

Use the phone keyboard's microphone to dictate a report. Review the text and send it.
The phone shows when the report is received and processed. It then shows the result.
If a place is ambiguous, the phone displays a question and buttons for the possible places.
The speaker can choose a place or reject all the choices.

The program supports English, French and Ukrainian. It includes maps for Vincennes and central Kyiv.

## How it works

- Ollama runs a language model on the controller computer. It extracts the place name and the meaning of the report.
- A deterministic resolver finds the place in a local OpenStreetMap gazetteer. The language model never supplies coordinates.
- The controller shows one marker per call sign. It also shows uncertainty circles, movement directions, trails and open questions.
- Missions group the reports. Each mission has a name, an area and an optional starting place.
- The report log is saved on the controller. Ended missions remain available for replay and export.
- The program does not read the phone's GPS.

There are two browser screens and one Node.js process. Ollama is a separate local process.
The map uses bundled street lines and landmarks. It does not download map tiles.

## Requirements

### Controller computer

| Requirement | Purpose |
|---|---|
| Node.js 24.12 or newer, including npm | Runs the controller, serves the pages and runs the development commands |
| A current Ollama release | Runs the local language model |
| The Ollama model `ministral-3:3b` | Interprets location descriptions |
| A modern browser | Displays the controller map |
| A local network shared with the phones | Connects phone browsers to the controller |
| About 3 GB of disk space for the model | Stores the one-time model download |
| Enough available memory for the model, Node and the browser | The model is the main memory requirement; use the 3B model on an 8 GB computer |

The application has **no npm package dependencies**. Its JavaScript uses Node's built-in modules.
It uses the browser's built-in HTML, CSS and SVG support.

### Phone

- An Android phone or iPhone with a modern browser.
- A keyboard with dictation for the chosen language. Typing is also supported.
- Access to the controller over the same network.

Dictation is provided by the phone and its keyboard. Some keyboards use an online speech service.
Offline dictation depends on the phone, language and installed language packs.
The application receives text. It does not record or upload audio.

## Install

These commands are for a Mac. Node and Ollama also provide installers for other systems.

1. Install [Node.js LTS](https://nodejs.org/en/download) and [Ollama](https://ollama.com/download).
   If you use Homebrew, Ollama can be installed with:

   ```bash
   brew install ollama
   ```

2. Download or clone this repository. Open a Terminal in its root folder.

   ```bash
   cd ~/Projects/edth-hackathon
   node --version
   npm --version
   ollama --version
   ```

3. Start Ollama in a separate Terminal. Leave that Terminal running.
   Quit the Ollama desktop app first if it is already serving port 11434.

   ```bash
   OLLAMA_NO_CLOUD=1 OLLAMA_CONTEXT_LENGTH=4096 ollama serve
   ```

4. In another Terminal, download the model. This is about 3 GB and is needed once.

   ```bash
   ollama pull ministral-3:3b
   ```

No API key, messaging account or mobile development tools are required.
There are no application packages to download with npm. `npm install` is optional.
Internet is needed for installation and the model download.
The controller and map can then run over a local network without an internet connection.
Phone dictation may still need internet, as described above.

## Build

The source runs directly in Node and the browser. There is no compilation or bundling step.
To validate the source before running it:

```bash
npm run build
```

This checks JavaScript syntax. It does not download models, install packages or start a server.

## Run

Keep Ollama running. In the repository root, start the controller:

```bash
npm start
```

Open [http://localhost:3117](http://localhost:3117) on the controller computer.
The page shows whether Ollama and the selected model are available.
The first report can take longer while the model loads.

### Open a mission

1. Click **New mission**.
2. Enter a name and choose Vincennes or Kyiv.
3. Optionally search for a starting place. This gives joining units an estimated starting position.
4. Open the mission.

The controller shows a phone address and a join code. If several network addresses are listed,
use the address for the Wi-Fi network shared with the phones.

The controller screen is available only from `localhost` on the computer running the program.
Phones use the transmitter screen instead.

### Connect a phone

1. Connect the phone to the same Wi-Fi network as the controller.
2. Open the displayed phone address. It looks like `http://192.168.1.10:3117/phone`.
3. Select the mission, enter its join code and choose a call sign.
4. Tap **Join mission**.
5. Choose the report language.

The connection uses ordinary HTTP on the local network. Use a trusted network.
The phone page uses keyboard dictation, so it does not require browser microphone permission or an HTTPS microphone setup.
If the computer firewall asks about incoming connections, allow the controller on the local network.

### Send a report

Tap the report text box. Use the keyboard microphone to dictate, or type the report.
Check the words and tap **Send report**.

Examples:

- “I'm at Bérault metro.”
- “I'm behind the church.”
- “Moving towards the town hall.”
- “Moved 200 metres north.”
- “Je suis devant la mairie.”
- “Я біля станції метро Хрещатик.”

The phone displays a receipt, processing status and the outcome. It keeps a feedback history.
If the controller asks a question, tap the correct place or **None of these**.
The answer updates the same mission map. A newer report replaces an older unanswered question.

**Read feedback aloud** uses the phone's installed system voices. Voice availability depends on the phone.
If sending fails, the draft is kept and **Retry last report** becomes available.
The controller recognises a repeated send and saves it once.

### Watch and replay

- Drag the map to pan. Use the zoom buttons or mouse wheel to zoom.
- Click a unit to centre the map on its position.
- Numbered markers show the choices for open questions.
- Move the time slider to replay the mission. Click **Return to live** to resume live updates.
- Click **Export log** to save the mission's events without its connection credentials.
- Click **End mission** when reporting is finished. Its history remains available.

Stop the controller with **Ctrl+C**. The saved missions are restored the next time it starts.
Reports interrupted by a restart are marked as failed so the speaker can resend them.

## Configuration

Defaults work without a configuration file. To change them, create `.env.local` in the repository root.
Use `.env.example` as a reference. Do not overwrite an existing configuration file.

| Variable | Default | Meaning |
|---|---|---|
| `HOST` | `0.0.0.0` | Network address to listen on; use `127.0.0.1` for computer-only use |
| `PORT` | `3117` | Controller and phone port |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Address of the Ollama server |
| `LOCAL_EXTRACT_MODEL` | `ministral-3:3b` | Installed Ollama model |
| `DATA_DIR` | `.data/lightweight` | Directory for saved mission events |

Command-line options override `HOST`, `PORT` and `DATA_DIR`:

```bash
npm start -- --host 0.0.0.0 --port 3117 --data-dir .data/lightweight
```

Mission data includes report text and phone connection credentials. Keep this directory private.
Only one controller process can use a data directory at a time.

## Troubleshooting

| Problem | Action |
|---|---|
| `node`, `npm` or `ollama` is not found | Install the missing tool. Reopen Terminal and check its PATH. With Homebrew on Apple Silicon, try `eval "$(/opt/homebrew/bin/brew shellenv)"`. |
| Ollama is unreachable | Start `ollama serve`. Check `OLLAMA_URL`. The default port is 11434. |
| The model is missing | Run `ollama pull ministral-3:3b` while Ollama is running. |
| The first report is slow | Allow the model to load. Keep other memory-heavy applications closed on an 8 GB computer. |
| The phone cannot open the page | Check the Wi-Fi network, phone address, computer firewall and listening address. Guest Wi-Fi may block device-to-device connections. |
| The keyboard has no microphone | Enable keyboard dictation in the phone settings, select a supported language, or type the report. |
| A call sign is in use | Choose another call sign. A different phone may take it over after three minutes of inactivity. |
| A mission has ended | Leave it and join an open mission. |
| Port 3117 is in use | Stop the other program or choose a different port with `--port`. |

## Development

```bash
npm test
npm run build
```

Tests use Node's built-in test runner. They do not need a model or an API key.
The HTTP integration test opens a loopback port.
The build command checks JavaScript syntax.

`npm run scenarios -- vincennes` and `npm run scenarios -- kyiv` run the example reports against Ollama.
These commands need the model running. They print the outcome and processing time for each report.

The source is in `src/`. Browser pages are in `web/`. Gazetteers are in `data/`.
See [docs/architecture.md](docs/architecture.md) for the design and [docs/contracts.md](docs/contracts.md) for the interfaces.

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), licensed under the ODbL.
