
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

Create a file named `.env` in the project root and populate it with your configuration:

```bash
# --- Server Config ---
PORT=3000

# --- Database Config (Updated for PostgreSQL) ---
# Replace with your actual Postgres credentials
DATABASE_URL="postgres://user:password@localhost:5432/market_db"

# --- API Keys for LLM Matching ---
ANTHROPIC_API_KEY="sk-ant-..."
GEMINI_API_KEY="AIza..."         # Optional: for multi-agent consensus
OPENAI_API_KEY="sk-..."         # Optional: for multi-agent consensus

# --- External API URLs (Defaults) ---
# These are kept in src/config/index.ts but can be overridden here
# POLYMARKET_WEBSOCKET_URL="wss://..."
# KALSHI_WEBSOCKET_URL="wss://..."
```

#### 3\. Database Setup (PostgreSQL)

Using Docker is the simplest way to run PostgreSQL locally:

```bash
# Start a local PostgreSQL instance
docker run --name market-postgres -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password -e POSTGRES_DB=market_db -p 5432:5432 -d postgres
```

The database initialization and table creation (`polymarket_data`, `kalshi_data`, `matched_events`, `price_history`) are handled automatically by the **Data Ingestor Worker Thread** upon startup, using the `DATABASE_URL`.

#### 4\. Installation and Run

```bash
# Install dependencies, including the new 'pg' and '@xenova/transformers'
npm install

# Build and run the application
npm start
```

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
3.  **Semantic Match:** It delegates the pre-filtering to the **Vector Matching Service** which uses a locally loaded **MiniLM-L6-v2** model to generate embeddings and calculate **Cosine Similarity** between market titles. This quickly filters the data down to high-probability matches (e.g., similarity score $\geq 0.75$).
4.  **LLM/Consensus:** The reduced list of candidates is sent to the LLM agent(s) (Claude/Gemini/ChatGPT) for high-confidence, natural language verification and scoring.
5.  **Output & Cache:** Results are returned to the user and cached in the **MatchCache** to avoid redundant LLM calls.

-----

### 📂 File Structure Highlights

| File Path | Description |
| :--- | :--- | :--- |
| `src/server.ts` | Main server entry point. Spawns the Ingestor Worker. |
| `src/database/postgres.client.ts` | Handles all database connections and CRUD operations using the `pg` driver. |
| `src/services/vector-matching.service.ts` |  Handles local vector embedding generation and cosine similarity calculation. |
| `src/services/matching-engine.service.ts` | **Core logic.** Orchestrates matching, now using **VectorMatchingService** for pre-filtering and handling the necessary `async` operations. | 
| `src/workers/data-ingestor.ts` | Worker thread logic for data streaming. Initializes and uses `PostgresClient`**. |

-----

### 💻 API Endpoints

The primary endpoints are available on the **Main Thread** at `http://localhost:3000`.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/matching/match` | Runs the full matching pipeline. Accepts filters in the request body (e.g., `polymarketTicker`, `limit`). |
| `GET` | `/api/matching/arbitrage` | Returns matches with a price difference exceeding the minimum threshold (default 5%). |
| `GET` | `/api/polymarket/latest/all` | Retrieves the latest Polymarket data for every unique ticker. |
| `GET` | `/api/kalshi/latest/all` | Retrieves the latest Kalshi data for every unique ticker. |

-----

### 💡 Future Improvements

  * **Persistent Vector Cache:** Store the generated embeddings from the **Vector Matching Service** in a vector-enabled database (e.g., Postgres with `pgvector`) instead of in-memory.
  * **Vector Distance Search:** Replace the manual iteration and similarity check in `VectorMatchingService` with a native `pgvector` search query for faster, production-grade matching.
