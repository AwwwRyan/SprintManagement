"use client";

import { ShieldAlert } from "lucide-react";
import { useCurrentUser } from "@/components/providers/auth-provider";
import { canManageUsers } from "@/lib/permissions";
import { EmptyState } from "@/components/common/empty-state";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { actor } = useCurrentUser();
  if (!canManageUsers(actor)) {
    return <EmptyState icon={ShieldAlert} title="Admins only" description="You don't have access to this page." />;
  }
  return <>{children}</>;
}
