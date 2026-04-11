# Pull Request — CashGuardian CLI

## Summary

<!-- What does this PR do? 1–3 clear sentences. -->

## Type of Change

- [ ] `feat` — New feature (maps to a task in `tasks.md`)
- [ ] `fix` — Bug fix
- [ ] `docs` — Documentation only
- [ ] `refactor` — Code restructure, no behaviour change
- [ ] `test` — Tests added or improved
- [ ] `chore` — Build, config, or tooling

## Related Task / Issue

<!-- e.g. "Phase 2 Task 5 — Query Agent" or "Closes #12" -->

## Files Changed

<!-- List what you touched and why. Be specific. -->

| File | What changed |
|---|---|
| `agent/queryAgent.js` | |
| `services/` | |
| `tests/` | |
| `docs/` | |

## How to Test

```bash
# 1. Install dependencies
npm install

# 2. Set up env (copy from .env.example, add your free API key)
cp .env.example .env

# 3. Run tests
npm test

# 4. Start the CLI and verify manually
node index.js
```

Specific queries to check for this PR:
- `> ` <!-- add the query that exercises your change -->

## Checklist

- [ ] `npm test` passes locally — 0 failures
- [ ] New behaviour has new test cases
- [ ] No `console.log` left in `services/` or `agent/`
- [ ] No secrets or real API keys in any file
- [ ] JSDoc present on all exported functions I added/changed
- [ ] `docs/` updated if I changed behaviour or added a feature
- [ ] Commit signed off with `git commit -s`

## Notes for Reviewer

<!-- Anything tricky, a trade-off made, or a decision you want feedback on. -->
<!-- If this is a Phase 2+ change, confirm the benchmark score did not drop. -->s