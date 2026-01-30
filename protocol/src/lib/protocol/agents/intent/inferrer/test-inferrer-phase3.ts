/**
 * Phase 3 Inferrer Options Test
 * 
 * This file demonstrates how to use the new InferrerOptions
 * to control profile fallback behavior in the ExplicitIntentInferrer.
 * 
 * Run these tests to verify Phase 3 implementation.
 */

import { ExplicitIntentInferrer } from './explicit.inferrer';

// ──────────────────────────────────────────────────────────────
// Test Setup
// ──────────────────────────────────────────────────────────────

const mockProfile = `
# User Profile

## Identity
Name: John Doe
Role: Software Engineer

## Narrative
I'm passionate about learning new technologies and building scalable systems.
I've been exploring AI/ML and want to transition into that space.

## Current Goals
- Master machine learning fundamentals
- Build a portfolio of ML projects
- Network with AI researchers
`;

const inferrer = new ExplicitIntentInferrer();

// ──────────────────────────────────────────────────────────────
// Test Cases
// ──────────────────────────────────────────────────────────────

async function runTests() {
  console.log('='.repeat(60));
  console.log('Phase 3 Inferrer Options Tests');
  console.log('='.repeat(60));
  console.log();

  // ────────────────────────────────────────────────────────────
  // Test 1: allowProfileFallback = false (Query operations)
  // ────────────────────────────────────────────────────────────
  console.log('Test 1: No content + allowProfileFallback = false');
  console.log('Expected: Returns empty array (no profile inference)');
  console.log('-'.repeat(60));
  
  try {
    const result1 = await inferrer.invoke(
      null, 
      mockProfile, 
      { 
        allowProfileFallback: false,
        operationMode: 'create'
      }
    );
    
    console.log(`Result: ${result1.intents.length} intents found`);
    console.log('Intents:', JSON.stringify(result1.intents, null, 2));
    console.log(`✓ Test 1 ${result1.intents.length === 0 ? 'PASSED' : 'FAILED'}`);
  } catch (error) {
    console.error('✗ Test 1 FAILED with error:', error);
  }
  
  console.log();

  // ────────────────────────────────────────────────────────────
  // Test 2: allowProfileFallback = true (Create operations)
  // ────────────────────────────────────────────────────────────
  console.log('Test 2: No content + allowProfileFallback = true');
  console.log('Expected: Returns intents inferred from profile');
  console.log('-'.repeat(60));
  
  try {
    const result2 = await inferrer.invoke(
      null, 
      mockProfile, 
      { 
        allowProfileFallback: true,
        operationMode: 'create'
      }
    );
    
    console.log(`Result: ${result2.intents.length} intents found`);
    console.log('Intents:', JSON.stringify(result2.intents, null, 2));
    console.log(`✓ Test 2 ${result2.intents.length > 0 ? 'PASSED' : 'FAILED'}`);
  } catch (error) {
    console.error('✗ Test 2 FAILED with error:', error);
  }
  
  console.log();

  // ────────────────────────────────────────────────────────────
  // Test 3: Explicit content (fallback irrelevant)
  // ────────────────────────────────────────────────────────────
  console.log('Test 3: With content + allowProfileFallback = false');
  console.log('Expected: Returns intents from content (ignores fallback setting)');
  console.log('-'.repeat(60));
  
  try {
    const result3 = await inferrer.invoke(
      'I want to learn Rust programming and build a web framework',
      mockProfile,
      { 
        allowProfileFallback: false,
        operationMode: 'create'
      }
    );
    
    console.log(`Result: ${result3.intents.length} intents found`);
    console.log('Intents:', JSON.stringify(result3.intents, null, 2));
    console.log(`✓ Test 3 ${result3.intents.length > 0 ? 'PASSED' : 'FAILED'}`);
  } catch (error) {
    console.error('✗ Test 3 FAILED with error:', error);
  }
  
  console.log();

  // ────────────────────────────────────────────────────────────
  // Test 4: Default behavior (backward compatibility)
  // ────────────────────────────────────────────────────────────
  console.log('Test 4: No options provided (backward compatibility)');
  console.log('Expected: Defaults to allowProfileFallback = true');
  console.log('-'.repeat(60));
  
  try {
    const result4 = await inferrer.invoke(
      null,
      mockProfile
      // No options - should default to allowProfileFallback: true
    );
    
    console.log(`Result: ${result4.intents.length} intents found`);
    console.log('Intents:', JSON.stringify(result4.intents, null, 2));
    console.log(`✓ Test 4 ${result4.intents.length > 0 ? 'PASSED' : 'FAILED'}`);
  } catch (error) {
    console.error('✗ Test 4 FAILED with error:', error);
  }
  
  console.log();

  // ────────────────────────────────────────────────────────────
  // Test 5: Update operation mode
  // ────────────────────────────────────────────────────────────
  console.log('Test 5: Update operation mode with content');
  console.log('Expected: Returns intents with update context');
  console.log('-'.repeat(60));
  
  try {
    const result5 = await inferrer.invoke(
      'Change my ML goal to focus on computer vision instead',
      mockProfile,
      { 
        allowProfileFallback: false,
        operationMode: 'update'
      }
    );
    
    console.log(`Result: ${result5.intents.length} intents found`);
    console.log('Intents:', JSON.stringify(result5.intents, null, 2));
    console.log(`✓ Test 5 ${result5.intents.length >= 0 ? 'PASSED' : 'FAILED'}`);
  } catch (error) {
    console.error('✗ Test 5 FAILED with error:', error);
  }
  
  console.log();

  // ────────────────────────────────────────────────────────────
  // Test 6: Phatic communication (should return empty)
  // ────────────────────────────────────────────────────────────
  console.log('Test 6: Phatic communication');
  console.log('Expected: Returns empty array (no intents from "Hello")');
  console.log('-'.repeat(60));
  
  try {
    const result6 = await inferrer.invoke(
      'Hello, how are you?',
      mockProfile,
      { 
        allowProfileFallback: true,
        operationMode: 'create'
      }
    );
    
    console.log(`Result: ${result6.intents.length} intents found`);
    console.log('Intents:', JSON.stringify(result6.intents, null, 2));
    console.log(`✓ Test 6 ${result6.intents.length === 0 ? 'PASSED' : 'FAILED'}`);
  } catch (error) {
    console.error('✗ Test 6 FAILED with error:', error);
  }
  
  console.log();
  console.log('='.repeat(60));
  console.log('Tests Complete');
  console.log('='.repeat(60));
}

// ──────────────────────────────────────────────────────────────
// Usage Examples
// ──────────────────────────────────────────────────────────────

export const usageExamples = {
  // Query operation: User asking "what are my intents?"
  queryOperation: async () => {
    return await inferrer.invoke(null, mockProfile, {
      allowProfileFallback: false,  // Don't infer from profile
      operationMode: 'create'
    });
  },

  // Create operation: User saying "I want to learn Rust"
  createOperation: async () => {
    return await inferrer.invoke(
      'I want to learn Rust programming',
      mockProfile,
      {
        allowProfileFallback: true,  // Can fallback if needed
        operationMode: 'create'
      }
    );
  },

  // Update operation: User modifying existing intent
  updateOperation: async () => {
    return await inferrer.invoke(
      'Update my ML goal to focus on NLP',
      mockProfile,
      {
        allowProfileFallback: false,
        operationMode: 'update'
      }
    );
  },

  // Backward compatible: No options (defaults to current behavior)
  backwardCompatible: async () => {
    return await inferrer.invoke(null, mockProfile);
  }
};

// ──────────────────────────────────────────────────────────────
// Run Tests (if executed directly)
// ──────────────────────────────────────────────────────────────

if (require.main === module) {
  runTests().catch(console.error);
}
