const productionHosts = new Set(["projekt.jkprojekt.se"]);

export const appEnvironment = (import.meta.env.VITE_APP_ENV as string | undefined) ?? "development";

export function isProductionHost() {
  if (typeof window === "undefined") return false;
  return productionHosts.has(window.location.hostname);
}

export function requireSupabase() {
  return appEnvironment === "production" || isProductionHost() || import.meta.env.VITE_REQUIRE_SUPABASE === "true";
}

export function allowMockAuth() {
  return !requireSupabase() && import.meta.env.VITE_ALLOW_MOCK_AUTH !== "false";
}
