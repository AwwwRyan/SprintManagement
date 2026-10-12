/**
 * Warms up the dev server before the E2E suite. In `next dev`, each route compiles on its first
 * request and each Admin API route boots its own Admin SDK instance, which can take tens of
 * seconds on a busy machine and would otherwise time out the first test that uses it.
 * Every call below authenticates as the seeded admin and then fails validation, so no data changes.
 */
const BASE = "http://localhost:3001";
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key";

export default async function globalSetup() {
  const res = await fetch(AUTH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "password123", returnSecureToken: true }),
  });
  if (!res.ok) throw new Error("E2E warm-up: couldn't sign in as admin@example.com. Is the seed loaded? (npm run seed)");
  const { idToken } = (await res.json()) as { idToken: string };
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` };

  const calls: [string, string][] = [
    ["POST", "/api/admin/users"],
    ["PATCH", "/api/admin/users/warmup"],
    ["POST", "/api/admin/users/warmup/password"],
    ["POST", "/api/admin/users/warmup/invite"],
  ];
  for (const [method, path] of calls) {
    await fetch(`${BASE}${path}`, { method, headers, body: "{}" }).catch(() => undefined);
  }
  // Pages hit by full-page navigations in the suite
  for (const path of ["/login", "/sprints", "/dashboard", "/my-tasks", "/admin/users"]) {
    await fetch(`${BASE}${path}`).catch(() => undefined);
  }
}
