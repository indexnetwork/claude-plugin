
import { privyClient } from '../lib/privy';
import { authService } from '../services/auth.service';

export interface AuthenticatedUser {
  id: string;
  privyId: string;
  email: string | null;
  name: string;
}

/**
 * AuthGuard: Validates the Request Authorization header against Privy.
 * Auto-creates user on first login via AuthService.
 * Throws an error if validation fails.
 * Returns the authenticated user object.
 */
export const AuthGuard = async (req: Request): Promise<AuthenticatedUser> => {
  const authHeader = req.headers.get('Authorization');
  const accessToken = authHeader && authHeader.split(' ')[1];

  if (!accessToken) {
    throw new Error('Access token required');
  }

  let claims;
  try {
    claims = await privyClient.verifyAuthToken(accessToken);
  } catch (error) {
    throw new Error('Invalid or expired access token');
  }

  if (!claims || !claims.userId) {
    throw new Error('Invalid access token claims');
  }

  const user = await authService.findOrCreateByPrivyId(claims.userId);

  if (user.deletedAt) {
    throw new Error('Account deactivated');
  }

  return {
    id: user.id,
    privyId: user.privyId,
    email: user.email,
    name: user.name
  };
};
