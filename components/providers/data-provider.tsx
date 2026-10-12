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
import type { AppType, AppUser, Module, Sprint } from "@/types";

interface DataState {
  loading: boolean;
  users: AppUser[];
  appTypes: AppType[];
  modules: Module[];
  sprints: Sprint[];
  userById: Map<string, AppUser>;
  appTypeById: Map<string, AppType>;
  moduleById: Map<string, Module>;
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
      sprints: sprints.data,
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

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside <DataProvider>");
  return ctx;
}

export const useUsers = () => useData().users;
export const useAppTypes = () => useData().appTypes;
export const useModules = () => useData().modules;
export const useSprints = () => useData().sprints;
