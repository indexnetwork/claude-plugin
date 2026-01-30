/**
 * Test script for Phase 1: Router Enhancement
 * 
 * This script tests the router's ability to correctly identify
 * read vs write operations for intent and profile queries.
 */

import { RouterAgent } from './router.agent';
import { log } from '../../../log';

// Test cases from architectural specification
const testCases = [
  // READ operations - should route to *_query
  {
    message: "what are my intents?",
    expectedTarget: "intent_query",
    expectedOperationType: "read",
    description: "Simple intent query"
  },
  {
    message: "show me my goals",
    expectedTarget: "intent_query",
    expectedOperationType: "read",
    description: "Display intents request"
  },
  {
    message: "list my current intentions",
    expectedTarget: "intent_query",
    expectedOperationType: "read",
    description: "List intents request"
  },
  {
    message: "do I have any active goals?",
    expectedTarget: "intent_query",
    expectedOperationType: "read",
    description: "Check intents status"
  },
  {
    message: "what's my profile?",
    expectedTarget: "profile_query",
    expectedOperationType: "read",
    description: "Profile query"
  },
  
  // WRITE operations - CREATE
  {
    message: "I want to learn Rust",
    expectedTarget: "intent_write",
    expectedOperationType: "create",
    description: "New intent creation"
  },
  {
    message: "looking for a co-founder",
    expectedTarget: "intent_write",
    expectedOperationType: "create",
    description: "Intent declaration"
  },
  {
    message: "I'm interested in AI",
    expectedTarget: "intent_write",
    expectedOperationType: "create",
    description: "Interest declaration"
  },
  
  // WRITE operations - UPDATE
  {
    message: "update my bio to senior engineer",
    expectedTarget: "profile_write",
    expectedOperationType: "update",
    description: "Profile update"
  },
  {
    message: "change my goal from Python to Rust",
    expectedTarget: "intent_write",
    expectedOperationType: "update",
    description: "Intent update"
  },
  
  // WRITE operations - DELETE
  {
    message: "remove my coding goal",
    expectedTarget: "intent_write",
    expectedOperationType: "delete",
    description: "Intent deletion"
  },
  {
    message: "I'm done with machine learning",
    expectedTarget: "intent_write",
    expectedOperationType: "delete",
    description: "Intent tombstone"
  }
];

async function runTests() {
  console.log('\n=== Phase 1: Router Enhancement Tests ===\n');
  
  const router = new RouterAgent();
  const profileContext = "Software engineer interested in Rust and AI";
  const activeIntents = "Learning Python, Building a startup";
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    try {
      console.log(`\n📝 Test: ${testCase.description}`);
      console.log(`   Message: "${testCase.message}"`);
      
      const result = await router.invoke(
        testCase.message,
        profileContext,
        activeIntents
      );
      
      const targetMatch = result.target === testCase.expectedTarget;
      const operationMatch = result.operationType === testCase.expectedOperationType;
      
      if (targetMatch && operationMatch) {
        console.log(`   ✅ PASS`);
        console.log(`      Target: ${result.target} (✓)`);
        console.log(`      Operation: ${result.operationType} (✓)`);
        console.log(`      Confidence: ${result.confidence.toFixed(2)}`);
        console.log(`      Reasoning: ${result.reasoning}`);
        passed++;
      } else {
        console.log(`   ❌ FAIL`);
        console.log(`      Expected: ${testCase.expectedTarget} / ${testCase.expectedOperationType}`);
        console.log(`      Got: ${result.target} / ${result.operationType}`);
        console.log(`      Confidence: ${result.confidence.toFixed(2)}`);
        console.log(`      Reasoning: ${result.reasoning}`);
        failed++;
      }
    } catch (error) {
      console.log(`   ❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
      failed++;
    }
  }
  
  console.log('\n=== Test Results ===');
  console.log(`Total: ${testCases.length}`);
  console.log(`Passed: ${passed} (${((passed / testCases.length) * 100).toFixed(1)}%)`);
  console.log(`Failed: ${failed}`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed! Phase 1 implementation is successful.\n');
  } else {
    console.log('\n⚠️  Some tests failed. Review the results above.\n');
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

export { runTests };
