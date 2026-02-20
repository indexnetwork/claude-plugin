"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/app/AuthProviderWrapper";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      setError(errorParam);
      return;
    }

    if (!token) {
      setError("No token provided");
      return;
    }

    (async () => {
      try {
        const res = await authClient.magicLink.verify(
          { query: { token } },
          {
            onSuccess: (ctx) => {
              const bearerToken = ctx.response.headers.get("set-auth-token");
              if (bearerToken) {
                localStorage.setItem("bearer_token", bearerToken);
              }
              router.push("/");
            },
            onError: (ctx) => {
              setError(ctx.error.message || "Verification failed");
            },
          }
        );
        if (res.error) {
          setError(res.error.message || "Verification failed");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Verification failed");
      }
    })();
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-red-600 mb-4">Sign In Failed</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-2 bg-gray-900 text-white text-sm"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-gray-900 mb-4">Signing you in...</h1>
        <div className="animate-spin h-8 w-8 border-2 border-gray-900 border-t-transparent rounded-full mx-auto" />
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-2 border-gray-900 border-t-transparent rounded-full" />
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
