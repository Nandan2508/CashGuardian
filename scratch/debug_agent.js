const { handleQuery } = require("./agent/queryAgent");

async function test() {
  try {
    const res = await handleQuery("What is my current cash balance?");
    console.log("Response:", res);
  } catch (err) {
    console.error("Caught Error:", err);
  }
}

test();
