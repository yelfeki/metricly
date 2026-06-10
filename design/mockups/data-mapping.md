# Design mockup → data mapping

Source-of-truth document for porting the mockups in `design/mockups/` onto the existing Metricly data model. Each row records a visual element, the existing data field it maps to, and the decision taken when the mockup expected something we don't store.

**Hard constraint:** no schema changes, no new tables, no new columns. If a mockup field has no data backing, the decision below either derives it from existing fields, makes it pure UI state, or hides the element.

**Legend**
- ✓ data exists, direct map
- ⊕ derived from existing data
- ◌ pure UI state (no data source needed)
- ✗ hidden (no data, no honest derivation)

---

## 1. Proficiency-levels view — `design/mockups/proficiency_levels.html`

**Status:** decisions confirmed. Implementation in `app/frameworks/[id]/proficiency/`.

**Interpretation:** new standalone page at `/frameworks/[id]/proficiency`, added as a tab on the framework dashboard. The existing in-drawer `ProficiencyLadder` is left untouched.

### Element → source

| Mockup element | Mapping | Source |
|---|---|---|
| Competency selector pill — name | ✓ | `framework.competencies[i].name` |
| Competency selector pill — icon | ⊕ | Hash `competency.cluster` → one of N Tabler icons (decision 1) |
| Active pill | ◌ | `currentComp` UI state |
| Header card — icon | ⊕ | Same cluster-hash icon as pill |
| Header card — name | ✓ | `framework.competencies[i].name` |
| Header card — subtitle "for senior role" | ⊕ | `framework.role_title` if set, else "for this role" (decision 6) |
| Header card — target chip "L4" | ✓ | `benchmarks[competency_id].required_level`, fallback `3` |
| Level tab labels (L1 Novice, L2 Developing, …) | ✓ | `framework.proficiency_levels[i].label` — honour stored labels even when mockup says "Foundational" (decision 2) |
| Level tab L1–L5 numbers | ◌ | Static `1..5` |
| Active tab | ◌ | `currentLevel` UI state |
| Dot ladder — reached / current / unreached | ◌ | UI state from `currentLevel` |
| Dot ladder — target ★ | ✓ | `benchmarks[competency_id].required_level === level` |
| Dot ladder — progress fill width | ◌ | `(currentLevel - 1) / 4` |
| Level detail — headline | ⊕ | `CompetencyLevelView.descriptor` when present; otherwise `behavioral_indicators[0]`. **Always render the full indicator list below the headline, even when descriptor is present — both carry information** (decision 3) |
| Level detail — behavioural anchors (staggered chips) | ✓ | `CompetencyLevelView.behavioral_indicators[]` |
| Level detail — example behaviour (italic) | ⊕ | `CompetencyLevelView.example_behaviors[0]`, rendered italic **without quote marks** (decision 4) |
| Level detail — "Role target" badge | ✓ | `benchmarks[competency_id].required_level === currentLevel` |
| Footer — target card with gap text | ✓ | `benchmarks[competency_id].required_level` minus `currentLevel` |
| Footer — progression time card | ✗ | **Hidden** — no honest derivation. Footer becomes single-card layout (decision 5) |
| Compare grid — 5 columns | ◌ | Same per-level data, alt layout |
| Compare grid — anchor list per column | ⊕ | `behavioral_indicators.slice(0, 3)` (decision 8) |
| Compare grid — intensity grading | ◌ | `level / 5` opacity calc |
| Compare grid — "TARGET" badge | ✓ | `benchmarks[competency_id].required_level === level` |
| Ladder / Compare view toggle | ◌ | `currentView` UI state |

### Confirmed decisions

| # | Decision |
|---|---|
| 1 | **Cluster → icon:** hash `competency.cluster` (string) to a fixed set of Tabler icons. Same cluster → same icon, consistent across sessions. Different clusters get visually distinct icons without claiming semantic meaning. |
| 2 | **Level labels:** honour stored labels from `proficiency_levels.label` even when they drift from mockup wording. Stored "Novice" is shown, not "Foundational". |
| 3 | **Headline derivation:** show `descriptor` if present; otherwise first indicator. **Always show the full indicator list below the headline** — descriptor and indicators carry different information, neither suppresses the other. |
| 4 | **Example formatting:** italic, no quote marks (our examples are 3rd-person observations, not quotes). |
| 5 | **Progression time:** hidden entirely. Footer becomes a single-card layout (target + gap). Never invent timing numbers. |
| 6 | **Header subtitle role qualifier:** `framework.role_title` when set, else "for this role". Never "for senior role" — seniority isn't a framework attribute. |
| 7 | **Default selection:** support `?competencyId=…` URL param. Fallback to `framework.competencies[0]`. Empty state when zero competencies. |
| 8 | **Compare-view anchor cap:** slice at 3 anchors per column (mockup shows 2; ours runs 2–5 so 3 reads better). |
| 9 | **Icons:** install `@tabler/icons-react` (tree-shakeable). |
| 10 | **Tab placement:** `Competencies → Proficiency → Team report → Benchmarks → Pulse`. Proficiency sits next to Competencies since both are framework-definition surfaces. |

