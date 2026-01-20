# Prediction Market Arbitrage System

A real-time prediction market arbitrage detection system that monitors Polymarket and Kalshi platforms, identifies matching markets, and detects profitable arbitrage opportunities using a **Vector Matching Engine** and **Multi-Agent AI Consensus**.



## 🎯 Overview

This system continuously ingests market data from two major prediction market platforms:

* **Polymarket** (via WebSocket)
* **Kalshi** (via REST API polling)

It stores the data in a **PostgreSQL database**, uses a local **Vector Matching Service** for efficient pre-filtering, and employs a **Multi-Agent LLM Consensus** (Claude, Gemini, OpenAI) to confirm high-confidence market matches and identify arbitrage opportunities.

## Screenshots:

<img src="https://raw.githubusercontent.com/ivaaak/PredictionMarket-Arbitrage/refs/heads/main/docs/1.png?token=GHSAT0AAAAAADTOJOIVIWRJ3ADPOGD5WJPI2LP5WRQ" width="80%"></img> 

<img src="https://raw.githubusercontent.com/ivaaak/PredictionMarket-Arbitrage/refs/heads/main/docs/2.png?token=GHSAT0AAAAAADTOJOIVIWRJ3ADPOGD5WJPI2LP5WRQ" width="80%"></img> 

<img src="https://raw.githubusercontent.com/ivaaak/PredictionMarket-Arbitrage/refs/heads/main/docs/3.png?token=GHSAT0AAAAAADTOJOIVIWRJ3ADPOGD5WJPI2LP5WRQ" width="80%"></img> 


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
* **Files:** `src/workers/data-ingestor.ts`, `src/api-clients/polymarket.ingestor.ts`.

### 3. Matching Engine

* **Vector Embedding:** Converts market titles/tickers to vectors using **MiniLM-L6-v2**.
* **Vector Pre-filtering:** Calculates **Cosine Similarity** (threshold) to filter matches.
* **Multi-Agent Consensus:** Parallel calls to **Claude, Gemini, and OpenAI** for final semantic scoring.
* **Files:** `src/services/matching-engine.service.ts`, `src/services/vector-matching.service.ts`.


## 🔧 Technology Stack

* **Runtime:** Node.js, TypeScript, Worker Threads.
* **Database:** PostgreSQL with `pg` client.
* **AI/ML:** MiniLM-L6-v2 (Local Embeddings), Claude, Gemini, OpenAI.
* **APIs:** Polymarket (WebSocket), Kalshi (REST Polling).


## 🚀 Getting Started

1. **PostgreSQL**
```bash
docker run --name market_db -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=admin -e POSTGRES_DB=market_db -p 5432:5432 -d postgres

```

2. **Configure Environment**
Create a `.env` file:
```env
ANTHROPIC_API_KEY=your_key
DATABASE_URL="postgres://postgres:admin@localhost:5432/market_db"
```

4. **Run System**
```bash
npm install
npm run dev
```

## 🧠 Matching Algorithm

1. **Phase 1: Embedding** – Generate vectors for all active market titles.
2. **Phase 2: Pre-filtering** – Calculate Cosine Similarity between platform pairs.
3. **Phase 3: Consensus** – High-probability pairs are verified by multiple LLMs.
4. **Phase 4: Scoring** – Average confidence scores are generated and cached.


## 💰 Arbitrage Detection

Arbitrage is flagged when:

1. **Consensus Confidence** as specified in the UI.
2. **Price Difference** as specified in the UI.
3. **Liquidity** meets minimum requirements.
