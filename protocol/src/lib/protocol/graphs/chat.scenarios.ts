/**
 * Central Scenario Definitions for Chat Agent Evaluation
 *
 * Aligned with the current 20-tool set and "Intent First" discovery pattern.
 *
 * This file contains all scenario specifications:
 * - User Personas: HOW users communicate
 * - User Needs: WHAT users want to accomplish (mapped to expected tool calls)
 * - Categories: grouping of needs for filtering
 *
 * Use `loadPregeneratedScenarios()` to get all need x persona combos,
 * then `filterScenarios()` to narrow by persona, tool, or category.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// USER PERSONAS - Communication Styles
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * User communication styles and patterns
 */
export const USER_PERSONAS = {
  DIRECT_REQUESTER: {
    id: "direct_requester" as const,
    description: "Gets straight to the point",
    communicationStyle: "direct, brief, action-oriented",
    examples: [
      "Find ML engineers",
      "Show my profile",
      "Create intent: hiring React devs",
    ],
  },
  EXPLORATORY_SEEKER: {
    id: "exploratory_seeker" as const,
    description: "Explores options before deciding",
    communicationStyle: "curious, asks follow-up questions, explores options",
    examples: [
      "I'm looking for AI engineers... what do you have?",
      "Can you help me find co-founders?",
      "Show me what's available in my network",
    ],
  },
  TECHNICAL_PRECISE: {
    id: "technical_precise" as const,
    description: "Provides detailed specifications",
    communicationStyle: "precise, technical, detailed requirements",
    examples: [
      "Find senior ML engineers with 5+ years PyTorch experience",
      "Update my profile: add Rust, remove Java from skills",
      "Create index: Fintech Builders, invite-only, for Series A founders",
    ],
  },
  VAGUE_REQUESTER: {
    id: "vague_requester" as const,
    description: "Unclear or ambiguous requests",
    communicationStyle: "vague, ambiguous, needs clarification",
    examples: [
      "Find someone helpful",
      "Update my stuff",
      "Show me things",
    ],
  },
} as const;

export type UserPersona = typeof USER_PERSONAS[keyof typeof USER_PERSONAS];
export type UserPersonaId = keyof typeof USER_PERSONAS;

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════════

export const CATEGORIES = {
  profile: "profile",
  intent: "intent",
  index: "index",
  intent_index: "intent_index",
  discovery: "discovery",
  url: "url",
  edge_case: "edge_case",
} as const;

export type Category = typeof CATEGORIES[keyof typeof CATEGORIES];

// ═══════════════════════════════════════════════════════════════════════════════
// USER NEEDS - Task Taxonomy
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Comprehensive User Needs Taxonomy for Chat Agent Evaluation
 *
 * Tools (20 total):
 *   Profile:       read_user_profiles, create_user_profile, update_user_profile
 *   Intent:        read_intents, create_intent, update_intent, delete_intent
 *   Intent-Index:  create_intent_index, read_intent_indexes, delete_intent_index
 *   Index:         read_indexes, read_users, create_index, update_index, delete_index, create_index_membership
 *   Opportunity:   create_opportunities, list_opportunities, send_opportunity
 *   Utility:       scrape_url
 *
 * Each need includes pre-generated example messages for different personas.
 */
