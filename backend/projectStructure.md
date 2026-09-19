# Backend Project Structure

```
backend/
├── src/
│   ├── api-clients/
│   │   ├── kalshi.polling.client.ts    (Kalshi /events poller: every open market with its book)
│   │   ├── kalshi-polling.ingestor.ts  (Persists each Kalshi sweep)
│   │   ├── polymarket.client.ts        (Polymarket Gamma poller: every open binary market with its book)
│   │   └── polymarket.ingestor.ts      (Persists each Polymarket sweep)
│   ├── config/
│   │   └── index.ts                    (Loads .env; the single source of env-derived settings)
│   ├── controller/                     (Express routers)
│   │   ├── kalshi.controller.ts        (/api/kalshi)
│   │   ├── matching.controller.ts      (/api/matching)
│   │   ├── polymarket.controller.ts    (/api/polymarket)
│   │   └── results.controller.ts       (/api/results)
│   ├── database/
│   │   ├── pool.ts                     (The shared pg Pool + NUMERIC/BIGINT type parsers)
│   │   └── postgres.client.ts          (Schema creation/migration, batched upserts, price history)
│   ├── services/
│   │   ├── alerting.service.ts         (Optional Discord webhook alerts)
│   │   ├── arbitrage.service.ts        (Prices the YES/NO hedge on a matched pair)
│   │   ├── consensus.service.ts        (Multi-agent voting: Claude + Gemini + ChatGPT)
│   │   ├── kalshi.service.ts           (Reads over kalshi_data)
│   │   ├── match-prompt.ts             (Shared LLM prompt + response parser)
│   │   ├── match-result.service.ts     (CRUD over matched_events)
│   │   ├── match-verdict.store.ts      (Stored LLM verdicts per market pair)
│   │   ├── matching-engine.instance.ts (The single engine instance shared by all routes)
│   │   ├── matching-engine.service.ts  (Orchestration: fetch, candidates, verdicts, verify, price)
│   │   ├── polymarket.service.ts       (Reads over polymarket_data)
│   │   └── vector-matching.service.ts  (MiniLM-L6-v2 embeddings + cosine similarity)
│   ├── types/                          (Shared interfaces: records, matches, filters, consensus)
│   ├── utils/
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
| `match_verdicts` | LLM decision per (Polymarket, Kalshi) pair: match or not, similarity, direction. |
| `price_history` | Append-only time series; a row is added whenever a market's price changes. |
