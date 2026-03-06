import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink, bearer, jwt } from "better-auth/plugins";
import { eq, and, ne } from "drizzle-orm";

import db from "./drizzle/drizzle";
import * as schema from "../schemas/database.schema";
import { getTrustedOrigins } from "./cors";
import { sendMagicLinkEmail } from "./email/magic-link.handler";
import { log } from "./log";

const logger = log.server.from("auth");

let _ensureWallet: ((userId: string) => Promise<void>) | null = null;

/** Register the wallet-creation hook (called from main.ts after messaging store is ready). */
export function setWalletHook(fn: (userId: string) => Promise<void>) {
  _ensureWallet = fn;
}

/**
 * Claims a ghost user when a real user signs up with the same email.
 * Transfers all ghost data (profiles, intents, index memberships, contacts) to the real user,
 * then deletes the ghost row.
 */
async function claimGhostUser(realUserId: string, email: string): Promise<void> {
  const ghost = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.email, email), eq(schema.users.isGhost, true), ne(schema.users.id, realUserId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!ghost) return;

  logger.info('Claiming ghost user', { realUserId, ghostId: ghost.id, email });

  // Transfer all ghost data to real user
  await db.transaction(async (tx) => {
    await tx.update(schema.userProfiles).set({ userId: realUserId }).where(eq(schema.userProfiles.userId, ghost.id));
    await tx.update(schema.intents).set({ userId: realUserId }).where(eq(schema.intents.userId, ghost.id));
    await tx.update(schema.indexMembers).set({ userId: realUserId }).where(eq(schema.indexMembers.userId, ghost.id));
    await tx.update(schema.hydeDocuments).set({ sourceId: realUserId }).where(eq(schema.hydeDocuments.sourceId, ghost.id));
    await tx.update(schema.userContacts).set({ userId: realUserId }).where(eq(schema.userContacts.userId, ghost.id));
    await tx.delete(schema.users).where(eq(schema.users.id, ghost.id));
  });

  logger.info('Ghost user claimed successfully', { realUserId, ghostId: ghost.id });
}

export const PROTOCOL_URL =
  process.env.PROTOCOL_URL || `http://localhost:${process.env.PORT || 3001}`;

export const auth = betterAuth({
  baseURL: PROTOCOL_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...schema,
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
      jwks: schema.jwks,
    },
  }),
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            if (_ensureWallet) await _ensureWallet(user.id);
          } catch (_) { /* wallet generation failure shouldn't block registration */ }
          try {
            await claimGhostUser(user.id, user.email);
          } catch (err) {
            logger.error('Ghost claiming failed', { userId: user.id, email: user.email, error: err });
          }
        },
      },
    },
  },
  basePath: "/api/auth",
  emailAndPassword: { enabled: true },
  user: {
    fields: {
      image: "avatar",
    },
  },
  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
  },
  trustedOrigins: getTrustedOrigins,
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail(email, url);
      },
      expiresIn: 600,
    }),
    bearer(),
    jwt({
      jwt: {
        issuer: PROTOCOL_URL,
        expirationTime: "1h",
        definePayload: ({ user }) => ({
          id: user.id,
          email: user.email,
          name: user.name,
        }),
      },
    }),
  ],
  advanced: {
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
    },
  },
});
