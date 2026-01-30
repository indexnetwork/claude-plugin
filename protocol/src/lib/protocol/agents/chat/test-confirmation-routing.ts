/**
 * Test case for confirmation routing bug fix
 * 
 * This test verifies that the router agent correctly detects confirmations
 * in conversation context and routes them to the appropriate write operations.
 * 
 * Bug: User says "Yes" to confirm an intent update, but router routes to "respond"
 * instead of "intent_write", causing the response generator to hallucinate the update.
 * 
 * Fix: Router now accepts conversation history and detects confirmation patterns.
 */

import { RouterAgent } from './router.agent';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { config } from 'dotenv';

config({ path: '.env.development', override: true });

// ═══════════════════════════════════════════════════════════════
// Test Setup
// ═══════════════════════════════════════════════════════════════

const router = new RouterAgent();

// ═══════════════════════════════════════════════════════════════
// Test Case 1: Confirmation After Intent Update Suggestion
// ═══════════════════════════════════════════════════════════════

async function testConfirmationAfterIntentSuggestion() {
  console.log('\n' + '═'.repeat(60));
  console.log('TEST 1: Confirmation After Intent Update Suggestion');
  console.log('═'.repeat(60));
  
  // Simulate conversation history where assistant suggested an update
  const conversationHistory = [
    new HumanMessage("I want to create an RPG game"),
    new AIMessage("I've noted your intent to create an RPG game. Should I update it to be more specific, like 'Create a text-based RPG game with LLM-enhanced narration'?"),
  ];
  
  const userMessage = "Yes";
  const profileContext = "Name: Test User\nBio: Software developer";
  const activeIntents = "Create an RPG game with LLM-enhanced narration";
  
  console.log('\n📋 Context:');
  console.log('Previous conversation shows assistant suggesting an update');
  console.log('User responds with: "Yes"');
  console.log('\n🎯 Expected: intent_write with operationType: update');
  console.log('🐛 Bug behavior: respond with operationType: null\n');
  
  const result = await router.invoke(
    userMessage,
    profileContext,
    activeIntents,
    conversationHistory
  );
  
  console.log('📊 Result:');
  console.log(`  Target: ${result.target}`);
  console.log(`  Operation Type: ${result.operationType}`);
  console.log(`  Confidence: ${result.confidence}`);
  console.log(`  Reasoning: ${result.reasoning}`);
  
  // Validation
  const passed = result.target === 'intent_write' && result.operationType === 'update';
  console.log(`\n${passed ? '✅ PASS' : '❌ FAIL'}: Confirmation detected and routed correctly`);
  
  return passed;
}

// ═══════════════════════════════════════════════════════════════
// Test Case 2: Confirmation with "Sure"
// ═══════════════════════════════════════════════════════════════

async function testConfirmationWithSure() {
  console.log('\n' + '═'.repeat(60));
  console.log('TEST 2: Confirmation with "Sure"');
  console.log('═'.repeat(60));
  
  const conversationHistory = [
    new HumanMessage("Can you delete my coding goal?"),
    new AIMessage("I can help with that. Should I delete your intent about 'Learn advanced TypeScript'?"),
  ];
  
  const userMessage = "Sure, go ahead";
  const profileContext = "Name: Test User";
  const activeIntents = "Learn advanced TypeScript";
  
  console.log('\n📋 Context:');
  console.log('Assistant asks for deletion confirmation');
  console.log('User responds with: "Sure, go ahead"');
  console.log('\n🎯 Expected: intent_write with operationType: delete\n');
  
  const result = await router.invoke(
    userMessage,
    profileContext,
    activeIntents,
    conversationHistory
  );
  
  console.log('📊 Result:');
  console.log(`  Target: ${result.target}`);
  console.log(`  Operation Type: ${result.operationType}`);
  console.log(`  Confidence: ${result.confidence}`);
  console.log(`  Reasoning: ${result.reasoning}`);
  
  const passed = result.target === 'intent_write' && result.operationType === 'delete';
  console.log(`\n${passed ? '✅ PASS' : '❌ FAIL'}: Deletion confirmation detected correctly`);
  
  return passed;
}

// ═══════════════════════════════════════════════════════════════
// Test Case 3: Confirmation with "Okay" for Creation
// ═══════════════════════════════════════════════════════════════

