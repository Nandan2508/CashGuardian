/**
 * Handles user queries for the CLI.
 * @param {string} userInput - Raw user input from the command line.
 * @returns {Promise<string>} Placeholder response while full routing is completed.
 */
async function handleQuery(userInput) {
  return `Query received: ${userInput}`;
}

module.exports = {
  handleQuery
};
