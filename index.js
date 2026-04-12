/**
 * CashGuardian CLI entry point.
 */
const readline = require("node:readline");
const dotenv = require("dotenv");
const { handleQuery } = require("./agent/queryAgent");

dotenv.config();

const BANNER = `
   ✨ CASHGUARDIAN AI [Luminous Edition] ✨
   ──────────────────────────────────────────
   Self-service Intelligence for your Data
   Demo: Mehta Wholesale Traders (Indian SME)

   Type your question or "help". Type "exit" to quit.
`;

/**
 * Starts the interactive CLI session.
 * @returns {void}
 */
function startCli() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "> "
  });

  console.log(BANNER);
  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    if (input.toLowerCase() === "exit") {
      rl.close();
      return;
    }

    try {
      const response = await handleQuery(input);
      console.log(response);
    } catch (error) {
      console.log("Something went wrong while processing your request.");
    }

    rl.prompt();
  });

  rl.on("SIGINT", () => {
    rl.close();
  });

  rl.on("close", () => {
    console.log("CashGuardian session ended.");
    process.exit(0);
  });
}

if (require.main === module) {
  startCli();
}

module.exports = {
  startCli
};
