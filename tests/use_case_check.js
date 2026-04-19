const { handleQuery } = require("../agent/queryAgent");
const { readFileSync } = require("fs");
const path = require("path");

async function runTest() {
  console.log("=== USE CASE ALIGNMENT VERIFICATION ===");
  
  // Load the enriched dataset
  const csvData = readFileSync(path.join(__dirname, "../data/test_13_week_dataset.csv"), "utf8");
  const lines = csvData.trim().split("\n");
  const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim());
  const customDataset = lines.slice(1).map(line => {
    const values = line.split(",");
    const obj = {};
    headers.forEach((h, i) => {
      const val = values[i] ? values[i].replace(/"/g, "").trim() : "";
      obj[h] = val;
    });
    return obj;
  });

  const testCases = [
    { 
      name: "UseCase 1: Understand Change", 
      query: "Why did my revenue drop last month?" 
    },
    { 
      name: "UseCase 2: Compare", 
      query: "Compare March vs February" 
    },
    { 
      name: "UseCase 3: Breakdown", 
      query: "What makes up my total sales?" 
    },
    { 
      name: "UseCase 4: Summarize", 
      query: "Give me a weekly summary" 
    }
  ];

  for (const tc of testCases) {
    console.log(`\n--- Testing ${tc.name} ---`);
    console.log(`Query: "${tc.query}"`);
    try {
      const result = await handleQuery(tc.query, customDataset);
      const output = typeof result === 'string' ? result : result.content;
      
      console.log("Response Snippet:", output.slice(0, 200) + "...");
      
      // Check for grounding indicators
      if (tc.name === "UseCase 1" && output.toLowerCase().includes("logistics")) {
        console.log("✅ Analysis grounded in category variances.");
      }
      if (tc.name === "UseCase 3" && output.includes("|")) {
        console.log("✅ Breakdown includes table/structure.");
      }
    } catch (err) {
      console.error(`❌ Error in ${tc.name}:`, err);
    }
  }
}

runTest();