export const CHAT_AGENT_USER_NEEDS = {
  // ═══════════════════════════════════════════════════════════════════════════════
  // PROFILE MANAGEMENT (Tools: read_user_profiles, create_user_profile, update_user_profile)
  // ═══════════════════════════════════════════════════════════════════════════════

  PROFILE_CREATE: {
    id: "profile_create" as const,
    category: "profile" as const,
    description: "User wants to create their profile",
    examples: [
      "Create my profile",
      "Set up my profile",
      "I'm a software engineer interested in AI",
    ],
    expectedTools: ["create_user_profile"],
    messages: {
      direct_requester: "Create my profile: software engineer, AI/ML, SF Bay Area",
      exploratory_seeker: "Hi! I'd like to set up my profile... how do I get started?",
      technical_precise: "Create profile with the following: Senior Software Engineer, 8 years experience, specialties in distributed systems and ML infrastructure, based in San Francisco",
      vague_requester: "I need a profile",
    },
  },

  PROFILE_VIEW: {
    id: "profile_view" as const,
    category: "profile" as const,
    description: "User wants to view their profile",
    examples: [
      "Show me my profile",
      "What's in my profile?",
      "View my information",
    ],
    expectedTools: ["read_user_profiles"],
    messages: {
      direct_requester: "Show my profile",
      exploratory_seeker: "Can I see what's in my profile?",
      technical_precise: "Display my complete profile information including all fields",
      vague_requester: "What do I have?",
    },
  },

  PROFILE_UPDATE: {
    id: "profile_update" as const,
    category: "profile" as const,
    description: "User wants to update their profile",
    examples: [
      "Update my bio to include blockchain experience",
      "Add Python to my skills",
      "Change my location to Austin",
    ],
    expectedTools: ["read_user_profiles", "update_user_profile"],
    messages: {
      direct_requester: "Add Python and Rust to my skills",
      exploratory_seeker: "I'd like to update my profile with some new skills... can you help?",
      technical_precise: "Update profile: add Python, Rust, and Kubernetes to skills; update location to Austin, TX",
      vague_requester: "Update my stuff",
    },
  },

  PROFILE_FROM_URL: {
    id: "profile_from_url" as const,
    category: "profile" as const,
    description: "User wants to create their profile from a social URL (LinkedIn, GitHub, etc.). URL is passed directly to create_user_profile — no scrape_url needed.",
    examples: [
      "Create my profile from linkedin.com/in/johndoe",
      "Use my GitHub to make my profile: github.com/jdoe",
      "Import my profile from my LinkedIn",
    ],
    expectedTools: ["create_user_profile"],
    messages: {
      direct_requester: "Create my profile from linkedin.com/in/johndoe",
      exploratory_seeker: "Can you import my profile from my LinkedIn at linkedin.com/in/johndoe?",
      technical_precise: "Generate my profile using my LinkedIn page at linkedin.com/in/johndoe and GitHub at github.com/jdoe",
      vague_requester: "Use my LinkedIn",
    },
  },

  PROFILE_UPDATE_FROM_URL: {
    id: "profile_update_from_url" as const,
    category: "profile" as const,
    description: "User already has a profile and wants to update it from a URL. Requires scrape_url first, then update_user_profile with scraped content.",
    examples: [
      "Update my profile with this GitHub: github.com/user",
      "Add info from my new portfolio site to my profile",
      "Refresh my profile from my LinkedIn",
    ],
    expectedTools: ["scrape_url", "update_user_profile"],
    messages: {
      direct_requester: "Update my profile with github.com/jdoe",
      exploratory_seeker: "I have a new portfolio site — can you update my profile from it? mysite.dev",
      technical_precise: "Scrape linkedin.com/in/johndoe and update my existing profile with the latest job title and skills",
      vague_requester: "Update my profile from my website",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // INTENT MANAGEMENT (Tools: read_intents, create_intent, update_intent, delete_intent)
  // ═══════════════════════════════════════════════════════════════════════════════

  INTENT_CREATE: {
    id: "intent_create" as const,
    category: "intent" as const,
    description: "User explicitly asks to create/add an intent (not expressing a discovery need)",
    examples: [
      "Add an intent: hiring React developers",
      "Create intent: Find AI ethics researchers",
      "Save this as an intent: looking for a CTO",
    ],
    expectedTools: ["create_intent"],
    messages: {
      direct_requester: "Create intent: Find AI ethics researchers",
      exploratory_seeker: "I'd like to save an intent about finding AI ethics researchers",
      technical_precise: "Create a new intent: Looking for AI ethics researchers with academic background, focus on fairness and interpretability",
      vague_requester: "Add an intent",
    },
  },

  INTENT_VIEW: {
    id: "intent_view" as const,
    category: "intent" as const,
    description: "User wants to see their intents",
    examples: [
      "Show me my intents",
      "What are my goals?",
      "List my active intents",
    ],
    expectedTools: ["read_intents"],
    messages: {
      direct_requester: "Show my intents",
      exploratory_seeker: "What goals do I have saved?",
      technical_precise: "List all my active intents with their descriptions",
      vague_requester: "What do I want?",
    },
  },

  INTENT_UPDATE: {
    id: "intent_update" as const,
    category: "intent" as const,
    description: "User wants to modify an existing intent",
    examples: [
      "Update my hiring intent to focus on senior engineers",
      "Change my co-founder intent",
      "Edit that intent to be more specific",
    ],
    expectedTools: ["read_intents", "update_intent"],
    messages: {
      direct_requester: "Update my hiring intent to focus on senior engineers only",
      exploratory_seeker: "Can I change that intent to be more specific?",
      technical_precise: "Update the hiring intent to: Seeking senior full-stack engineers with 5+ years React and Node.js expertise",
      vague_requester: "Change that thing",
    },
  },

  INTENT_DELETE: {
    id: "intent_delete" as const,
    category: "intent" as const,
    description: "User wants to remove an intent",
    examples: [
      "Delete my hiring intent",
      "Remove that intent",
      "I don't need the co-founder goal anymore",
    ],
    expectedTools: ["read_intents", "delete_intent"],
    messages: {
      direct_requester: "Delete my co-founder intent",
      exploratory_seeker: "I don't need that intent anymore... can you remove it?",
      technical_precise: "Archive the intent with description 'Looking for technical co-founder'",
      vague_requester: "Get rid of that",
    },
  },

  INTENT_FROM_URL: {
    id: "intent_from_url" as const,
    category: "intent" as const,
    description: "User shares a URL and wants to create an intent from the content. Requires scrape_url first, then create_intent with a conceptual summary.",
    examples: [
      "Create an intent from this project: github.com/org/cool-project",
      "I want to find people like this: example.com/article",
      "Make an intent from this link",
    ],
    expectedTools: ["scrape_url", "create_intent"],
    messages: {
      direct_requester: "Create an intent from github.com/org/ml-framework",
      exploratory_seeker: "I found this interesting project — can you help me find similar people? github.com/org/ml-framework",
      technical_precise: "Scrape github.com/org/ml-framework and create an intent based on the project's domain and technology stack",
      vague_requester: "Use this link for an intent: github.com/org/ml-framework",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // INDEX (COMMUNITY) MANAGEMENT (Tools: read_indexes, create_index, update_index, delete_index, read_users, create_index_membership)
  // ═══════════════════════════════════════════════════════════════════════════════

  INDEX_VIEW: {
    id: "index_view" as const,
    category: "index" as const,
    description: "User wants to see their indexes/communities",
    examples: [
      "Show me my communities",
      "What indexes am I in?",
      "List my groups",
    ],
    expectedTools: ["read_indexes"],
    messages: {
      direct_requester: "List my indexes",
      exploratory_seeker: "What communities am I part of?",
      technical_precise: "Display all indexes where I'm a member, including ownership status and member counts",
      vague_requester: "Show my groups",
    },
  },

  INDEX_CREATE: {
    id: "index_create" as const,
    category: "index" as const,
    description: "User wants to create a new community",
    examples: [
      "Create an index for fintech builders",
      "Start a community for AI founders",
      "Make a new group for product managers",
    ],
    expectedTools: ["create_index"],
    messages: {
      direct_requester: "Create index: AI Founders Network",
      exploratory_seeker: "I want to start a community for AI founders... how do I create one?",
      technical_precise: "Create a new index titled 'AI Founders Network' with prompt 'Community for AI/ML startup founders' and invite-only join policy",
      vague_requester: "Make a group",
    },
  },

  INDEX_UPDATE: {
    id: "index_update" as const,
    category: "index" as const,
    description: "User wants to modify their community settings (owner only)",
    examples: [
      "Update my index description",
      "Change the AI Founders index to be invite-only",
      "Edit the community title",
    ],
    expectedTools: ["read_indexes", "update_index"],
    messages: {
      direct_requester: "Make AI Founders index invite-only",
      exploratory_seeker: "Can I change my community settings to be more private?",
      technical_precise: "Update the AI Founders Network index: set join policy to invite-only",
      vague_requester: "Change the settings",
    },
  },

  INDEX_DELETE: {
    id: "index_delete" as const,
    category: "index" as const,
    description: "User wants to delete their community (owner only, sole member)",
    examples: [
      "Delete my test index",
      "Remove the Product Managers community",
      "Get rid of that empty index",
    ],
    expectedTools: ["read_indexes", "delete_index"],
    messages: {
      direct_requester: "Delete my Test Community index",
      exploratory_seeker: "I don't need that community anymore... can you delete it?",
      technical_precise: "Remove the index titled 'Test Community' that I own",
      vague_requester: "Delete that",
    },
  },

  INDEX_MEMBERS_VIEW: {
    id: "index_members_view" as const,
    category: "index" as const,
    description: "User wants to see who's in a community",
    examples: [
      "Who's in the AI Founders index?",
      "Show me members of my community",
      "List people in the fintech group",
    ],
    expectedTools: ["read_users"],
    messages: {
      direct_requester: "Show members in AI Founders",
      exploratory_seeker: "Who's in my community?",
      technical_precise: "List all members of the AI Founders Network index with their names and intent counts",
      vague_requester: "Who's in there?",
    },
  },

  INDEX_MEMBER_ADD: {
    id: "index_member_add" as const,
    category: "index" as const,
    description: "User wants to add someone to their community (owner only)",
    examples: [
      "Add Sarah to my fintech community",
      "Invite John to the AI Founders index",
      "Add this person to my group",
    ],
    expectedTools: ["create_index_membership"],
    messages: {
      direct_requester: "Add user Sarah Chen to AI Founders index",
      exploratory_seeker: "Can I invite someone to join my community?",
      technical_precise: "Add user to the AI Founders Network index as a member",
      vague_requester: "Add them",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // INTENT-INDEX LINKING (Tools: create_intent_index, read_intent_indexes, delete_intent_index)
  // ═══════════════════════════════════════════════════════════════════════════════

  INTENT_INDEX_LINK: {
    id: "intent_index_link" as const,
    category: "intent_index" as const,
    description: "User wants to add one of their intents to a specific community",
    examples: [
      "Add my hiring intent to the AI Founders index",
      "Link this intent to my community",
      "Put my co-founder goal in the fintech group",
    ],
    expectedTools: ["read_intents", "read_indexes", "create_intent_index"],
    messages: {
      direct_requester: "Add my hiring intent to AI Founders",
      exploratory_seeker: "Can I add my intent to the AI Founders community?",
      technical_precise: "Link my hiring intent to the AI Founders Network index",
      vague_requester: "Put it in there",
    },
  },

  INTENT_INDEX_VIEW: {
    id: "intent_index_view" as const,
    category: "intent_index" as const,
    description: "User wants to see all intents in a community (not just their own)",
    examples: [
      "Show all intents in the AI Founders index",
      "What goals are in my community?",
      "List everyone's intents in this group",
    ],
    expectedTools: ["read_intents"],
    messages: {
      direct_requester: "Show all intents in AI Founders",
      exploratory_seeker: "What is everyone looking for in our community?",
      technical_precise: "List all intents associated with the AI Founders Network index, including creator names",
      vague_requester: "What's in there?",
    },
  },

  INTENT_INDEX_UNLINK: {
    id: "intent_index_unlink" as const,
    category: "intent_index" as const,
    description: "User wants to remove their intent from a community",
    examples: [
      "Remove my hiring intent from this index",
      "Take my goal out of the fintech group",
      "Unlink this intent from the community",
    ],
    expectedTools: ["read_intents", "read_indexes", "delete_intent_index"],
    messages: {
      direct_requester: "Remove my hiring intent from AI Founders",
      exploratory_seeker: "Can I take that intent out of the community?",
      technical_precise: "Remove the link between my hiring intent and the AI Founders Network index",
      vague_requester: "Take it out",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // DISCOVERY (Tools: create_intent, create_opportunities, list_opportunities, send_opportunity)
  //
  // Intent First rules:
  //   - User expresses a NEW need  → create_intent (auto-triggers discovery)
  //   - User asks to discover WITHOUT a new need → create_opportunities + list_opportunities
  //   - User asks to LIST opportunities → list_opportunities
  //   - User asks to SEND a draft → list_opportunities + send_opportunity
  // ═══════════════════════════════════════════════════════════════════════════════

  // ── Intent First: user expresses a new need ──────────────────────────────

  DISCOVERY_HIRE: {
    id: "discovery_hire" as const,
    category: "discovery" as const,
    description: "User is looking to hire or recruit someone with specific skills.",
    examples: [
      "I need AI/ML engineers for my startup",
      "Find me a React developer",
      "Hiring a senior backend engineer",
    ],
    expectedTools: ["create_intent"],
    messages: {
      direct_requester: "I need AI/ML engineers for my startup",
      exploratory_seeker: "I'm building a team and looking for strong ML engineers... anyone around?",
      technical_precise: "I'm seeking senior ML engineers with 5+ years experience in deep learning and NLP for a Series A startup",
      vague_requester: "I need to find some people to hire",
    },
  },

  DISCOVERY_COFOUNDER: {
    id: "discovery_cofounder" as const,
    category: "discovery" as const,
    description: "User is looking for a co-founder or founding-team member.",
    examples: [
      "I'm looking for a technical co-founder",
      "Need a business co-founder for my AI startup",
      "Anyone interested in starting a company together?",
    ],
    expectedTools: ["create_intent"],
    messages: {
      direct_requester: "Looking for a technical co-founder for my fintech startup",
      exploratory_seeker: "I've got this startup idea but I need a co-founder... can you help?",
      technical_precise: "Seeking a technical co-founder with distributed systems expertise for a developer-tools startup, pre-seed stage",
      vague_requester: "I want a co-founder",
    },
  },

  DISCOVERY_COLLABORATE: {
    id: "discovery_collaborate" as const,
    category: "discovery" as const,
    description: "User wants to find collaborators for a project, research, or creative endeavor.",
    examples: [
      "Looking for someone to collaborate on an open-source project",
      "I want to co-author a paper on federated learning",
      "Anyone interested in building a side project together?",
    ],
    expectedTools: ["create_intent"],
    messages: {
      direct_requester: "Find collaborators for my open-source ML framework",
      exploratory_seeker: "I'm working on a research project about privacy-preserving AI and could use a collaborator... anyone interested?",
      technical_precise: "Looking for collaborators with experience in federated learning and differential privacy for a joint research paper",
      vague_requester: "I want to work on something with someone",
    },
  },

  DISCOVERY_IDEA_SHARE: {
    id: "discovery_idea_share" as const,
    category: "discovery" as const,
    description: "User wants to share ideas, get feedback, or find people interested in a topic.",
    examples: [
      "I want to discuss AI safety with others",
      "Anyone thinking about decentralized social networks?",
      "Looking for people to brainstorm edtech ideas with",
    ],
    expectedTools: ["create_intent"],
    messages: {
      direct_requester: "Find people interested in discussing AI alignment and safety",
      exploratory_seeker: "I've been thinking a lot about decentralized social media... anyone else exploring that space?",
      technical_precise: "Looking for individuals interested in exchanging ideas around on-device LLM inference and edge AI deployment strategies",
      vague_requester: "I want to talk about ideas with people",
    },
  },

  DISCOVERY_NETWORKING: {
    id: "discovery_networking" as const,
    category: "discovery" as const,
    description: "User wants to expand their professional network in a field or industry.",
    examples: [
      "I want to meet other founders in climate tech",
      "Connect me with people in the web3 space",
      "I'm new to the community, who should I know?",
    ],
    expectedTools: ["create_intent"],
    messages: {
      direct_requester: "Connect me with climate tech founders",
      exploratory_seeker: "I'm new here and want to get to know other people in the AI space... who should I meet?",
      technical_precise: "Looking to network with Series A and B founders in the developer-tools and infrastructure space",
      vague_requester: "I want to meet people",
    },
  },

  DISCOVERY_MENTOR: {
    id: "discovery_mentor" as const,
    category: "discovery" as const,
    description: "User is looking for a mentor or advisor in a specific domain.",
    examples: [
      "Find me a mentor in product management",
      "I need an advisor for my startup",
      "Who can mentor me on fundraising?",
    ],
    expectedTools: ["create_intent"],
    messages: {
      direct_requester: "Find me a mentor for early-stage fundraising",
      exploratory_seeker: "I could really use some guidance on product strategy... anyone who could mentor me?",
      technical_precise: "Seeking an experienced advisor with background in B2B SaaS go-to-market, ideally having raised Series A+",
      vague_requester: "I need a mentor",
    },
  },

  DISCOVERY_PEER: {
    id: "discovery_peer" as const,
    category: "discovery" as const,
    description: "User wants to find peers at a similar stage or with shared interests for mutual support.",
    examples: [
      "Find other solo founders to chat with",
      "Who else is working on AI agents?",
      "Looking for peers building in the education space",
    ],
    expectedTools: ["create_intent"],
    messages: {
      direct_requester: "Find other solo founders building AI products",
      exploratory_seeker: "Are there other people here who are also early-stage and working on something in AI?",
      technical_precise: "Looking for fellow pre-seed founders in the AI agent / LLM tooling space for peer accountability and knowledge exchange",
      vague_requester: "Anyone like me here?",
    },
  },

  DISCOVERY_INVESTOR: {
    id: "discovery_investor" as const,
    category: "discovery" as const,
    description: "User is looking for investors, funding, or fundraising connections.",
    examples: [
      "I want to connect with fintech investors",
      "Find angels interested in AI startups",
      "Looking for VCs focused on developer tools",
    ],
    expectedTools: ["create_intent"],
    messages: {
      direct_requester: "Find angel investors interested in AI infrastructure",
      exploratory_seeker: "I'm raising a pre-seed round... anyone here who invests in AI?",
      technical_precise: "Seeking seed-stage investors with portfolio focus on developer tools and AI infrastructure, check size 250K-1M",
      vague_requester: "I need funding",
    },
  },

  DISCOVERY_SERVICE: {
    id: "discovery_service" as const,
    category: "discovery" as const,
    description: "User is looking for a service provider, freelancer, or agency.",
    examples: [
      "I need a designer for my landing page",
      "Find me a DevOps consultant",
      "Looking for a legal advisor for my startup",
    ],
    expectedTools: ["create_intent"],
    messages: {
      direct_requester: "Find a freelance product designer for a SaaS dashboard",
      exploratory_seeker: "I need help with my landing page design... know anyone good?",
      technical_precise: "Looking for a contract DevOps engineer experienced with Kubernetes, Terraform, and GCP for a 3-month engagement",
      vague_requester: "I need help with something",
    },
  },

  // ── Discover using existing intents (no new need) ──────────────────────

  DISCOVERY_EXISTING: {
    id: "discovery_existing" as const,
    category: "discovery" as const,
    description: "User asks to discover or find opportunities without expressing a new need. Uses existing intents for discovery.",
    examples: [
      "Find me opportunities",
      "Who should I meet?",
      "Run discovery for me",
      "Any matches for my intents?",
    ],
    expectedTools: ["create_opportunities", "list_opportunities"],
    messages: {
      direct_requester: "Find me opportunities",
      exploratory_seeker: "Who should I connect with based on what I'm already looking for?",
      technical_precise: "Run discovery against my existing intents across all my indexes",
      vague_requester: "Find someone for me",
    },
  },

  // ── List / Send ────────────────────────────────────────────────────────

  DISCOVERY_LIST: {
    id: "discovery_list" as const,
    category: "discovery" as const,
    description: "User wants to see their existing opportunities (no new discovery)",
    examples: [
      "Show my opportunities",
      "Do I have any opportunities?",
      "List my suggested connections",
    ],
    expectedTools: ["list_opportunities"],
    messages: {
      direct_requester: "Show my opportunities",
      exploratory_seeker: "What connections have been suggested for me?",
      technical_precise: "List all my opportunities with status and confidence scores",
      vague_requester: "What do I have?",
    },
  },

  DISCOVERY_SEND: {
    id: "discovery_send" as const,
    category: "discovery" as const,
    description: "User wants to send/activate a draft opportunity",
    examples: [
      "Send intro to Sarah",
      "Send that opportunity",
      "Connect me with the first person",
    ],
    expectedTools: ["list_opportunities", "send_opportunity"],
    messages: {
      direct_requester: "Send the first opportunity",
      exploratory_seeker: "Can you send an intro to that person?",
      technical_precise: "Send the draft opportunity for the ML engineer match",
      vague_requester: "Send it",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // URL SCRAPING (Tool: scrape_url)
  // ═══════════════════════════════════════════════════════════════════════════════

  URL_SCRAPE: {
    id: "url_scrape" as const,
    category: "url" as const,
    description: "User wants to extract information from a URL (generic, not for profile or intent). Bare domains work — no https:// required.",
    examples: [
      "What's this article about? example.com/article",
      "Scrape this page for me",
      "What does this link say?",
    ],
    expectedTools: ["scrape_url"],
    messages: {
      direct_requester: "Scrape example.com/article",
      exploratory_seeker: "Can you tell me what's on this page? example.com/article",
      technical_precise: "Extract and summarize content from techblog.io/posts/scaling-ml-infra",
      vague_requester: "What's this? example.com/article",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════════

  CLARIFICATION_NEEDED: {
    id: "clarification_needed" as const,
    category: "edge_case" as const,
    description: "User request is too ambiguous to act on — agent should ask clarifying questions",
    examples: [
      "Help me",
      "Do something",
      "Update it",
    ],
    expectedTools: [],
    messages: {
      direct_requester: "Update it",
      exploratory_seeker: "Can you help me?",
      technical_precise: "Modify the resource",
      vague_requester: "Do something",
    },
  },

  MULTI_STEP_WORKFLOW: {
    id: "multi_step_workflow" as const,
    category: "edge_case" as const,
    description: "User request requires multiple tool calls in sequence",
    examples: [
      "Create a new index and add my hiring intent to it",
      "Show me my profile, intents, and opportunities",
      "Find mentors and send an intro to the best match",
    ],
    expectedTools: [],
    messages: {
      direct_requester: "Show my profile, intents, and communities",
      exploratory_seeker: "Can you give me an overview of everything I have?",
      technical_precise: "Fetch my profile, list my intents, and list my indexes in parallel",
      vague_requester: "Show me everything",
    },
  },

  NO_ACTION_NEEDED: {
    id: "no_action_needed" as const,
    category: "edge_case" as const,
    description: "User statement requires conversational response only — no tools",
    examples: [
      "Thanks for your help!",
      "That's perfect",
      "Great, I appreciate it",
    ],
    expectedTools: [],
    messages: {
      direct_requester: "Thanks",
      exploratory_seeker: "Thank you so much!",
      technical_precise: "Acknowledged",
      vague_requester: "Cool",
    },
  },
} as const;

export type UserNeed = (typeof CHAT_AGENT_USER_NEEDS)[keyof typeof CHAT_AGENT_USER_NEEDS];

// Convenience export for backward compatibility
export { CHAT_AGENT_USER_NEEDS as USER_NEEDS };

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO TYPE
// ═══════════════════════════════════════════════════════════════════════════════

export interface Scenario {
  id: string;
  needId: string;
  personaId: string;
  message: string;
  category: Category;
  tools: readonly string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRE-GENERATED SCENARIO LOADER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Load pre-generated scenarios from the definitions above (no LLM calls).
 * This is fast and deterministic.
 * Each scenario includes category and tools for easy filtering.
 */
export function loadPregeneratedScenarios(): Scenario[] {
  const scenarios: Scenario[] = [];

  const needIds = Object.keys(CHAT_AGENT_USER_NEEDS) as Array<keyof typeof CHAT_AGENT_USER_NEEDS>;
  const personaIds = Object.keys(USER_PERSONAS) as Array<keyof typeof USER_PERSONAS>;

  // Generate all combinations of need × persona
  for (const needId of needIds) {
    for (const personaId of personaIds) {
      const need = CHAT_AGENT_USER_NEEDS[needId];

      // Get pre-generated message for this persona
      const personaKey = USER_PERSONAS[personaId].id;
      const message = 'messages' in need && need.messages && personaKey in need.messages
        ? (need.messages as any)[personaKey] // eslint-disable-line @typescript-eslint/no-explicit-any
        : need.examples[0]; // Fallback to first example

      scenarios.push({
        id: `${needId}-${personaId}`,
        needId: String(needId),
        personaId: String(personaId),
        message,
        category: need.category,
        tools: need.expectedTools,
      });
    }
  }

  return scenarios;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILTER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Filter selectors. Pass "all" to any field to skip that filter.
 */
export interface ScenarioFilter {
  /** Persona key (e.g. "DIRECT_REQUESTER") or "all" */
  persona?: UserPersonaId | "all";
  /** Tool name (e.g. "create_intent") or "all" */
  tool?: string | "all";
  /** Category (e.g. "discovery") or "all" */
  category?: Category | "all";
}

/**
 * Filter scenarios by persona, tool, and/or category.
 * Each selector defaults to "all" when omitted.
 *
 * @example
 *   // All discovery scenarios for direct_requester persona
 *   filterScenarios(scenarios, { persona: "DIRECT_REQUESTER", category: "discovery" })
 *
 *   // Every scenario that uses create_intent
 *   filterScenarios(scenarios, { tool: "create_intent" })
 *
 *   // Everything (no filter)
 *   filterScenarios(scenarios, {})
 */
export function filterScenarios(
  scenarios: Scenario[],
  filter: ScenarioFilter = {},
): Scenario[] {
  const { persona = "all", tool = "all", category = "all" } = filter;

  return scenarios.filter((s) => {
    if (persona !== "all" && s.personaId !== persona) return false;
    if (category !== "all" && s.category !== category) return false;
    if (tool !== "all" && !s.tools.includes(tool)) return false;
    return true;
  });
}

/**
 * Convenience: all unique tool names across all needs.
 */
export function allToolNames(): string[] {
  const set = new Set<string>();
  const needIds = Object.keys(CHAT_AGENT_USER_NEEDS) as Array<keyof typeof CHAT_AGENT_USER_NEEDS>;
  for (const needId of needIds) {
    for (const t of CHAT_AGENT_USER_NEEDS[needId].expectedTools) set.add(t);
  }
  return [...set].sort();
}

/**
 * Convenience: all unique category values.
 */
export function allCategories(): Category[] {
  return Object.values(CATEGORIES);
}

/**
 * Convenience: all persona keys.
 */
export function allPersonaIds(): UserPersonaId[] {
  return Object.keys(USER_PERSONAS) as UserPersonaId[];
}
