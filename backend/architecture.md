# Architecture Overview

For the full set of diagrams see [`../docs/architecture.md`](../docs/architecture.md).

## System Components

### External Data Sources

* **Polymarket** — WebSocket feed (`wss://ws-live-data.polymarket.com`).
* **Kalshi** — REST polling against `https://api.elections.kalshi.com/trade-api/v2`.
  A WebSocket client exists (`src/api-clients/kalshi.client.ts`) but the polling
  transport is what the ingestor worker actually runs.

### Backend — Node.js / Express

* **Data Ingestion Layer** — Clients and ingestors consuming market data, run on
  a dedicated worker thread so streaming never blocks the API.
* **Service Layer** — Data access (`polymarket.service`, `kalshi.service`,
  `match-result.service`) and matching logic (`matching-engine.service`).
* **Database Layer** — PostgreSQL behind one shared `pg` pool. Four tables:
  `polymarket_data` and `kalshi_data` (upserted per ticker), `matched_events`,
  and the append-only `price_history`.
* **Vector Layer** — MiniLM-L6-v2 embeddings computed locally, used to
  pre-filter candidate pairs by cosine similarity before any LLM call.
* **AI Integration** — Claude for single-agent matching; Claude + Gemini +
  ChatGPT for consensus matching when all three keys are configured.
* **API Layer** — RESTful endpoints for data access, matching and stored results.

### Frontend — React / TypeScript

* Component-based UI with a table per platform.
* Matching panel for configuring and triggering matches.
* Results view for live matches and for pairs already stored in the database.

## Data Flow

* **Ingestion:** WebSocket / REST poll → clients → ingestors → PostgreSQL
  (continuous upserts, plus a `price_history` row per observation).
* **API:** React components → Vite `/api` proxy → Express routes → services → database.
* **Matching:** User input → matching engine → cache check → database fetch →
  vector pre-filter → LLM (single-agent or consensus) → results, cached for one hour.
