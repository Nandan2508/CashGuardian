# Architecture

## Layered Design

```mermaid
flowchart TD
    A[User Input - CLI] --> B[index.js]
    B --> C[agent/queryAgent.js]
    C --> D[agent/intentMap.js]
    C --> E[Services Layer]
    E --> E1[cashFlowService.js]
    E --> E2[invoiceService.js]
    E --> E3[riskService.js]
    E --> E4[predictionService.js]
    E --> E5[anomalyService.js]
    E --> E6[summaryService.js]
    E --> E7[emailService.js]
    C --> F[AI Provider Adapter]
    F --> G[utils/formatter.js]
    G --> H[User Output]
```

## Query Lifecycle

1. The user enters a natural-language question in the CLI.
2. `index.js` reads the query and forwards it to `agent/queryAgent.js`.
3. `intentMap.js` classifies the query with deterministic keyword matching.
4. Relevant services compute the financial facts from locked local JSON.
5. The agent either:
   - returns a direct rule-based response, or
   - builds a system prompt and sends the grounded snapshot to the configured AI provider.
6. The system prompt includes external validation references from `data/externalValidation.json` to reinforce realism and reduce hallucinated assumptions.
7. `formatter.js` renders the result for the terminal.

## AI Provider Abstraction

```mermaid
flowchart LR
    ENV[AI_PROVIDER env var] --> G[gemini]
    ENV --> GR[groq]
    ENV --> OR[openrouter]
    G --> EP1[Google generateContent]
    GR --> EP2[OpenAI-compatible Groq]
    OR --> EP3[OpenAI-compatible OpenRouter]
```

This separation keeps business logic independent from vendor-specific request formatting. Switching providers requires only a `.env` change — no code changes.

## Secret Handling

- All secrets come from environment variables only
- `.env.example` contains placeholders, never real values
- `AI_API_KEY`, `EMAIL_USER`, and `EMAIL_PASS` are never committed intentionally
- Services and agents avoid logging secrets to stdout
- All commits are signed off per DCO requirements (`git commit -s`)

## Data Sources

- `data/transactions.json`: 90-day cash flow ledger
- `data/invoices.json`: invoice and payment history
- `data/metrics.json`: weekly KPI snapshots
- `data/externalValidation.json`: public-dataset validation notes used as AI context

The first three files are benchmark-locked and should not be regenerated or edited during feature work. The external validation file is descriptive context and should remain stable unless references are intentionally updated.
