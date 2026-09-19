# Architecture Diagrams

## System Architecture Diagram

```mermaid
graph TB
    subgraph "External APIs"
        PM[Polymarket WebSocket API]
        KL[Kalshi REST API]
    end

    subgraph "Worker Thread - Data Ingestion"
        PMI[Polymarket Ingestor<br/>WebSocket Client]
        KLI[Kalshi Ingestor<br/>Polling Client]
        WDB[Postgres Client<br/>Write Operations]
    end

    subgraph "Main Thread - Express Server"
        SERVER[Express Server<br/>Port 3000]
        
        subgraph "Controllers"
            PMC[Polymarket Controller]
            KLC[Kalshi Controller]
            MC[Matching Controller]
        end
        
        subgraph "Services"
            ME[Matching Engine Service]
            VEC[Vector Matching Service<br/>MiniLM-L6-v2]
            TP[Text Processor]
            CACHE[Match Cache<br/>LRU + TTL]
        end
        
        RDB[Postgres Client<br/>Read Operations]
    end

    subgraph "Database"
        DB[(PostgreSQL<br/>market_db)]
        PMT[polymarket_data table]
        KLT[kalshi_data table]
    end

    subgraph "AI Services"
        CLAUDE[Claude<br/>Anthropic API]
        CONS[Consensus Service<br/>Claude + Gemini + ChatGPT<br/>optional]
    end

    PM -->|Real-time<br/>Market Data| PMI
    KL -->|REST API<br/>Every 5s| KLI
    
    PMI -->|Transform &<br/>Validate| WDB
    KLI -->|Transform &<br/>Validate| WDB
    
    WDB -->|INSERT| DB
    DB --> PMT
    DB --> KLT
    
    PMT -->|Query| RDB
    KLT -->|Query| RDB
    
    RDB -->|Data| PMC
    RDB -->|Data| KLC
    RDB -->|Data| MC
    
    MC --> ME
    ME -->|Normalize| TP
    ME -->|Check| CACHE
    ME -->|Embed &<br/>pre-filter| VEC
    VEC -->|Candidate pairs| ME
    ME -->|Match Request| CLAUDE
    ME -->|Match Request| CONS
    CLAUDE -->|Matches +<br/>Confidence| ME
    CONS -->|Voted matches| ME
    ME -->|Store| CACHE
    
    SERVER --> PMC
    SERVER --> KLC
    SERVER --> MC
    
    style PM fill:#e1f5ff
    style KL fill:#fff4e1
    style PMI fill:#e1f5ff
    style KLI fill:#fff4e1
    style CLAUDE fill:#d4edda
    style CONS fill:#d4edda
    style VEC fill:#e7d4ed
    style DB fill:#f8d7da
    style CACHE fill:#d1ecf1
    style SERVER fill:#fff3cd
```

## Data Flow Diagram

```mermaid
sequenceDiagram
    participant PM as Polymarket API
    participant KL as Kalshi API
    participant Worker as Worker Thread
    participant DB as Postgres Database
    participant API as Express API
    participant Client as API Client
    participant AI as Claude AI
    participant Cache as Match Cache

    Note over PM,KL: Data Ingestion (Continuous)
    
    PM->>Worker: WebSocket: Market Update
    Worker->>DB: INSERT polymarket_data
    
    KL->>Worker: REST Poll: Market Data
    Worker->>DB: INSERT kalshi_data
    
    Note over Client,Cache: Matching Request (On-Demand)
    
    Client->>API: POST /api/matching/match
    API->>Cache: Check for cached result
    
    alt Cache Hit
        Cache-->>API: Return cached matches
        API-->>Client: Return result
    else Cache Miss
        API->>DB: Query polymarket_data
        API->>DB: Query kalshi_data
        DB-->>API: Return records
        
        API->>API: Embed titles<br/>(MiniLM-L6-v2)
        API->>API: Cosine similarity<br/>pre-filter (>= 0.75)
        
        API->>AI: Send filtered pairs<br/>+ similarity hints
        AI-->>API: Matched pairs<br/>+ confidence scores
        
        API->>API: Deduplication<br/>& Sorting
        API->>Cache: Store result (1hr TTL)
        API-->>Client: Return matches
    end
```

