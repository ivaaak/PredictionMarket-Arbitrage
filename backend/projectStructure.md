# Backend Project Structure

```
backend/
├── src/
│   ├── api-clients/
│   │   ├── kalshi.client.ts            (Kalshi WebSocket client - not currently wired up)
│   │   ├── kalshi.ingestor.ts          (Ingestor for the WebSocket client - not currently wired up)
│   │   ├── kalshi.polling.client.ts    (Kalshi REST poller; the transport actually in use)
│   │   ├── kalshi-polling.ingestor.ts  (Maps poll results to MarketData and persists them)
│   │   ├── polymarket.client.ts        (Polymarket WebSocket client)
│   │   └── polymarket.ingestor.ts      (Maps WS trades to MarketData and persists them)
│   ├── config/
│   │   └── index.ts                    (Loads .env; the single source of env-derived settings)
│   ├── controller/                     (Express routers)
│   │   ├── kalshi.controller.ts        (/api/kalshi)
│   │   ├── matching.controller.ts      (/api/matching)
│   │   ├── polymarket.controller.ts    (/api/polymarket)
│   │   └── results.controller.ts       (/api/results)
│   ├── database/
│   │   ├── pool.ts                     (The shared pg Pool + NUMERIC/BIGINT type parsers)
│   │   └── postgres.client.ts          (Schema creation, ingestion upserts, price history)
│   ├── services/
│   │   ├── alerting.service.ts         (Optional Discord webhook alerts)
│   │   ├── consensus.service.ts        (Multi-agent voting: Claude + Gemini + ChatGPT)
│   │   ├── kalshi.service.ts           (Reads over kalshi_data)
│   │   ├── match-result.service.ts     (CRUD over matched_events)
│   │   ├── matching-engine.instance.ts (The single engine instance shared by all routes)
│   │   ├── matching-engine.service.ts  (Orchestration: fetch, pre-filter, batch, verify, cache)
│   │   ├── polymarket.service.ts       (Reads over polymarket_data)
│   │   └── vector-matching.service.ts  (MiniLM-L6-v2 embeddings + cosine similarity)
│   ├── types/                          (Shared interfaces: records, matches, filters, consensus)
│   ├── utils/
│   │   ├── match-cache.ts              (TTL + LRU cache for matching results)
│   │   └── text-processor.ts           (Normalization and tokenization helpers)
│   ├── workers/
│   │   └── data-ingestor.ts            (Worker thread entry: starts both ingestors)
│   ├── worker-pool.ts                  (Generic worker pool; not currently wired up)
│   └── server.ts                       (Express entry point: schema init, worker spawn, routes)
├── .env.example                        (Template for the .env this directory expects)
├── .eslintrc.cjs
├── package.json
└── tsconfig.json                       (Compiles src/ to dist/)
```

## Database

PostgreSQL, reached through `DATABASE_URL`. There is no local database file —
the SQLite artefacts this project used before the Postgres migration have been
removed, and `*.db` is gitignored.

Tables, all created on startup by `PostgresClient.initialize()`:

| Table | Purpose |
| :--- | :--- |
| `polymarket_data` | Latest row per Polymarket ticker (upserted on conflict). |
| `kalshi_data` | Latest row per Kalshi ticker (upserted on conflict). |
| `matched_events` | Confirmed pairs, with generated `price_spread` and `total_combined_volume`. |
| `price_history` | Append-only time series of every observed price/volume. |
