# AI Provider Setup Guide

> **Which phase does the AI API happen?**
> **Phase 2, Task 5** — `agent/queryAgent.js`
> This is the only file that makes API calls. Everything else is pure logic with no external dependencies.

---

## You do NOT need a paid API

CashGuardian CLI is designed to work with **any free-tier AI provider**. The API call is abstracted in one place — just set the right env vars and the rest of the code is unchanged.

---

## Option 1: Google Gemini (Recommended — most generous free tier)

**Free tier:** 15 requests/min, 1M tokens/day — plenty for a hackathon.

**Setup:**
1. Go to [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Create a free API key (no credit card needed)
3. Set in `.env`:

```env
AI_PROVIDER=gemini
AI_API_KEY=your-gemini-api-key-here
AI_MODEL=gemini-1.5-flash
```

**API call pattern (in queryAgent.js):**

```js
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${process.env.AI_MODEL}:generateContent?key=${process.env.AI_API_KEY}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        { role: "user", parts: [{ text: systemPrompt + "\n\n" + userQuery }] }
      ],
      generationConfig: { maxOutputTokens: 500, temperature: 0.3 }
    })
  }
);
const data = await response.json();
const reply = data.candidates[0].content.parts[0].text;
```

---

## Option 2: Groq (Fastest inference, free tier)

**Free tier:** 30 requests/min, uses open models like LLaMA 3.

**Setup:**
1. Sign up at [https://console.groq.com](https://console.groq.com)
2. Create a free API key
3. Set in `.env`:

```env
AI_PROVIDER=groq
AI_API_KEY=your-groq-api-key-here
AI_MODEL=llama3-8b-8192
```

**API call pattern (OpenAI-compatible):**

```js
const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.AI_API_KEY}`
  },
  body: JSON.stringify({
    model: process.env.AI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userQuery }
    ],
    max_tokens: 500,
    temperature: 0.3
  })
});
const data = await response.json();
const reply = data.choices[0].message.content;
```

---

## Option 3: OpenRouter (Access 50+ free models)

**Free tier:** Many models available for free including Mistral, Gemma, LLaMA.

**Setup:**
1. Sign up at [https://openrouter.ai](https://openrouter.ai)
2. Create a free API key
3. Set in `.env`:

```env
AI_PROVIDER=openrouter
AI_API_KEY=your-openrouter-api-key-here
AI_MODEL=mistralai/mistral-7b-instruct:free
```

**API call pattern (OpenAI-compatible):**

```js
const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.AI_API_KEY}`,
    "HTTP-Referer": "https://github.com/your-org/cashguardian-cli"
  },
  body: JSON.stringify({
    model: process.env.AI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userQuery }
    ],
    max_tokens: 500
  })
});
const data = await response.json();
const reply = data.choices[0].message.content;
```

---

## How queryAgent.js should handle all providers

The agent reads `AI_PROVIDER` from env and calls the right pattern:

```js
// agent/queryAgent.js

async function callAI(systemPrompt, userQuery) {
  const provider = process.env.AI_PROVIDER || "gemini";

  try {
    if (provider === "gemini") {
      return await callGemini(systemPrompt, userQuery);
    } else {
      // groq and openrouter both use OpenAI-compatible format
      return await callOpenAICompat(systemPrompt, userQuery);
    }
  } catch (err) {
    // Graceful fallback — return rule-based response
    return fallbackResponse(userQuery);
  }
}
```

---

## .env.example (updated)

```env
# ─── AI Provider ──────────────────────────────────────────────
# Options: gemini | groq | openrouter
AI_PROVIDER=gemini

# Your free API key from the chosen provider
AI_API_KEY=your-api-key-here

# Model to use (see provider docs)
# Gemini:     gemini-1.5-flash
# Groq:       llama3-8b-8192
# OpenRouter: mistralai/mistral-7b-instruct:free
AI_MODEL=gemini-1.5-flash

# ─── Email (Nodemailer) ───────────────────────────────────────
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=CashGuardian <your-email@gmail.com>
```

---

## Comparison

| Provider | Free Tier | Speed | Best For |
|---|---|---|---|
| Google Gemini | 1M tokens/day | Fast | Best overall for hackathon |
| Groq | 30 req/min | Fastest | Low latency demos |
| OpenRouter | Varies by model | Medium | Model flexibility |

**Recommendation:** Use **Gemini 1.5 Flash** — it's free, fast, understands financial data well, and requires no credit card.