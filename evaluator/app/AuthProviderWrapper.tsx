"use client";

import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

// Use relative /api/auth so sign-in cookies are set on evaluator domain (fixes 401 on /api/eval/*)
export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [magicLinkClient()],
});

export function AuthProviderWrapper({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
