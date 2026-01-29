import { ProfileDocument } from '../agents/profile/profile.generator';
/**
 * Abstract database interface for performing specific domain operations.
 * Decouples the protocol layer from the infrastructure layer.
 */
export interface Database {
  /**
   * Retrieves a user profile by userId.
   * @param userId - The unique identifier of the user
   * @returns The user's profile or null if not found
   */
  getProfile(userId: string): Promise<ProfileDocument | null>;

  /**
   * Creates or updates a user profile.
   * @param userId - The unique identifier of the user
   * @param profile - The profile data to save
   */
  saveProfile(userId: string, profile: ProfileDocument): Promise<void>;

  /**
   * Updates the HyDE (Hypothetical Document Embedding) fields for a user profile.
   * @param userId - The unique identifier of the user
   * @param description - The generated HyDE description
   * @param embedding - The vector embedding of the description
   */
  saveHydeProfile(userId: string, description: string, embedding: number[]): Promise<void>;

  /**
   * Retrieves basic user information (name, email, socials) by userId.
   * @param userId - The unique identifier of the user
   * @returns The user record or null if not found
   */
  getUser(userId: string): Promise<any | null>;
}

