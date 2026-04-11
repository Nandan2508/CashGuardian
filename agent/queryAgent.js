/**
 * Handles user queries for the CLI.
 */
async function handleQuery(userInput) {
  return `Query received: ${userInput}`;
}

module.exports = {
  handleQuery
};
