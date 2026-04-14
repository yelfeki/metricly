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

export type SurveyStatus = "draft" | "published"

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
}
