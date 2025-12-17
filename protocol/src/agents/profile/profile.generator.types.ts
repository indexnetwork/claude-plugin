export interface UserProfileIdentity {
    name: string;
    bio: string;
}

export interface UserProfileNarrative {
    context: string;
    aspirations: string;
}

export interface UserProfileAttributes {
    interests: string[];
    skills: string[];
}

export interface UserProfile {
    identity: UserProfileIdentity;
    narrative: UserProfileNarrative;
    attributes: UserProfileAttributes;
}

export interface ProfileGeneratorOutput {
    profile: UserProfile;
    implicitIntents: string[];
}

export interface ProfileGeneratorAgent {
    run(parallelData: any): Promise<ProfileGeneratorOutput>;
}
