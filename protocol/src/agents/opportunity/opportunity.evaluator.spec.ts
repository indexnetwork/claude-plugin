import * as dotenv from 'dotenv';
import path from 'path';
import { OpportunityEvaluator } from './opportunity.evaluator';
import { UserMemoryProfile } from '../intent/manager/intent.manager.types';
import { CandidateProfile } from './opportunity.evaluator.types';

// Load env
const envPath = path.resolve(__dirname, '../../../../.env.development');
dotenv.config({ path: envPath });

// Mock Data
const mockSourceProfile: UserMemoryProfile = {
  userId: "testtesttest",
  "identity": {
    "name": "Seref Yarar",
    "bio": "Seref Yarar is currently the Co-Founder at Index Network, leveraging his extensive background in engineering to drive forward technological innovations, particularly focused on user privacy and decentralized networks.",
    "location": "Brooklyn, New York, United States"
  },
  "narrative": {
    "context": "Seref Yarar, based in Brooklyn, New York, operates in a dynamic and evolving tech landscape. He holds a strong academic background in Computer Engineering from Bahcesehir University. Initially making his mark as a Software Engineer and subsequently a Head of Engineering, Seref moved on to co-found GoWit Technology, where he held the role of CTO, developing advanced retail media advertisement platforms. Now, as the Co-Founder of Index Network, he leverages his engineering expertise to innovate within decentralized networks, focusing on custom search engines and data privacy protocols. His work involves collaboration with decentralized protocols and platforms such as Lit Protocol and Ceramic Network, aiming to empower users by giving them control over their data and interactions with digital content.",
    "aspirations": "Seref aspires to revolutionize how digital content is accessed and utilized. He is keenly interested in the integration of autonomous agents in everyday digital tasks to transform search engines and matchmaking services. Seeking to connect with like-minded professionals and developers, Seref aims to expand Index Network's influence to become a leader in decentralized and user-oriented data management solutions, ultimately creating technology that aligns with user privacy and personalization."
  },
  "attributes": {
    "goals": [
      "innovate within decentralized networks",
      "empower users by giving them control over their data and interactions with digital content"
    ],
    "interests": [
      "autonomous agents",
      "decentralized networks",
      "user privacy",
      "data interoperability"
    ],
    "skills": [
      "computer engineering",
      "software development",
      "technology innovation",
      "leadership",
      "data privacy"
    ]
  }
}

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

  const evaluator = new OpportunityEvaluator();

  try {
    // Test Find Opportunities (Analyze Stage)
    console.log("2️⃣  Test: Analyze Opportunities");
    const opportunities = await evaluator.evaluateOpportunities(mockSourceProfile, mockCandidates, {
      hydeDescription: "Third-person description of an ideal match who is a Rust expert."
    });

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

    // --- STABILITY CHECK ---
    console.log("\n3️⃣  Test: Score Stability (3 Iterations)");
    const iterations = 3;
    const scores: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const runOps = await evaluator.evaluateOpportunities(mockSourceProfile, mockCandidates, {
        hydeDescription: "Third-person description of an ideal match who is a Rust expert."
      });
      const match = runOps.find(op => op.candidateId === 'candidate-1');
      scores.push(match ? match.score : 0);
      process.stdout.write(`Run ${i + 1}: ${match?.score} | `);
    }
    console.log("\nScores:", scores);

    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const variance = maxScore - minScore;

    if (variance <= 5) {
      console.log(`✅ Passed (Score variance ${variance} is within limit <= 5)`);
    } else {
      console.error(`❌ Failed (Score variance ${variance} is too high)`);
      process.exit(1);
    }
    // -----------------------

  } catch (err) {
    console.error("❌ Error running OpportunityFinder:", err);
  }
}

runTests().catch(console.error);