### Data not used from the mockup

- The 8 hardcoded competencies (vision, coach, decide, plan, influ, deliver, resil, data) — replaced by `framework.competencies` from `getFramework(frameworkId)`.
- The hand-written rubric (`rubric[id][1..5]` with headlines, anchors, examples) — replaced by `getFrameworkCompetencyDetail(frameworkId, competencyId).levels`.
- Hardcoded purple `#534AB7` — adopted as the active-state colour. Close enough to our existing `--accent-from: #5b21b6` to read identically.

---

## 2. Competency network view — `design/mockups/competency_network.html`

**Status:** ⚠ **SUPERSEDED** by §3 (framework summary client view). Implementation deleted. This section is kept as a historical record of decisions taken at the time, in case the network visual is revived later.

**Why superseded:** the network view was a relational visualisation (nodes, edges, clusters). The client-facing dashboard pivoted to a presentation-only summary (metric cards + histograms + filter-pill grid) without evaluative content. The new view targets clients viewing a framework, not analysts exploring relationships.

**Interpretation (historical):** replaced the constellation-cards layout on `/frameworks/[id]` with a network SVG view. Existing drawer + library picker preserved. Existing hooks (`useCompetencyConnections`) used as-is.

### Element → source

| Mockup element | Mapping | Source |
|---|---|---|
| Node `id` | ✓ | `framework.competencies[i].id` |
| Node `name` | ✓ | `framework.competencies[i].name` |
| Node `cluster` (one of 6 mockup keys) | ⊕ | Derived from `competency.cluster` string via palette mapping (see decision N1) |
| Node radius (scaled by `target`) | ✓ | `benchmarks[i].required_level` → `7 + level * 1.5` |
| Node colour | ⊕ | Cluster → palette colour |
| Edges between competencies | ✓ | `useCompetencyConnections(...).connections` (existing token-overlap heuristic — unchanged) |
| Edge thickness (same-cluster heavier) | ⊕ | `competencies[a].cluster === competencies[b].cluster` |
| Detail panel — cluster badge | ⊕ | Cluster → palette |
| Detail panel — target proficiency bar | ✓ | `benchmarks[i].required_level / 5` |
| Detail panel — behavioural indicators | ✓ | `getFrameworkCompetencyDetail` → `levels[targetLevel-1].behavioral_indicators` |
| Detail panel — connected competencies | ⊕ | `connections` filtered by selected node id |
| Density gauge value | ⊕ | `connections.length / (n * (n-1) / 2)` |
| Density gauge stats — nodes / edges / clusters | ⊕ | `competencies.length`, `connections.length`, count of unique cluster values |
| Cluster legend | ⊕ | Distinct cluster values present in the framework |
| Layout toggle (Network / Radial) | ◌ | UI state |
| Dependency-bar strength values | ⊕ | Count cross-cluster edges, normalise (decision N2) |

### Confirmed decisions

| # | Decision | Status |
|---|---|---|
| N1 | **Cluster colour mapping:** hash each distinct cluster string to one of the 6 mockup palette colours. Reasoning: cleanest visual without inventing categories the data doesn't have. Trade-off: two unrelated clusters can land on the same colour. | `[CONFIRMED]` |
| N2 | **Dependency-bar derivation:** count cross-cluster edges between each pair of clusters, normalise to 0–100, show top 6 by strength. | `[CONFIRMED]` |
| N3 | **Dependency-bar count:** show top 6 cross-cluster pairs (matches mockup); the set is adaptive to the framework's clusters. | `[CONFIRMED]` |
| N4 | **Edges always visible:** remove the existing "Show connections" toggle. Network view = edges on by default. | `[CONFIRMED]` |
| N5 | **Detail surface:** mockup's inline 240px detail panel = quick preview on select; existing 560px `CompetencyDetailDrawer` still opens via "Open full detail" button. Preserves edit / provenance / linked-survey / full ladder access. | `[CONFIRMED]` |
| N6 | **Bottom stats row:** keep the existing tab-bar above the network. Stats (density + dep bars) sit below. | `[CONFIRMED]` |
| N7 | **Header controls:** keep "+ Add from library" in the dashboard header alongside the layout switch. Drop the connections toggle (per N4). | `[CONFIRMED]` |
| N8 | **Empty state:** retain existing "No competencies yet" empty state; do not show an empty network canvas. | `[CONFIRMED]` |
| N9 | **Tabler icons:** install `@tabler/icons-react` (network needs 5: affiliate, target, hand-finger, pointer, check). Shared with the proficiency view. | `[CONFIRMED]` via proficiency decision 9 |

