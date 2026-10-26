"use client";

/**
 * App-wide live data that many screens need (users, App Types, modules, sprints).
 * One onSnapshot listener per collection for the whole app, so components never
 * open duplicate listeners for the same data.
 */
import { createContext, useContext, useMemo } from "react";
import { orderBy, query } from "firebase/firestore";
import { col } from "@/lib/firebase/refs";
import { useLiveQuery } from "@/lib/hooks/use-live";
import { BACKLOG_ID, type AppType, type AppUser, type Module, type Sprint } from "@/types";

interface DataState {
  loading: boolean;
  users: AppUser[];
  appTypes: AppType[];
  modules: Module[];
  /** releases only (the Backlog doc is left out) */
  sprints: Sprint[];
  /** the Backlog (a special sprint doc); null until it has been set up */
  backlog: Sprint | null;
  userById: Map<string, AppUser>;
  appTypeById: Map<string, AppType>;
  moduleById: Map<string, Module>;
  /** releases and the Backlog, for looking up a task's place by its sprintId */
  sprintById: Map<string, Sprint>;
  activeSprint: Sprint | null;
}

const DataContext = createContext<DataState | null>(null);

const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((i) => [i.id, i]));

export function DataProvider({ children }: { children: React.ReactNode }) {
  const users = useLiveQuery("users", () => query(col.users(), orderBy("name")));
  const appTypes = useLiveQuery("appTypes", () => query(col.appTypes(), orderBy("name")));
  const modules = useLiveQuery("modules", () => query(col.modules(), orderBy("name")));
  const sprints = useLiveQuery("sprints", () => query(col.sprints(), orderBy("startDate", "desc")));

  const value = useMemo<DataState>(
    () => ({
      loading: users.loading || appTypes.loading || modules.loading || sprints.loading,
      users: users.data,
      appTypes: appTypes.data,
      modules: modules.data,
      sprints: sprints.data.filter((s) => s.id !== BACKLOG_ID),
      backlog: sprints.data.find((s) => s.id === BACKLOG_ID) ?? null,
      userById: byId(users.data),
      appTypeById: byId(appTypes.data),
      moduleById: byId(modules.data),
      sprintById: byId(sprints.data),
      activeSprint: sprints.data.find((s) => s.status === "active") ?? null,
    }),
    [users, appTypes, modules, sprints],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

/** Like useData, but null outside the provider (for shared components such as avatars). */
export function useOptionalData(): DataState | null {
  return useContext(DataContext);
}

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside <DataProvider>");
  return ctx;
}

export const useUsers = () => useData().users;
export const useAppTypes = () => useData().appTypes;
export const useModules = () => useData().modules;
export const useSprints = () => useData().sprints;
