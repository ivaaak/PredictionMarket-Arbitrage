📊 System Components:

External Data Sources

Polymarket & Kalshi WebSocket APIs providing real-time market data


Backend - Node.js/Express Server

Data Ingestion Layer: WebSocket clients and ingestors that consume market data
Service Layer: Business logic for data access and market matching
Database Layer: SQLite with two tables (polymarket_data, kalshi_data) using UPSERT pattern
API Layer: RESTful endpoints for data access and matching
AI Integration: Claude API for intelligent market matching


Frontend - React/TypeScript

Component-based UI with tables for each platform
Matching panel for configuring and triggering matches
Results display for matched markets



🔄 Data Flow:

Ingestion: WebSocket → Clients → Ingestors → SQLite (continuous updates)
API: React Components → Express Routes → Services → Database
Matching: User Input → Matching Service → Claude API → Results Display