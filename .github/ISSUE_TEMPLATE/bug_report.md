---
name: Bug Report
about: Something is broken or giving wrong output
title: "[BUG] "
labels: bug
assignees: ""
---

## What is broken?

<!-- One clear sentence describing the problem. -->

## Steps to Reproduce

```bash
# Exact commands you ran
node index.js
```

Then typed:
```
> your query here
```

## Expected Output

<!-- What should the CLI have shown? Include expected numbers if relevant. -->

## Actual Output

<!-- Paste the actual CLI output here. Redact any API keys or email passwords. -->

```
paste output here
```

## Environment

| Item | Value |
|---|---|
| Node.js version (`node --version`) | |
| OS | |
| `AI_PROVIDER` in .env | gemini / groq / openrouter |
| Phase completed up to | Phase X Task Y |

## Which layer is failing?

- [ ] CLI input / readline loop (`index.js`)
- [ ] Intent classification (`agent/intentMap.js`)
- [ ] AI API call (`agent/queryAgent.js`)
- [ ] A specific service (`services/___Service.js`)
- [ ] Output formatting (`utils/formatter.js`)
- [ ] Email sending (`services/emailService.js`)
- [ ] Not sure

## Additional Context

<!-- Error stack traces, screenshots, or anything else helpful.
     If this is a wrong number in the AI response, check BENCHMARK.md
     ground truth first — it may be a system prompt issue, not a bug. -->