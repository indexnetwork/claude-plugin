import { StateGraph, START, END } from "@langchain/langgraph";
import { ProfileGraphState } from "./profile.graph.state";
import { ProfileGenerator, ProfileDocument } from "../../agents/profile/profile.generator";
import { HydeGenerator } from "../../agents/profile/hyde/hyde.generator";
import { ProfileGraphDatabase } from "../../interfaces/database.interface";
import { Embedder } from "../../interfaces/embedder.interface";
import { Scraper } from "../../interfaces/scraper.interface";
import { log } from "../../../log";

/** Minimum length for input to be considered meaningful (e.g. not just "Yes") */
const MIN_MEANINGFUL_INPUT_LENGTH = 20;

/** Phrases that are confirmations only and must not be used as profile content */
const CONFIRMATION_PHRASES = new Set([
  "yes", "yeah", "yep", "sure", "ok", "okay", "go ahead", "do it", "please",
  "correct", "right", "exactly", "absolutely", "of course", "sounds good",
  "create one", "create it", "set one up", "set it up", "create my profile",
  "create profile", "set up profile", "create a profile"
]);

/**
 * Returns true only if the input contains real profile information.
 * Confirmation-only replies (e.g. "Yes" to "Would you like to create a profile?")
 * must not be treated as input so we ask for user info / use scraper instead of inventing a profile.
 */
function isMeaningfulProfileInput(input: string | undefined): boolean {
  if (!input || typeof input !== "string") return false;
  const trimmed = input.trim();
  if (trimmed.length < MIN_MEANINGFUL_INPUT_LENGTH) return false;
  const lower = trimmed.toLowerCase();
  if (CONFIRMATION_PHRASES.has(lower)) return false;
  if (CONFIRMATION_PHRASES.has(lower.replace(/[.!?]+$/, ""))) return false;
  return true;
}

/**
 * Factory class to build and compile the Profile Generation Graph.
 * 
 * Flow:
 * 1. check_state - Detect what's missing (profile, embeddings, hyde)
 * 2. Conditional routing based on operation mode and missing components:
 *    - Query mode: Return immediately (fast path)
 *    - Write mode: Generate only what's needed
 * 3. Profile generation (if needed)
 * 4. Profile embedding (if needed)
 * 5. HyDE generation (if needed or profile updated)
 * 6. HyDE embedding (if needed)
 * 
 * Key Features:
 * - Read/Write separation (query vs write)
 * - Conditional generation (skip expensive operations if data exists)
 * - Automatic hyde regeneration when profile is updated
 */
export class ProfileGraphFactory {
  constructor(
    private database: ProfileGraphDatabase,
    private embedder: Embedder,
    private scraper: Scraper
  ) { }

