"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/components/providers/data-provider";
import { FullPageSpinner } from "@/components/common/full-page-spinner";

/** `/` goes to the active sprint if there is one, otherwise to the sprint list. */
export default function HomeRedirect() {
  const { loading, activeSprint } = useData();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(activeSprint ? `/releases/${activeSprint.id}` : "/releases");
  }, [loading, activeSprint, router]);

  return <FullPageSpinner />;
}
