# Prediction Market Arbitrage System

A real-time prediction market arbitrage detection system that monitors Polymarket and Kalshi platforms, identifies matching markets, and detects profitable arbitrage opportunities using a **Vector Matching Engine** and **Multi-Agent AI Consensus**.

## 🎯 Overview

This system continuously ingests market data from two major prediction market platforms:

  - **Polymarket** (via WebSocket)
  - **Kalshi** (via REST API polling)

It stores the data in a **PostgreSQL database**, uses a local **Vector Matching Service** for efficient pre-filtering, and employs a **Multi-Agent LLM Consensus** (e.g., Claude, Gemini, OpenAI) to confirm high-confidence market matches and identify arbitrage opportunities.

-----

## 🏗️ System Architecture

### 1\. High-Level ASCII Diagram (Updated)

The architecture now uses **PostgreSQL** for persistence and a new **Vector Matching** layer for pre-filtering markets before engaging the LLMs.

```
┌─────────────────────────────────────────────────────────────────┐
│                         MAIN THREAD                              │
│                       (Express Server)                           │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │  Polymarket  │  │    Kalshi    │  │   Matching Engine    │ │
│  │  Controller  │  │  Controller  │  │    Controller        │ │
│  └──────────────┘  └──────────────┘  └──────────────────────┘ │
│         │                  │                      │             │
│         └──────────────────┴──────────────────────┘             │
│                            │                                    │
│                   ┌────────▼─────────┐                          │
│                   │ PostgreSQL Client│                          │
│                   └────────┬─────────┘                          │
│                            │                                    │
└────────────────────────────┼────────────────────────────────────┘
                             │
                    ┌────────▼──────────┐
                    │ PostgreSQL Database │
                    │    (market_db)      │
                    └────────┬──────────┘
                             │
        ┌────────────────────┴────────────────────┐
        │                                         │
┌───────▼──────────┐                    ┌────────▼───────────┐
│  WORKER THREAD   │                    │  VECTOR MATCHING   │
│  Data Ingestor   │                    │  MiniLM-L6-v2      │
│                  │                    └────────────────────┘
│  ┌────────────┐  │
│  │ Polymarket │  │
│  │  Ingestor  │  │
│  │ (WebSocket)│  │
│  └─────┬──────┘  │
│        │         │
│  ┌─────▼──────┐  │
│  │   Kalshi   │  │
│  │  Ingestor  │  │
│  │ (Polling)  │  │
│  └────────────┘  │
└──────────────────┘
```

### 2\. Detailed Matching Pipeline (Mermaid)

This flow clearly separates the local, fast vector processing from the slow, high-confidence LLM verification.

```mermaid
graph TD
    subgraph External Exchanges
        E[Polymarket WebSocket]
        F[Kalshi Polling/WS]
    end

    subgraph Node.js Application
        subgraph Main Thread (Express API)
            B(Matching Engine Service)
            Z[API Routes: /match, /arbitrage]
        end
        subgraph Worker Thread (I/O Bound)
            C(Data Ingestor Worker)
        end
    end

    subgraph Matching Pipeline Components
        G(Vector Matching Service: MiniLM-L6-v2)
        H(LLM Consensus Service: Claude/Gemini/OpenAI)
        I[MatchCache: In-Memory TTL]
    end

    D[(PostgreSQL Database)]

    A[User/Client] --> Z
    Z --> B
    
    %% Ingestion Flow
    E --> C
    F --> C
    C -- Writes Continuous Data --> D
    
    %% Matching Process Flow (Triggered by B)
    B -- 1. Check Cache --> I
    I -- Cache Miss --> B
    B -- 2. Fetch Records --> D
    D -- Market Data --> B
    B -- 3. Semantic Pre-Filter --> G
    G -- High-Prob Matches --> B
    B -- 4. LLM Verification --> H
    H -- Final Match Results --> B
    B -- 5. Cache Results --> I

    style B fill:#f9f,stroke:#333,stroke-width:2px
    style C fill:#ccf,stroke:#333,stroke-width:2px
    style G fill:#ffb,stroke:#333,stroke-width:2px
    style H fill:#bbf,stroke:#333,stroke-width:2px
    style Z fill:#eee,stroke:#333
```

-----

## 📊 Data Flow (Updated)

