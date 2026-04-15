export interface CronbachAlphaResponse {
  alpha: number
  n_items: number
  n_respondents: number
  item_total_correlations: number[]
  alpha_if_item_deleted: number[]
  interpretation: "poor" | "acceptable" | "good" | "excellent"
  scale_name: string | null
}

export type Interpretation = "poor" | "acceptable" | "good" | "excellent"

export interface Module {
  id: string
  name: string
  description: string
  detail: string
  endpoint: string
  category: string
  color: ModuleColor
  href: string | null
  available: boolean
}

export type ModuleColor = "indigo" | "violet" | "emerald" | "amber"

// ---------------------------------------------------------------------------
// Survey builder types
// ---------------------------------------------------------------------------

export type QuestionType =
  | "text"
  | "single_choice"
  | "multiple_choice"
  | "likert_5"
  | "likert_7"
  | "forced_choice"
  | "ranking"

export interface ForcedChoiceConfig {
  items: string[]
  labels: [string, string]
}

export type SurveyStatus = "draft" | "published" | "closed"

export interface QuestionOut {
  id: string
  survey_id: string
  text: string
  question_type: QuestionType
  // list for choice/ranking, ForcedChoiceConfig for forced_choice, null for text/likert
  options: string[] | ForcedChoiceConfig | null
  position: number
  // v0.4 psychometric fields
  factor: string | null
  reverse_scored: boolean
  score_weight: number
  // option text → score (single/multiple) or item text → weight (forced_choice)
  option_scores: Record<string, number> | null
  // v0.6 demographic fields
  is_demographic: boolean
  demographic_key: string | null
}

export interface SurveyOut {
  id: string
  name: string
  description: string | null
  status: SurveyStatus
  created_at: string
  questions: QuestionOut[]
  response_count: number
}

export interface SurveyListItem {
  id: string
  name: string
  description: string | null
  status: SurveyStatus
  created_at: string
  response_count: number
}

export interface ResponseOut {
  id: string
  survey_id: string
  respondent_ref: string | null
  submitted_at: string
}

export interface SurveyFactor {
  id: string
  survey_id: string
  name: string
  description: string | null
}

export interface QuestionStat {
  question_id: string
  text: string
  question_type: QuestionType
  n: number
  mean: number | null
  std: number | null
  distribution: Record<string, number>   // "label|item" → count for forced_choice
  text_values: string[] | null
  ranking_averages: Record<string, number> | null  // item → avg rank (lower = preferred)
}

export interface SurveyResults {
  survey_id: string
  survey_name: string
  response_count: number
  questions: QuestionStat[]
}

// ---------------------------------------------------------------------------
// Scoring algorithms
// ---------------------------------------------------------------------------

export interface LabelThreshold {
  threshold: number  // 0–100 on the normalized scale
  label: string
  color: string      // CSS color string, e.g. "#22c55e"
}

