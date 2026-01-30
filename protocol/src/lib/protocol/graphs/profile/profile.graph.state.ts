import { Annotation } from "@langchain/langgraph";
import { ProfileDocument } from "../../agents/profile/profile.generator";

/**
 * The Graph State for Profile Generation.
 */
export const ProfileGraphState = Annotation.Root({
  // --- Inputs (Required at start) ---
  /**
   * The User ID to link the profile to.
   */
  userId: Annotation<string>,

  // --- Intermediate State ---

  /**
   * Internal objective constructed from user data.
   */
  objective: Annotation<string | undefined>({
    reducer: (curr, next) => next,
    default: () => undefined,
  }),

  /**
   * Raw input data (either provided or scraped).
   */
  input: Annotation<string | undefined>({
    reducer: (curr, next) => next,
    default: () => undefined,
  }),

  /**
   * The generated profile document.
   */
  profile: Annotation<ProfileDocument | undefined>({
    reducer: (curr, next) => next,
    default: () => undefined,
  }),

  // --- Output ---

  /**
   * The generated HyDE description string from the HydeGenerator.
   */
  hydeDescription: Annotation<string | undefined>({
    reducer: (curr, next) => next,
    default: () => undefined,
  }),

  /**
   * Flag to force profile regeneration even if profile exists.
   * When true with new input, the graph will re-generate and update the profile.
   */
  forceUpdate: Annotation<boolean>({
    reducer: (curr, next) => next,
    default: () => false,
  }),
});
