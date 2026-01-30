/**
 * Test case for response generator hallucination prevention
 * 
 * This test verifies that the response generator does NOT claim successful
 * database operations when none actually occurred.
 * 
 * Bug: Response generator receives conversation context and "assumes" operations
 * succeeded, claiming "I've updated your intent..." when target was "respond"
 * with no actual database writes.
 * 
 * Fix: Added validation warnings in formatSubgraphResults() to prevent
 * hallucinated confirmations.
 */

import { ResponseGeneratorAgent } from './response.generator';
import type { RouterOutput } from './router.agent';
import type { SubgraphResults } from './response.generator';
import { config } from 'dotenv';

config({ path: '.env.development', override: true });

// ═══════════════════════════════════════════════════════════════
// Test Setup
// ═══════════════════════════════════════════════════════════════

const responseGenerator = new ResponseGeneratorAgent();

// ═══════════════════════════════════════════════════════════════
// Test Case 1: No Actions with Respond Target (Hallucination Scenario)
// ═══════════════════════════════════════════════════════════════

async function testNoActionsRespondTarget() {
  console.log('\n' + '═'.repeat(60));
  console.log('TEST 1: No Actions with Respond Target');
  console.log('═'.repeat(60));
  
  const routingDecision: RouterOutput = {
    target: 'respond',
    operationType: null,
    confidence: 0.9,
    reasoning: 'General conversation',
    extractedContext: null
  };
  
  // Empty subgraph results - no actual operations performed
  const subgraphResults: SubgraphResults = {};
  
  const userMessage = "Yes";
  
  console.log('\n📋 Context:');
  console.log('Router target: respond (no write operation)');
  console.log('Subgraph results: empty (no actions taken)');
  console.log('User message: "Yes"');
  console.log('\n🎯 Expected: Response should NOT claim updates were made');
  console.log('🐛 Bug behavior: "I\'ve updated your intent..." (hallucination)\n');
  
  const formattedResults = responseGenerator.formatSubgraphResults(subgraphResults);
  
  console.log('📊 Formatted Results:');
  console.log(formattedResults);
  console.log();
  
  // Validation
  const hasWarning = formattedResults.includes('WARNING') || 
                     formattedResults.includes('No subgraph results available');
  
  console.log(`\n${hasWarning ? '✅ PASS' : '❌ FAIL'}: Validation warning present when no actions taken`);
  
  return hasWarning;
}

// ═══════════════════════════════════════════════════════════════
// Test Case 2: Intent Write with No Actions (Edge Case)
// ═══════════════════════════════════════════════════════════════

async function testIntentWriteNoActions() {
  console.log('\n' + '═'.repeat(60));
  console.log('TEST 2: Intent Write Target with No Actions');
  console.log('═'.repeat(60));
  
  const routingDecision: RouterOutput = {
    target: 'intent_write',
    operationType: 'update',
    confidence: 0.85,
    reasoning: 'Update intent detected',
    extractedContext: null
  };
  
  // Intent processing occurred but produced no actions (validation failure case)
  const subgraphResults: SubgraphResults = {
    intent: {
      mode: 'write',
      actions: [],  // Empty actions array - no database writes!
      inferredIntents: ['Create a text-based RPG game']
    }
  };
  
  const userMessage = "Update my intent to be text-based";
  
  console.log('\n📋 Context:');
  console.log('Router target: intent_write (update expected)');
  console.log('Subgraph results: intent.actions = [] (empty!)');
  console.log('User message: "Update my intent to be text-based"');
  console.log('\n🎯 Expected: Warning that no database operations occurred\n');
  
  const formattedResults = responseGenerator.formatSubgraphResults(subgraphResults);
  
  console.log('📊 Formatted Results:');
  console.log(formattedResults);
  console.log();
  
  // Validation
  const hasWarning = formattedResults.includes('WARNING') && 
                     formattedResults.includes('No actual database operations');
  
  console.log(`\n${hasWarning ? '✅ PASS' : '❌ FAIL'}: Warning shown for empty actions array`);
  
  return hasWarning;
}

// ═══════════════════════════════════════════════════════════════
// Test Case 3: Successful Update with Actions (Positive Case)
// ═══════════════════════════════════════════════════════════════

async function testSuccessfulUpdateWithActions() {
  console.log('\n' + '═'.repeat(60));
  console.log('TEST 3: Successful Update with Actions');
  console.log('═'.repeat(60));
  
  const routingDecision: RouterOutput = {
    target: 'intent_write',
    operationType: 'update',
    confidence: 0.95,
    reasoning: 'Update intent detected',
    extractedContext: null
  };
  
  // Successful update with actual database action
  const subgraphResults: SubgraphResults = {
    intent: {
      mode: 'write',
      actions: [{
        type: 'update',
        id: 'intent-123',
        payload: 'Create a text-based RPG game with LLM-enhanced narration',
        score: 0.9,
        reasoning: 'Updated based on user request',
        intentMode: 'ATTRIBUTIVE'
      }],
      inferredIntents: ['Create a text-based RPG game with LLM-enhanced narration']
    }
  };
  
  const userMessage = "Make it text-based";
  
  console.log('\n📋 Context:');
  console.log('Router target: intent_write (update)');
  console.log('Subgraph results: 1 UPDATE action present');
  console.log('User message: "Make it text-based"');
  console.log('\n🎯 Expected: Show UPDATE action, NO warnings\n');
  
  const formattedResults = responseGenerator.formatSubgraphResults(subgraphResults);
  
  console.log('📊 Formatted Results:');
  console.log(formattedResults);
  console.log();
  
  // Validation
  const hasUpdateAction = formattedResults.includes('UPDATE') && 
                          formattedResults.includes('intent-123');
  const noWarnings = !formattedResults.includes('VALIDATION WARNING');
  
  const passed = hasUpdateAction && noWarnings;
  
  console.log(`\n${passed ? '✅ PASS' : '❌ FAIL'}: Successful update shown correctly without false warnings`);
  
  return passed;
}

