# CashGuardian: The Final Pitch
**Hackathon**: NatWest Group — Code for Purpose
**Team**: Team IronMan (Krishan Malhotra & Nandan Verma) — Thapar Institute of Engineering and Technology
**Duration**: 10 Minutes (600 Seconds)

### **Presentation Timing Breakdown**

| # | Slide / Section | Time | Focus / Action |
|---|---|---|---|
| 1 | **Introduction** | **30s** | Introduce Team IronMan & the CashGuardian vision. |
| 2 | **Problem Statement** | **45s** | The "Invisible Debt" problem in Indian MSMEs. |
| 3 | **Why it Matters** | **45s** | Impact on growth & why manual tracking fails. |
| 4 | **Solution Overview** | **60s** | "Talk to Data": Bridging the gap between raw data and action. |
| 5 | **10 Key Features** | **100s** | **Rapid Fire (10s per feature)** |
| 6 | **Security & Trust** | **60s** | PII Masking, Data Encryption, and Audit Trails. |
| 7 | **What Makes it Unique** | **45s** | Context Injection vs. Hallucination. |
| 8 | **Architecture** | **110s** | **Deep Dive:** LangGraph nodes, Data Layer, & PII Guard. |
| 9 | **Tech Stack** | **30s** | Gemini, Node.js, LangChain, PostgreSQL, Express. |
| 10 | **Impact & Future** | **45s** | Scalability and integration with Open Banking APIs. |
| 11 | **Conclusion** | **30s** | Final summary and Thank You. |

---

## 1. Introduction (0:00 - 0:30)
**Script**: 
"Good afternoon, judges and the esteemed panel. We are Team IronMan from **Thapar Institute of Engineering and Technology**. We’re thrilled to be here for the **Grand Finale of the NatWest Group 'Code for Purpose' Hackathon**, conducted in collaboration with **Unstop**. Our project, **CashGuardian**, directly addresses the theme: **'Talk to Data.'** Our vision is to provide **'Seamless Self-Service Intelligence'**—building a bridge where Indian MSME owners don't just 'view' data, they actually *talk* to it, turning silent spreadsheets into active, actionable intelligence."

---

## 2. Problem Statement (0:30 - 1:15)
**Transition**: "To understand the need for CashGuardian, we must first look at the challenges hindering the growth of MSMEs."

**Script**: 
"Small businesses generate financial data every single day — through transactions, invoices, and expenses. But here's the problem: that data just sits there.
 It's hard to interpret without spreadsheets, analysts, or expensive BI tools that most small business owners simply don't have access to.

What they actually need are simple, direct answers — How much cash do I have? Which customers haven't paid me yet? Am I going to be okay this month?

Traditional dashboards show numbers, but they don't tell you what to do with those numbers. They're not decision-ready.
That's the gap we're solving — turning raw financial data into clear, actionable answers.

---

## 3. Why This Matters (1:15 - 2:00)
Now, why does this actually matter? Look at this chart — 55% of small businesses are genuinely struggling to make sense of their financial data. Another 25% have only partial clarity. That's 80% of businesses flying somewhat blind.
And the consequences are real. A missed overdue invoice directly hits your cash flow. Unusual spending goes unnoticed until it's too late. And most small business owners don't have a finance team to catch these things — they're doing it all themselves.
The good news? You don't need to hire an analyst. If a system can explain your business data in plain English — clearly, instantly — it improves your confidence, your speed, and your control.
That's not a nice-to-have. For a small business owner, that's the difference between staying afloat and falling behind.

---

## 4. Solution Overview (2:00 - 3:00)
**Script**: 
The core idea is simple — a small business owner should be able to just ask a question in plain English and get a straight answer. No spreadsheets, no training required. Something like 'How much cash do I have?' or 'Who hasn't paid me yet?' — and CashGuardian just tells you.
Under the hood, it does something important that most AI tools don't. It doesn't just guess. It combines solid, rule-based financial logic with AI-generated explanations — so the numbers are always accurate, and the answers are always easy to understand. We're calling this grounded AI.
In terms of what it can actually do — it handles your cash balance, flags overdue invoices, spots unusual spending before it becomes a problem, compares performance across time periods, and gives you weekly summaries so you always know where you stand.
Think of it as a financial assistant that's always on, always accurate, and speaks your language — not the language of accountants.

