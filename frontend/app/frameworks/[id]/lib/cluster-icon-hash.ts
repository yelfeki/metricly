"use client"

import {
  IconBolt,
  IconBook,
  IconBulb,
  IconChartArrows,
  IconChartDots,
  IconChecklist,
  IconCompass,
  IconFlag,
  IconHeartHandshake,
  IconShield,
  IconSpider,
  IconTargetArrow,
  IconUsers,
  type IconProps,
} from "@tabler/icons-react"
import type { ComponentType } from "react"

/**
 * Curated set of Tabler icons assigned to clusters via a deterministic string hash.
 * Same cluster string → same icon every time (no random mappings, no flicker on re-render).
 *
 * Why this design (per data-mapping.md decision 1):
 *   Our competency.cluster is a free string (~20 distinct values). We do not store an
 *   icon per cluster. Hashing avoids inventing semantic meaning per cluster while still
 *   giving each one a stable, recognisable shape.
 *
 * Icons selected for visual distinctness at small sizes (16–22px). Order is stable —
 * adding new icons appends to the end so existing hash slots don't shift.
 */
const ICON_SET: ComponentType<IconProps>[] = [
  IconTargetArrow,
  IconUsers,
  IconBulb,
  IconChartArrows,
  IconBolt,
  IconChecklist,
  IconSpider,
  IconChartDots,
  IconCompass,
  IconShield,
  IconHeartHandshake,
  IconBook,
  IconFlag,
]

/** Stable, dependency-free string hash. Good enough for tiny string sets. */
function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0  // force int32
  }
  return Math.abs(h)
}

/**
 * Return the Tabler icon component assigned to the given cluster.
 * Returns a generic icon when cluster is null/empty.
 */
export function iconForCluster(cluster: string | null | undefined): ComponentType<IconProps> {
  if (!cluster) return IconCompass
  return ICON_SET[hashString(cluster) % ICON_SET.length]
}