## Component Interaction Diagram

```mermaid
graph LR
    subgraph "Data Layer"
        DB[(Postgres)]
    end
    
    subgraph "Service Layer"
        ME[Matching Engine]
        TP[Text Processor]
        MC[Match Cache]
    end
    
    subgraph "Controller Layer"
        PMC[Polymarket<br/>Controller]
        KLC[Kalshi<br/>Controller]
        MTC[Matching<br/>Controller]
    end
    
    subgraph "External Services"
        CLAUDE[Claude AI]
    end
    
    PMC --> DB
    KLC --> DB
    MTC --> ME
    ME --> TP
    ME --> MC
    ME --> CLAUDE
    ME --> DB
    
    style DB fill:#f8d7da
    style CLAUDE fill:#d4edda
    style MC fill:#d1ecf1
```

## Matching Engine Flow

```mermaid
flowchart TD
    START([API Request]) --> CACHE_CHECK{Check Cache}
    CACHE_CHECK -->|Hit| RETURN_CACHED[Return Cached Result]
    CACHE_CHECK -->|Miss| FETCH[Fetch Records from DB]
    
    FETCH --> CHECK_RECORDS{Records<br/>Available?}
    CHECK_RECORDS -->|No| EMPTY[Return Empty Result]
    CHECK_RECORDS -->|Yes| EMBED[Embed titles once per side<br/>MiniLM-L6-v2]
    
    EMBED --> SIMILARITY[Calculate Cosine Similarity<br/>for every cross-platform pair]
    SIMILARITY --> FILTER[Filter Pairs<br/>similarity >= 0.75]
    
    FILTER --> CHECK_FILTERED{Any Pairs<br/>Remaining?}
    CHECK_FILTERED -->|No| EMPTY
    CHECK_FILTERED -->|Yes| BATCH[Create Batches<br/>50 records each]
    
    BATCH --> AI_PROCESS[Send to LLM layer<br/>single-agent or consensus<br/>with re-based hints]
    AI_PROCESS --> PARSE[Parse AI Response]
    PARSE --> VALIDATE[Validate Matches<br/>confidence >= 0.6]
    
    VALIDATE --> DEDUPE[Deduplicate Results]
    DEDUPE --> SORT[Sort by Confidence]
    SORT --> CACHE_STORE[Store in Cache<br/>1 hour TTL]
    
    CACHE_STORE --> RETURN[Return Matches]
    RETURN_CACHED --> END([API Response])
    RETURN --> END
    EMPTY --> END
    
    style START fill:#d4edda
    style END fill:#d4edda
    style CACHE_CHECK fill:#fff3cd
    style AI_PROCESS fill:#e1f5ff
    style CACHE_STORE fill:#d1ecf1
```

## Worker Thread Architecture

```mermaid
graph TB
    subgraph "Main Thread"
        MAIN[Main Server Process]
        SERVER[Express HTTP Server]
    end
    
    subgraph "Worker Thread"
        WORKER[Worker Entry Point]
        
        subgraph "Polymarket Stream"
            PMC[WebSocket Client]
            PMH[Message Handler]
            PMT[Data Transformer]
        end
        
        subgraph "Kalshi Stream"
            KLC[HTTP Poller]
            KLH[Response Handler]
            KLT[Data Transformer]
        end
        
        DBC[Postgres Client]
    end
    
    subgraph "Database"
        DB[(PostgreSQL<br/>market_db)]
    end
    
    MAIN -->|spawn with<br/>execArgv| WORKER
    WORKER -->|initialize| PMC
    WORKER -->|initialize| KLC
    
    PMC -->|on message| PMH
    PMH --> PMT
    PMT --> DBC
    
    KLC -->|poll interval| KLH
    KLH --> KLT
    KLT --> DBC
    
    DBC -->|INSERT| DB
    
    WORKER -.->|postMessage<br/>'ready'| MAIN
    MAIN -.->|postMessage<br/>'stop'| WORKER
    
    style WORKER fill:#e1f5ff
    style DB fill:#f8d7da
```

