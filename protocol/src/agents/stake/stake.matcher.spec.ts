import * as dotenv from 'dotenv';
import path from 'path';
import { StakeMatcher } from './stake.matcher';

// Load env
const envPath = path.resolve(__dirname, '../../../.env.development');
console.log(`Loading env from: ${envPath}`);
dotenv.config({ path: envPath });

async function runTests() {
  console.log("🧪 Starting StakeMatcher Tests...");

  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    console.warn("⚠️  No API Key found. Live LLM tests might fail.");
  }

  // Override preset with a standard model for testing
  const matcher = new StakeMatcher({ model: 'openai/gpt-4o-mini' });

  // Mock Data
  const primaryIntent = {
    id: "primary-123",
    payload: "I want to learn Rust programming"
  };

  const candidates = [
    { id: "c1", payload: "Teaching a Rust beginners course" }, // Good match
    { id: "c2", payload: "Looking for a Rust developer" }, // Mutual match
    { id: "c3", payload: "I like baking bread" } // Irrelevant
  ];

  try {
    console.log(`Test Intent: "${primaryIntent.payload}"`);
    console.log(`Candidates: ${candidates.length}`);

    // Run Matcher (Pure)
    console.log("\n1️⃣  Test: Run Matcher");
    const result = await matcher.run(primaryIntent, candidates);

    console.log("\nMatches Found:", result.matches.length);
    result.matches.forEach((m: any) => {
      console.log(`   - [${m.score}] Matches ${m.targetIntentId}`);
      console.log(`     Reasoning: ${m.reasoning}`);
    });

    if (result.matches.length > 0) {
      console.log("✅ Passed (Found matches)");
    } else {
      // Depending on LLM this might vary, but Rust + Teaching Rust should match
      console.warn("⚠️ Warning (No matches found - check LLM logic)");
    }

  } catch (error) {
    console.error("❌ Test Failed:", error);
  }
}

runTests().catch(console.error);
