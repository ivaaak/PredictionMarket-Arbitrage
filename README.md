# Prediction Market Arbitrage System

A real-time prediction market arbitrage detection system that monitors Polymarket and Kalshi platforms, identifies matching markets, and detects profitable arbitrage opportunities using a **Vector Matching Engine** and **Multi-Agent AI Consensus**.



## 🎯 Overview

This system continuously ingests market data from two major prediction market platforms:

* **Polymarket** (Gamma REST API polling: full open-market catalogue with best bid/ask)
* **Kalshi** (REST API polling: all open events and their markets, with best bid/ask)

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
│  │ (Polling)  │  │                    │   Multi-Agent-LLM  │
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
        E[Polymarket Gamma Polling]
        F[Kalshi Polling]
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
        I[(match_verdicts: stored LLM decisions)]
    end

    D[(PostgreSQL Database)]

    A[User] --> Z
    Z --> B
    
    E --> C
    F --> C
    C -- Writes --> D
    
    B -- 1. Fetch Open Markets --> D
    D -- Market Data + Order Books --> B
    B -- 2. Top-k Vector Candidates --> G
    G -- Candidate Pairs --> B
    B -- 3. Look Up Verdicts --> I
    B -- 4. Judge Unseen Pairs --> H
    H -- Verdicts --> B
    B -- 5. Store Verdicts --> I

```


## 📊 Data Flow

```
┌─────────────┐         ┌──────────────┐
│ Polymarket  │───────> │   Polling    │
│ (Gamma API) │         │   Ingestor   │
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
* **Vector Pre-filtering:** Keeps each Polymarket market's top-3 most similar Kalshi markets as candidate pairs.
* **Multi-Agent Consensus:** Parallel calls to **Claude, Gemini, and OpenAI** for
  final semantic scoring. Enabled only when `GEMINI_API_KEY` and `OPENAI_API_KEY`
  are both set; otherwise the engine runs single-agent (Claude only).
* **Files:** `src/services/matching-engine.service.ts`, `src/services/vector-matching.service.ts`,
  `src/services/consensus.service.ts`.


## 🔧 Technology Stack

* **Runtime:** Node.js, TypeScript, Worker Threads.
* **Database:** PostgreSQL with `pg` client.
* **AI/ML:** MiniLM-L6-v2 (Local Embeddings), Claude, Gemini, OpenAI.
* **APIs:** Polymarket Gamma (REST Polling), Kalshi (REST Polling).


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

Whether two markets are the same bet is slow and expensive to decide (LLMs) but
never changes; whether there is an edge right now is cheap to compute but
changes constantly. The pipeline keeps the two apart:

1. **Load** – The highest-volume open markets on each side (`limit`, default
   300 per platform, optionally narrowed with `search`) are read fresh from the
   database on every request.
2. **Candidates** – Titles are embedded with MiniLM-L6-v2 and each Polymarket
   market keeps its 3 most similar Kalshi markets (similarity `>= 0.5`).
3. **Verdict lookup** – Candidate pairs already judged are answered from the
   `match_verdicts` table, including pairs previously judged *not* to match.
4. **Verification** – Only never-seen pairs go to the LLM layer, in batches of
   15 Polymarket markets with their candidates. The prompt includes close dates,
   resolution rules and what YES means on each side, and asks for:
   * `similarity`: `exact` or `high`. Merely related markets are rejected,
     because they can resolve differently.
   * `direction`: `same` (YES = YES) or `inverted` (Polymarket YES = Kalshi NO).
   With all three keys configured, a pair needs 60% of agents agreeing on both
   the match *and* its direction. Every answer is stored; a failed LLM call
   stores nothing, so its pairs are retried next run.
5. **Pricing** – Each match is priced from the current order books (below).

`POST /api/matching/cache/clear` forgets all stored verdicts.


## 💰 Arbitrage Detection

For equivalent markets, buying YES on one venue and the opposite side on the
other pays exactly $1 whichever way the event resolves. The trade is an
arbitrage when the two **asks** plus fees cost less than $1:

```
netEdge = 1 - (ask_leg1 + ask_leg2) - fees          per $1 contract pair
fees    = rate * P * (1 - P) per leg                (Kalshi rate 0.07; Polymarket 0 by default)
```

Both possible hedges are priced (and flipped for `inverted` pairs) and the
better one is returned as `arbitrage` on every match, with its legs, cost, fees,
gross/net edge and ROI; it is `null` when a leg has no ask.
`POST /api/matching/arbitrage` returns matches with `netEdge >= minNetEdge`
(default `0`), best first.

The displayed `price` (book mid or last trade) is never used for this: two
markets both showing 0.50 can be an arbitrage, and two showing 0.40 and 0.60 may
not be. The quote is top-of-book only, so executable size is limited by the
depth behind those asks.

## 📁 Repository Layout

```
backend/    Express API, ingestor worker, matching engine  (see backend/README.md)
frontend/   React + TypeScript + Vite UI                   (see frontend/README.md)
docs/       Architecture diagrams and screenshots          (see docs/architecture.md)
```

## 📄 License

Apache-2.0
