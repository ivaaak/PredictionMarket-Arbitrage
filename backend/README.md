
### Arbitrage Hunter: Market Matching and Arbitrage Platform

The Arbitrage Hunter platform uses a multi-threaded Node.js server, a PostgreSQL database, and large language models (LLMs) combined with semantic vector matching to identify equivalent prediction markets between **Polymarket** and **Kalshi**.

-----

### 🚀 Getting Started

#### 1\. Prerequisites

  * Node.js (v18+)
  * Docker (Recommended for PostgreSQL setup) or a running PostgreSQL instance
  * API Keys:
      * **Anthropic API Key** (for Claude LLM)
      * **Google Gemini API Key** (Optional, for Consensus)
      * **OpenAI API Key** (Optional, for Consensus)

#### 2\. Environment Setup

Create a file named `.env` in this `backend/` directory (that is where the
process loads it from) and populate it with your configuration. A ready-made
template lives at `backend/.env.example`:

```bash
# --- Server Config ---
PORT=3000
NODE_ENV=development

# --- Database Config (PostgreSQL) ---
# Replace with your actual Postgres credentials
DATABASE_URL="postgres://user:password@localhost:5432/market_db"

# --- Data ingestion ---
ENABLE_INGESTOR=true             # false serves an already populated DB
KALSHI_POLLING_INTERVAL_MS=5000

# --- API Keys for LLM Matching ---
ANTHROPIC_API_KEY="sk-ant-..."
GEMINI_API_KEY="AIza..."         # Optional: BOTH this and OPENAI_API_KEY
OPENAI_API_KEY="sk-..."          # are required to enable consensus mode

# --- Alerting (optional) ---
DISCORD_WEBHOOK_URL=""
```

> The external API URLs live in `src/config/index.ts` and are not read from the
> environment.

#### 3\. Database Setup (PostgreSQL)

Using Docker is the simplest way to run PostgreSQL locally:

```bash
# Start a local PostgreSQL instance
docker run --name market-postgres -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password -e POSTGRES_DB=market_db -p 5432:5432 -d postgres
```

Table creation (`polymarket_data`, `kalshi_data`, `matched_events`,
`price_history`) runs automatically on server startup in `src/server.ts`, using
`DATABASE_URL`. It does not depend on the ingestor worker, so the API still
comes up correctly with `ENABLE_INGESTOR=false`.

#### 4\. Installation and Run

```bash
# Install dependencies
npm install

# Run the API with ts-node (no build step)
npm start

# ...or with reload on change
npm run dev

# Compile to dist/ and run the compiled output
npm run build
npm run start:prod
```

Other scripts: `npm run typecheck` (tsc --noEmit) and `npm run lint` (eslint).

On the first matching request the MiniLM-L6-v2 embedding model (~80MB) is
downloaded and cached locally, so that request is noticeably slower than the
rest.

-----

### ⚙️ Architecture and Data Flow

The application is structured around a multi-threaded architecture to ensure the API remains fast and responsive while handling continuous high-volume data streaming and intensive CPU tasks like LLM and Vector Processing.

#### Main Thread (API Server)

  * Runs the Express server and handles all client requests.
  * Hosts the **Matching Engine Service** which orchestrates the matching process.
  * Executes the final arbitrage check.

#### Data Ingestor Worker Thread (I/O Bound)

  * Spawns a dedicated thread for continuous market data ingestion.
  * Connects to **Polymarket (WebSocket)** and **Kalshi (Polling/WebSocket)** streams.
  * **Persists all incoming market data directly to PostgreSQL.**

#### Matching Process Flow

