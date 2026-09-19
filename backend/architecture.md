# Architecture Overview

For the full set of diagrams see [`../docs/architecture.md`](../docs/architecture.md).

## System Components

### External Data Sources

* **Polymarket** — REST polling of the Gamma market catalogue
  (`https://gamma-api.polymarket.com/markets`), with each market's best bid/ask.
* **Kalshi** — REST polling of all open events with nested markets
  (`https://api.elections.kalshi.com/trade-api/v2/events`), with best YES/NO bid/ask.

### Backend — Node.js / Express

* **Data Ingestion Layer** — Clients and ingestors consuming market data, run on
  a dedicated worker thread so streaming never blocks the API.
* **Service Layer** — Data access (`polymarket.service`, `kalshi.service`,
  `match-result.service`) and matching logic (`matching-engine.service`).
* **Database Layer** — PostgreSQL behind one shared `pg` pool. Five tables:
  `polymarket_data` and `kalshi_data` (upserted per ticker, with order-book
  columns), `matched_events`, the append-only `price_history`, and
  `match_verdicts` (stored LLM decisions per market pair).
* **Vector Layer** — MiniLM-L6-v2 embeddings computed locally, used to pick
  each Polymarket market's top-3 Kalshi candidates before any LLM call.
* **AI Integration** — Claude for single-agent matching; Claude + Gemini +
  ChatGPT for consensus matching when all three keys are configured.
* **API Layer** — RESTful endpoints for data access, matching and stored results.

### Frontend — React / TypeScript

* Component-based UI with a table per platform.
* Matching panel for configuring and triggering matches.
* Results view for live matches and for pairs already stored in the database.

## Data Flow

* **Ingestion:** REST poll sweeps → clients → ingestors → PostgreSQL
  (batched upserts, plus a `price_history` row whenever a price moves).
* **API:** React components → Vite `/api` proxy → Express routes → services → database.
* **Matching:** User input → database fetch (fresh prices) → vector candidates →
  stored verdicts → LLM (single-agent or consensus) for unseen pairs only →
  matches priced as YES/NO hedges from current asks and fees.
