# Prediction Market Arbitrage System

A real-time prediction market arbitrage detection system that monitors Polymarket and Kalshi platforms, identifies matching markets, and detects profitable arbitrage opportunities using a **Vector Matching Engine** and **Multi-Agent AI Consensus**.



## 🎯 Overview

This system continuously ingests market data from two major prediction market platforms:

* **Polymarket** (via WebSocket)
* **Kalshi** (via REST API polling)

It stores the data in a **PostgreSQL database**, uses a local **Vector Matching Service** for efficient pre-filtering, and employs a **Multi-Agent LLM Consensus** (Claude, Gemini, OpenAI) to confirm high-confidence market matches and identify arbitrage opportunities.

## Screenshots

<img src="docs/1.png" width="80%" alt="Arbitrage opportunities view" />

<img src="docs/2.png" width="80%" alt="Market feed view" />

<img src="docs/3.png" width="80%" alt="Matching panel and filters" />


## 🏗️ System Architecture

### 1. High-Level Architecture

The architecture uses **PostgreSQL** for persistence and a **Vector Matching** layer for pre-filtering markets before engaging the LLMs.

```
┌─────────────────────────────────────────────────────────────────┐
│                        MAIN THREAD                              │
│                      (Express Server)                           │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  Polymarket  │  │    Kalshi    │  │   Matching Engine    │   │
│  │  Controller  │  │  Controller  │  │    Controller        │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│          │                  │                      │            │
│          └──────────────────┴──────────────────────┘            │
│                             │                                   │
│                    ┌────────▼─────────┐                         │
│                    │ PostgreSQL Client│                         │
│                    └────────┬─────────┘                         │
│                             │                                   │
└─────────────────────────────┼───────────────────────────────────┘
                              │
                     ┌────────▼──────────┐
                     │   PostgreSQL DB   │
                     │     (market_db)   │
                     └────────┬──────────┘
                              │
        ┌─────────────────────┴───────────────────┐
        │                                         │
┌───────▼──────────┐                    ┌─────────▼──────────┐
│  WORKER THREAD   │                    │  VECTOR MATCHING   │
│  Data Ingestor   │                    │  MiniLM-L6-v2      │
│                  │                    └────────────────────┘
│  ┌────────────┐  │                              │
│  │ Polymarket │  │                              │
│  │  Ingestor  │  │                    ┌─────────▼──────────┐
│  │ (WebSocket)│  │                    │   Multi-Agent-LLM  │
│  └─────┬──────┘  │                    │  Consensus Service │
│        │         │                    │OpenAI Claude Gemini│
│  ┌─────▼──────┐  │                    └────────────────────┘
│  │   Kalshi   │  │
│  │  Ingestor  │  │
│  │ (Polling)  │  │
│  └────────────┘  │
└──────────────────┘

```

### 2. Detailed Matching Pipeline

This flow separates the local, fast vector processing from the high-confidence LLM verification.

```mermaid
graph TD
    subgraph External_Exchanges
        E[Polymarket WebSocket]
        F[Kalshi Polling/WS]
    end

    subgraph Node_Application
        subgraph Main_Thread
            B(Matching Engine Service)
            Z[API Routes]
        end
        subgraph Worker_Thread
            C(Data Ingestor Worker)
        end
    end

    subgraph Components
        G(Vector Matching: MiniLM-L6-v2)
        H(LLM Consensus: Claude/Gemini/OpenAI)
        I[MatchCache: In-Memory TTL]
    end

    D[(PostgreSQL Database)]

    A[User] --> Z
    Z --> B
    
    E --> C
    F --> C
    C -- Writes --> D
    
    B -- 1. Check Cache --> I
    I -- Cache Miss --> B
    B -- 2. Fetch Records --> D
    D -- Market Data --> B
    B -- 3. Vector Pre-Filter --> G
    G -- Matches --> B
    B -- 4. LLM Verification --> H
    H -- Final Results --> B
    B -- 5. Cache Results --> I

```


## 📊 Data Flow

```
┌─────────────┐         ┌──────────────┐
│ Polymarket  │───────> │  WebSocket   │
│   (WS API)  │         │   Ingestor   │
└─────────────┘         └──────┬───────┘
                               │
                               │ Real-time market data
                               │
┌─────────────┐         ┌──────▼───────┐
│   Kalshi    │───────> │   Polling    │
│ (REST API)  │         │   Ingestor   │
└─────────────┘         └──────┬───────┘
                               │
                        ┌──────▼──────────┐
                        │ PostgreSQL Client│
                        └──────┬──────────┘
                               │
                        ┌──────▼──────────┐
                        │    Database     │
                        └──────┬──────────┘
                               │
                        ┌──────▼────────┐
                        │   API Query   │
                        └──────┬────────┘
                               │
                    ┌──────────▼──────────────┐
                    │  Matching Engine        │
                    │  1. Vector Embedding    │
                    │  2. Cosine Similarity   │
                    │  3. LLM Consensus       │
                    └──────────┬──────────────┘
                               │
                    ┌──────────▼──────────────┐
                    │  Arbitrage Detection    │
                    └─────────────────────────┘
```