---

## 5. 9 Key Features: Rapid Fire (3:00 - 4:40)
*(Approx. 11 Seconds Per Feature)*
"Let me walk you through what CashGuardian actually does.
First — you upload your financial data, and the system gets to work immediately. No setup headache, no configuration. You get insights straight away.
From there, it shows you your real-time cash balance and how money is moving in and out of your business. Alongside that, the expense breakdown gives you a clear picture of where your money is actually going — broken down by category so nothing gets missed.
Overdue detection automatically identifies which customers haven't paid, and then — with the email reminders feature — it can send follow-up reminders to those clients directly. That alone can make a real difference to cash flow.
The anomaly detection keeps an eye out for anything unusual — an unexpected expense spike or an income drop — so issues don't quietly slip through unnoticed.
The weekly summary gives you a quick snapshot of how the business is doing, without having to dig through your data yourself.
And finally — PDF export, so reports can be shared with an accountant or a partner easily. And voice-based querying, so users can simply speak their question rather than type it — making the whole experience even more accessible.
Together, these features are designed to give a small business owner the kind of visibility that was previously only available to much larger companies."
---

## 6. Security & Trust (4:40 - 5:40)
When you're dealing with a business's financial data, trust is everything. So let me talk about how CashGuardian handles security — powered by AI guardrails.
First — PII protection. Sensitive information like Aadhar numbers, PAN, and bank details are automatically masked and encrypted before they ever reach the AI. Your data stays protected at every step.
Second — prompt injection protection. Any malicious or manipulative queries are filtered out by our guardrails before AI processing even begins, preventing data leaks and unauthorized access.
Third — secure JWT authentication. Access to the system is stateless, secure, and rate-limited — which means it's built to handle security at an enterprise level, not just a basic login screen.
And finally — every single action on the platform, whether it's a query, a login, or a file upload, is logged and tracked. This gives businesses a full audit trail for monitoring and compliance purposes.

---

## 7. What Makes It Unique (5:40 - 6:25)
So what actually makes CashGuardian different?
Most AI tools just take your question and generate an answer. We don't do that. The AI is grounded — meaning every response is based on real, computed financial data. Not guesswork, not assumptions.
Here's how it works. First, a deterministic service layer calculates the actual numbers — the truth. Then, and only then, does the AI come in to explain it in plain English.
Truth first, explanation next.
The result is something that's both accurate and easy to understand. We combine solid financial logic with AI explanations to deliver answers you can actually trust.

---

## 8. Architecture: Technical Deep-Dive (6:25 - 8:15)
"Let’s look under the hood. We use an agentic workflow powered by **LangGraph**. 
- First, the **Classify Node** identifies intent and resolves conversational context.
- Next, the **Data Layer** pulls a snapshot from our optimized PostgreSQL schema.
- This snapshot passes through the **PII Masking Layer** to ensure compliance.
- Finally, the **Execute Node** feeds this grounded context to **Gemini 1.5 Flash** to generate a professional, narrative response. 
This multi-step pipeline ensures that every answer is audited, secure, and statistically sound."

---

## 9. Tech Stack Requirements (8:15 - 8:45)
**Script**: 
"Our stack is designed for speed and scale:
- **AI**: Gemini 1.5 Flash (Free Tier) via LangChain.
- **Backend**: Node.js, Express, and PostgreSQL.
- **Security**: JWT for Auth, BCrypt for hashing, AES-256 for encryption.
- **Utilities**: date-fns for aging, Nodemailer for reminders."

---

## 10. Impact & Future Scope (8:45 - 9:30)
**Script**: 
"The impact is clear: 70% reduction in manual data analysis time for SME owners. Looking ahead, we plan to integrate directly with **Open Banking APIs** to pull live bank statements and implement **GSTN automated reconciliation**, making CashGuardian a truly 'hands-free' financial manager."

---

## 11. Conclusion & Thank You (9:30 - 10:00)
**Script**: 
"In conclusion, CashGuardian solves for **Clarity, Trust, and Speed**. We’re turning silent data into a powerful voice for Indian MSMEs. Thank you for your time, we are now open for your questions."
