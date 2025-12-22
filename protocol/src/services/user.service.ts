import db from '../lib/db';
import { users, userNotificationSettings, userProfiles, User } from '../lib/schema';
import { eq } from 'drizzle-orm';
import { log } from '../lib/log';

export class UserService {
    async findById(userId: string) {
        log.info('[UserService] Finding user by ID', { userId });
        const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        return result[0] || null;
    }

    async findWithGraph(userId: string) {
        const userResult = await db.select({
            user: users,
            settings: userNotificationSettings,
            profile: userProfiles
        })
            .from(users)
            .leftJoin(userNotificationSettings, eq(users.id, userNotificationSettings.userId))
            .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
            .where(eq(users.id, userId))
            .limit(1);

        if (userResult.length === 0) {
            return null;
        }

        const { user, settings, profile } = userResult[0];

        return {
            ...user,
            profile,
            notificationPreferences: settings?.preferences || {
                connectionUpdates: true,
                weeklyNewsletter: true,
            }
        };
    }

    async update(userId: string, data: Partial<User>) {
        log.info('[UserService] Updating user', { userId, fields: Object.keys(data) });
        const result = await db.update(users)
            .set({
                ...data,
                updatedAt: new Date()
            })
            .where(eq(users.id, userId))
            .returning();

        return result[0] || null;
    }

    async softDelete(userId: string) {
        log.info('[UserService] Soft deleting user', { userId });
        await db.update(users)
            .set({ deletedAt: new Date() })
            .where(eq(users.id, userId));
        return true;
    }
}
