const { getSnapshot } = require('../agent/queryAgent');
const { handleQuery } = require('../agent/langChainAgent');
require('dotenv').config();

async function runBenchmark() {
  const userId = 1; // Assuming user ID 1 exists
  
  console.log('--- Latency Benchmark ---');
  
  console.time('Cold Start Snapshot');
  await getSnapshot(userId);
  console.timeEnd('Cold Start Snapshot');

  console.time('Cached Snapshot');
  await getSnapshot(userId);
  console.timeEnd('Cached Snapshot');

  const query = 'What is my current cash balance?';
  console.log(`\nTesting Query: "${query}"`);
  
  console.time('First Query (Warm Cache)');
  await handleQuery(query, null, [], userId);
  console.timeEnd('First Query (Warm Cache)');

  console.time('Second Query (Cached)');
  await handleQuery(query, null, [], userId);
  console.timeEnd('Second Query (Cached)');
}

runBenchmark().catch(console.error);