  public createGraph() {
    const profileGenerator = new ProfileGenerator();
    const hydeGenerator = new HydeGenerator();

    // ─────────────────────────────────────────────────────────
    // NODE: Check State
    // Loads existing profile from DB and detects what needs generation:
    // - Profile missing
    // - Profile embedding missing
    // - HyDE description missing
    // - HyDE embedding missing
    // - User information insufficient for scraping
    // ─────────────────────────────────────────────────────────
    const checkStateNode = async (state: typeof ProfileGraphState.State) => {
      if (!state.userId) {
        log.error("[Graph:Profile:CheckState] Missing userId");
        return {
          error: "userId is required"
        };
      }

      log.info("[Graph:Profile:CheckState] Checking profile state...", { 
        userId: state.userId,
        operationMode: state.operationMode,
        forceUpdate: state.forceUpdate
      });

      try {
        const profile = await this.database.getProfile(state.userId) as any;

        // Query mode: Just return the profile (fast path)
        if (state.operationMode === 'query') {
          log.info("[Graph:Profile:CheckState] 🚀 Query mode - returning existing profile (fast path)", {
            hasProfile: !!profile
          });
          return {
            profile: profile || undefined
          };
        }

        // Write mode: Detect what needs generation
        // Treat confirmation-only input (e.g. "Yes") as no input so we ask for info / use scraper
        const hasMeaningfulInput = !!state.input && isMeaningfulProfileInput(state.input);
        const needsProfileGeneration = !profile || (state.forceUpdate && hasMeaningfulInput);
        const needsProfileEmbedding = profile && (!profile.embedding || profile.embedding.length === 0);
        const needsHydeGeneration = !profile?.hydeDescription || (state.forceUpdate && hasMeaningfulInput);
        const needsHydeEmbedding = profile?.hydeDescription && (!profile.hydeEmbedding || profile.hydeEmbedding.length === 0);

        // Check if we need to scrape (profile generation needed but no meaningful input provided)
        const willNeedScraping = needsProfileGeneration && !hasMeaningfulInput;
        
        // If we need to scrape, check if we have sufficient user information
        let needsUserInfo = false;
        let missingUserInfo: string[] = [];

        if (willNeedScraping) {
          log.info("[Graph:Profile:CheckState] Will need scraping - checking user information...");
          
          const user = await this.database.getUser(state.userId);
          
          if (!user) {
            log.error("[Graph:Profile:CheckState] User not found", { userId: state.userId });
            return {
              error: `User not found: ${state.userId}`
            };
          }

          // Check what information we have from the user table (schema: users)
          // Required fields: email, name (always present)
          // Optional fields: intro, avatar, location, socials
          
          const hasSocials = !!(user.socials && (
            user.socials.x || 
            user.socials.linkedin || 
            user.socials.github || 
            (user.socials.websites && user.socials.websites.length > 0)
          ));
          
          // Check if name is a full name (not just email username)
          // For scraping to work well, we need first + last name
          const hasMeaningfulName = user.name && 
            user.name.trim() !== '' && 
            !user.name.includes('@') && 
            user.name.split(/\s+/).filter(Boolean).length >= 2;
          
          const hasLocation = !!(user.location && user.location.trim() !== '');

          // Minimum requirement for accurate scraping:
          // - At least ONE social link (preferred - most reliable for finding the right person)
          // - OR a full name (first + last) - less reliable but workable
          // Location helps disambiguate but is not required
          
          const hasMinimumInfo = hasSocials || hasMeaningfulName;

          if (!hasMinimumInfo) {
            needsUserInfo = true;
            
            // Build precise list of what's missing and would help
            if (!hasSocials) {
              missingUserInfo.push('social_urls');
            }
            if (!hasMeaningfulName) {
              missingUserInfo.push('full_name');
            }
            if (!hasLocation) {
              missingUserInfo.push('location'); // Nice to have
            }

            log.info("[Graph:Profile:CheckState] ⚠️ Insufficient user information for scraping", {
              hasSocials,
              hasMeaningfulName,
              hasLocation,
              currentName: user.name,
              missingUserInfo
            });
          } else {
            log.info("[Graph:Profile:CheckState] ✅ Sufficient user information for scraping", {
              hasSocials,
              hasMeaningfulName,
              hasLocation,
              willProceedWith: hasSocials ? 'social links' : 'full name'
            });
          }
        }

        log.info("[Graph:Profile:CheckState] 📊 State detection complete", {
          hasProfile: !!profile,
          needsProfileGeneration,
          needsProfileEmbedding,
          needsHydeGeneration,
          needsHydeEmbedding,
          needsUserInfo,
          missingUserInfo,
          forceUpdate: state.forceUpdate,
          hasInput: !!state.input,
          hasMeaningfulInput,
          hasHydeDescription: !!profile?.hydeDescription
        });

        return {
          profile: profile || undefined,
          hydeDescription: profile?.hydeDescription || undefined,
          needsProfileGeneration,
          needsProfileEmbedding,
          needsHydeGeneration,
          needsHydeEmbedding,
          needsUserInfo,
          missingUserInfo
        };
      } catch (error) {
        log.error("[Graph:Profile:CheckState] Failed to load profile", {
          error: error instanceof Error ? error.message : String(error)
        });
        return {
          profile: undefined,
          error: "Failed to load profile from database"
        };
      }
    };

    // ─────────────────────────────────────────────────────────
    // NODE: Scrape
    // Scrapes data from web if input is not provided
    // ─────────────────────────────────────────────────────────
    const scrapeNode = async (state: typeof ProfileGraphState.State) => {
      if (state.input && isMeaningfulProfileInput(state.input)) {
        log.info("[Graph:Profile:Scrape] Meaningful input already provided - skipping scrape");
        return {};
      }

      log.info("[Graph:Profile:Scrape] Starting web scrape...", { 
        userId: state.userId 
      });

      try {
        // Fetch user details to construct objective for web scraping
        const user = await this.database.getUser(state.userId);

        if (!user) {
          log.error("[Graph:Profile:Scrape] User not found", { userId: state.userId });
          return {
            error: `User not found: ${state.userId}`
          };
        }

        // Build scraping objective from available user information
        // Priority: social links (most reliable) > name + location > email
        const socialParts: string[] = [];
        if (user.socials) {
          if (user.socials.x) socialParts.push(`X/Twitter: ${user.socials.x}`);
          if (user.socials.linkedin) socialParts.push(`LinkedIn: ${user.socials.linkedin}`);
          if (user.socials.github) socialParts.push(`GitHub: ${user.socials.github}`);
          if (user.socials.websites && user.socials.websites.length > 0) {
            user.socials.websites.forEach((url: string) => socialParts.push(`Website: ${url}`));
          }
        }

        // Construct objective based on what we have
        let objective = `Find information about ${user.name || 'this person'}`;
        
        if (user.location) {
          objective += ` located in ${user.location}`;
        }
        
        objective += '.\n\n';
        
        if (socialParts.length > 0) {
          objective += `Their social profiles:\n${socialParts.join('\n')}\n\n`;
          objective += 'Use these links to find accurate information about their professional background, skills, and interests.';
        } else if (user.email) {
          objective += `Their email: ${user.email}\n\n`;
          objective += 'Search for professional information, skills, and background about this person.';
        } else {
          objective += 'Search for professional information and background about this person.';
        }

        log.info("[Graph:Profile:Scrape] Constructed scraping objective", { 
          hasSocials: socialParts.length > 0,
          hasLocation: !!user.location,
          objectivePreview: objective.substring(0, 100) 
        });
        
        const scrapedData = await this.scraper.scrape(objective);

        log.info("[Graph:Profile:Scrape] ✅ Scrape complete", {
          dataLength: scrapedData?.length || 0
        });

        return {
          objective,
          input: scrapedData,
          operationsPerformed: { scraped: true }
        };
      } catch (error) {
        log.error("[Graph:Profile:Scrape] Scrape failed", {
          error: error instanceof Error ? error.message : String(error)
        });
        return {
          error: "Web scrape failed"
        };
      }
    };

    // ─────────────────────────────────────────────────────────
    // NODE: Generate Profile
    // Generates profile from input using ProfileGenerator agent.
    // If updating existing profile, merges new information intelligently.
    // ─────────────────────────────────────────────────────────
    const generateProfileNode = async (state: typeof ProfileGraphState.State) => {
      if (!state.input) {
        log.error("[Graph:Profile:Generate] No input provided for profile generation");
        return {
          error: "Input required for profile generation"
        };
      }

      log.info("[Graph:Profile:Generate] Starting profile generation...", {
        hasExistingProfile: !!state.profile,
        isUpdate: state.forceUpdate,
        inputLength: state.input.length
      });

      try {
        // If updating existing profile, include it in the input for context
        let inputWithContext = state.input;
        if (state.profile && state.forceUpdate) {
          inputWithContext = `EXISTING PROFILE:\n${JSON.stringify(state.profile, null, 2)}\n\nNEW INFORMATION:\n${state.input}\n\nPlease merge the new information with the existing profile, preserving all relevant existing data and updating/adding new details as appropriate.`;
          log.info("[Graph:Profile:Generate] Merging with existing profile");
        }

        const result = await profileGenerator.invoke(inputWithContext);

        log.info("[Graph:Profile:Generate] ✅ Profile generated successfully", {
          name: result.output.identity.name,
          skillsCount: result.output.attributes.skills.length,
          interestsCount: result.output.attributes.interests.length
        });

        return {
          profile: {
            ...result.output,
            userId: state.userId,
            embedding: [] as number[] | number[][]
          },
          // Mark that hyde needs regeneration since profile was updated
          needsHydeGeneration: true,
          operationsPerformed: { generatedProfile: true }
        };
      } catch (error) {
        log.error("[Graph:Profile:Generate] Profile generation failed", {
          error: error instanceof Error ? error.message : String(error)
        });
        return {
          error: "Profile generation failed"
        };
      }
    };

    // ─────────────────────────────────────────────────────────
    // NODE: Embed & Save Profile
    // Generates embedding for profile and saves to DB
    // ─────────────────────────────────────────────────────────
    const embedSaveProfileNode = async (state: typeof ProfileGraphState.State) => {
      if (!state.profile) {
        log.error("[Graph:Profile:EmbedSave] Profile missing in embed step");
        return {
          error: "Profile missing in embed step"
        };
      }

      log.info("[Graph:Profile:EmbedSave] Starting profile embedding...", {
        userId: state.userId
      });

      try {
        const profile = { ...state.profile };
        const textToEmbed = [
          '# Identity',
          '## Name', profile.identity.name,
          '## Bio', profile.identity.bio,
          '## Location', profile.identity.location,
          '# Narrative',
          '## Context', profile.narrative.context,
          '# Attributes',
          '## Interests', profile.attributes.interests.join(', '),
          '## Skills', profile.attributes.skills.join(', ')
        ].join('\n');

        log.info("[Graph:Profile:EmbedSave] Generating embedding...", {
          textLength: textToEmbed.length
        });
        
        const embedding = await this.embedder.generate(textToEmbed);
        profile.embedding = embedding;

        log.info("[Graph:Profile:EmbedSave] Saving profile to DB...", { 
          userId: state.userId,
          embeddingDimensions: Array.isArray(embedding[0]) ? embedding[0].length : embedding.length
        });

        await this.database.saveProfile(state.userId, profile);

        log.info("[Graph:Profile:EmbedSave] ✅ Profile saved successfully");

        return { 
          profile,
          operationsPerformed: { embeddedProfile: true }
        };
      } catch (error) {
        log.error("[Graph:Profile:EmbedSave] Failed to embed/save profile", {
          error: error instanceof Error ? error.message : String(error)
        });
        return {
          error: "Failed to embed/save profile"
        };
      }
    };


    // ─────────────────────────────────────────────────────────
    // NODE: Generate HyDE
    // Generates Hypothetical Document Embedding description for profile matching
    // ─────────────────────────────────────────────────────────
    const generateHydeNode = async (state: typeof ProfileGraphState.State) => {
      if (!state.profile) {
        log.error("[Graph:Profile:HyDE] Profile missing for HyDE generation");
        return {
          error: "Profile missing for HyDE generation"
        };
      }

      log.info("[Graph:Profile:HyDE] Starting HyDE generation...", {
        userId: state.userId,
        profileName: state.profile.identity.name
      });

      try {
        const profileString = JSON.stringify(state.profile, null, 2);
        const result = await hydeGenerator.invoke(profileString);

        log.info("[Graph:Profile:HyDE] ✅ HyDE generated successfully", {
          descriptionLength: result.textToEmbed.length
        });

        return { 
          hydeDescription: result.textToEmbed,
          operationsPerformed: { generatedHyde: true }
        };
      } catch (error) {
        log.error("[Graph:Profile:HyDE] HyDE generation failed", {
          error: error instanceof Error ? error.message : String(error)
        });
        return {
          error: "HyDE generation failed"
        };
      }
    };

    // ─────────────────────────────────────────────────────────
    // NODE: Embed & Save HyDE
    // Generates embedding for HyDE description and saves to DB
    // ─────────────────────────────────────────────────────────
    const embedSaveHydeNode = async (state: typeof ProfileGraphState.State) => {
      if (!state.hydeDescription) {
        log.error("[Graph:Profile:HyDEEmbed] HyDE description missing");
        return {
          error: "HyDE description missing"
        };
      }

      log.info("[Graph:Profile:HyDEEmbed] Starting HyDE embedding...", {
        userId: state.userId,
        descriptionLength: state.hydeDescription.length
      });

      try {
        const hydeEmbedding = await this.embedder.generate(state.hydeDescription);

        // Normalize embedding if needed (Adapters usually handle this, but to be sure)
        const flatHydeEmbedding = Array.isArray(hydeEmbedding[0]) 
          ? (hydeEmbedding as number[][])[0] 
          : (hydeEmbedding as number[]);

        log.info("[Graph:Profile:HyDEEmbed] Saving HyDE to DB...", { 
          userId: state.userId,
          embeddingDimensions: flatHydeEmbedding.length
        });

        await this.database.saveHydeProfile(state.userId, state.hydeDescription, flatHydeEmbedding);

        log.info("[Graph:Profile:HyDEEmbed] ✅ HyDE saved successfully");

        return {
          operationsPerformed: { embeddedHyde: true }
        };
      } catch (error) {
        log.error("[Graph:Profile:HyDEEmbed] Failed to embed/save HyDE", {
          error: error instanceof Error ? error.message : String(error)
        });
        return {
          error: "Failed to embed/save HyDE"
        };
      }
    };

    // ─────────────────────────────────────────────────────────
    // ROUTING CONDITIONS
    // Smart conditional routing based on operation mode and missing components
    // ─────────────────────────────────────────────────────────

    /**
     * Route from check_state to next step based on operation mode and detected needs.
     */
    const checkStateCondition = (state: typeof ProfileGraphState.State): string => {
      // Query mode: Return immediately (fast path)
      if (state.operationMode === 'query') {
        log.info("[Graph:Profile:RouteCondition] Query mode - ending (fast path)");
        return END;
      }

      // Check if user information is insufficient for scraping
      // Return early so chat graph can request the missing information
      if (state.needsUserInfo) {
        log.info("[Graph:Profile:RouteCondition] ⚠️ Insufficient user info - requesting from user", {
          missingInfo: state.missingUserInfo
        });
        return END;
      }

      // Write mode: Check what needs generation
      if (state.needsProfileGeneration) {
        // Only use provided input if it's meaningful (not just "Yes" / confirmation)
        if (state.input && isMeaningfulProfileInput(state.input)) {
          log.info("[Graph:Profile:RouteCondition] Profile generation needed with meaningful input provided");
          return "generate_profile";
        } else {
          log.info("[Graph:Profile:RouteCondition] Profile generation needed - scraping first (no meaningful input)");
          return "scrape";
        }
      }

      // Profile exists but missing embedding
      if (state.needsProfileEmbedding) {
        log.info("[Graph:Profile:RouteCondition] Profile embedding needed");
        return "embed_save_profile";
      }

      // Profile and embedding exist, check hyde
      if (state.needsHydeGeneration) {
        log.info("[Graph:Profile:RouteCondition] HyDE generation needed");
        return "generate_hyde";
      }

      // Hyde exists but missing embedding
      if (state.needsHydeEmbedding) {
        log.info("[Graph:Profile:RouteCondition] HyDE embedding needed");
        return "embed_save_hyde";
      }

      // Everything exists and is up to date
      log.info("[Graph:Profile:RouteCondition] All components exist - ending");
      return END;
    };

    /**
     * Route after profile embedding to check if hyde needs generation.
     */
    const afterProfileEmbeddingCondition = (state: typeof ProfileGraphState.State): string => {
      // If profile was just generated/updated, regenerate hyde
      if (state.needsHydeGeneration || state.forceUpdate) {
        log.info("[Graph:Profile:RouteCondition] Profile updated - regenerating HyDE");
        return "generate_hyde";
      }

      // Check if hyde embedding is missing
      if (state.needsHydeEmbedding) {
        log.info("[Graph:Profile:RouteCondition] HyDE embedding needed");
        return "embed_save_hyde";
      }

      log.info("[Graph:Profile:RouteCondition] Profile complete - ending");
      return END;
    };

    /**
     * Route after hyde generation to embedding step.
     * Always embed after generating hyde.
     */
    const afterHydeGenerationCondition = (state: typeof ProfileGraphState.State): string => {
      log.info("[Graph:Profile:RouteCondition] HyDE generated - proceeding to embedding");
      return "embed_save_hyde";
    };


    // ─────────────────────────────────────────────────────────
    // GRAPH ASSEMBLY
    // Conditional flow based on operation mode and detected needs
    // ─────────────────────────────────────────────────────────

    const workflow = new StateGraph(ProfileGraphState)
      // Add all nodes
      .addNode("check_state", checkStateNode)
      .addNode("scrape", scrapeNode)
      .addNode("generate_profile", generateProfileNode)
      .addNode("embed_save_profile", embedSaveProfileNode)
      .addNode("generate_hyde", generateHydeNode)
      .addNode("embed_save_hyde", embedSaveHydeNode)

      // Start with state check
      .addEdge(START, "check_state")

      // Conditional routing from check_state
      .addConditionalEdges(
        "check_state",
        checkStateCondition,
        {
          scrape: "scrape",                     // Need profile, no input -> scrape first
          generate_profile: "generate_profile", // Need profile, have input -> generate
          embed_save_profile: "embed_save_profile", // Have profile, need embedding
          generate_hyde: "generate_hyde",       // Have profile+embedding, need hyde
          embed_save_hyde: "embed_save_hyde",   // Have hyde, need embedding
          [END]: END                            // Query mode or everything exists
        }
      )

      // Scrape -> Generate profile (linear)
      .addEdge("scrape", "generate_profile")
      
      // Generate profile -> Embed profile (linear)
      .addEdge("generate_profile", "embed_save_profile")

      // After profile embedding, check if hyde needs generation
      .addConditionalEdges(
        "embed_save_profile",
        afterProfileEmbeddingCondition,
        {
          generate_hyde: "generate_hyde",     // Profile updated -> regenerate hyde
          embed_save_hyde: "embed_save_hyde", // Only hyde embedding missing
          [END]: END                          // Everything complete
        }
      )

      // After hyde generation, always embed it
      .addConditionalEdges(
        "generate_hyde",
        afterHydeGenerationCondition,
        {
          embed_save_hyde: "embed_save_hyde"
        }
      )

      // Hyde embedding -> END (linear)
      .addEdge("embed_save_hyde", END);

    log.info("[ProfileGraphFactory] Graph built successfully");
    return workflow.compile();
  }
}
