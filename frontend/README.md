# Prediction Market Arbitrage — Frontend

React + TypeScript + Vite UI for the arbitrage detection system. Components are
styled with **CSS Modules** (`*.module.css`); there is no CSS-in-JS in this app.

## Setup

```sh
npm install
```

## Development

```sh
npm run dev
```

Serves on `http://localhost:5173`. Requests to `/api/*` are proxied to the
backend on `http://localhost:3000` (see `vite.config.ts`), so the backend must
be running for the tables and matching to return data. Because everything goes
through that proxy, API calls use relative URLs and no CORS setup is needed.

## Other scripts

```sh
npm run build       # typecheck, then production build into dist/
npm run typecheck   # tsc --noEmit
npm run lint        # eslint, warnings treated as failures
npm run preview     # serve the production build locally
```

## Structure

```
src/
├── components/
│   ├── PolymarketTable.tsx   Polymarket feed      (GET /api/polymarket)
│   ├── KalshiTable.tsx       Kalshi feed          (GET /api/kalshi)
│   ├── MatchingPanel.tsx     Filters + trigger    (POST /api/matching/match)
│   ├── MatchResults.tsx      Live and stored pairs (GET|POST /api/results/matched-events)
│   └── *.module.css          Per-component styles
├── utils/axios.ts            Axios instance with a relative /api base URL
├── types.ts                  Record/match interfaces mirroring backend/src/types
├── App.tsx                   Sidebar + tabbed layout
└── main.tsx                  Entry point
```

### A note on `types.ts`

`PolymarketDataRecord`, `KalshiDataRecord`, `MarketMatch` and `MatchFilters`
duplicate the interfaces in `backend/src/types/`. They must be kept in sync by
hand; if you change a record shape on the server, change it here too.
