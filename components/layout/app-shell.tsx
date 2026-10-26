"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  Inbox,
  Rows3,
  ChevronsLeft,
  ChevronsRight,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  Menu,
  Layers,
  Shapes,
  Users,
  Zap,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useData } from "@/components/providers/data-provider";
import { canManageUsers, canTriageSuggestions } from "@/lib/permissions";
import { useNewSuggestions } from "@/lib/hooks/use-suggestions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserMenu } from "./user-menu";
import { ConnectionIndicator } from "./connection-indicator";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  match: (path: string) => boolean;
}

const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, match: (p) => p.startsWith("/dashboard") },
  { href: "/releases", label: "Releases", icon: Zap, match: (p) => p.startsWith("/releases") },
  { href: "/all-tasks", label: "All Tasks", icon: Rows3, match: (p) => p.startsWith("/all-tasks") },
  { href: "/backlog", label: "Backlog", icon: Inbox, match: (p) => p.startsWith("/backlog") },
  { href: "/my-tasks", label: "My Tasks", icon: ListChecks, match: (p) => p.startsWith("/my-tasks") },
  { href: "/suggestions", label: "Suggestions", icon: Lightbulb, match: (p) => p.startsWith("/suggestions") },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin/users", label: "Users", icon: Users, match: (p) => p.startsWith("/admin/users") },
  { href: "/admin/app-types", label: "App Types", icon: Shapes, match: (p) => p.startsWith("/admin/app-types") },
  { href: "/admin/modules", label: "Modules", icon: Boxes, match: (p) => p.startsWith("/admin/modules") },
];

const COLLAPSE_KEY = "stm.sidebar.collapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { actor } = useAuth();
  const { activeSprint } = useData();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);
  useEffect(() => setMobileOpen(false), [pathname]);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* storage unavailable */
      }
      return !c;
    });
  };

  // QA/Admin see how many suggestions are waiting to be looked at.
  const newSuggestions = useNewSuggestions(canTriageSuggestions(actor)).data.length;
  const badgeFor = (item: NavItem) => (item.href === "/suggestions" ? newSuggestions : 0);

  const renderItem = (item: NavItem) => {
    const active = item.match(pathname);
    const badge = badgeFor(item);
    const link = (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors",
          active
            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
            : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
          collapsed && "md:justify-center md:px-0",
        )}
      >
        <span className="relative shrink-0">
          <item.icon className="size-4" />
          {badge > 0 && collapsed && <span className="absolute -top-1 -right-1 hidden size-2 rounded-full bg-sky-500 md:block" aria-hidden />}
        </span>
        <span className={cn(collapsed && "md:sr-only")}>{item.label}</span>
        {badge > 0 && (
          <span
            className={cn("ml-auto rounded-full bg-sky-500 px-1.5 text-[11px] font-semibold text-white tabular-nums", collapsed && "md:hidden")}
            aria-label={`${badge} new`}
          >
            {badge}
          </span>
        )}
      </Link>
    );
    if (!collapsed) return link;
    return (
      <Tooltip key={item.href}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" className="hidden md:block">
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className="flex h-svh overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          "no-print fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r bg-sidebar transition-[width,transform] duration-200 md:static md:translate-x-0",
          collapsed ? "md:w-14" : "md:w-60",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Main navigation"
      >
        <div className={cn("flex h-12 items-center gap-2 border-b px-3", collapsed && "md:justify-center md:px-0")}>
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            RM
          </div>
          <span className={cn("truncate text-sm font-semibold", collapsed && "md:hidden")}>Release Management</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          {MAIN_NAV.map(renderItem)}
          {activeSprint && (
            <Link
              href={`/releases/${activeSprint.id}`}
              className={cn(
                "mt-1 flex h-8 items-center gap-2.5 rounded-md px-2.5 text-xs text-sidebar-foreground/75 hover:bg-sidebar-accent/60",
                collapsed && "md:hidden",
              )}
            >
              <Layers className="size-3.5 text-emerald-500" />
              <span className="truncate">Active: {activeSprint.name}</span>
            </Link>
          )}
          {canManageUsers(actor) && (
            <>
              <div
                className={cn(
                  "mt-4 mb-1 px-2.5 text-[11px] font-medium tracking-wide text-sidebar-foreground/50 uppercase",
                  collapsed && "md:sr-only",
                )}
              >
                Admin
              </div>
              {ADMIN_NAV.map(renderItem)}
            </>
          )}
        </nav>
        <div className="hidden border-t p-2 md:block">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggle}
            className={cn("w-full justify-start", collapsed && "justify-center")}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
            {!collapsed && "Collapse"}
          </Button>
        </div>
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setMobileOpen(false)} aria-hidden />
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </Button>
          <div className="flex-1" />
          <ConnectionIndicator />
          <UserMenu />
        </header>
        <main className="min-h-0 flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
