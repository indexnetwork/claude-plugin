import * as dotenv from 'dotenv';
import path from 'path';
import { ProfileGenerator } from './profile.generator';
import { ProfileGeneratorOutput } from './profile.generator.types';

// Load env
const envPath = path.resolve(__dirname, '../../../.env.development');
dotenv.config({ path: envPath });

async function runTests() {
    console.log("🧪 Starting ProfileGenerator Tests...\n");

    const generator = new ProfileGenerator();

    // Mock Parallel Data consistent with what we expect from the API
    const mockParallelData = {
        results: [
            {
                title: "Casey Harper - Rust Developer",
                content: "Casey is a passionate Rust developer working on distributed systems. She is currently building a new p2p protocol. She also loves hiking and coffee."
            },
            {
                title: "GitHub - charper",
                content: "Repositories: p2p-gossip, rust-async-runtime. Bio: Systems engineer. building the future of web3."
            }
        ]
    };

    console.log("1️⃣  Test: Generate Profile from Mock Data");
    try {
        const result: ProfileGeneratorOutput = await generator.run(mockParallelData);
        console.log("Generated Profile:\n", JSON.stringify(result, null, 2));

        const hasBio = !!result.profile.identity.bio;
        const hasInterests = result.profile.attributes.interests.length > 0;
        const hasImplicitIntents = result.implicitIntents.length > 0;
        const hasNarrative = !!result.profile.narrative.context && !!result.profile.narrative.aspirations;

        if (hasBio && hasInterests && hasImplicitIntents && hasNarrative) {
            console.log("✅ Passed (Profile generated with all required fields)");
        } else {
            console.error("❌ Failed (Missing some fields)");
            if (!hasBio) console.error(" - Missing Bio");
            if (!hasInterests) console.error(" - Missing Interests");
            if (!hasImplicitIntents) console.error(" - Missing Implicit Intents");
            if (!hasNarrative) console.error(" - Missing Narrative");
        }

    } catch (err) {
        console.error("❌ Error running ProfileGenerator:", err);
    }
}

runTests().catch(console.error);
