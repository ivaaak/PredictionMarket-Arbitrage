/prediction-market-arbitrage

backend/
├── src/
│   ├── api-clients/
│   │   ├── kalshi.client.ts         (Fetches Kalshi data, calculates mid-price)
│   │   └── polymarket.client.ts     (Fetches Polymarket data)
│   ├── config.ts                    (Environment variables: Redis, API keys)
│   ├── database/
│   │   └── Postgres.client.ts         (Handles connection and persistence to database.db)
│   ├── queues/
│   │   ├── data-ingestion.queue.ts  (BullMQ Queue setup for adding jobs)
│   │   └── market-scheduler.ts      (Logic to periodically enqueue market fetching jobs)
│   ├── server.ts                    (Express.js entry point, API routes)
│   ├── types/
│   │   └── market.ts                (Type definitions: KalshiMarketData, NormalizedMarketData, etc.)
│   └── workers/
│       └── data-processor.worker.ts (BullMQ Worker: Normalizes and saves data to Postgres)
├── package.json
├── tsconfig.json
└── database.db                      (The Postgres file, created on first run)


