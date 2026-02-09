# VokaWin – Vocabulary Duel

Realtime multiplayer vocabulary matching game for 2–5 players.  
Designed for German Gymnasium students practicing foreign language vocabulary.

## Quick Start

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## How to Play

1. Select a textbook and word range
2. Choose how many words (8, 10, or 12) and how many players (2–5)
3. Create game → share the code or link with friends
4. Once players join, the creator can start (or it auto-starts when full)
5. Match source words to target words by tapping pairs
6. First to finish triggers a 30-second timer for everyone else
7. Highest score wins, ties broken by speed

## Adding New Books

1. Create a JSON file in `/data/`:
```json
{
  "id": "my-book",
  "words": [
    { "source": "Haus", "target": "house" },
    { "source": "Schule", "target": "school" }
  ]
}
```

2. Add an entry to `/data/catalog.json`:
```json
{
  "id": "my-book",
  "title": "My Book",
  "subtitle": "English, Grade 7",
  "language": { "source": "de", "target": "en" },
  "wordCount": 2
}
```

Supported languages: `de`, `en`, `fr`, `la` (UI labels adapt automatically).

## Project Structure

```
├── server/
│   ├── index.js           Express + routes + startup
│   ├── gameManager.js     Game state logic (no I/O)
│   ├── socketHandler.js   Socket.IO event wiring
│   └── utils.js           Shuffle, code gen, scoring
├── public/
│   ├── index.html         Home page (thin shell)
│   ├── game.html          Game page (thin shell)
│   ├── css/               Split stylesheets
│   ├── js/                Client modules
│   │   ├── i18n.js        Translation system
│   │   ├── utils.js       Shared utilities
│   │   ├── home.js        Home page logic
│   │   └── game.js        Game logic
│   ├── i18n/              Translation files (de, en)
│   └── images/            Logo, favicons, OG image
├── data/
│   ├── catalog.json       Book index
│   └── *.json             Per-book word lists
└── package.json
```

## Tech Stack

- Node.js + Express (static files + REST API)
- Socket.IO (realtime game sync)
- Vanilla HTML/CSS/JS (no framework, no build step)
- In-memory game state (no database)

## License

MIT
