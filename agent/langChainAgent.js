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
const { extractClientName, getSnapshot, buildSystemPrompt } = require("./queryAgent");

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
 * Determines what the user wants to do and resolves context (like client names) from memory.
 */
async function classifyNode(state) {
  const lastUserMessage = state.messages[state.messages.length - 1].content;
  const intent = classifyIntent(lastUserMessage);
  
  // Try to extract client from current query
  let client = extractClientName(lastUserMessage, state.activeDataset);
  
  // CONTEXT MEMORY: If no client in query, use the one from state
  if (!client && state.lastClient) {
    client = state.lastClient;
    console.log(`[LangGraph] Resolved context: using last client "${client}"`);
  }

  return { 
    intent, 
    lastClient: client || state.lastClient 
  };
}

/**
 * Node: Execution
 * Actually calls the services or the LLM based on the intent.
 */
async function executeNode(state) {
  const { intent, lastClient, activeDataset, messages } = state;
  const userInput = messages[messages.length - 1].content;

  // 1. High-Priority Action: Send Reminder
  if (intent === INTENTS.SEND_REMINDER) {
    if (!lastClient) return { response: "Please specify which client should receive the reminder." };

    const dataset = activeDataset || require("../data/transactions.json");
    const overdueRow = dataset.find(item => item.client === lastClient && (item.status === 'overdue' || item.amount < 0));

    if (!overdueRow) return { response: `No overdue records found for ${lastClient} in the active dataset.` };

    const result = await sendPaymentReminder({
      client: lastClient,
      amount: Math.abs(overdueRow.amount),
      daysOverdue: overdueRow.daysOverdue || 7,
      invoiceId: overdueRow.id || overdueRow.invoiceId || 'N/A'
    }, activeDataset);

    return { response: result.alert };
  }

  // 2. Data Retrieval Intents
  let fallbackText = null;
  if (intent === INTENTS.CASH_BALANCE) {
    const balance = getCashBalance();
    fallbackText = `Current net cash balance is ${formatCurrency(balance.netBalance)}.\nIncome: ${formatCurrency(balance.totalIncome)} | Expenses: ${formatCurrency(balance.totalExpenses)}`;
  } else if (intent === INTENTS.OVERDUE_INVOICES) {
    if (lastClient) {
      const invoicesByClient = getInvoicesByClient(lastClient);
      const overdueInvoice = invoicesByClient.find((invoice) => invoice.status === "overdue");
      fallbackText = `${lastClient} has ${invoicesByClient.length} invoices. ${overdueInvoice ? `Overdue: ${formatCurrency(overdueInvoice.amount)}.` : "No overdue invoices."}`;
    }
  }

  const snapshot = getSnapshot(activeDataset);

  // 3. New Decomposition (Breakdown) handling
  if (intent === INTENTS.DECOMPOSITION) {
    const { decomposeTransactions } = require("../services/decompositionService");
    const { formatDecompositionTable } = require("./queryAgent");
    const norm = userInput.toLowerCase();
    let decompType = "expense";
    let decompFilter = null;
    let decompGroup = "category";

    if (norm.includes("sales") || norm.includes("revenue") || norm.includes("income")) {
      decompType = "income";
      decompFilter = "sales";
      decompGroup = "client";
    }

    if (norm.includes("region") || norm.includes("location") || norm.includes("area")) {
      decompGroup = "region";
    }
    if (norm.includes("channel") || norm.includes("medium") || norm.includes("method")) {
      decompGroup = "channel";
    }

    const result = decomposeTransactions(decompType, decompFilter, decompGroup, activeDataset);
    const table = formatDecompositionTable(result);

    const systemPrompt =
      buildSystemPrompt(snapshot) +
      `\n\n### MANDATORY DATA SOURCE: TARGET DECOMPOSITION\n` +
      `You MUST explain the following components of the focus area "${result.target}":\n` +
      `Total: ${formatCurrency(result.total)}\n` +
      `Breakdown: ${JSON.stringify(result.components)}\n` +
      `Statistically relevant patterns: ${result.insights.join(", ") || "None detected"}\n` +
      `### END DATA SOURCE\n\n` +
      "Task: Provide a strategic executive narrative of the decomposition data above. Highlight the top contributor and explain any concentration risks or outliers found in the statistically relevant patterns. Ignore other snapshot data if it contradicts the Target Decomposition breakdown.";

    const llm = getLLM();
    const resultAI = await llm.invoke([new SystemMessage(systemPrompt), ...messages]);

    return {
      response: resultAI.content.trim(),
      duel: null,
      trend: null,
      comparisonTrend: null
    };
  }

  // 4. Prediction Mode
  if (intent === INTENTS.PREDICTION) {
    const { calculate30DayForecast } = require("../services/predictionService");
    const forecast = calculate30DayForecast(activeDataset);

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
    const resultAI = await llm.invoke([new SystemMessage(systemPrompt), ...messages]);

    return {
      response: resultAI.content,
      duel: null,
      trend: null,
      comparisonTrend: null
    };
  }

  // 4. Fallback to AI Reasoning (Passing history for conversational awareness)
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
      const { comparePeriods } = require("../services/cashFlowService");
      const period = normalized.includes("week") ? "week" : "month";
      snapshot.periodComparison = comparePeriods(period, 1, activeDataset);
    } else {
      const parts = cleanInput.split(/ vs | versus /);
      if (parts.length >= 2) {
        const entityA = parts[0].trim();
        const entityB = parts[1].trim();
        const { compareEntities } = require("../services/cashFlowService");
        snapshot.duel = compareEntities(entityA, entityB, activeDataset);
        console.log(`[LangGraph] Duel detected: ${entityA} vs ${entityB}`);
      }
    }
  }

  const systemPrompt = buildSystemPrompt(snapshot) + 
    (lastClient ? `\n\nCONTEXT: You are currently discussing "${lastClient}". If the user uses pronouns like "him", "them", or "that client", they refer to "${lastClient}".` : "") +
    `\n\nGROUNDING RULE: Answer ONLY using the data provided in the snapshot. Be professional and provide executive-level analysis. ` +
    `NEVER guess email addresses or suggest unrelated high-risk clients (like Patel) if the requested client is missing from the directory. ` +
    `If a client is not in the OVERDUE LIST, simply state that they have no overdue invoices. Accuracy is 100% mandatory.`;

  const llm = getLLM();
  const result = await llm.invoke([
    new SystemMessage(systemPrompt),
    ...messages
  ]);

  return { 
    response: result.content,
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
  lastClient: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  activeDataset: Annotation({
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
async function handleQuery(userInput, customDataset = null, history = []) {
  try {
    // 1. Prepare initial messages
    const messages = history.map(m => m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content));
    messages.push(new HumanMessage(userInput));

    // 2. Fetch current state context (we could persist this in a DB, but for now we look at history)
    let lastClient = null;
    for (let i = history.length - 1; i >= 0; i--) {
      const match = extractClientName(history[i].content, customDataset);
      if (match) {
        lastClient = match;
        break;
      }
    }

    // 3. Run the Graph
    const result = await app.invoke({
      messages,
      activeDataset: customDataset,
      lastClient
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
async function* handleStream(userInput, customDataset = null, history = []) {
  try {
    const messages = history.map(m => m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content));
    messages.push(new HumanMessage(userInput));

    let lastClient = null;
    for (let i = history.length - 1; i >= 0; i--) {
      const match = extractClientName(history[i].content, customDataset);
      if (match) {
        lastClient = match;
        break;
      }
    }

    // 1. Initial Processing (Snapshot + Intent)
    const snapshot = getSnapshot(customDataset);
    const intent = classifyIntent(userInput);
    const clientFromQuery = extractClientName(userInput, customDataset);
    const resolvedClient = clientFromQuery || lastClient;

    // 2. High-Priority Side-Effect: Send Reminder
    if (intent === INTENTS.SEND_REMINDER) {
      if (!resolvedClient) {
        yield { type: 'text', content: "Please specify which client should receive the reminder." };
        return;
      }

      const dataset = customDataset || require("../data/transactions.json");
      const overdueRow = dataset.find(item => {
        const clientKey = Object.keys(item).find(k => k.toLowerCase() === 'client' || k.toLowerCase() === 'customer');
        return clientKey && item[clientKey] && item[clientKey].toLowerCase() === resolvedClient.toLowerCase() && (item.status === 'overdue' || item.amount < 0);
      });

      if (!overdueRow) {
        yield { type: 'text', content: `No overdue records found for ${resolvedClient} in the active dataset.` };
        return;
      }

      const result = await sendPaymentReminder({
        client: resolvedClient,
        amount: Math.abs(overdueRow.amount || 0),
        daysOverdue: overdueRow.daysOverdue || 7,
        invoiceId: overdueRow.id || overdueRow.invoiceId || 'N/A'
      }, customDataset);

      yield { 
        type: 'text', 
        content: result.alert,
        intent 
      };
      return;
    }

    // 3. Build the system prompt for narrative intents
    const systemPrompt = buildSystemPrompt(snapshot) + 
      (resolvedClient ? `\n\nCONTEXT: You are currently discussing "${resolvedClient}".` : "") +
      `\n\nGROUNDING RULE: Answer ONLY using the snapshot data. Accuracy is 100% mandatory.`;

    // 3. Stream from LLM
    const llm = getLLM();
    const stream = await llm.stream([
      new SystemMessage(systemPrompt),
      ...messages
    ]);

    for await (const chunk of stream) {
      if (chunk.content) {
        yield { 
          type: 'text',
          content: chunk.content,
          intent,
          duel: snapshot.duel,
          trend: snapshot.periodComparison ? snapshot.periodComparison.currentTrend : null
        };
      }
    }
  } catch (error) {
    console.error("[LangGraph Stream Error]", error);
    yield { type: 'error', content: "Streaming error occurred." };
  }
}

module.exports = {
  handleQuery,
  handleStream,
  processQuery: handleQuery
};
