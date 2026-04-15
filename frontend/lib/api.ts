import type {
  CronbachAlphaResponse,
  DashboardData,
  FactorScoresResponse,
  GroupComparisonData,
  LabelThreshold,
  ParticipantReport,
  QuestionOut,
  RespondentsData,
  ResponseOut,
  ScoringAlgorithm,
  SurveyFactor,
  SurveyInvite,
  SurveyListItem,
  SurveyOut,
  SurveyResults,
  SurveyStats,
  UserRole,
} from "./types"

export type { CronbachAlphaResponse }

// ---------------------------------------------------------------------------
// Auth token provider
// Set once by AuthProvider; all fetch wrappers call it automatically.
// ---------------------------------------------------------------------------

type TokenProvider = () => Promise<string | null>
let _tokenProvider: TokenProvider | null = null

export function setTokenProvider(provider: TokenProvider) {
  _tokenProvider = provider
}

async function authHeader(): Promise<Record<string, string>> {
  if (!_tokenProvider) return {}
  const token = await _tokenProvider()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// ---------------------------------------------------------------------------
// Base fetch wrappers
// ---------------------------------------------------------------------------

async function post<T>(path: string, body: unknown, auth = true): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (auth) Object.assign(headers, await authHeader())
  const res = await fetch(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(
      typeof payload.detail === "string"
        ? payload.detail
        : `Request failed with status ${res.status}`
    )
  }
  return res.json() as Promise<T>
}

async function get<T>(path: string, auth = true): Promise<T> {
  const headers: Record<string, string> = {}
  if (auth) Object.assign(headers, await authHeader())
  const res = await fetch(path, { cache: "no-store", headers })
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(
      typeof payload.detail === "string"
        ? payload.detail
        : `Request failed with status ${res.status}`
    )
  }
  return res.json() as Promise<T>
}

async function patch<T>(path: string, body: unknown, auth = true): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (auth) Object.assign(headers, await authHeader())
  const res = await fetch(path, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(
      typeof payload.detail === "string"
        ? payload.detail
        : `Request failed with status ${res.status}`
    )
  }
  return res.json() as Promise<T>
}

async function del(path: string, auth = true): Promise<void> {
  const headers: Record<string, string> = {}
  if (auth) Object.assign(headers, await authHeader())
  const res = await fetch(path, { method: "DELETE", headers })
  if (!res.ok && res.status !== 204) {
    throw new Error(`Request failed with status ${res.status}`)
  }
}

// ---------------------------------------------------------------------------
// Psychometric engine (no auth required)
// ---------------------------------------------------------------------------

export function runCronbachAlpha(
  items: number[][],
  scaleName?: string
): Promise<CronbachAlphaResponse> {
  return post<CronbachAlphaResponse>(
    "/api/v1/reliability/cronbach-alpha",
    { items, scale_name: scaleName || null },
    false
  )
}

// ---------------------------------------------------------------------------
// Surveys
// ---------------------------------------------------------------------------

export interface ForcedChoiceConfigPayload {
  items: string[]
  labels: [string, string]
}

export interface QuestionCreatePayload {
  text: string
  question_type: string
  options?: string[] | null
  forced_choice_config?: ForcedChoiceConfigPayload | null
  position: number
  factor?: string | null
  reverse_scored?: boolean
  score_weight?: number
  option_scores?: Record<string, number> | null
  is_demographic?: boolean
  demographic_key?: string | null
}

export interface SurveyCreatePayload {
  name: string
  description: string | null
  status: "draft" | "published"
  questions: QuestionCreatePayload[]
}

export interface SurveyUpdatePayload {
  name?: string
  description?: string | null
  status?: "draft" | "published" | "closed"
}

export const getSurveys = (): Promise<SurveyListItem[]> =>
  get("/api/v1/surveys")

export const getSurvey = (id: string): Promise<SurveyOut> =>
  get(`/api/v1/surveys/${id}`)

export const createSurvey = (body: SurveyCreatePayload): Promise<SurveyOut> =>
  post("/api/v1/surveys", body)

export const updateSurvey = (id: string, body: SurveyUpdatePayload): Promise<SurveyOut> =>
  patch(`/api/v1/surveys/${id}`, body)

export const deleteSurvey = (id: string): Promise<void> =>
  del(`/api/v1/surveys/${id}`)

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export interface QuestionUpdatePayload {
  text?: string
  question_type?: string
  options?: string[] | null
  forced_choice_config?: ForcedChoiceConfigPayload | null
  position?: number
  factor?: string | null
  reverse_scored?: boolean
  score_weight?: number
  option_scores?: Record<string, number> | null
  is_demographic?: boolean
  demographic_key?: string | null
}

export const addQuestion = (surveyId: string, body: QuestionCreatePayload): Promise<QuestionOut> =>
  post(`/api/v1/surveys/${surveyId}/questions`, body)

