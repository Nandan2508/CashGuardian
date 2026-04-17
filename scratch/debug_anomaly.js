const { handleQuery } = require("../agent/queryAgent");

async function run() {
  process.env.AI_API_KEY = ""; // ensure it triggers fallback
  const query = "Are there any unusual patterns in my spending?";
  const response = await handleQuery(query);
  console.log("QUERY:", query);
  console.log("RESPONSE:", response);
}

run();