async function testConfirmationWithOkay() {
  console.log('\n' + '═'.repeat(60));
  console.log('TEST 3: Confirmation with "Okay" for Creation');
  console.log('═'.repeat(60));
  
  const conversationHistory = [
    new HumanMessage("I'm interested in learning Rust"),
    new AIMessage("Would you like me to create an intent for 'Learn Rust programming language'?"),
  ];
  
  const userMessage = "Okay";
  const profileContext = "Name: Test User";
  const activeIntents = "No active intents.";
  
  console.log('\n📋 Context:');
  console.log('Assistant suggests creating a new intent');
  console.log('User responds with: "Okay"');
  console.log('\n🎯 Expected: intent_write with operationType: create\n');
  
  const result = await router.invoke(
    userMessage,
    profileContext,
    activeIntents,
    conversationHistory
  );
  
  console.log('📊 Result:');
  console.log(`  Target: ${result.target}`);
  console.log(`  Operation Type: ${result.operationType}`);
  console.log(`  Confidence: ${result.confidence}`);
  console.log(`  Reasoning: ${result.reasoning}`);
  
  const passed = result.target === 'intent_write' && result.operationType === 'create';
  console.log(`\n${passed ? '✅ PASS' : '❌ FAIL'}: Creation confirmation detected correctly`);
  
  return passed;
}

// ═══════════════════════════════════════════════════════════════
// Test Case 4: No Conversation History (Baseline)
// ═══════════════════════════════════════════════════════════════

async function testNoConversationHistory() {
  console.log('\n' + '═'.repeat(60));
  console.log('TEST 4: No Conversation History (Baseline)');
  console.log('═'.repeat(60));
  
  const userMessage = "Yes";
  const profileContext = "Name: Test User";
  const activeIntents = "No active intents.";
  
  console.log('\n📋 Context:');
  console.log('No conversation history provided');
  console.log('User says: "Yes" (ambiguous without context)');
  console.log('\n🎯 Expected: respond or clarify (no write operation)\n');
  
  const result = await router.invoke(
    userMessage,
    profileContext,
    activeIntents
    // No conversation history
  );
  
  console.log('📊 Result:');
  console.log(`  Target: ${result.target}`);
  console.log(`  Operation Type: ${result.operationType}`);
  console.log(`  Confidence: ${result.confidence}`);
  console.log(`  Reasoning: ${result.reasoning}`);
  
  const passed = (result.target === 'respond' || result.target === 'clarify') && 
                 result.operationType === null;
  console.log(`\n${passed ? '✅ PASS' : '❌ FAIL'}: Ambiguous "Yes" without context handled correctly`);
  
  return passed;
}

// ═══════════════════════════════════════════════════════════════
// Test Case 5: Negative Confirmation
// ═══════════════════════════════════════════════════════════════

async function testNegativeConfirmation() {
  console.log('\n' + '═'.repeat(60));
  console.log('TEST 5: Negative Confirmation (Rejection)');
  console.log('═'.repeat(60));
  
  const conversationHistory = [
    new HumanMessage("I want to learn Python"),
    new AIMessage("Should I create an intent for 'Learn Python programming'?"),
  ];
  
  const userMessage = "No, actually I changed my mind";
  const profileContext = "Name: Test User";
  const activeIntents = "No active intents.";
  
  console.log('\n📋 Context:');
  console.log('Assistant suggests creating an intent');
  console.log('User responds with: "No, actually I changed my mind"');
  console.log('\n🎯 Expected: respond (acknowledge rejection, no write)\n');
  
  const result = await router.invoke(
    userMessage,
    profileContext,
    activeIntents,
    conversationHistory
  );
  
  console.log('📊 Result:');
  console.log(`  Target: ${result.target}`);
  console.log(`  Operation Type: ${result.operationType}`);
  console.log(`  Confidence: ${result.confidence}`);
  console.log(`  Reasoning: ${result.reasoning}`);
  
  const passed = result.target === 'respond' && result.operationType === null;
  console.log(`\n${passed ? '✅ PASS' : '❌ FAIL'}: Negative confirmation handled correctly`);
  
  return passed;
}

// ═══════════════════════════════════════════════════════════════
// Run All Tests
// ═══════════════════════════════════════════════════════════════

async function runAllTests() {
  console.log('\n');
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║  CONFIRMATION ROUTING FIX - TEST SUITE                   ║');
  console.log('╚' + '═'.repeat(58) + '╝');
  console.log('\nTesting router agent with conversation history...\n');
  
  const results = await Promise.all([
    testConfirmationAfterIntentSuggestion(),
    testConfirmationWithSure(),
    testConfirmationWithOkay(),
    testNoConversationHistory(),
    testNegativeConfirmation(),
  ]);
  
  const passCount = results.filter(r => r).length;
  const totalCount = results.length;
  
  console.log('\n' + '═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));
  console.log(`\nTests Passed: ${passCount}/${totalCount}`);
  console.log(`Success Rate: ${((passCount / totalCount) * 100).toFixed(1)}%\n`);
  
  if (passCount === totalCount) {
    console.log('🎉 All tests passed! The confirmation routing fix is working correctly.\n');
  } else {
    console.log('⚠️  Some tests failed. Review the results above for details.\n');
  }
}

// Run tests
runAllTests().catch(console.error);