1.  **Request:** A user calls the `/api/matching/match` endpoint on the **Main Thread**.
2.  **Fetch & Pre-filter:** The **Matching Engine Service** fetches the latest data from PostgreSQL.
3.  **Semantic Match:** It delegates the pre-filtering to the **Vector Matching Service**, which embeds each side once with a locally loaded **MiniLM-L6-v2** model and computes **Cosine Similarity** between market titles. Pairs scoring `>= 0.75` survive and are carried forward as hints.
4.  **LLM/Consensus:** The reduced list of candidates is sent to the LLM agent(s) (Claude/Gemini/ChatGPT) for high-confidence, natural language verification and scoring.
5.  **Output & Cache:** Results are returned to the user and cached in the **MatchCache** to avoid redundant LLM calls.

-----

### 📂 File Structure Highlights

| File Path | Description |
| :--- | :--- |
| `src/server.ts` | Entry point. Initializes the schema, spawns the Ingestor Worker, mounts routes. |
| `src/config/index.ts` | Loads `.env` and exports every environment-derived setting. |
| `src/database/pool.ts` | The single shared `pg` connection pool, plus numeric type parsers. |
| `src/database/postgres.client.ts` | Schema creation and the ingestion upsert/history writes. |
| `src/services/vector-matching.service.ts` | Local embedding generation and cosine similarity. |
| `src/services/matching-engine.service.ts` | **Core logic.** Fetch, vector pre-filter, batch, LLM verify, cache. |
| `src/services/consensus.service.ts` | Multi-agent voting across Claude, Gemini and ChatGPT. |
| `src/services/matching-engine.instance.ts` | The shared engine instance used by every route. |
| `src/workers/data-ingestor.ts` | Worker thread that runs both ingestors against `PostgresClient`. |

-----

### 💻 API Endpoints

The primary endpoints are available on the **Main Thread** at `http://localhost:3000`.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Server liveness plus whether the ingestor worker is running. |
| `POST` | `/api/matching/match` | Runs the full matching pipeline. Filters in the body (`polymarketTicker`, `kalshiTicker`, `startTimestamp`, `endTimestamp`, `limit`). |
| `GET` | `/api/matching/match` | Same pipeline, filters as query parameters. |
| `POST` | `/api/matching/arbitrage` | Matches whose price difference is at least `minPriceDifference` (default `0.05`). |
| `POST` | `/api/matching/cache/clear` | Clears the match result cache and the embedding cache. |
| `GET` | `/api/matching/health` | Matching subsystem health. |
| `GET` | `/api/polymarket` | Paginated Polymarket rows (`limit`, `offset`). |
| `GET` | `/api/polymarket/count` | Total Polymarket row count. |
| `GET` | `/api/polymarket/latest/all` | Latest Polymarket row per unique ticker. |
| `GET` | `/api/polymarket/timerange` | Rows between `start` and `end` unix timestamps. |
| `GET` | `/api/polymarket/ticker/:ticker` | Rows for one ticker. |
| `GET` | `/api/polymarket/:id` | One row by id. |
| `GET` | `/api/kalshi/...` | Same six routes as `/api/polymarket`, over `kalshi_data`. |
| `GET` | `/api/results/matched-events` | Stored matches (`limit`, `offset`, `activeOnly`). |
| `POST` | `/api/results/matched-events` | Persists a match. Requires both ids, `common_title` and both tickers. |
| `GET` | `/api/results/matched-events/by-tickers` | One stored match by `polymarketTicker` + `kalshiTicker`. |
| `DELETE` | `/api/results/matched-events/:id` | Deletes a stored match. |

All responses are shaped `{ success: boolean, ... }`; list endpoints add
`count` and `data`.

-----

### 💡 Future Improvements

  * **Tests:** There is no test suite yet; `npm test` at the repository root
    currently runs typecheck and lint only.
  * **Persistent Vector Cache:** Store the generated embeddings from the **Vector Matching Service** in a vector-enabled database (e.g., Postgres with `pgvector`) instead of in-memory.
  * **Vector Distance Search:** Replace the manual iteration and similarity check in `VectorMatchingService` with a native `pgvector` search query for faster, production-grade matching.
