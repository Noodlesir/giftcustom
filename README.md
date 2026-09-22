# GiftCustom — Backend

A small Node.js/Express backend for the GiftCustom gifting wizard. It replaces the
frontend's fake, deterministic "AI" theme generator with a real call to Claude, and
adds order persistence + lookup.

## What it does

- **`POST /api/themes`** — generates 3 gift theme ideas from the recipient/occasion/
  budget/gift-type inputs. Calls the Anthropic API (Claude) if `ANTHROPIC_API_KEY` is
  set; otherwise (or if the AI call fails) it falls back to a deterministic local
  generator, so the app always works.
- **`POST /api/orders`** — validates and saves a confirmed order to
  `data/orders.json`, returning a generated `orderId`.
- **`GET /api/orders/:orderId`** — looks up a previously saved order.
- **`GET /api/health`** — quick check of whether AI generation is configured.
- Serves the frontend itself as static files from `public/` (same origin as the API,
  so there's no CORS setup needed in normal use).

## Setup

```bash
npm install
cp .env.example .env
# edit .env and add your ANTHROPIC_API_KEY (get one at https://console.anthropic.com/)
npm start
```

Then open **http://localhost:3000**.

If you don't set `ANTHROPIC_API_KEY`, the app still works end-to-end — theme
generation just uses the deterministic fallback instead of live AI output.

## Design

The frontend has a hand-drawn, stationer's-studio look: a kraft/cream paper
background, a handwritten display face (Caveat) for headings paired with a
clean sans (Urbanist) for body copy, and "pencil wobble" borders on cards and
buttons (an SVG `feTurbulence`/`feDisplacementMap` filter, defined once in
`index.html` and reused via CSS). Each occasion (birthday, anniversary,
festival, sorry, congrats, other) tints the accent colors via
`body[data-occasion]` in `css/themes.css`. The unused Three.js/GSAP CDN
`<script>` tags from the original markup were removed since nothing in
`js/main.js` referenced them.

## Project layout

```
giftcustom-backend/
├── server.js           # Express app + routes
├── lib/
│   ├── themes.js        # AI theme generation + validation + fallback
│   └── orders.js        # Order validation + file-based storage
├── data/orders.json      # created automatically on first order
├── public/               # the frontend (served as static files)
│   ├── index.html
│   ├── css/               # main, themes, animations, components, responsive
│   └── js/main.js          # talks to /api/themes and /api/orders
├── package.json
└── .env.example
```

## Frontend changes made

- `runThemeGeneration()` now `fetch()`s `POST /api/themes` with the wizard's state,
  and renders whatever themes come back. If the request fails for any reason, it
  transparently falls back to the original local generator so the flow never breaks.
- The "Confirm Gift" button now `fetch()`s `POST /api/orders` to persist the order
  before showing the confirmation screen, and displays the returned `orderId` on the
  receipt. If that request fails, a local placeholder ID is used instead so the user
  can still complete the flow.

## Notes on the AI prompt

The theme-generation prompt (in `lib/themes.js`) asks Claude to return a strict JSON
array matching the exact shape the frontend already renders (`name`, `concept`,
`palette`, `items`, `tone`, `message`, `totalPrice`, `giftType`), capped to the
provided budget. The server parses and re-validates every field before it reaches
the browser, so malformed or out-of-range model output can't break the UI.

## Storage

Orders are stored in a single JSON file for simplicity (`data/orders.json`). For
production use, swap `lib/orders.js` for a real database (Postgres, SQLite, etc.) —
the `createOrder`/`getOrder` function signatures are the only thing `server.js`
depends on, so the rest of the app doesn't need to change.