### Data not used from the mockup

- Hardcoded `competencies` list (24 items across 6 fixed clusters) — replaced by `framework.competencies`.
- Hardcoded `edges` array (42 pairs) — replaced by `useCompetencyConnections` output.
- Hardcoded `clusters` map (leadership/strategic/interpersonal/execution/adaptability/business + colour/bg/text per cluster) — palette adopted as the colour set; cluster keys themselves are not adopted (we use the framework's own cluster strings).

---

## 3. Framework summary client view — `design/mockups/metricly_framework_summary_client_view.html`

**Status:** decisions confirmed. Implementation replaces the previous dashboard at `/frameworks/[id]/page.tsx` and supersedes §2.

**Interpretation:** a **presentational, client-facing summary** of a framework. No evaluative content (no health scores, no AI review notes, no benchmark markers beyond the target level itself, no provenance tags). Editing surfaces moved out of the dashboard into a new `/frameworks/[id]/edit` route.

### Element → source

| Mockup element | Mapping | Source |
|---|---|---|
| Header eyebrow "YOUR COMPETENCY FRAMEWORK" | ◌ | Static |
| Header title | ✓ | `framework.role_title` (fallback `framework.title`) |
| Header subtitle | ⊕ | `framework.description` if set, else omitted (decision FS1) |
| Header Export button | ◌ | Rendered, non-functional ("coming soon" tooltip) (decision FS4) |
| Header Launch assessment button | ◌ | Rendered, non-functional ("coming soon" tooltip) (decision FS4) |
| Metric card — Competencies | ✓ | `framework.competencies.length` |
| Metric card — Clusters | ⊕ | `new Set(competencies.map(c => c.cluster ?? "—")).size` |
| Metric card — Behavioural indicators | ⊕ | `Σ` over all competencies × all 5 levels of `level.behavioral_indicators.length`. Requires `getFrameworkCompetencyDetail` per competency (parallel fetch on mount) |
| Metric card — Proficiency range | ⊕ | `min`/`max` of `benchmarks[i].required_level`. Unbenchmarked competencies default to L3 (decision FS2) |
| Cluster composition — bar per cluster | ⊕ | `groupBy(competencies, c => c.cluster)` |
| Cluster composition — label | ✓ | `competency.cluster` (or "Uncategorised") |
| Cluster composition — colour | ✓ | `colourForCluster(cluster).main` (existing palette hash) |
| Proficiency profile — histogram | ⊕ | Histogram of `benchmarks[i].required_level`. Unbenchmarked → L3 bucket (decision FS2) |
| Proficiency profile — bar colours | ◌ | Cobalt ramp: `#B5D4F4 / #85B7EB / #378ADD / #185FA5 / #0C447C` (mockup palette, adopted verbatim) |
| Proficiency profile — chart impl | — | `recharts` (already in deps; not Chart.js / CDN) |
| Filter pill — "All N" | ✓ | `competencies.length` |
| Filter pill — per-cluster with count | ⊕ | `groupBy(competencies, cluster)`, sorted by count desc then alpha (decision FS3) |
| Filter pill — active highlight | ◌ | UI state |
| Comp card — icon tile | ✓ | `iconForCluster(cluster)` (existing hash util) |
| Comp card — colour scheme | ✓ | `colourForCluster(cluster)` `.main` + `.bg` + `.text` |
| Comp card — L# pill | ✓ | `benchmarks[c.id].required_level`, fallback "—" |
| Comp card — name | ✓ | `competency.name` |
| Comp card — subtitle "Advanced · leadership" | ⊕ | `framework.proficiency_levels[target-1].label` + `competency.cluster` (honours stored labels per decision 2) |
| Comp card — 5-dot progress | ◌ | Pure UI from target |
| Comp card — "N behavioural indicators" | ⊕ | `Σ` over 5 levels of indicator count per competency. Same fetch as the total-indicators metric |
| Comp card — click | — | Deep-links to `/frameworks/[id]/proficiency?competencyId={id}` (decision FS4) |
| Proficiency scale legend — L# / label | ✓ | `framework.proficiency_levels[i].label` (honour stored labels) |
| Proficiency scale legend — colours | ◌ | Same cobalt ramp as histogram |
| Footer — "Grounded in validated psychometric instruments" | ◌ | Static |
| Footer — Edit framework button | — | Routes to **new** `/frameworks/[id]/edit` page that hosts the relocated drawer + picker + form (decision FS4) |
| Footer — Share button | ◌ | Rendered, non-functional ("coming soon" tooltip) (decision FS4) |

### Confirmed decisions

| # | Decision |
|---|---|
| FS1 | **Header subtitle:** render `framework.description` when set, else omit the subtitle line entirely. Never invent function / seniority / industry strings. |
| FS2 | **Unbenchmarked target handling:** competencies with no `Benchmark` row default to L3 (matches the rest of the app's fallback). Counted silently in the L3 bucket of the histogram and proficiency-range calc. |
| FS3 | **Filter-pill order:** sort by competency count descending, ties broken alphabetically. `All` first. |
| FS4 | **Action buttons + edit flow:** Render all four mockup buttons. `Edit framework` → new `/frameworks/[id]/edit` route hosting the previously dashboard-mounted `CompetencyDetailDrawer`, `LibraryPickerDrawer`, and `CustomCompetencyForm` (moved, not deleted). `Export PDF` / `Launch assessment` / `Share` render but are non-functional with a "coming soon" tooltip. Card click deep-links to `/frameworks/[id]/proficiency?competencyId={id}`. |

### Files affected (implementation summary, for posterity)

- **Modified:** `app/frameworks/[id]/page.tsx` (rewritten from network view to summary view)
- **New:** `app/frameworks/[id]/edit/page.tsx` (hosts the relocated editing surface)
- **Deleted (network view + accumulated dead code):**
  - `app/frameworks/[id]/components/network/` (whole dir — 5 files)
  - `app/frameworks/[id]/components/ConstellationCard.tsx`
  - `app/frameworks/[id]/components/ClusterGroup.tsx`
  - `app/frameworks/[id]/components/ConnectionOverlay.tsx`
  - `app/frameworks/[id]/hooks/` (whole dir — `useCardPositions.ts` + `useCompetencyConnections.ts`)
- **Relocated (moved, not deleted; behaviour unchanged):**
  - `CompetencyDetailDrawer.tsx` → still used from `/edit`
  - `LibraryPickerDrawer.tsx` → still used from `/edit`
  - `CustomCompetencyForm.tsx` → still used from `/edit`

### Data not used from the mockup

- The 12 hardcoded competencies (vision setting, influence without authority, …) — replaced by `framework.competencies` from `getFramework(frameworkId)`.
- The hardcoded `clusters` map (leadership / strategic / etc.) — replaced by the live `competency.cluster` field + existing `cluster-palette.ts` hash mapping.
- The 5 hardcoded indicator counts per competency (5, 6, 5, 6, …) — replaced by live counts derived from `getFrameworkCompetencyDetail`.
- The hardcoded `target` values — replaced by `Benchmark.required_level`.
- The hardcoded role / metadata (Senior product manager · Product · Senior IC · Technology / SaaS) — replaced by `framework.role_title` + `framework.description`.

---

## 4. Shared decisions across both mockups

| Topic | Decision |
|---|---|
| Active-state purple | Adopt mockup's `#534AB7`. Reads identically to Metricly's `--accent-from: #5b21b6`; one channel of drift is acceptable. |
| Easing | Standardise on `cubic-bezier(0.4, 0, 0.2, 1)` everywhere (matches the mockup). |
| Border radius | Inline `rounded-xl` (Tailwind, ≈12px) for the mockup's `--border-radius-md`; `rounded-2xl` (≈16px) for `--border-radius-lg`. No new CSS variables. |
| Font | `var(--font-jakarta)` for body (Plus Jakarta Sans); `var(--font-playfair)` for the italic example-quote serif. |
| Icon library | `@tabler/icons-react`. |
| Cluster palette | Mockup's 6-colour set, adopted verbatim as a typed `const` in `app/frameworks/[id]/lib/cluster-palette.ts` (created when the network view lands). |
| Cluster icon set | Curated subset of Tabler icons in `app/frameworks/[id]/lib/cluster-icon-hash.ts`. |

---

## 4. Maintenance notes

- When a new mockup is ported, add a section here matching the structure of §1 / §2.
- When a previously `[CONFIRMED]` decision is confirmed, change the marker to `[CONFIRMED]` and remove the warning at the top of that section.
- If a future decision diverges from a prior decision in this doc, update both rows and add a one-line note explaining the change.
- This document is the canonical answer to *"why does the dashboard render X like that when the data says Y?"* — keep it honest.