// ═══════════════════════════════════════════════════════════════
// Test Case 4: Query Mode (Read Operations)
// ═══════════════════════════════════════════════════════════════

async function testQueryMode() {
  console.log('\n' + '═'.repeat(60));
  console.log('TEST 4: Query Mode (Read Operations)');
  console.log('═'.repeat(60));
  
  const routingDecision: RouterOutput = {
    target: 'intent_query',
    operationType: 'read',
    confidence: 0.95,
    reasoning: 'User asking about intents',
    extractedContext: null
  };
  
  // Query results - no validation warnings expected
  const subgraphResults: SubgraphResults = {
    intent: {
      mode: 'query',
      intents: [
        {
          id: 'intent-1',
          description: 'Learn Rust programming',
          summary: 'Focus on systems programming',
          createdAt: new Date('2026-01-15')
        },
        {
          id: 'intent-2',
          description: 'Build a CLI tool',
          createdAt: new Date('2026-01-20')
        }
      ],
      count: 2
    }
  };
  
  const userMessage = "What are my intents?";
  
  console.log('\n📋 Context:');
  console.log('Router target: intent_query (read)');
  console.log('Subgraph results: 2 intents found');
  console.log('User message: "What are my intents?"');
  console.log('\n🎯 Expected: Show intents, NO validation warnings\n');
  
  const formattedResults = responseGenerator.formatSubgraphResults(subgraphResults);
  
  console.log('📊 Formatted Results:');
  console.log(formattedResults);
  console.log();
  
  // Validation
  const hasIntents = formattedResults.includes('Learn Rust programming') &&
                     formattedResults.includes('Build a CLI tool');
  const noWarnings = !formattedResults.includes('VALIDATION WARNING');
  
  const passed = hasIntents && noWarnings;
  
  console.log(`\n${passed ? '✅ PASS' : '❌ FAIL'}: Query mode displays correctly without false warnings`);
  
  return passed;
}

// ═══════════════════════════════════════════════════════════════
// Test Case 5: Create Action Present
// ═══════════════════════════════════════════════════════════════

async function testCreateActionPresent() {
  console.log('\n' + '═'.repeat(60));
  console.log('TEST 5: Create Action Present');
  console.log('═'.repeat(60));
  
  const routingDecision: RouterOutput = {
    target: 'intent_write',
    operationType: 'create',
    confidence: 0.92,
    reasoning: 'New intent creation detected',
    extractedContext: null
  };
  
  const subgraphResults: SubgraphResults = {
    intent: {
      mode: 'write',
      actions: [{
        type: 'create',
        payload: 'Learn functional programming with Haskell',
        score: 0.85,
        reasoning: 'New learning goal',
        intentMode: 'ATTRIBUTIVE',
        referentialAnchor: null,
        semanticEntropy: 0.2
      }],
      inferredIntents: ['Learn functional programming with Haskell']
    }
  };
  
  const userMessage = "I want to learn functional programming with Haskell";
  
  console.log('\n📋 Context:');
  console.log('Router target: intent_write (create)');
  console.log('Subgraph results: 1 CREATE action present');
  console.log('User message: "I want to learn functional programming with Haskell"');
  console.log('\n🎯 Expected: Show CREATE action, NO warnings\n');
  
  const formattedResults = responseGenerator.formatSubgraphResults(subgraphResults);
  
  console.log('📊 Formatted Results:');
  console.log(formattedResults);
  console.log();
  
  // Validation
  const hasCreateAction = formattedResults.includes('CREATE') && 
                          formattedResults.includes('functional programming');
  const noWarnings = !formattedResults.includes('VALIDATION WARNING');
  
  const passed = hasCreateAction && noWarnings;
  
  console.log(`\n${passed ? '✅ PASS' : '❌ FAIL'}: Create action shown correctly`);
  
  return passed;
}

// ═══════════════════════════════════════════════════════════════
// Run All Tests
// ═══════════════════════════════════════════════════════════════

async function runAllTests() {
  console.log('\n');
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║  RESPONSE GENERATOR VALIDATION - TEST SUITE              ║');
  console.log('╚' + '═'.repeat(58) + '╝');
  console.log('\nTesting response generator hallucination prevention...\n');
  
  const results = await Promise.all([
    testNoActionsRespondTarget(),
    testIntentWriteNoActions(),
    testSuccessfulUpdateWithActions(),
    testQueryMode(),
    testCreateActionPresent(),
  ]);
  
  const passCount = results.filter(r => r).length;
  const totalCount = results.length;
  
  console.log('\n' + '═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));
  console.log(`\nTests Passed: ${passCount}/${totalCount}`);
  console.log(`Success Rate: ${((passCount / totalCount) * 100).toFixed(1)}%\n`);
  
  if (passCount === totalCount) {
    console.log('🎉 All tests passed! The response generator validation is working correctly.\n');
  } else {
    console.log('⚠️  Some tests failed. Review the results above for details.\n');
  }
}

// Run tests
runAllTests().catch(console.error);
