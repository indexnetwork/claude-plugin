import * as dotenv from 'dotenv';
import path from 'path';
import { OpportunityFinder } from './opportunity.finder';
import { UserMemoryProfile } from '../../intent/manager/intent.manager.types';
import { CandidateProfile } from './opportunity.finder.types';

// Load env
const envPath = path.resolve(__dirname, '../../../../.env.development');
dotenv.config({ path: envPath });

// Mock Data
const mockSourceProfile: UserMemoryProfile = {
    userId: 'source-user',
    identity: {
        bio: 'Senior Rust Developer looking for decentralized identity projects.',
        location: 'Berlin'
    },
    attributes: {
        interests: ['Rust', 'DID', 'Cryptography'],
        skills: ['Rust', 'WASM'],
        goals: ['Contribute to open source']
    },
    narrative: {
        aspirations: 'Build a privacy-preserving identity layer.'
    }
} as any;

const mockCandidates: CandidateProfile[] = [
    {
        userId: 'candidate-1',
        identity: {
            bio: 'Building a DID protocol in Rust. Need contributors.',
            location: 'Remote'
        },
        attributes: {
            interests: ['Rust', 'SSI'],
            skills: ['Rust', 'Libp2p']
        },
        narrative: {
            aspirations: 'Launch mainnet'
        }
    },
    {
        userId: 'candidate-2',
        identity: {
            bio: 'Frontend dev looking for assignments.',
            location: 'New York'
        },
        attributes: {
            interests: ['React', 'UI/UX'],
            skills: ['Typescript', 'React']
        },
        narrative: {
            aspirations: 'Find a job'
        }
    }
];

async function runTests() {
    console.log("🧪 Starting OpportunityFinder Tests...\n");

    const finder = new OpportunityFinder();

    try {
        // Test HyDE Query Generation (just for manual verification)
        console.log("1️⃣  Test: Generate HyDE Query");
        const hydeQuery = await finder.generateHydeQuery(mockSourceProfile);
        console.log("HyDE Query:", hydeQuery);
        if (hydeQuery && hydeQuery.length > 10) {
            console.log("✅ Passed (Generated HyDE query)\n");
        } else {
            console.error("❌ Failed (HyDE query empty or too short)\n");
        }

        // Test Find Opportunities (Analyze Stage)
        console.log("2️⃣  Test: Analyze Opportunities");
        const opportunities = await finder.findOpportunities(mockSourceProfile, mockCandidates);

        console.log(`Found ${opportunities.length} opportunities:\n`, JSON.stringify(opportunities, null, 2));

        const strongMatch = opportunities.find(op => op.candidateId === 'candidate-1');
        const weakMatch = opportunities.find(op => op.candidateId === 'candidate-2');

        if (strongMatch && strongMatch.score > 70) {
            console.log("✅ Passed (Found strong match for Rust dev)");
        } else {
            console.error("❌ Failed (Did not find expected strong match)");
        }

        if (!weakMatch || weakMatch.score < 50) {
            console.log("✅ Passed (Correctly filtered/low-scored weak match)");
        } else {
            console.error("⚠️ Warning (Weak match scored unexpectedly high)");
        }

    } catch (err) {
        console.error("❌ Error running OpportunityFinder:", err);
    }
}

runTests().catch(console.error);
