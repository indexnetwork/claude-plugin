import { Router, Response, Request } from 'express';
import { privyClient } from '../lib/privy';
import { authenticatePrivy, AuthRequest } from '../middleware/auth';
import db from '../lib/db';
import { users, userNotificationSettings, userProfiles, intents } from '../lib/schema';
import { eq, isNull, and, or } from 'drizzle-orm';
import { ExplicitIntentDetector } from '../agents/intent/inferrer/explicit.inferrer';
import { UserMemoryProfile, ActiveIntent } from '../agents/intent/manager/intent.manager.types';
import { checkAndTriggerSocialSync, checkAndTriggerEnrichment } from '../lib/integrations/social-sync';
import { searchUser } from '../lib/parallel/parallel';
import { json2md } from '../lib/json2md/json2md';
import { ProfileGenerator } from '../agents/profile/profile.generator';

const router = Router();

// Verify access token and get user info
router.get('/me', authenticatePrivy, async (req: AuthRequest, res: Response) => {
  try {
    const userResult = await db.select({
      user: users,
      settings: userNotificationSettings,
      profile: userProfiles
    })
      .from(users)
      .leftJoin(userNotificationSettings, eq(users.id, userNotificationSettings.userId))
      .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
      .where(eq(users.id, req.user!.id))
      .limit(1);

    if (userResult.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { user, settings, profile } = userResult[0];

    // Merge settings into user object for frontend compatibility
    const userWithPreferences = {
      ...user,
      profile, // Include the profile object
      notificationPreferences: settings?.preferences || {
        connectionUpdates: true,
        weeklyNewsletter: true,
      }
    };

    return res.json({ user: userWithPreferences });
  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json({ error: 'Failed to get user info' });
  }
});

// Update user profile
router.patch('/profile', authenticatePrivy, async (req: AuthRequest, res: Response) => {
  try {
    const { name, intro, avatar, location, timezone, socials, notificationPreferences } = req.body;
    const userId = req.user!.id;

    // Get old socials before update
    const currentUser = await db.select({ socials: users.socials })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const oldSocials = currentUser[0]?.socials || null;

    // Update user fields in 'users' table (legacy support)
    // Note: 'intro' is deprecated in users table, we only use userProfiles.bio
    const updatedUserResult = await db.update(users)
      .set({
        ...(name && { name }),
        ...(avatar && { avatar }),
        ...(location !== undefined && { location }),
        ...(timezone !== undefined && { timezone }),
        ...(socials !== undefined && { socials }),
        updatedAt: new Date()
      })
      .where(eq(users.id, userId))
      .returning();

    if (updatedUserResult.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Upsert into 'user_profiles' table (new schema)
    // We map 'intro' to 'bio'
    // Upsert into 'user_profiles' table (new schema with identity)
    if (intro !== undefined || location !== undefined || name !== undefined) {
      const existingProfileRes = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
      const existingIdentity = existingProfileRes[0]?.identity || { name: updatedUserResult[0].name, bio: '', location: '' };

      const newIdentity = {
        name: name || existingIdentity.name,
        bio: intro !== undefined ? intro : existingIdentity.bio,
        location: location !== undefined ? location : existingIdentity.location
      };

      await db.insert(userProfiles)
        .values({
          userId: userId,
          identity: newIdentity,
        })
        .onConflictDoUpdate({
          target: userProfiles.userId,
          set: {
            identity: newIdentity,
            updatedAt: new Date()
          }
        });

      // Trigger background intent generation if bio (intro) changed
      if (intro !== undefined) {
        (async () => {
          try {
            console.log('Triggering background intent generation for profile update', userId);

            // 1. Fetch User Profile & Intents
            const [profileData, activeIntentsData] = await Promise.all([
              db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1),
              db.select().from(intents).where(and(
                eq(intents.userId, userId),
                isNull(intents.archivedAt)
              ))
            ]);

            if (!profileData.length) return;
            let userProfile = profileData[0];

            // Validate and Repair Profile if attributes or narrative are missing
            const hasAttributes = userProfile.attributes &&
              ((userProfile.attributes.interests?.length || 0) > 0 || (userProfile.attributes.skills?.length || 0) > 0);
            const hasNarrative = !!userProfile.narrative;

            if (!hasAttributes || !hasNarrative) {
              console.log('Profile incomplete (missing attributes/narrative), triggering repair via ProfileGenerator', userId);
              // Use the new bio (intro) if available, otherwise existing bio
              // Use the new bio (intro) if available, otherwise existing identity bio
              const bioToUse = intro || userProfile.identity?.bio || '';

              if (bioToUse) {
                try {
                  const generator = new ProfileGenerator();
                  // Generate comprehensive profile structure
                  const generated = await generator.run(bioToUse);

                  console.log('Profile generated:', JSON.stringify(generated.profile, null, 2));

                  // Ensure identity location is string
                  const fixedIdentity = {
                    ...generated.profile.identity,
                    location: generated.profile.identity.location || ''
                  };

                  // Update DB with repaired data
                  await db.update(userProfiles)
                    .set({
                      identity: fixedIdentity,
                      narrative: generated.profile.narrative,
                      attributes: generated.profile.attributes,
                      updatedAt: new Date()
                    })
                    .where(eq(userProfiles.id, userProfile.id));

                  // Update local variable for immediate usage
                  userProfile = {
                    ...userProfile,
                    identity: fixedIdentity,
                    narrative: generated.profile.narrative,
                    attributes: generated.profile.attributes
                  };
                  console.log('Profile repaired successfully');
                } catch (e) {
                  console.error('Profile repair failed:', e);
                }
              } else {
                console.warn('Cannot repair profile: No bio available');
              }
            }

            // 2. Prepare Agents Data
            const attributes = userProfile.attributes || { interests: [], skills: [] };
            const identity = userProfile.identity || { name: updatedUserResult[0].name || 'User', bio: '', location: '' };

            const memoryProfile: UserMemoryProfile = {
              userId: userId,
              identity: {
                name: identity.name,
                bio: identity.bio,
                location: identity.location
              },
              narrative: userProfile.narrative || undefined,
              attributes: {
                interests: attributes.interests || [],
                skills: attributes.skills || [],
                goals: [] // ProfileGenerator doesn't output structured goals array yet
              }
            };

            const activeIntents: ActiveIntent[] = activeIntentsData.map(i => ({
              id: i.id,
              description: i.payload,
              status: 'active',
              created_at: i.createdAt.getTime()
            }));

            // 3. Run Inferrer
            const detector = new ExplicitIntentDetector();
            // User instructed: "Just need to infer intents from what is available" (the profile).
            const content = null;

            const result = await detector.run(content, memoryProfile, activeIntents);
            console.log('Intent detection result:', JSON.stringify(result));

            // 4. Execute Actions
            if (result.actions && result.actions.length > 0) {
              for (const action of result.actions) {
                if (action.type === 'create') {
                  // Deduplicate: Check if active intent with same payload exists? 
                  // The detector should handle this via activeIntents list, but let's be safe?
                  // No, detector returns "create" only if not present usually.
                  await db.insert(intents).values({
                    userId: userId,
                    payload: action.payload,
                  });
                  console.log(`Created intent: ${action.payload}`);
                }
                // Handle expire/update eventually
              }
            }
          } catch (err) {
            console.error('Background intent generation failed:', err);
          }
        })();
      }
    }

    // Update notification preferences if provided
    let updatedPreferences = null;
    if (notificationPreferences !== undefined) {
      const existingSettings = await db.select()
        .from(userNotificationSettings)
        .where(eq(userNotificationSettings.userId, userId))
        .limit(1);

      if (existingSettings.length > 0) {
        const settings = await db.update(userNotificationSettings)
          .set({
            preferences: notificationPreferences,
            updatedAt: new Date()
          })
          .where(eq(userNotificationSettings.userId, userId))
          .returning();
        updatedPreferences = settings[0].preferences;
      } else {
        const settings = await db.insert(userNotificationSettings)
          .values({
            userId: userId,
            preferences: notificationPreferences
          })
          .returning();
        updatedPreferences = settings[0].preferences;
      }
    } else {
      // Fetch existing preferences if not updating
      const settings = await db.select()
        .from(userNotificationSettings)
        .where(eq(userNotificationSettings.userId, userId))
        .limit(1);
      updatedPreferences = settings[0]?.preferences || {
        connectionRequest: true,
        connectionAccepted: true,
        connectionRejected: true,
        weeklyNewsletter: true,
      };
    }

    // Trigger social sync if socials changed
    if (socials !== undefined) {
      checkAndTriggerSocialSync(userId, oldSocials, socials);
    }

    // Removed: checkAndTriggerEnrichment(userId) - Enrichment should not trigger on manual profile edits.

    // Return the updated user object. Merge profile data if needed?
    // Use the fetched/updated profile data or just return what we have.
    // Ideally we should return the merged profile like /me does?
    // Current frontend expects 'user' object. user profiles fields (bio/location) are mirrored in 'users' for now?
    // Yes, we updated 'users' table too.

    const finalUser = {
      ...updatedUserResult[0],
      notificationPreferences: updatedPreferences
    };

    return res.json({ user: finalUser });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Update onboarding state
router.patch('/onboarding-state', authenticatePrivy, async (req: AuthRequest, res: Response) => {
  try {
    const { completedAt, flow, currentStep, indexId, invitationCode } = req.body;

    // Get current onboarding state
    const currentUser = await db.select({
      onboarding: users.onboarding
    }).from(users)
      .where(eq(users.id, req.user!.id))
      .limit(1);

    if (currentUser.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Merge with existing onboarding state
    const currentOnboarding = (currentUser[0].onboarding || {}) as any;
    const updatedOnboarding = {
      ...currentOnboarding,
      ...(completedAt !== undefined && { completedAt }),
      ...(flow !== undefined && { flow }),
      ...(currentStep !== undefined && { currentStep }),
      ...(indexId !== undefined && { indexId }),
      ...(invitationCode !== undefined && { invitationCode }),
    };

    const updatedUser = await db.update(users)
      .set({
        onboarding: updatedOnboarding,
        updatedAt: new Date()
      })
      .where(eq(users.id, req.user!.id))
      .returning({
        id: users.id,
        privyId: users.privyId,
        name: users.name,
        intro: users.intro,
        avatar: users.avatar,
        location: users.location,
        socials: users.socials,
        onboarding: users.onboarding,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt
      });

    if (updatedUser.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if onboarding was just completed
    if (completedAt) {
      // Ensure user has notification settings
      const existingSettings = await db.select()
        .from(userNotificationSettings)
        .where(eq(userNotificationSettings.userId, req.user!.id))
        .limit(1);

      if (existingSettings.length === 0) {
        await db.insert(userNotificationSettings)
          .values({
            userId: req.user!.id,
            preferences: {
              connectionUpdates: true,
              weeklyNewsletter: true,
            }
          })
          .onConflictDoNothing(); // Safety measure
      }
    }

    return res.json({ user: updatedUser[0] });
  } catch (error) {
    console.error('Update onboarding state error:', error);
    return res.status(500).json({ error: 'Failed to update onboarding state' });
  }
});

// Get Privy user from their service (for debugging/admin)
router.get('/privy-user', authenticatePrivy, async (req: AuthRequest, res: Response) => {
  try {
    const privyUser = await privyClient.getUserById(req.user!.privyId);
    return res.json({ privyUser });
  } catch (error) {
    console.error('Get Privy user error:', error);
    return res.status(500).json({ error: 'Failed to get Privy user info' });
  }
});

// Delete user account
router.delete('/account', authenticatePrivy, async (req: AuthRequest, res: Response) => {
  try {
    await db.update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, req.user!.id));

    return res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    return res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Generate profile with intro, location, etc. using Parallel AI (SSE)
router.post('/generate-profile', authenticatePrivy, async (req: AuthRequest, res: Response) => {
  try {
    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Get user data
    const userRecords = await db.select({
      name: users.name,
      email: users.email,
      socials: users.socials,
    })
      .from(users)
      .where(eq(users.id, req.user!.id))
      .limit(1);

    if (userRecords.length === 0) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'User not found' })}\n\n`);
      res.end();
      return;
    }

    const user = userRecords[0];
    const socials = (user.socials || {}) as { x?: string; linkedin?: string; github?: string; websites?: string[] };

    // Send status: Searching
    res.write(`data: ${JSON.stringify({ type: 'status', message: 'Searching for public information...' })}\n\n`);

    // Build search query
    let query = `Find information about the person named ${user.name || 'Unknown'}.`;
    if (user.email) query += `\nEmail: ${user.email}`;
    if (socials.linkedin) query += `\nLinkedIn: ${socials.linkedin}`;
    if (socials.x) query += `\nTwitter: ${socials.x}`;
    if (socials.github) query += `\nGitHub: ${socials.github}`;
    if (socials.websites?.length) query += `\nWebsites: ${socials.websites.join(', ')}`;

    // 1. Search
    const searchResult = await searchUser(query);

    // Send status: Processing
    res.write(`data: ${JSON.stringify({ type: 'status', message: 'Analyzing profile data...' })}\n\n`);

    // 2. Prepare data for generator
    const markdownData = json2md.fromObject(
      searchResult.results.map(r => ({
        title: r.title,
        content: r.excerpts.join('\n')
      }))
    );

    // 3. Generate Profile
    const generator = new ProfileGenerator();
    const result = await generator.run(markdownData);

    // Save/Update user profile
    const fixedIdentity = {
      ...result.profile.identity,
      location: result.profile.identity.location || ''
    };

    // Save/Update user profile
    await db.insert(userProfiles)
      .values({
        userId: req.user!.id,
        identity: fixedIdentity,
        narrative: result.profile.narrative,
        attributes: result.profile.attributes,
      })
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: {
          identity: fixedIdentity,
          narrative: result.profile.narrative,
          attributes: result.profile.attributes,
          updatedAt: new Date(),
        }
      });

    // 4. Send Result
    res.write(`data: ${JSON.stringify({
      type: 'result',
      data: {
        intro: result.profile.identity.bio,
        location: result.profile.identity.location,
        intents: [] // Explicit intents handled separately
      }
    })}\n\n`);

    // End the stream
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();

  } catch (error) {
    console.error('Generate summary error:', error);
    try {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to generate summary' })}\n\n`);
      res.end();
    } catch {
      // Response already ended
    }
  }
});

export default router; 