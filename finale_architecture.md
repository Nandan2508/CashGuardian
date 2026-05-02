# 🛡️ CashGuardian: Technical Architecture
This document outlines the end-to-end architecture of CashGuardian for SMEs.
## 🏗️ System Architecture Flow (Compact Enterprise View)
```mermaid
graph LR
    User((Authenticated SME)) --> Auth[JWT Login & Auth]
    subgraph "Frontend Engine"
        Dashboard[Web Dashboard]
        Charts["Charts.js Rendering"]
        Chat["Narrative Chat"]
        PDF_Btn["Download Report"]
    end
    Auth --> Dashboard
    Dashboard -- "JSON Payload + JWT" --> Gateway[Security Gateway]
    subgraph "Intelligence Core"
        Agent["agent/queryAgent.js"]
        Intent["Intent Mapper"]
        PII["PII Guard"]
    end
    Gateway --> Agent
    Agent --> Intent
    Agent --> PII
    subgraph "Core Services"
        AuditSvc["AuditService.js"]
        subgraph "DataService.js Internals"
            DataSvc["Data Access Layer"]
            Pool["PG Connection Pool"]
            Security["Encryption/Decryption"]
            Batch["Bulk Data Processor"]
        end
        EmailSvc["EmailService.js"]
        PDF_Svc["PDF Generator"]
    end
    Agent --> Core_Logic{Logic Router}
    Core_Logic --> AuditSvc
    Core_Logic --> DataSvc
    Core_Logic --> EmailSvc
    Core_Logic -- "If Requested" --> PDF_Svc
    subgraph "Data Storage"
        DB[(Neon Database)]
        AuditLog[("audit_logs")]
    end
    DataSvc <--> Pool
    Pool <--> DB
    DataSvc --- Security
    DataSvc --- Batch
    AuditSvc --> AuditLog
    Core_Logic -- "Result" --> Dashboard
    Charts <--> Dashboard
    Chat <--> Dashboard
    PDF_Svc -.-> PDF_Btn
    AuditLog --> Admin[Admin Security Panel]
    style User fill:#f9f,stroke:#333
    style Auth fill:#fff700,stroke:#333
    style Gateway fill:#ff9a9e,stroke:#333
    style Core_Logic fill:#a18cd1,stroke:#333
    style DB fill:#00f2fe,stroke:#333
    style DataSvc fill:#74b9ff,stroke:#333
```
---
## 📘 Detailed Process Explanation
### 1. Identity & Access
Every session begins with **JWT Authentication**, ensuring strict data silos where User A can never access User B's records.
### 2. Security Gateway
The gateway extracts `userId` and monitors for malicious patterns, logging threats directly to the **Audit Log**.
### 3. Intelligence Core
The **Agent** identify intent and fetch real-time data from PostgreSQL, eliminating hallucinations by using live numbers.
### 4. 🗄️ Inside DataService.js (The Data Backbone)
This module acts as the Single Source of Truth for all database interactions.
- **Connection Pooling**: Manages high-performance connections to Neon PostgreSQL.
- **CRUD Operations**: Specialized functions like `getTransactions(userId)`, `getInvoices(userId)`, and `getClients(userId)` ensure data is always scoped to the logged-in user.
- **Security Logic**: Integrates with `decrypt()` utility to securely handle encrypted PII (Aadhar, PAN) before passing it to the PII Guard for masking.
- **Batch Processing**: Powers the fast dataset upload feature using optimized bulk insert logic.
### 5. Multi-Channel Output
The system returns a rich JSON payload rendered as **Narrative Text**, **Interactive Charts**, and **PDF Documents**.
---
## 🚀 Why this architecture WOWS?
- **Horizontal Scalability**: Decoupled and modular services.
- **Privacy by Design**: Isolation at DB level and masking at API level.
- **Traceability**: Every AI decision is backed by an audit trail.
