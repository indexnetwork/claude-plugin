import { PrivyClient } from "@privy-io/server-auth";

const privyClient = new PrivyClient(
  process.env.NEXT_PUBLIC_PRIVY_APP_ID || "",
  process.env.PRIVY_APP_SECRET || ""
);

export async function getUserIdFromRequest(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  try {
    const claims = await privyClient.verifyAuthToken(token);
    return claims?.userId ?? null;
  } catch {
    return null;
  }
}