export const updateQuestion = (id: string, body: QuestionUpdatePayload): Promise<QuestionOut> =>
  patch(`/api/v1/questions/${id}`, body)

export const deleteQuestion = (id: string): Promise<void> =>
  del(`/api/v1/questions/${id}`)

// ---------------------------------------------------------------------------
// Factors
// ---------------------------------------------------------------------------

export interface SurveyFactorPayload {
  name: string
  description?: string | null
}

export const getFactors = (surveyId: string): Promise<SurveyFactor[]> =>
  get(`/api/v1/surveys/${surveyId}/factors`)

export const createFactor = (surveyId: string, body: SurveyFactorPayload): Promise<SurveyFactor> =>
  post(`/api/v1/surveys/${surveyId}/factors`, body)

export const updateFactor = (
  surveyId: string,
  factorId: string,
  body: Partial<SurveyFactorPayload>
): Promise<SurveyFactor> =>
  patch(`/api/v1/surveys/${surveyId}/factors/${factorId}`, body)

export const deleteFactor = (surveyId: string, factorId: string): Promise<void> =>
  del(`/api/v1/surveys/${surveyId}/factors/${factorId}`)

// ---------------------------------------------------------------------------
// Scoring algorithms
// ---------------------------------------------------------------------------

export interface ScoringAlgorithmPayload {
  factor_id?: string | null
  min_possible: number
  max_possible: number
  normalized_min?: number
  normalized_max?: number
  labels?: LabelThreshold[] | null
}

export interface ScoringAlgorithmUpdatePayload {
  min_possible?: number
  max_possible?: number
  normalized_min?: number
  normalized_max?: number
  labels?: LabelThreshold[] | null
}

export const getAlgorithms = (surveyId: string): Promise<ScoringAlgorithm[]> =>
  get(`/api/v1/surveys/${surveyId}/scoring-algorithms`)

export const createAlgorithm = (
  surveyId: string,
  body: ScoringAlgorithmPayload
): Promise<ScoringAlgorithm> =>
  post(`/api/v1/surveys/${surveyId}/scoring-algorithms`, body)

export const updateAlgorithm = (
  surveyId: string,
  algoId: string,
  body: ScoringAlgorithmUpdatePayload
): Promise<ScoringAlgorithm> =>
  patch(`/api/v1/surveys/${surveyId}/scoring-algorithms/${algoId}`, body)

export const deleteAlgorithm = (surveyId: string, algoId: string): Promise<void> =>
  del(`/api/v1/surveys/${surveyId}/scoring-algorithms/${algoId}`)

// ---------------------------------------------------------------------------
// Responses  (public — no auth header)
// ---------------------------------------------------------------------------

export interface AnswerPayload {
  question_id: string
  value: string
}

export interface ResponsePayload {
  answers: AnswerPayload[]
  respondent_ref?: string | null
}

export const submitResponse = (surveyId: string, body: ResponsePayload): Promise<ResponseOut> =>
  post(`/api/v1/surveys/${surveyId}/responses`, body, false)

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export const getSurveyResults = (surveyId: string): Promise<SurveyResults> =>
  get(`/api/v1/surveys/${surveyId}/results`)

export const getSurveyReliability = (surveyId: string): Promise<CronbachAlphaResponse> =>
  get(`/api/v1/surveys/${surveyId}/analyse/reliability`)

export const getFactorScores = (surveyId: string): Promise<FactorScoresResponse> =>
  get(`/api/v1/surveys/${surveyId}/factor-scores`)

export const getParticipantReport = (
  surveyId: string,
  responseId: string
): Promise<ParticipantReport> =>
  get(`/api/v1/surveys/${surveyId}/responses/${responseId}/report`)

// ---------------------------------------------------------------------------
// Dashboard / cohort analytics
// ---------------------------------------------------------------------------

export const getDashboard = (surveyId: string): Promise<DashboardData> =>
  get(`/api/v1/surveys/${surveyId}/dashboard`)

export const getGroupComparison = (
  surveyId: string,
  demographicKey: string
): Promise<GroupComparisonData> =>
  get(`/api/v1/surveys/${surveyId}/group-comparison?demographic_key=${encodeURIComponent(demographicKey)}`)

export const getRespondents = (
  surveyId: string,
  page = 1,
  pageSize = 20,
  sortDir: "asc" | "desc" = "desc"
): Promise<RespondentsData> =>
  get(`/api/v1/surveys/${surveyId}/respondents?page=${page}&page_size=${pageSize}&sort_dir=${sortDir}`)

// ---------------------------------------------------------------------------
// Stats (response rate)
// ---------------------------------------------------------------------------

export const getSurveyStats = (surveyId: string): Promise<SurveyStats> =>
  get(`/api/v1/surveys/${surveyId}/stats`)

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

