/**
 * CashGuardian CLI entry point.
 */
const readline = require("node:readline");
const dotenv = require("dotenv");
const { handleQuery } = require("./agent/queryAgent");

dotenv.config();

const BANNER = [
  "\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557",
  "\u2551         CashGuardian CLI  \ud83d\udcbc                     \u2551",
  "\u2551   Talk to your finances in plain English         \u2551",
  "\u2551   Powered by free AI  |  Indian SME Edition      \u2551",
  "\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d",
  'Type your question or "help". Type "exit" to quit.',
  ""
].join("\n");

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
