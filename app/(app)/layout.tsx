"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { DataProvider } from "@/components/providers/data-provider";
import { FullPageSpinner } from "@/components/common/full-page-spinner";
import { AppShell } from "@/components/layout/app-shell";

/** Protected route group: unauthenticated users are redirected to /login. */
export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { loading, actor } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !actor) router.replace(`/login${pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : ""}`);
  }, [loading, actor, router, pathname]);

  if (loading || !actor) return <FullPageSpinner />;

  return (
    <DataProvider>
      <AppShell>{children}</AppShell>
    </DataProvider>
  );
}