export interface ScoringAlgorithm {
  id: string
  survey_id: string
  factor_id: string | null
  min_possible: number
  max_possible: number
  normalized_min: number
  normalized_max: number
  labels: LabelThreshold[] | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Factor scores
// ---------------------------------------------------------------------------

export interface FactorScoreEntry {
  raw_mean: number | null
  normalized: number | null
  label: string | null
  color: string | null
}

export interface RespondentFactorScores {
  response_id: string    // actual UUID — for deep-linking to the report
  respondent_id: string  // display label
  scores: Record<string, FactorScoreEntry>
}

export interface FactorScoresSummary {
  mean: Record<string, FactorScoreEntry>
  sd: Record<string, number | null>
}

export interface FactorScoresResponse {
  survey_id: string
  factors: string[]
  rows: RespondentFactorScores[]
  summary: FactorScoresSummary
}

// ---------------------------------------------------------------------------
// Participant report
// ---------------------------------------------------------------------------

export interface AnswerReport {
  question_id: string
  question_text: string
  factor: string | null
  value: string
  raw_score: number | null
  normalized: number | null
  label: string | null
  color: string | null
  reverse_scored: boolean
}

export interface FactorReport {
  factor_name: string
  item_count: number
  raw_mean: number | null
  normalized: number | null
  label: string | null
  color: string | null
}

export interface CompositeReport {
  normalized: number | null
  label: string | null
  color: string | null
}

export interface ParticipantReport {
  survey_id: string
  survey_title: string
  survey_description: string | null
  response_id: string
  respondent_ref: string | null
  submitted_at: string
  answers: AnswerReport[]
  factors: FactorReport[]
  composite: CompositeReport
}

// ---------------------------------------------------------------------------
// Dashboard / cohort analytics
// ---------------------------------------------------------------------------

export interface HistogramBin {
  start: number
  end: number
  count: number
}

export interface FactorDistribution {
  factor_name: string
  mean: number | null
  sd: number | null
  min: number | null
  max: number | null
  n: number
  histogram: HistogramBin[]
  label: string | null
  color: string | null
}

export interface DashboardData {
  survey_id: string
  response_count: number
  date_range_start: string | null
  date_range_end: string | null
  average_composite: number | null
  composite_label: string | null
  composite_color: string | null
  factor_distributions: FactorDistribution[]
  composite_histogram: HistogramBin[]
  demographic_keys: string[]
}

export interface GroupStats {
  group_value: string
  n: number
  mean: number | null
  sd: number | null
}

export interface FactorGroupComparison {
  factor_name: string
  groups: GroupStats[]
  test_type: string | null
  p_value: number | null
  significant: boolean
  effect_size: number | null
  effect_size_type: string | null
  interpretation: string
}

export interface GroupComparisonData {
  survey_id: string
  demographic_key: string
  group_values: string[]
  factors: FactorGroupComparison[]
}

export interface RespondentRow {
  response_id: string
  respondent_ref: string | null
  submitted_at: string
  composite_score: number | null
  composite_label: string | null
  composite_color: string | null
  factor_scores: Record<string, FactorScoreEntry>
  demographics: Record<string, string>
}

export interface RespondentsData {
  survey_id: string
  total: number
  page: number
  page_size: number
  rows: RespondentRow[]
}

// ---------------------------------------------------------------------------
// Response rate stats
// ---------------------------------------------------------------------------

export interface SurveyStats {
  survey_id: string
  total_invited: number
  total_responded: number
  response_rate: number  // 0–100
  last_response_at: string | null
  avg_completion_time_seconds: number | null
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

export interface SurveyInvite {
  id: string
  survey_id: string
  email: string
  token: string
  invited_at: string
  responded_at: string | null
  respond_url: string
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export type UserRoleValue = "admin" | "client"

export interface UserRole {
  user_id: string
  role: UserRoleValue
}

// ---------------------------------------------------------------------------
// Local builder state (client-only, not persisted until save)
// ---------------------------------------------------------------------------

export interface QuestionDraft {
  localId: string
  text: string
  question_type: QuestionType
  options: string[]                         // items for choice/ranking/forced_choice
  forced_choice_labels: [string, string]    // only used when question_type === "forced_choice"
  position: number
  // v0.4 psychometric fields
  factor: string                            // factor name, "" = none
  reverse_scored: boolean                   // Likert only
  score_weight: number                      // Likert only (default 1.0)
  option_scores: number[]                   // parallel to options[]; 0 = not scored
  // v0.6 demographic fields
  is_demographic: boolean
  demographic_key: string                   // "" = none
}

// ---------------------------------------------------------------------------
// Competency Framework types
// ---------------------------------------------------------------------------

export interface CompetencyOut {
  id: string
  framework_id: string
  name: string
  description: string | null
  order_index: number
}

export interface ProficiencyLevelOut {
  id: string
  framework_id: string
  level: number
  label: string
  description: string | null
  color: string | null
}

export interface FrameworkSurveyLink {
  id: string
  framework_id: string
  survey_id: string
  competency_id: string
}

export interface FrameworkOut {
  id: string
  user_id: string | null
  title: string
  description: string | null
  role_title: string | null
  created_at: string
  competencies: CompetencyOut[]
  proficiency_levels: ProficiencyLevelOut[]
  survey_links: FrameworkSurveyLink[]
}

export interface FrameworkListItem {
  id: string
  title: string
  description: string | null
  role_title: string | null
  created_at: string
  competency_count: number
}

export interface EmployeeProfileOut {
  id: string
  user_id: string | null
  framework_id: string
  name: string
  email: string | null
  department: string | null
  role_title: string | null
  created_at: string
}

export interface CompetencyScoreOut {
  id: string
  employee_profile_id: string
  competency_id: string
  survey_response_id: string | null
  normalized_score: number
  proficiency_level: number | null
  assessed_at: string
}

// Gap analysis

export interface CompetencyGap {
  competency_id: string
  competency_name: string
  required_level: number
  required_score: number
  actual_score: number | null
  actual_level: number | null
  gap: number | null
  priority: boolean
}

export interface GapReport {
  employee_id: string
  employee_name: string
  framework_id: string
  framework_title: string
  overall_readiness: number
  gaps: CompetencyGap[]
  top_priorities: CompetencyGap[]
}

export interface CompetencyTeamStats {
  competency_id: string
  competency_name: string
  mean_score: number | null
  level_distribution: Record<string, number>
  critical: boolean
}

export interface TeamHeatmapRow {
  employee_id: string
  employee_name: string
  scores: Record<string, number | null>
}

export interface TeamGapReport {
  framework_id: string
  framework_title: string
  employee_count: number
  competency_stats: CompetencyTeamStats[]
  heatmap: TeamHeatmapRow[]
  critical_gaps: CompetencyTeamStats[]
}

// ---------------------------------------------------------------------------
// Pulse Schedules
// ---------------------------------------------------------------------------

export type PulseFrequency = "weekly" | "biweekly" | "monthly"

export interface PulseScheduleOut {
  id: string
  framework_id: string
  survey_id: string
  frequency: PulseFrequency
  start_date: string
  end_date: string | null
  is_active: boolean
  created_at: string
  next_assessment_date: string | null
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

export interface BenchmarkOut {
  id: string
  framework_id: string
  competency_id: string
  required_score: number
  required_level: number
}

export type BenchmarkStatus = "below" | "meeting" | "exceeding" | "unassessed" | "no_benchmark"

export interface CompetencyComparison {
  competency_id: string
  competency_name: string
  benchmark_score: number | null
  actual_score: number | null
  gap: number | null
  pct_of_benchmark: number | null
  status: BenchmarkStatus
}

export interface BenchmarkComparison {
  employee_id: string
  employee_name: string
  framework_id: string
  framework_title: string
  overall_pct_of_benchmark: number
  comparisons: CompetencyComparison[]
}

export interface CompetencyReadiness {
  competency_id: string
  competency_name: string
  benchmark_score: number | null
  pct_meeting: number | null
  mean_score: number | null
}

export interface TeamBenchmarkSummary {
  framework_id: string
  framework_title: string
  employee_count: number
  overall_team_readiness: number
  competency_readiness: CompetencyReadiness[]
}

// ---------------------------------------------------------------------------
// Growth
// ---------------------------------------------------------------------------

export interface ScorePoint {
  assessed_at: string
  normalized_score: number
  proficiency_level: number | null
}

export interface CompetencyTrend {
  competency_id: string
  competency_name: string
  scores: ScorePoint[]
  trend: "improving" | "stable" | "declining" | "insufficient_data"
  current_score: number | null
  benchmark_score: number | null
  benchmark_status: "below" | "meeting" | "exceeding" | null
}

export interface GrowthProfile {
  employee_id: string
  employee_name: string
  framework_id: string
  framework_title: string
  role_title: string | null
  department: string | null
  competency_trends: CompetencyTrend[]
}

// ---------------------------------------------------------------------------
// Assessment Library
// ---------------------------------------------------------------------------

export interface InstrumentCategoryOut {
  id: string
  name: string
  description: string | null
  icon_name: string | null
  order_index: number
}

export interface InstrumentSubscaleOut {
  id: string
  instrument_id: string
  name: string
  description: string | null
  item_count: number
  scoring_notes: string | null
}

export interface InstrumentItemOut {
  id: string
  instrument_id: string
  subscale_id: string | null
  item_text: string
  item_text_ar: string | null
  order_index: number
  is_reverse_scored: boolean
  scoring_key: string | null
}

export interface InstrumentListItem {
  id: string
  name: string
  short_name: string
  description: string | null
  construct_measured: string | null
  category_id: string | null
  category_name: string | null
  license_type: string
  is_proprietary: boolean
  total_items: number
  estimated_minutes: number | null
  scoring_type: string
  response_format: string
  languages: string | null
  reliability_alpha: number | null
  subscale_count: number
}

export interface InstrumentOut {
  id: string
  category_id: string | null
  name: string
  short_name: string
  description: string | null
  construct_measured: string | null
  theoretical_framework: string | null
  source_citation: string | null
  source_url: string | null
  license_type: string
  is_proprietary: boolean
  total_items: number
  estimated_minutes: number | null
  scoring_type: string
  response_format: string
  validated_populations: string | null
  languages: string | null
  reliability_alpha: number | null
  is_active: boolean
  created_at: string
  subscales: InstrumentSubscaleOut[]
  items: InstrumentItemOut[]
}

export interface CategoryGroup {
  category: InstrumentCategoryOut
  instruments: InstrumentListItem[]
}

export interface LibraryGrouped {
  total_instruments: number
  categories: CategoryGroup[]
}

export interface DeployResponse {
  deployment_id: string
  survey_id: string
  instrument_id: string
  instrument_name: string
  items_deployed: number
  factors_created: number
}

// ---------------------------------------------------------------------------
// Interpretive report (AI-generated)
// ---------------------------------------------------------------------------

export type ReportPurpose = "hiring" | "development" | "research"

export interface InterpretiveReportContext {
  role?: string | null
  industry?: string | null
  purpose: ReportPurpose
}

export interface FactorNarrative {
  factor_name: string
  score: number
  label: string | null
  narrative: string
  strengths: string[]
  watch_outs: string[]
}

export interface InterpretiveReportData {
  overall_summary: string
  factor_narratives: FactorNarrative[]
  development_suggestions: string[]
  hiring_recommendation?: string
  role_fit_notes?: string
}

export interface InterpretiveReportOut {
  id: string
  response_id: string
  survey_id: string
  generated_at: string
  context: InterpretiveReportContext
  report: InterpretiveReportData
  model_used: string
}