```
┌─────────────┐         ┌──────────────┐
│ Polymarket  │─────────▶│  WebSocket   │
│   (WS API)  │         │   Ingestor   │
└─────────────┘         └──────┬───────┘
                               │
                               │ Real-time
                               │ market data
                               │
┌─────────────┐         ┌──────▼───────┐
│   Kalshi    │─────────▶│   Polling    │
│ (REST API)  │         │   Ingestor   │
└─────────────┘         └──────┬───────┘
                               │
                               │
                        ┌──────▼──────────┐
                        │ PostgreSQL Client│
                        │  (Insert ops)   │
                        └──────┬──────────┘
                               │
                        ┌──────▼──────────┐
                        │   Database      │
                        │  - Polymarket   │
                        │  - Kalshi       │
                        └──────┬──────────┘
                               │
                        ┌──────▼────────┐
                        │   API Query   │
                        │   (GET /api)  │
                        └──────┬────────┘
                               │
                    ┌──────────▼──────────────┐
                    │  Matching Engine        │
                    │  1. Vector Embedding    │
                    │  2. Cosine Similarity   │
                    │  3. LLM Consensus (Multi-Agent) │
                    │  4. Cache Results       │
                    └──────────┬──────────────┘
                               │
                    ┌──────────▼──────────────┐
                    │  Arbitrage Detection    │
                    │  (Price differences)    │
                    └─────────────────────────┘
```

-----

## 🧩 Component Architecture (Updated)

### 1\. Main Thread (Express Server)

**Purpose:** Handle HTTP requests, serve API endpoints, coordinate workers

**Key Components:**

  - **Express Server** - REST API server on port 3000
  - **Route Controllers** - Handle incoming API requests
  - **PostgreSQL Client** - Database interface for reads
  - **Worker Manager** - Spawns and manages worker threads

**Files:**

  - `src/server.ts` - Main entry point
  - `src/controller/` - API route handlers
  - `src/database/postgres.client.ts` - **NEW: PostgreSQL operations**

### 2\. Data Ingestor Worker Thread

**Purpose:** Continuously fetch market data and persist to **PostgreSQL**

**Key Components:**

  - **Polymarket Ingestor** - WebSocket connection for real-time data
  - **Kalshi Ingestor** - REST API polling (every 5 seconds)
  - **PostgreSQL Client** - Database interface for writes

**Data Flow:**

```
External API → Ingestor → Transform → PostgreSQL Client → Database
```

**Files:**

  - `src/workers/data-ingestor.ts` - Worker thread entry
  - `src/api-clients/polymarket.ingestor.ts` - Polymarket data handler
  - `src/api-clients/kalshi-polling.ingestor.ts` - Kalshi data handler

### 3\. Matching Engine

**Purpose:** Use vectors and AI consensus to match markets across platforms

**Key Features:**

  - **Vector Embedding** - Converts market titles/tickers to vectors using **MiniLM-L6-v2**.
  - **Vector Pre-filtering** - Calculates **Cosine Similarity** to filter matches with high vector overlap ($\geq 0.75$).
  - **Multi-Agent Consensus** - Sends high-probability matches to **Claude, Gemini, and OpenAI** for final, verifiable semantic scoring.
  - **Caching** - Store results for 1 hour (configurable).

**Optimization Pipeline:**

```
Raw Markets (150+ each platform)
        ↓
Vector Embedding (MiniLM-L6-v2)
        ↓
Vector Pre-filtering (Cosine Similarity threshold)
        ↓
Filtered Markets (~5-15 pairs)
        ↓
Multi-Agent LLM Consensus (Batches for Claude, Gemini, OpenAI)
        ↓
Deduplication & Sorting
        ↓
Cached Results
```

**Files:**

  - `src/services/matching-engine.service.ts` - Main matching logic
  - `src/services/vector-matching.service.ts` - **NEW: Handles embedding and cosine similarity**
  - `src/services/consensus.service.ts` - **NEW: Orchestrates multi-agent calls**
  - `src/utils/match-cache.ts` - Result caching

### 4\. Database Schema (PostgreSQL)

The database has been migrated from Postgres to **PostgreSQL**. The schema remains functionally the same, but data types and primary key definition follow PostgreSQL conventions (e.g., using `SERIAL` instead of `AUTOINCREMENT`).

**Polymarket Table:**

```sql
CREATE TABLE polymarket_data (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(255) NOT NULL UNIQUE,
    source VARCHAR(50) DEFAULT 'Polymarket_WS',
    price REAL NOT NULL,
    volume INT NOT NULL,
    timestamp INT NOT NULL,
    title TEXT,
    outcome TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);
```

**Kalshi Table:**

