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
const { getCashPrediction } = require("../services/predictionService");
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

  // 3. Fallback to AI Reasoning (Passing history for conversational awareness)
  const snapshot = getSnapshot(activeDataset);

  // Check for Head-to-Head Comparison (Duel)
  const normalized = userInput.toLowerCase();
  if (intent === INTENTS.COMPARE && (normalized.includes(" vs ") || normalized.includes(" versus "))) {
    const parts = normalized.split(/ vs | versus /);
    const entityA = parts[0].trim().replace(/compare /g, "");
    const entityB = parts[1].trim();
    snapshot.duel = compareEntities(entityA, entityB);
    console.log(`[LangGraph] Duel detected: ${entityA} vs ${entityB}`);
  }

  const systemPrompt = buildSystemPrompt(snapshot) + 
    (lastClient ? `\n\nCONTEXT: You are currently discussing "${lastClient}". If the user uses pronouns like "him", "them", or "that client", they refer to "${lastClient}".` : "") +
    `\n\nREPORT QUALITY RULE: You are currently using a high-reasoning 70B model. Provide at least 3-4 detailed paragraphs of analysis. Avoid short answers. Deep-dive into the "Why" behind the numbers.`;

  const llm = getLLM();
  const result = await llm.invoke([
    new SystemMessage(systemPrompt),
    ...messages
  ]);

  return { 
    response: result.content,
    duel: snapshot.duel || null 
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
      duel: result.duel
    };
  } catch (error) {
    console.error("[LangGraph Error]", error);
    return "Something went wrong with the Agentic Intelligence. Run 'git checkout queryAgent.js' to revert.";
  }
}

module.exports = {
  handleQuery,
  processQuery: handleQuery
};
