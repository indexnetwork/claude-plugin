import * as dotenv from 'dotenv';
import path from 'path';
import { HydeGeneratorAgent } from './hyde.generator';
import { UserMemoryProfile } from '../../../intent/manager/intent.manager.types';

// Load env
const envPath = path.resolve(__dirname, '../../../../../.env.development');
dotenv.config({ path: envPath });

// Mock Source Profile
const mockProfile: UserMemoryProfile = {
  userId: 'test-user-hyde',
  identity: {
    bio: 'I am a software engineer specializing in distributed systems and cryptography.',
    location: 'Berlin'
  },
  attributes: {
    interests: ['Rust', 'ZK-Rollups', 'P2P'],
    skills: ['Rust', 'Solidity', 'Protocol Design'],
    goals: ['Build a decentralized social network']
  },
  narrative: {
    aspirations: 'Create tools for digital sovereignty.'
  }
} as any;

async function runTests() {
  console.log("🧪 Starting Hyde Generator Tests...\n");

  const agent = new HydeGeneratorAgent();

  console.log("1️⃣  Test: Generate HyDE Description");
  try {
    const description = await agent.generate(mockProfile);
    console.log("Generated Description:\n", description);

    if (description && description.length > 50) {
      console.log("✅ Passed (Description generated and has sufficient length)");
    } else {
      console.error("❌ Failed (Description empty or too short)");
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Failed with error:", error);
    process.exit(1);
  }
}

// Check if running directly
if (require.main === module) {
  runTests().catch(console.error);
}

// Export for test runners if needed
export { runTests };
