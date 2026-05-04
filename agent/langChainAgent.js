const { ChatOpenAI } = require("@langchain/openai");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { StateGraph, MessagesAnnotation } = require("@langchain/langgraph");
const { SystemMessage, HumanMessage, AIMessage } = require("@langchain/core/messages");
const {
  INTENTS,
  classifyIntent
} = require("./intentMap");
const {
  getCashBalance,
  getCashSummary,
  getExpenseBreakdown,
  comparePeriods,
  compareEntities
} = require("../services/cashFlowService");
const {
  getOverdueInvoices,
  getInvoicesByClient
} = require("../services/invoiceService");
const { getRiskReport, getClientRisk } = require("../services/riskService");
const { decomposeTransactions } = require("../services/decompositionService");
const { detectAnomalies } = require("../services/anomalyService");
const { generateSummary } = require("../services/summaryService");
const { sendPaymentReminder } = require("../services/emailService");
const { formatCurrency } = require("../utils/formatter");
const { getTransactions, getInvoices } = require("../services/dataService");
const { extractClientName, getSnapshot, buildSystemPrompt, formatOverdueTable, formatDecompositionTable } = require("./queryAgent");
const { auditLog } = require("../utils/auditLog");

function isFastModeEnabled() {
  return process.env.AI_FAST_PATH !== "false";
}

function formatForecastQuick(forecast) {
  return [
    "#### 30-Day Forecast",
    `Opening Balance: ${formatCurrency(forecast.openingBalance)}`,
    `Projected Revenue: ${formatCurrency(forecast.projectedRevenue)}`,
    `Projected Burn: ${formatCurrency(forecast.projectedBurn)}`,
    `Upcoming Invoices: ${formatCurrency(forecast.upcomingTotal)}`,
    `Projected Closing Balance: ${formatCurrency(forecast.finalBalance)}`
  ].join("\n");
}

async function invokeWithTimeout(llm, messages, fallbackText, timeoutMs = 8000) {
  try {
    const result = await Promise.race([
      llm.invoke(messages),
      new Promise((_, reject) => setTimeout(() => reject(new Error("LLM timeout")), timeoutMs))
    ]);
    return result && result.content ? result.content.trim() : fallbackText;
  } catch (_error) {
    return fallbackText;
  }
}

// Initialize LLM based on provider
function getLLM() {
  const provider = (process.env.AI_PROVIDER || "gemini").toLowerCase();
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;

  if (!apiKey) {
    throw new Error("AI_API_KEY is not defined in environment variables.");
  }

  if (provider === "gemini") {
    return new ChatGoogleGenerativeAI({
      model: model || "gemini-1.5-flash",
      apiKey: apiKey,
      maxOutputTokens: 2000, // Increased for deeper reasoning
      temperature: 0.3
    });
  }

  // Support for Groq/OpenRouter via OpenAI compatibility
  const baseUrl = provider === "groq"
    ? "https://api.groq.com/openai/v1"
    : "https://openrouter.ai/api/v1";

  return new ChatOpenAI({
    model: model,
    apiKey: apiKey,
    configuration: {
      baseURL: baseUrl
    },
    maxTokens: 2000, // Increased for 70B reasoning
    temperature: 0.3
  });
}

/**
 * Node: Intent Classification
 * Determines what the user wants to do.
 */
async function classifyNode(state) {
  const lastUserMessage = state.messages[state.messages.length - 1].content;
  const intent = classifyIntent(lastUserMessage);
  
  return { 
    intent 
  };
}

/**
 * Node: Execution
 * Actually calls the services or the LLM based on the intent.
 */
