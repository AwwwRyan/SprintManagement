"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { FullPageSpinner } from "@/components/common/full-page-spinner";

/** Public pages. Signed-in users are sent into the app. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { loading, actor } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && actor) {
      const next = new URLSearchParams(window.location.search).get("next");
      // only same-site relative paths, never "//host"
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    }
  }, [loading, actor, router]);

  if (loading || actor) return <FullPageSpinner />;

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            RM
          </div>
          <span className="text-lg font-semibold">Release Management</span>
        </div>
        {children}
      </div>
    </div>
  );
}