```sql
CREATE TABLE kalshi_data (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(255) NOT NULL UNIQUE,
    source VARCHAR(50) DEFAULT 'Kalshi_Polling',
    price REAL NOT NULL,
    volume INT NOT NULL,
    timestamp INT NOT NULL,
    title TEXT,
    subtitle TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);
```

-----

## 🔧 Technology Stack (Updated)

### Backend

  - **Node.js** - JavaScript runtime
  - **TypeScript** - Type-safe development
  - **Express** - Web framework
  - **Worker Threads** - Multi-threading for data ingestion
  - **PostgreSQL** - **NEW: Production-grade relational database**
  - **pg** - **NEW: Node.js PostgreSQL client library**

### AI & Matching

  - **MiniLM-L6-v2** - **NEW: Sentence Transformer model for local vector embeddings**
  - **Vector Matching Service** - **NEW: Calculates Cosine Similarity**
  - **LLM Consensus** - **Claude, Gemini, OpenAI** for high-confidence semantic matching
  - **LRU Cache** - Result caching

### Data Sources

  - **Polymarket WebSocket API** - Real-time market data
  - **Kalshi REST API** - Polling-based market data

### Development

  - **ts-node** - TypeScript execution
  - **nodemon** - Auto-reload on file changes
  - **Docker** - Recommended for local PostgreSQL instance

-----

## 🚀 Getting Started (Updated)

### Prerequisites

  - Node.js 18+
  - npm or yarn
  - **Docker** (Recommended for PostgreSQL)
  - **Anthropic API Key** (Required for Claude)
  - **Google Gemini API Key** (Optional for Consensus)
  - **OpenAI API Key** (Optional for Consensus)

### Installation

1.  **Clone the repository**

<!-- end list -->

```bash
git clone <repository-url>
cd backend
```

2.  **Start PostgreSQL with Docker**

<!-- end list -->

```bash
docker run --name market-postgres -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password -e POSTGRES_DB=market_db -p 5432:5432 -d postgres
```

3.  **Install dependencies**

<!-- end list -->

```bash
npm install
```

4.  **Set environment variables**

<!-- end list -->

```bash
# Create .env file
echo "ANTHROPIC_API_KEY=your_anthropic_key" > .env
echo "GEMINI_API_KEY=your_gemini_key" >> .env      # Optional
echo "OPENAI_API_KEY=your_openai_key" >> .env      # Optional
echo "PORT=3000" >> .env
# Set the Database URL
echo "DATABASE_URL=postgres://user:password@localhost:5432/market_db" >> .env
```

5.  **Start the server**

<!-- end list -->

```bash
npm run dev
```

### Development Scripts

```bash
npm run dev       # Start with auto-reload
npm run build     # Compile TypeScript
npm run start     # Run compiled JavaScript
```

-----

## 🧠 Matching Algorithm (Updated)

The matching pipeline is now dramatically streamlined by replacing the custom text processor with a high-performance vector matching layer.

### Phase 1: Vector Embedding Generation

1.  **Model Loading** - The **Vector Matching Service** loads the **MiniLM-L6-v2** sentence transformer model locally.
2.  **Conversion** - All market titles/tickers are converted into high-dimensional numerical vectors (embeddings).

### Phase 2: Vector Pre-filtering (Cosine Similarity)

1.  **Comparison** - The service calculates the **Cosine Similarity** between every Polymarket vector and every Kalshi vector.
2.  **Filtering** - Pairs with a **Cosine Similarity Score** $\geq 0.75$ are selected as high-probability candidates. This process runs in milliseconds and filters out 90%+ of non-matches.

### Phase 3: Multi-Agent LLM Consensus

1.  **Consensus Request** - The reduced list of candidate pairs is batched and sent simultaneously to multiple LLM agents (**Claude**, **Gemini**, **OpenAI**).
2.  **Verification** - Each agent provides a high-confidence score and reasoning for the match.
3.  **Consensus Scoring** - A final consensus score is calculated based on the agreement (e.g., 60% of agents must agree) and the average confidence is used for the final match object.

### Phase 4: Post-processing

1.  Deduplicate matches
2.  Sort by Consensus Confidence
3.  Cache results (1 hour TTL)

### Matching Criteria

  - **Exact** (≥0.9 confidence): Same event, same outcome, **Unanimous/Majority LLM agreement**
  - **High** (≥0.75 confidence): Same event, slight variations, **Consensus Score $\geq 0.6$**
  - **Medium** (≥0.6 confidence): Related events, similar outcomes
  - **Low** (≥0.5 confidence): Loosely related events