export const createInvites = (surveyId: string, emails: string[]): Promise<SurveyInvite[]> =>
  post(`/api/v1/surveys/${surveyId}/invites`, { emails })

export const listInvites = (surveyId: string): Promise<SurveyInvite[]> =>
  get(`/api/v1/surveys/${surveyId}/invites`)

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export const getMyRole = (): Promise<UserRole> =>
  get("/api/v1/users/me/role")

// ---------------------------------------------------------------------------
// Frameworks
// ---------------------------------------------------------------------------

import type {
  CompetencyOut,
  CompetencyScoreOut,
  EmployeeProfileOut,
  FrameworkListItem,
  FrameworkOut,
  FrameworkSurveyLink,
  GapReport,
  ProficiencyLevelOut,
  TeamGapReport,
} from "./types"

// Framework CRUD
export const listFrameworks = (): Promise<FrameworkListItem[]> =>
  get("/api/v1/frameworks")

export const createFramework = (body: {
  title: string
  description?: string | null
  role_title?: string | null
}): Promise<FrameworkOut> => post("/api/v1/frameworks", body)

export const getFramework = (id: string): Promise<FrameworkOut> =>
  get(`/api/v1/frameworks/${id}`)

export const updateFramework = (
  id: string,
  body: { title?: string; description?: string | null; role_title?: string | null }
): Promise<FrameworkOut> => patch(`/api/v1/frameworks/${id}`, body)

export const deleteFramework = (id: string): Promise<void> =>
  del(`/api/v1/frameworks/${id}`)

// Competencies
export const addCompetency = (
  frameworkId: string,
  body: { name: string; description?: string | null; order_index?: number }
): Promise<CompetencyOut> => post(`/api/v1/frameworks/${frameworkId}/competencies`, body)

export const updateCompetency = (
  frameworkId: string,
  competencyId: string,
  body: { name?: string; description?: string | null; order_index?: number }
): Promise<CompetencyOut> =>
  patch(`/api/v1/frameworks/${frameworkId}/competencies/${competencyId}`, body)

export const deleteCompetency = (frameworkId: string, competencyId: string): Promise<void> =>
  del(`/api/v1/frameworks/${frameworkId}/competencies/${competencyId}`)

// Proficiency levels
export const addProficiencyLevel = (
  frameworkId: string,
  body: { level: number; label: string; description?: string | null; color?: string | null }
): Promise<ProficiencyLevelOut> =>
  post(`/api/v1/frameworks/${frameworkId}/proficiency-levels`, body)

export const updateProficiencyLevel = (
  frameworkId: string,
  levelId: string,
  body: { label?: string; description?: string | null; color?: string | null }
): Promise<ProficiencyLevelOut> =>
  patch(`/api/v1/frameworks/${frameworkId}/proficiency-levels/${levelId}`, body)

export const deleteProficiencyLevel = (frameworkId: string, levelId: string): Promise<void> =>
  del(`/api/v1/frameworks/${frameworkId}/proficiency-levels/${levelId}`)

// Survey linking
export const linkSurvey = (
  frameworkId: string,
  body: { survey_id: string; competency_id: string }
): Promise<FrameworkSurveyLink> => post(`/api/v1/frameworks/${frameworkId}/link-survey`, body)

export const unlinkSurvey = (frameworkId: string, competencyId: string): Promise<void> =>
  del(`/api/v1/frameworks/${frameworkId}/link-survey/${competencyId}`)

// Employees
export const listEmployees = (frameworkId: string): Promise<EmployeeProfileOut[]> =>
  get(`/api/v1/frameworks/${frameworkId}/employees`)

export const createEmployee = (
  frameworkId: string,
  body: { name: string; email?: string | null; department?: string | null; role_title?: string | null }
): Promise<EmployeeProfileOut> => post(`/api/v1/frameworks/${frameworkId}/employees`, body)

export const deleteEmployee = (frameworkId: string, employeeId: string): Promise<void> =>
  del(`/api/v1/frameworks/${frameworkId}/employees/${employeeId}`)

// Scores
export const submitCompetencyScore = (
  frameworkId: string,
  employeeId: string,
  body: { competency_id: string; normalized_score: number; survey_response_id?: string | null }
): Promise<CompetencyScoreOut> =>
  post(`/api/v1/frameworks/${frameworkId}/employees/${employeeId}/scores`, body)

// Gap reports
export const getGapReport = (frameworkId: string, employeeId: string): Promise<GapReport> =>
  get(`/api/v1/frameworks/${frameworkId}/gap-report?employee_id=${encodeURIComponent(employeeId)}`)

export const getTeamGapReport = (frameworkId: string): Promise<TeamGapReport> =>
  get(`/api/v1/frameworks/${frameworkId}/team-gap-report`)
