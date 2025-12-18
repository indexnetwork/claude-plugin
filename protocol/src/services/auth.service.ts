import db from '../lib/db';
import { users, userNotificationSettings, OnboardingState } from '../lib/schema';
import { privyClient } from '../lib/privy';

export class AuthService {
    async setupDefaultPreferences(userId: string) {
        await db.insert(userNotificationSettings)
            .values({
                userId: userId,
                preferences: {
                    connectionUpdates: true,
                    weeklyNewsletter: true,
                }
            })
            .onConflictDoNothing();
    }

    calculateOnboardingState(currentOnboarding: OnboardingState, update: OnboardingState): OnboardingState {
        const { completedAt, flow, currentStep, indexId, invitationCode } = update;
        return {
            ...currentOnboarding,
            ...(completedAt !== undefined && { completedAt }),
            ...(flow !== undefined && { flow }),
            ...(currentStep !== undefined && { currentStep }),
            ...(indexId !== undefined && { indexId }),
            ...(invitationCode !== undefined && { invitationCode }),
        };
    }

    async getPrivyUser(privyId: string) {
        return await privyClient.getUserById(privyId);
    }
}