async function executeNode(state) {
  const { intent, activeDataset, messages } = state;
  const userInput = messages[messages.length - 1].content;
  const fastMode = isFastModeEnabled();
  
  // Extract client from current query
  const clientFromQuery = await extractClientName(userInput, state.transactions);
  
  console.log(`[DEBUG] executeNode - Intent: ${intent}, Invoices in State: ${state.invoices?.length || 0}`);

  // 1. High-Priority Action: Send Reminder
  if (intent === INTENTS.SEND_REMINDER) {
    if (!clientFromQuery) return { response: "Please specify which client should receive the reminder." };

    const clientInvoices = await getInvoicesByClient(state.userId, clientFromQuery);
    const overdueRow = clientInvoices.find((inv) => {
      const dueDate = inv.dueDate || inv.duedate;
      const status = String(inv.status || "").toLowerCase();
      return status === "overdue" || (dueDate && new Date(dueDate).getTime() < Date.now());
    });
    if (!overdueRow) return { response: `No overdue records found for ${clientFromQuery}.` };
    const dueDate = overdueRow.dueDate || overdueRow.duedate;
    const daysOverdue = dueDate ? Math.max(1, Math.ceil((Date.now() - new Date(dueDate).getTime()) / 86400000)) : 7;

    const result = await sendPaymentReminder({
      client: clientFromQuery,
      amount: Math.abs(Number(overdueRow.amount) || 0),
      daysOverdue,
      invoiceId: overdueRow.id || overdueRow.invoiceId || "N/A"
    }, state.userId);

    return { response: result.alert };
  }

  // 2. Data Retrieval Intents
  let fallbackText = null;
  if (intent === INTENTS.CASH_BALANCE) {
    const balance = await getCashBalance(state.userId, state.transactions);
    fallbackText = `Current net cash balance is ${formatCurrency(balance.netBalance)}.\nIncome: ${formatCurrency(balance.totalIncome)} | Expenses: ${formatCurrency(balance.totalExpenses)}`;
    if (fastMode) return { response: fallbackText, duel: null, trend: null, comparisonTrend: null };
  } else if (intent === INTENTS.CASH_SUMMARY) {
    const summary = await getCashSummary(state.userId, 90, state.transactions);
    fallbackText = `Over the latest tracked period, income was ${formatCurrency(summary.income)} and expenses were ${formatCurrency(summary.expenses)}.\nNet cash flow was ${formatCurrency(summary.net)}, with ${summary.topExpenseCategory} as the top expense category.`;
    if (fastMode) return { response: fallbackText, duel: null, trend: null, comparisonTrend: null };
  } else if (intent === INTENTS.WEEKLY_SUMMARY) {
    fallbackText = await generateSummary(state.userId, "weekly", state.transactions);
    if (fastMode) return { response: fallbackText, duel: null, trend: null, comparisonTrend: null };
  } else if (intent === INTENTS.EXPENSE_BREAKDOWN) {
    const breakdown = await getExpenseBreakdown(state.userId, state.transactions);
    const { formatExpenseBreakdown } = require("./queryAgent");
    fallbackText = formatExpenseBreakdown(breakdown);
    if (fastMode) return { response: fallbackText, duel: null, trend: null, comparisonTrend: null };
  } else if (intent === INTENTS.ANOMALY) {
    const activeTxns = activeDataset || state.transactions;
    const anomalies = await detectAnomalies(state.userId, activeTxns);
    const text = anomalies.length
      ? anomalies.map((a) => `- ${a.explanation}`).join("\n")
      : "No significant anomalies detected.";

    return { 
      response: `#### Anomaly Report\n${text}`, 
      duel: null, 
      trend: null, 
      comparisonTrend: null 
    };
  } else if (intent === INTENTS.OVERDUE_INVOICES) {
    // 🛡️ ENFORCED GLOBAL RULE: No client-specific filtering for overdue
    const invoices = await getOverdueInvoices(state.userId);
    const table = formatOverdueTable(invoices);
    
    let response = table;
    if (clientFromQuery) {
      response += `\n\n*Note: Providing global operational view. Client-specific filtering for ${clientFromQuery} is restricted for overdue reporting.*`;
    }

    return {
      response,
      duel: null,
      trend: null,
      comparisonTrend: null
    };
  }

  const snapshot = await getSnapshot(state.userId, activeDataset, {
    transactions: state.transactions,
    invoices: state.invoices
  });

  // 3. New Decomposition (Breakdown) handling
  if (intent === INTENTS.DECOMPOSITION) {
    const norm = userInput.toLowerCase();
    let decompType = "expense";
    let decompFilter = null;
    let decompGroup = "category";

    if (norm.includes("sales") || norm.includes("revenue") || norm.includes("income")) {
      decompType = "income";
    }

    if (norm.includes("region") || norm.includes("location") || norm.includes("area")) {
      decompGroup = "region";
    }
    if (norm.includes("channel") || norm.includes("medium") || norm.includes("method")) {
      decompGroup = "channel";
    }
    if (norm.includes("client") || norm.includes("customer") || norm.includes("account")) {
      decompGroup = "client";
    }

    const result = await decomposeTransactions(decompType, decompFilter, decompGroup, state.userId, activeDataset);
    const table = formatDecompositionTable(result);
    const decompFallback = [
      "#### Breakdown Analysis",
      `Total analyzed: ${formatCurrency(result.total)}.`,
      result.insights.length ? result.insights.join(" ") : "The mix is relatively distributed without a single dominant outlier."
    ].join("\n\n");

    const systemPrompt =
      buildSystemPrompt(snapshot) +
      `\n\n### MANDATORY DATA SOURCE: TARGET DECOMPOSITION\n` +
      `You MUST explain the following components of the focus area "${result.target}":\n` +
      `Total: ${formatCurrency(result.total)}\n` +
      `Tabular Breakdown:\n${table}\n` +
      `Statistically relevant patterns: ${result.insights.join(", ") || "None detected"}\n` +
      `### END DATA SOURCE\n\n` +
      "Task: Provide a strategic executive narrative only. Keep it concise and insight-focused. Do NOT include the table in your answer.";

    const llm = getLLM();
    const responseText = await invokeWithTimeout(
      llm,
      [new SystemMessage(systemPrompt), ...messages],
      decompFallback,
      2500
    );

    return {
      response: `${table}\n\n${responseText}`,
      duel: null,
      trend: null,
      comparisonTrend: null
    };
  }

  // 4. Prediction Mode
  if (intent === INTENTS.PREDICTION) {
    const { calculate30DayForecast } = require("../services/predictionService");
    const forecast = await calculate30DayForecast(state.userId, activeDataset);
    if (fastMode) {
      return { response: formatForecastQuick(forecast), duel: null, trend: null, comparisonTrend: null };
    }

    const systemPrompt = buildSystemPrompt(snapshot) +
      `\n\n### MANDATORY DATA SOURCE: 30-DAY FORECAST\n` +
      `Opening Balance: ${formatCurrency(forecast.openingBalance)}\n` +
      `Projected Revenue (30d): ${formatCurrency(forecast.projectedRevenue)} (Daily Avg: ${formatCurrency(forecast.avgDailyRevenue)})\n` +
      `Projected Burn (30d): ${formatCurrency(forecast.projectedBurn)} (Daily Avg: ${formatCurrency(forecast.avgDailyBurn)})\n` +
      `Upcoming Invoices: ${formatCurrency(forecast.upcomingTotal)}\n` +
      `30-Day Project Balance: ${formatCurrency(forecast.finalBalance)}\n` +
      `Reasoning: ${forecast.reasoning}\n` +
      `### END DATA SOURCE\n\n` +
      `Task: Provide an executive narrative of this 30-day forecast. Explain how the historical burn rate and upcoming receivables combine to reach the final balance. Accuracy is mandatory.`;

    const llm = getLLM();
    const responseText = await invokeWithTimeout(
      llm,
      [new SystemMessage(systemPrompt), ...messages],
      formatForecastQuick(forecast)
    );

    return {
      response: responseText,
      duel: null,
      trend: null,
      comparisonTrend: null
    };
  }

  // 5. Fallback to AI Reasoning (Passing history for conversational awareness)
  const normalized = userInput.toLowerCase();
  
  // SMART ROUTING: Determine if this is a month-on-month trend or an entity duel
  const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december", "jan", "feb", "mar", "apr"];
  const isPeriodComparison = monthNames.some(m => normalized.includes(m)) || normalized.includes("month") || normalized.includes("week");

  // Robust pattern: match anything "vs" or "versus" anything, cleaning common noise
  if (intent === INTENTS.COMPARE && (normalized.includes(" vs ") || normalized.includes(" versus "))) {
    const cleanInput = normalized
      .replace(/.*compare /i, "") // Capture everything after the word "compare"
      .replace(/["']/g, "")
      .replace(/\.$/, "");        // Remove trailing period
    
    // If it's a period comparison (month vs month), route to comparePeriods
    if (isPeriodComparison) {
      const period = normalized.includes("week") ? "week" : "month";
        snapshot.periodComparison = await comparePeriods(state.userId, period, 1, activeDataset);
    } else {
      const parts = cleanInput.split(/ vs | versus /);
      if (parts.length >= 2) {
        const entityA = parts[0].trim();
        const entityB = parts[1].trim();
        const { compareEntities } = require("../services/cashFlowService");
        snapshot.duel = await compareEntities(state.userId, entityA, entityB, activeDataset);
        console.log(`[LangGraph] Duel detected: ${entityA} vs ${entityB}`);
      }
    }
  }


  if (fastMode && intent === INTENTS.COMPARE) {
    const period = normalized.includes("week") ? "week" : "month";
    const comparison = await comparePeriods(state.userId, period, 1, state.transactions);
    return {
      response: comparison.narrative,
      duel: null,
      trend: comparison.currentTrend,
      comparisonTrend: comparison.previousTrend
    };
  }

  const systemPrompt = buildSystemPrompt(snapshot) + 
    `\n\nGROUNDING RULE: Answer ONLY using the data provided in the snapshot. Be professional and provide executive-level analysis. ` +
    `NEVER guess email addresses or suggest unrelated high-risk clients (like Patel) if the requested client is missing from the directory. ` +
    `If a client is not in the OVERDUE LIST, simply state that they have no overdue invoices. Accuracy is 100% mandatory.`;

  const llm = getLLM();
  const fallbackResponse = fallbackText || "Please try a more specific finance query (balance, overdue, breakdown, compare, or summary).";
  const responseText = await invokeWithTimeout(
    llm,
    [new SystemMessage(systemPrompt), ...messages],
    fallbackResponse
  );

  return { 
    response: responseText,
    duel: snapshot.duel || null,
    trend: snapshot.periodComparison ? snapshot.periodComparison.currentTrend : null,
    comparisonTrend: snapshot.periodComparison ? snapshot.periodComparison.previousTrend : null
  };
}

const { Annotation } = require("@langchain/langgraph");

// Define the Graph State Schema
const StateAnnotation = Annotation.Root({
  messages: Annotation({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  intent: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  activeDataset: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  transactions: Annotation({
    reducer: (x, y) => x, // Read-only once set
    default: () => null,
  }),
  invoices: Annotation({
    reducer: (x, y) => x, // Read-only once set
    default: () => null,
  }),
  userId: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  response: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  duel: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  trend: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  comparisonTrend: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null,
  })
});

const workflow = new StateGraph(StateAnnotation)
  .addNode("classify", classifyNode)
  .addNode("execute", executeNode)
  .addEdge("__start__", "classify")
  .addEdge("classify", "execute")
  .addEdge("execute", "__end__");

const app = workflow.compile();

/**
 * Entry point for the new LangGraph Agent.
 * @param {string} userInput - The user's query.
 * @param {Array<Object>} customDataset - Uploaded data.
 * @param {Array} history - Previous messages.
 */
async function handleQuery(userInput, customDataset = null, history = [], userId = null) {
  try {
    // 1. Prepare initial messages
    const messages = history.map(m => m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content));
    messages.push(new HumanMessage(userInput));

    // 1.5 Pre-fetch data for the graph (with deep cloning for safety)
    const clonedCustom = customDataset && customDataset.length > 0 ? JSON.parse(JSON.stringify(customDataset)) : null;
    const [transactions, invoices] = await Promise.all([
      clonedCustom ? Promise.resolve(clonedCustom) : getTransactions(userId),
      getInvoices(userId)
    ]);

    // 3. Run the Graph
    const intent = classifyIntent(userInput);
    auditLog(userId, 'AI_QUERY', intent, '0.0.0.0', { query: userInput.substring(0, 100), agent: 'langgraph-legacy' }).catch(() => {});

    const result = await app.invoke({
      messages,
      activeDataset: clonedCustom,
      transactions: JSON.parse(JSON.stringify(transactions)),
      invoices: JSON.parse(JSON.stringify(invoices)),
      userId
    });

    return {
      content: result.response,
      duel: result.duel,
      trend: result.trend,
      comparisonTrend: result.comparisonTrend
    };
  } catch (error) {
    console.error("[LangGraph Error]", error);
    return "Something went wrong with the Agentic Intelligence. Run 'git checkout queryAgent.js' to revert.";
  }
}

/**
 * Streaming entry point for the LangGraph Agent.
 * @param {string} userInput - The user's query.
 * @param {Array<Object>} customDataset - Uploaded data.
 * @param {Array} history - Previous messages.
 */
async function* handleStream(userInput, customDataset = null, history = [], userId = null) {
  try {
    const recentHistory = history.slice(-3); // Keep only last 3 messages to save tokens
    const messages = recentHistory.map(m => m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content));
    messages.push(new HumanMessage(userInput));

    // 1. Pre-fetch all necessary data in parallel (deep clone customDataset)
    const clonedCustom = customDataset && customDataset.length > 0 ? JSON.parse(JSON.stringify(customDataset)) : null;
    const [activeTransactions, activeInvoices] = await Promise.all([
      clonedCustom ? Promise.resolve(clonedCustom) : getTransactions(userId),
      getInvoices(userId)
    ]);

    console.time(`[LangGraph] Processing:${userInput.substring(0, 20)}`);
    // 1. Processing (Snapshot + Intent)
    let snapshot;
    try {
      console.time("[Performance] getSnapshot");
      snapshot = await getSnapshot(userId, clonedCustom, { 
        transactions: activeTransactions, 
        invoices: activeInvoices 
      });
      console.timeEnd("[Performance] getSnapshot");
    } catch (snapshotErr) {
      console.error("[LangGraph] Snapshot failed:", snapshotErr.message);
      yield { type: 'error', content: `Data processing failed: ${snapshotErr.message}` };
      return;
    }

    const intent = classifyIntent(userInput);
    auditLog(userId, 'AI_QUERY_STREAM', intent, '0.0.0.0', { query: userInput.substring(0, 100), agent: 'langgraph-stream' }).catch(() => {});

    console.timeEnd(`[LangGraph] Processing:${userInput.substring(0, 20)}`);
    
    console.log(`[LangGraph] Intent=${intent}`);

    // 2. High-Priority Side-Effect: Send Reminder
    if (intent === INTENTS.SEND_REMINDER) {
      const clientFromQuery = extractClientName(userInput, activeTransactions, [...new Set([...activeTransactions.map(t => t.client || t.client_name), ...activeInvoices.map(i => i.client || i.client_name)].filter(Boolean))]);
      if (!clientFromQuery) {
        yield { type: 'text', content: "Please specify which client should receive the reminder." };
        return;
      }

      const overdueRow = activeInvoices.find((inv) => {
        const clientValue = inv.client || inv.client_name || inv.customer || "";
        if (clientValue.toLowerCase() !== clientFromQuery.toLowerCase()) return false;
        const status = String(inv.status || "").toLowerCase();
        const dueDate = inv.dueDate || inv.duedate;
        return status === "overdue" || (dueDate && new Date(dueDate).getTime() < Date.now());
      });

      if (!overdueRow) {
        yield { type: 'text', content: `No overdue records found for ${clientFromQuery}.` };
        return;
      }

      const result = await sendPaymentReminder({
        client: clientFromQuery,
        amount: Math.abs(overdueRow.amount || 0),
        daysOverdue: (() => {
          const dueDate = overdueRow.dueDate || overdueRow.duedate;
          return dueDate ? Math.max(1, Math.ceil((Date.now() - new Date(dueDate).getTime()) / 86400000)) : 7;
        })(),
        invoiceId: overdueRow.id || overdueRow.invoiceId || 'N/A'
      }, userId);

      yield { 
        type: 'text', 
        content: result.alert,
        intent 
      };
      return;
    }

    // 3. Narrative Support Intelligence (Tables, Data Injections)
    if (intent === INTENTS.OVERDUE_INVOICES) {
      const clientFromQuery = extractClientName(userInput, activeTransactions, [...new Set([...activeTransactions.map(t => t.client || t.client_name), ...activeInvoices.map(i => i.client || i.client_name)].filter(Boolean))]);
      
      const overdueList = await getOverdueInvoices(userId);
      const table = formatOverdueTable(overdueList);
      
      let content = table;
      if (clientFromQuery) {
        content += `\n\n*Note: Providing global operational view. Client-specific filtering for ${clientFromQuery} is restricted for overdue reporting.*`;
      }

      yield { type: 'text', content: content, intent };
      return;
    }

    if (intent === INTENTS.ANOMALY) {
      const anomalies = await detectAnomalies(userId, activeTransactions);
      const text = anomalies.length
        ? anomalies.map((a) => `- ${a.explanation}`).join("\n")
        : "No significant anomalies detected.";
      yield { 
        type: 'text', 
        content: `#### Anomaly Report\n${text}`,
        intent 
      };
      return;
    }

    let extraContext = "";
    if (intent === INTENTS.EXPENSE_BREAKDOWN || intent === INTENTS.DECOMPOSITION) {
      const norm = userInput.toLowerCase();
      let decompType = (norm.includes("sales") || norm.includes("revenue") || norm.includes("income")) ? "income" : "expense";
      let decompGroup = (norm.includes("region") || norm.includes("location") || norm.includes("area")) ? "region" : (norm.includes("channel") ? "channel" : "category");
      const result = await decomposeTransactions(decompType, null, decompGroup, userId, activeTransactions);
      const table = formatDecompositionTable(result);
      extraContext = `\n\n### MANDATORY DATA SOURCE: BREAKDOWN\nFocus: ${result.target}\n${table}\nTask: Provide a detailed executive analysis (approx 100-150 words). Discuss concentrations, outliers, and strategic implications. Do NOT repeat the table in your response; return narrative only.`;
    } else if (intent === INTENTS.WEEKLY_SUMMARY || intent === INTENTS.CASH_SUMMARY) {
      extraContext = `\n\nTask: Provide a comprehensive executive narrative (minimum 150 words). Identify key drivers of performance, risks, and provide three distinct actionable recommendations. Be professional, detailed, and insightful. Use the available snapshot data extensively.`;
    }

    // NEW: Detailed Comparison Detection for Graphs
    const normalized = userInput.toLowerCase();
    const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
    const shortMonths = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const isPeriodComparison = monthNames.some(m => normalized.includes(m)) || 
                             shortMonths.some(m => new RegExp(`\\b${m}\\b`).test(normalized)) ||
                             normalized.includes("month") || normalized.includes("week");

    if (intent === INTENTS.COMPARE && (normalized.includes(" vs ") || normalized.includes(" versus "))) {
      const cleanInput = normalized
        .replace(/.*compare /i, "")
        .replace(/["']/g, "")
        .replace(/\.$/, "");
      
      if (isPeriodComparison) {
        const period = normalized.includes("week") ? "week" : "month";
        snapshot.periodComparison = await comparePeriods(userId, period, 1, activeTransactions);
      } else {
        const parts = cleanInput.split(/ vs | versus /);
        if (parts.length >= 2) {
          const entityA = parts[0].trim();
          const entityB = parts[1].trim();
          snapshot.duel = await compareEntities(userId, entityA, entityB, activeTransactions);
        }
      }
    }

    // 4. Build the system prompt for narrative intents
    const systemPrompt = buildSystemPrompt(snapshot) + 
      extraContext +
      `\n\nGROUNDING RULE: Answer ONLY using the snapshot data. Accuracy is 100% mandatory.`;

    // 3. Stream from LLM
    let llm, stream;
    try {
      llm = getLLM();
      stream = await llm.stream([
        new SystemMessage(systemPrompt),
        ...messages
      ]);
    } catch (llmErr) {
      console.error("[LangGraph] LLM init/stream failed:", llmErr.message);
      yield { type: 'error', content: `AI service error: ${llmErr.message}. Check AI_API_KEY in .env.` };
      return;
    }

    console.time("[Performance] LLM Stream First Token");
    try {
      let firstToken = true;
      for await (const chunk of stream) {
        if (firstToken && chunk.content) {
          console.timeEnd("[Performance] LLM Stream First Token");
          firstToken = false;
        }
        if (chunk.content) {
          yield { 
            type: 'text',
            content: chunk.content,
            intent,
            duel: snapshot.duel,
            trend: snapshot.periodComparison ? snapshot.periodComparison.currentTrend : (snapshot.trend || null),
            comparisonTrend: snapshot.periodComparison ? snapshot.periodComparison.previousTrend : (snapshot.comparisonTrend || null)
          };
        }
      }
    } catch (streamErr) {
      console.error("[LangGraph] Stream read failed:", streamErr.message);
      yield { type: 'error', content: "AI stream interrupted. Your data is safe." };
    }
  } catch (error) {
    console.error("[LangGraph Stream Error]", error);
    yield { type: 'error', content: error.message || "Unexpected error occurred." };
  }
}

module.exports = {
  handleQuery,
  handleStream,
  processQuery: handleQuery
};
