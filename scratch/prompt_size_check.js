const { getSnapshot, buildSystemPrompt } = require('../agent/queryAgent');
require('dotenv').config();

async function checkPromptSize() {
  const userId = 1;
  const snapshot = await getSnapshot(userId);
  const prompt = buildSystemPrompt(snapshot);
  
  console.log('--- Prompt Size Check ---');
  console.log(`Character count: ${prompt.length}`);
  console.log(`Estimated Token count (chars/4): ${Math.ceil(prompt.length / 4)}`);
  
  if (prompt.length > 4000) {
    console.warn('⚠️ Warning: Prompt might still be too large for Groq TPM limits.');
  } else {
    console.log('✅ Prompt size looks good for Groq free tier.');
  }

  console.log('\n--- Prompt Snippet ---');
  console.log(prompt.substring(0, 500) + '...');
}

checkPromptSize().catch(console.error);
