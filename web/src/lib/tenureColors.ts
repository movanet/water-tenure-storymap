/**
 * Colours for the tenure typology and the security scale.
 *
 * A tenure type's colour comes from its "color" in the vocabulary; types
 * without one fall back to a hue for their category, so every type renders
 * distinguishably.
 */

import { getTenureType } from "@/data/tenureVocab";

/** Fallback marker colour for records with an unknown tenure_type. */
export const TENURE_FALLBACK_COLOR = "#9CA3AF";

export const CATEGORY_FALLBACK_COLORS: Record<string, string> = {
  formal: "#5C7A99",
  institutional: "#2456A6",
  contractual: "#0F8B8D",
  communal: "#3E9D4E",
  environmental: "#1FB6C9",
  informal: "#D9822B",
  contested: "#C0392B",
};

export function tenureColor(tenureTypeId: string | undefined): string {
  const type = getTenureType(tenureTypeId);
  if (!type) return TENURE_FALLBACK_COLOR;
  return type.color ?? CATEGORY_FALLBACK_COLORS[type.category] ?? TENURE_FALLBACK_COLOR;
}

/**
 * 4-step light-to-dark ramp for the security scale
 * (1 = Secure -> light, 4 = Very little or none -> dark). Used by the
 * "security gap" display mode: fill = legal, ring = perceived security.
 */
export const SECURITY_RAMP: Record<"1" | "2" | "3" | "4", string> = {
  "1": "#BFE3F4",
  "2": "#6FC2E4",
  "3": "#2E8FBF",
  "4": "#0B5275",
};

/** Gray for NA / NR / prose or missing security ratings. */
export const SECURITY_NA_COLOR = "#9CA3AF";

export function securityColor(value: unknown): string {
  const key = String(value ?? "");
  if (key === "1" || key === "2" || key === "3" || key === "4") {
    return SECURITY_RAMP[key];
  }
  return SECURITY_NA_COLOR;
}