## 🧩 Component Architecture

### 1. Main Thread (Express Server)

* **Purpose:** Handle HTTP requests, serve API endpoints, coordinate workers.
* **Files:** `src/server.ts`, `src/controller/`, `src/database/postgres.client.ts`.

### 2. Data Ingestor Worker Thread

* **Purpose:** Continuously fetch market data and persist to PostgreSQL.
* **Files:** `src/workers/data-ingestor.ts`, `src/api-clients/polymarket.ingestor.ts`,
  `src/api-clients/kalshi-polling.ingestor.ts`.
* Spawned by `src/server.ts` at boot unless `ENABLE_INGESTOR=false`.

### 3. Matching Engine

* **Vector Embedding:** Converts market titles/tickers to vectors using **MiniLM-L6-v2**.
* **Vector Pre-filtering:** Calculates **Cosine Similarity** (threshold) to filter matches.
* **Multi-Agent Consensus:** Parallel calls to **Claude, Gemini, and OpenAI** for
  final semantic scoring. Enabled only when `GEMINI_API_KEY` and `OPENAI_API_KEY`
  are both set; otherwise the engine runs single-agent (Claude only).
* **Files:** `src/services/matching-engine.service.ts`, `src/services/vector-matching.service.ts`,
  `src/services/consensus.service.ts`.


## 🔧 Technology Stack

* **Runtime:** Node.js, TypeScript, Worker Threads.
* **Database:** PostgreSQL with `pg` client.
* **AI/ML:** MiniLM-L6-v2 (Local Embeddings), Claude, Gemini, OpenAI.
* **APIs:** Polymarket (WebSocket), Kalshi (REST Polling).


## 🚀 Getting Started

**Prerequisites:** Node.js 18+, a running PostgreSQL instance, and an Anthropic API key.

### 1. Start PostgreSQL

```bash
docker run --name market_db \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=admin -e POSTGRES_DB=market_db \
  -p 5432:5432 -d postgres
```

### 2. Configure the backend environment

The backend reads its `.env` from the `backend/` directory. Copy the template
and fill it in:

```bash
cp backend/.env.example backend/.env
```

```env
PORT=3000
DATABASE_URL="postgres://postgres:admin@localhost:5432/market_db"

# Single-agent matching needs only this key.
ANTHROPIC_API_KEY=your_key

# Add BOTH of these to enable multi-agent consensus (optional).
GEMINI_API_KEY=your_key
OPENAI_API_KEY=your_key

# Set to false to serve an already populated database without ingesting.
ENABLE_INGESTOR=true
```

### 3. Install and run

From the repository root, this installs both workspaces and runs the API and the
UI together:

```bash
npm install
npm start
```

* API: `http://localhost:3000` (health check at `/api/health`)
* UI: `http://localhost:5173` (proxies `/api` to the backend)

Tables are created automatically on first boot. On the first matching request
the MiniLM embedding model (~80MB) is downloaded and cached locally.

To run a workspace on its own:

```bash
cd backend  && npm run dev    # API with reload
cd frontend && npm run dev    # Vite dev server
```

### Checks

```bash
npm test          # typecheck + lint across both workspaces
npm run build     # compile backend to dist/ and build the UI
```

## 🧠 Matching Algorithm

1. **Embedding** – Every market title (falling back to the ticker) is embedded
   once per side with MiniLM-L6-v2.
2. **Pre-filtering** – Cosine similarity is computed for every cross-platform
   pair; only pairs scoring `>= 0.75` survive, and the surviving pairs are
   passed on as hints.
3. **Verification** – Survivors are batched (50 Polymarket records per batch)
   and sent to the LLM layer. With all three keys configured this is the
   multi-agent consensus path; with only `ANTHROPIC_API_KEY` it is Claude alone.
   Consensus failures fall back to the single-agent path.
4. **Scoring** – Matches below `0.6` confidence are dropped, duplicates are
   removed, results are sorted by confidence and cached for one hour.


## 💰 Arbitrage Detection

`POST /api/matching/arbitrage` runs the full matching pipeline and then keeps
only the pairs whose absolute price difference is at least
`minPriceDifference` (default `0.05`), sorted widest spread first. Each
opportunity is returned with its price difference, potential profit percentage,
average volume, and a liquidity score (the smaller of the two volumes).

Confidence filtering happens earlier in the pipeline: matches below `0.6`
confidence are discarded before they can become opportunities.

## 📁 Repository Layout

```
backend/    Express API, ingestor worker, matching engine  (see backend/README.md)
frontend/   React + TypeScript + Vite UI                   (see frontend/README.md)
docs/       Architecture diagrams and screenshots          (see docs/architecture.md)
```

## 📄 License

Apache-2.0