-----

## ⚡ Performance Optimizations (Updated)

### 1\. Vector Pre-filtering

  - **Impact:** \>90% reduction in records sent to LLM
  - **Method:** Cosine Similarity check using embeddings
  - **Result:** Drastic cost reduction and speedup by only using LLMs for the final, high-value verification step.

### 2\. Multi-Agent Asynchronicity

  - **Method:** LLM calls to Claude, Gemini, and OpenAI are made in parallel using `Promise.all`.
  - **Benefit:** The consensus result is returned based on the slowest agent, but the parallel execution minimizes overall waiting time compared to sequential calls.

### 3\. Caching

  - **TTL:** 1 hour (configurable)
  - **Strategy:** LRU eviction
  - **Impact:** 35-50% cache hit rate

### 4\. Worker Threads

  - **Purpose:** Non-blocking data ingestion
  - **Benefit:** Main thread stays responsive
  - **Pattern:** Separate thread for I/O operations

-----

## 💰 Arbitrage Detection

Arbitrage opportunities are identified when:

1.  Markets are matched with high confidence (**Consensus Confidence** \>0.7)
2.  Price difference exceeds threshold (default 5%)
3.  Both markets have sufficient liquidity

**Profit Calculation:**

```typescript
priceDifference = |priceA - priceB|
profitPercentage = (priceDifference / min(priceA, priceB)) × 100
```

-----

## 📡 API Endpoints

*(The API Endpoints remain the same)*

### Polymarket Data

**Get Latest Records**

```http
GET /api/polymarket/latest/all
```

**Get By Ticker**

```http
GET /api/polymarket/ticker/:ticker
```

**Get By Time Range**

```http
GET /api/polymarket/range?start=1234567890&end=1234567999
```

### Kalshi Data

**Get Latest Records**

```http
GET /api/kalshi/latest/all
```

**Get By Ticker**

```http
GET /api/kalshi/ticker/:ticker
```

**Get By Time Range**

```http
GET /api/kalshi/range?start=1234567890&end=1234567999
```

### Market Matching

**Match Markets**

```http
POST /api/matching/match
Content-Type: application/json

{
  "limit": 100,
  "startTimestamp": 1234567890,
  "endTimestamp": 1234567999
}
```

**Find Arbitrage Opportunities**

```http
POST /api/matching/arbitrage
Content-Type: application/json

{
  "minPriceDifference": 0.05,
  "limit": 50
}
```

**Clear Cache**

```http
POST /api/matching/cache/clear
```

**Health Check**

```http
GET /api/matching/health
```

-----

## 🐛 Troubleshooting (Updated)

### Database Connection Issues

**Problem:** `FATAL: password authentication failed for user "user"`

**Solution:** Check your `.env` file to ensure `DATABASE_URL` matches the credentials used when starting the PostgreSQL Docker container (`user:password@localhost:5432/market_db`).

### High Memory Usage

**Problem:** Memory grows over time, likely due to the vector model or large datasets.

**Solution:**

  - **Vector Model Cleanup:** Ensure the vector matching service cleans up models/embeddings after use, or consider running vector generation in its own dedicated worker pool (currently disabled but mentioned in code snippets like `worker-pool.ts`).
  - **Cache Limits:** Implement and tune cache size limits (default: 1000 entries) and auto-cleanup.
  - **Monitoring:** Monitor with `process.memoryUsage()` to pinpoint the source of the leak.

### Worker Thread Issues

**Problem:** `Cannot find module` errors in worker threads

**Solution:** (The existing solution is still correct for TypeScript workers)
Add to `tsconfig.json`:

```json
{
  "ts-node": {
    "transpileOnly": true,
    "files": true,
    "compilerOptions": {
      "module": "commonjs"
    }
  }
}
```

And pass `execArgv` to Worker:

```typescript
new Worker(workerPath, {
  execArgv: ['--require', 'ts-node/register']
});
```

-----

## 🔮 Future Enhancements

1.  **Persistent Vector Index:** Implement a vector-enabled PostgreSQL extension (e.g., **pgvector**) to store market embeddings and allow for native, performant $\text{k-NN}$ (nearest neighbor) search directly in the database, eliminating the in-memory vector matching step.
2.  **Real-time Notifications** - WebSocket alerts for arbitrage.
3.  **Historical Analysis** - Track arbitrage opportunities over time.
4.  **Automated Trading** - Execute arbitrage automatically.
5.  **Dashboard UI** - React frontend for visualization.