## Cache Strategy Diagram

```mermaid
stateDiagram-v2
    [*] --> CheckCache: API Request
    
    CheckCache --> CacheHit: Key Found & Not Expired
    CheckCache --> CacheMiss: Key Not Found / Expired
    
    CacheHit --> ReturnResult: Return Cached Data
    
    CacheMiss --> FetchData: Query Database
    FetchData --> ProcessData: Run Matching Logic
    ProcessData --> CallAI: Send to Claude
    CallAI --> StoreCache: Store Result (TTL: 1hr)
    StoreCache --> ReturnResult
    
    ReturnResult --> [*]
    
    state StoreCache {
        [*] --> CheckSize: New Entry
        CheckSize --> Evict: Size >= 1000
        CheckSize --> Insert: Size < 1000
        Evict --> Insert: Remove Oldest
        Insert --> [*]
    }
    
    note right of StoreCache
        Cache Configuration:
        - Max Size: 1000 entries
        - TTL: 1 hour
        - Eviction: LRU
        - Cleanup: Every 5 min
    end note
```

## Database Schema

```mermaid
erDiagram
    POLYMARKET_DATA {
        SERIAL id PK
        TEXT ticker UK
        TEXT source
        DECIMAL price
        DECIMAL volume
        BIGINT timestamp
        TEXT title
        TEXT outcome
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }

    KALSHI_DATA {
        SERIAL id PK
        TEXT ticker UK
        TEXT source
        DECIMAL price
        DECIMAL volume
        BIGINT timestamp
        TEXT title
        TEXT subtitle
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }

    MATCHED_EVENTS {
        SERIAL id PK
        INTEGER polymarket_id FK
        INTEGER kalshi_id FK
        TEXT common_title
        TEXT match_category
        DECIMAL match_confidence
        TEXT poly_ticker
        DECIMAL poly_price
        DECIMAL poly_volume
        TEXT kalshi_ticker
        DECIMAL kalshi_price
        DECIMAL kalshi_volume
        DECIMAL price_spread "GENERATED"
        DECIMAL total_combined_volume "GENERATED"
        TIMESTAMP last_sync_at
        BOOLEAN is_active
    }

    PRICE_HISTORY {
        SERIAL id PK
        TEXT ticker
        TEXT platform
        DECIMAL price
        DECIMAL volume
        BIGINT timestamp
        TIMESTAMP recorded_at
    }

    POLYMARKET_DATA ||--o{ MATCHED_EVENTS : "matched_with"
    KALSHI_DATA ||--o{ MATCHED_EVENTS : "matched_with"
```

`price_spread` and `total_combined_volume` are `GENERATED ALWAYS ... STORED`
columns, so they are maintained by PostgreSQL and must not be written directly.

## Request Processing Pipeline

```mermaid
graph LR
    A[Client Request] --> B{Route}
    
    B -->|/api/polymarket| C[Polymarket Controller]
    B -->|/api/kalshi| D[Kalshi Controller]
    B -->|/api/matching| E[Matching Controller]
    
    C --> F[Postgres Client]
    D --> F
    E --> G[Matching Engine]
    
    G --> H[Text Processor]
    G --> I[Cache]
    G --> J[Claude AI]
    G --> F
    
    H --> K[Response]
    I --> K
    J --> K
    F --> K
    
    K --> L[JSON Response]
    
    style A fill:#d4edda
    style L fill:#d4edda
    style G fill:#e1f5ff
    style J fill:#fff4e1
```