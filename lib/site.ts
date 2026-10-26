/** Site identity used by metadata, icons and the link-preview image. */
export const SITE_NAME = "Release Management";
export const SITE_SHORT_NAME = "Release Management";
export const SITE_DESCRIPTION =
  "Plan releases, track bugs, improvements and tasks in a live shared grid, and see release progress at a glance.";

/** Absolute base URL for link previews: explicit env, else Vercel's production domain, else local dev. */
export function siteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return new URL(explicit);
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return new URL(`https://${vercel}`);
  return new URL("http://localhost:3000");
}
