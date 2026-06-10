/**
 * Cluster colour palette — built from the Metricly editorial-modern pigment
 * family. Reduced from six to **five** pigments (navy / cobalt / olive /
 * butter / persimmon) at the user's request — mauve was dropped so every
 * cluster swatch lands on an explicitly approved colour. The original mockup
 * palette (leadership-purple, strategic-green, etc.) was a one-off colour
 * set that pre-dated the design system.
 *
 * Same hash algorithm as cluster-icon-hash.ts — every distinct cluster
 * string always lands on the same colour. With more than 5 clusters two
 * will share a colour; that's accepted (data-mapping.md decision N1) in
 * exchange for not inventing categories that don't exist in the data.
 */

export interface ClusterColour {
  main: string  // primary fill / accent — pigment at full saturation
  bg: string    // light background tint for chips / detail panel
  text: string  // dark text on the bg tint
}

export const CLUSTER_PALETTE: readonly ClusterColour[] = [
  // navy
  { main: "#0F2841", bg: "rgba(15,40,65,0.10)",  text: "#0A1E33" },
  // cobalt
  { main: "#2A5BA8", bg: "rgba(42,91,168,0.10)", text: "#042C53" },
  // olive
  { main: "#7E8A55", bg: "rgba(126,138,85,0.14)", text: "#3F4A2A" },
  // butter (paired with a deeper amber text for legibility on the tint)
  { main: "#E2B146", bg: "rgba(226,177,70,0.18)", text: "#5A3A0C" },
  // persimmon
  { main: "#DD6334", bg: "rgba(221,99,52,0.12)", text: "#4A1B0C" },
]

/** Neutral fallback when a competency has no cluster set. */
export const CLUSTER_FALLBACK: ClusterColour = {
  main: "rgba(10,30,51,0.45)",
  bg: "rgba(10,30,51,0.06)",
  text: "rgba(10,30,51,0.7)",
}

/** Stable string hash — same cluster → same colour every render. */
function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

export function colourForCluster(cluster: string | null | undefined): ClusterColour {
  if (!cluster) return CLUSTER_FALLBACK
  return CLUSTER_PALETTE[hashString(cluster) % CLUSTER_PALETTE.length]
}
