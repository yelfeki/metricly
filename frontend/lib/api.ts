import type {
  BatchDeployRequest,
  ImportResult,
  BatchDeployResponse,
  BenchmarkComparison,
  BenchmarkOut,
  CompetencyDetail,
  CompetencyFrameworkListItem,
  CompetencyListItem,
  CronbachAlphaResponse,
  DashboardData,
  DeployResponse,
  FactorScoresResponse,
  GrowthProfile,
  GroupComparisonData,
  IndustryDetailOut,
  IndustryInstrumentOut,
  IndustryOut,
  InstrumentCategoryOut,
  InterpretiveReportOut,
  InstrumentOut,
  LabelThreshold,
  LibraryGrouped,
  ParticipantReport,
  PulseFrequency,
  PulseScheduleOut,
  QuestionOut,
  ReportPurpose,
  RespondentsData,
  ResponseOut,
  ScoringAlgorithm,
  SkillsChatMessage,
  StrawManRequest,
  StrawManResponse,
  SurveyFactor,
  SurveyInvite,
  SurveyListItem,
  SurveyOut,
  SurveyResults,
  SurveyStats,
  TeamBenchmarkSummary,
  UserRole,
} from "./types"

export type { CronbachAlphaResponse }

// ---------------------------------------------------------------------------
// Auth token provider + session refresher
// Both are set once by AuthProvider on mount.
// ---------------------------------------------------------------------------

type TokenProvider = () => Promise<string | null>
let _tokenProvider: TokenProvider | null = null
let _sessionRefresher: TokenProvider | null = null

export function setTokenProvider(provider: TokenProvider) {
  _tokenProvider = provider
}

/** Called by AuthProvider to register a function that forces a Supabase
 *  token refresh. Used to recover from 401s without a page reload. */
export function setSessionRefresher(refresher: TokenProvider) {
  _sessionRefresher = refresher
}

async function getToken(): Promise<string | null> {
  return _tokenProvider ? _tokenProvider() : null
}

// ---------------------------------------------------------------------------
// Central fetch helper with automatic 401 → refresh → retry
// ---------------------------------------------------------------------------

async function apiFetch(
  path: string,
  init: RequestInit & { _auth?: boolean },
): Promise<Response> {
  const { _auth, ...fetchInit } = init
  const auth = _auth !== false
  const buildHeaders = async (token: string | null): Promise<Record<string, string>> => {
    const base = (fetchInit.headers ?? {}) as Record<string, string>
    return token ? { ...base, Authorization: `Bearer ${token}` } : base
  }

  let token = auth ? await getToken() : null
  let res = await fetch(path, { ...fetchInit, headers: await buildHeaders(token) })

  // On 401: refresh the session once and retry
  if (res.status === 401 && auth && _sessionRefresher) {
    token = await _sessionRefresher()
    if (token) {
      res = await fetch(path, { ...fetchInit, headers: await buildHeaders(token) })
    }
  }

  return res
}

function throwOnError(res: Response, payload: Record<string, unknown>): never {
  throw new Error(
    typeof payload.detail === "string"
      ? payload.detail
      : `Request failed with status ${res.status}`
  )
}

// ---------------------------------------------------------------------------
// Base fetch wrappers
// ---------------------------------------------------------------------------

async function post<T>(path: string, body: unknown, auth = true): Promise<T> {
  const res = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    _auth: auth,
  })
  if (!res.ok) throwOnError(res, await res.json().catch(() => ({})))
  return res.json() as Promise<T>
}

async function get<T>(path: string, auth = true): Promise<T> {
  const res = await apiFetch(path, { cache: "no-store", _auth: auth })
  if (!res.ok) throwOnError(res, await res.json().catch(() => ({})))
  return res.json() as Promise<T>
}

async function patch<T>(path: string, body: unknown, auth = true): Promise<T> {
  const res = await apiFetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    _auth: auth,
  })
  if (!res.ok) throwOnError(res, await res.json().catch(() => ({})))
  return res.json() as Promise<T>
}

async function del(path: string, auth = true): Promise<void> {
  const res = await apiFetch(path, { method: "DELETE", _auth: auth })
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

// Sprint 2 types (re-exported from the top-level import above)
// BenchmarkComparison, BenchmarkOut, GrowthProfile, PulseFrequency, PulseScheduleOut, TeamBenchmarkSummary
// are already imported at the top of this file.

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

// Pulse schedules
export const listPulseSchedules = (frameworkId: string): Promise<PulseScheduleOut[]> =>
  get(`/api/v1/frameworks/${frameworkId}/pulse-schedules`)

export const createPulseSchedule = (
  frameworkId: string,
  body: { survey_id: string; frequency: PulseFrequency; start_date: string; end_date: string | null; is_active: boolean }
): Promise<PulseScheduleOut> =>
  post(`/api/v1/frameworks/${frameworkId}/pulse-schedules`, body)

export const updatePulseSchedule = (
  frameworkId: string,
  scheduleId: string,
  body: Partial<{ frequency: PulseFrequency; start_date: string; end_date: string | null; is_active: boolean }>
): Promise<PulseScheduleOut> =>
  patch(`/api/v1/frameworks/${frameworkId}/pulse-schedules/${scheduleId}`, body)

export const deletePulseSchedule = (frameworkId: string, scheduleId: string): Promise<void> =>
  del(`/api/v1/frameworks/${frameworkId}/pulse-schedules/${scheduleId}`)

// Benchmarks
export const listBenchmarks = (frameworkId: string): Promise<BenchmarkOut[]> =>
  get(`/api/v1/frameworks/${frameworkId}/benchmarks`)

export const upsertBenchmark = (
  frameworkId: string,
  body: { competency_id: string; required_score: number; required_level: number }
): Promise<BenchmarkOut> =>
  post(`/api/v1/frameworks/${frameworkId}/benchmarks`, body)

export const getBenchmarkReport = (frameworkId: string, employeeId: string): Promise<BenchmarkComparison> =>
  get(`/api/v1/frameworks/${frameworkId}/benchmark-report?employee_id=${encodeURIComponent(employeeId)}`)

export const getTeamBenchmarkReport = (frameworkId: string): Promise<TeamBenchmarkSummary> =>
  get(`/api/v1/frameworks/${frameworkId}/team-benchmark-report`)

// Employee growth
export const getMyProfiles = (): Promise<EmployeeProfileOut[]> =>
  get("/api/v1/employees/me")

export const getEmployeeGrowth = (employeeId: string): Promise<GrowthProfile> =>
  get(`/api/v1/employees/${employeeId}/growth`)

// ---------------------------------------------------------------------------
// Assessment Library
// ---------------------------------------------------------------------------

export const getLibrary = (params?: { search?: string; category_id?: string }): Promise<LibraryGrouped> => {
  const q = new URLSearchParams()
  if (params?.search) q.set("search", params.search)
  if (params?.category_id) q.set("category_id", params.category_id)
  const qs = q.toString()
  return get(`/api/v1/library${qs ? `?${qs}` : ""}`)
}

export const getLibraryCategories = (): Promise<InstrumentCategoryOut[]> =>
  get("/api/v1/library/categories")

export const getInstrument = (instrumentId: string): Promise<InstrumentOut> =>
  get(`/api/v1/library/instruments/${instrumentId}`)

export const deployInstrument = (
  instrumentId: string,
  body: { item_ids?: string[] | null; customization_notes?: string | null }
): Promise<DeployResponse> =>
  post(`/api/v1/library/instruments/${instrumentId}/deploy`, body)

// ---------------------------------------------------------------------------
// Interpretive Reports (AI-generated)
// ---------------------------------------------------------------------------

export interface InterpretiveReportRequest {
  role?: string | null
  industry?: string | null
  purpose: ReportPurpose
  force?: boolean
}

export const generateInterpretiveReport = (
  surveyId: string,
  responseId: string,
  body: InterpretiveReportRequest
): Promise<InterpretiveReportOut> =>
  post(`/api/v1/surveys/${surveyId}/responses/${responseId}/interpretive-report`, body)

export const getInterpretiveReport = (
  surveyId: string,
  responseId: string
): Promise<InterpretiveReportOut> =>
  get(`/api/v1/surveys/${surveyId}/responses/${responseId}/interpretive-report`)

// ---------------------------------------------------------------------------
// Skills Explorer
// ---------------------------------------------------------------------------

export const chatSkillsExplorer = (
  messages: SkillsChatMessage[]
): Promise<{ content: string }> =>
  post(`/api/v1/skills-explorer/chat`, { messages })

export const batchDeploy = (
  body: BatchDeployRequest
): Promise<BatchDeployResponse> =>
  post(`/api/v1/library/batch-deploy`, body)

export const requestAssessment = (
  skill_name: string,
  context?: string,
  requester_email?: string,
): Promise<{ success: boolean; id: string }> =>
  post(`/api/v1/skills-explorer/request-assessment`, {
    skill_name,
    context,
    requester_email,
  })

// ---------------------------------------------------------------------------
// Competency Framework Database
// ---------------------------------------------------------------------------

export const getCompetencyFrameworks = (): Promise<CompetencyFrameworkListItem[]> =>
  get(`/api/v1/competencies/frameworks`)

export const getCompetencies = (params?: {
  framework_id?: string
  factor?: string
  cluster?: string
  category?: string
  is_leadership?: boolean
}): Promise<CompetencyListItem[]> => {
  const qs = new URLSearchParams()
  if (params?.framework_id) qs.set("framework_id", params.framework_id)
  if (params?.factor) qs.set("factor", params.factor)
  if (params?.cluster) qs.set("cluster", params.cluster)
  if (params?.category) qs.set("category", params.category)
  if (params?.is_leadership !== undefined) qs.set("is_leadership", String(params.is_leadership))
  const query = qs.toString()
  return get(`/api/v1/competencies${query ? `?${query}` : ""}`)
}

export const getCompetency = (id: string): Promise<CompetencyDetail> =>
  get(`/api/v1/competencies/${id}`)

export const generateStrawMan = (body: StrawManRequest): Promise<StrawManResponse> =>
  post(`/api/v1/competencies/straw-man`, body)

export const exportStrawMan = async (body: StrawManRequest): Promise<Blob> => {
  const res = await apiFetch(`/api/v1/competencies/straw-man/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Export failed: ${res.status}`)
  return res.blob()
}

// ---------------------------------------------------------------------------
// Guided-flow ranker + library-import endpoints
// ---------------------------------------------------------------------------

export interface RankRequest {
  role: string
  level: "IC" | "Team Lead" | "Manager" | "Director+"
  outcome: string
  gaps: string[]
  size: "lean" | "standard" | "comprehensive"
  required_ids?: string[] | null
}

export interface RankedItem {
  competency_id: string
  name: string
  definition: string | null
  cluster: string | null
  role_family: string | null
  framework_id: string
  framework_name: string
  score: number
  rationale: string
  suggested_proficiency_level: number
}

export interface RankResponse {
  role_family_inferred: string | null
  ranked: RankedItem[]
}

export const rankForFramework = (body: RankRequest): Promise<RankResponse> =>
  post(`/api/v1/competencies/rank-for-framework`, body)

export interface FromLibraryItem {
  library_competency_id: string
  order_index?: number
  suggested_proficiency_level?: number | null
}

export interface FrameworkFromLibraryRequest {
  title: string
  description?: string | null
  role_title?: string | null
  competencies: FromLibraryItem[]
}

export const createFrameworkFromLibrary = (
  body: FrameworkFromLibraryRequest,
): Promise<FrameworkOut> => post(`/api/v1/frameworks/from-library`, body)

export const importCompetencyFromLibrary = (
  frameworkId: string,
  body: {
    library_competency_id: string
    order_index?: number
    suggested_proficiency_level?: number | null
  },
): Promise<CompetencyOut> =>
  post(`/api/v1/frameworks/${frameworkId}/competencies/import-from-library`, body)

export interface PickerCandidate {
  library_competency_id: string
  name: string
  definition: string | null
  role_family: string | null
  cluster: string | null
  framework_source: string | null
  framework_name: string
  is_custom: boolean
  status: "active" | "draft" | "archived"
}

export const getPickerCandidates = (
  frameworkId: string,
  params?: { role_family?: string; cluster?: string; q?: string },
): Promise<PickerCandidate[]> => {
  const qs = new URLSearchParams()
  if (params?.role_family) qs.set("role_family", params.role_family)
  if (params?.cluster) qs.set("cluster", params.cluster)
  if (params?.q) qs.set("q", params.q)
  const query = qs.toString()
  return get(
    `/api/v1/frameworks/${frameworkId}/competencies/picker-candidates${query ? `?${query}` : ""}`,
  )
}

export interface CompetencyLevelView {
  level: number
  label: string
  descriptor: string | null
  behavioral_indicators: string[]
  example_behaviors: string[]
}

export interface LinkedSurveyView {
  survey_id: string
  survey_name: string | null
}

export interface CompetencyDetailView {
  id: string
  framework_id: string
  name: string
  description: string | null
  cluster: string | null
  order_index: number
  library_competency_id: string | null
  library_framework_source: string | null
  library_role_family: string | null
  library_framework_name: string | null
  // Custom-competency overlay (when imported from a custom library row)
  library_is_custom: boolean
  library_status: "active" | "draft" | "archived"
  library_organization_id: string | null
  levels: CompetencyLevelView[]
  linked_survey: LinkedSurveyView | null
}

export const getFrameworkCompetencyDetail = (
  frameworkId: string,
  competencyId: string,
): Promise<CompetencyDetailView> =>
  get(`/api/v1/frameworks/${frameworkId}/competencies/${competencyId}/detail`)

// ---------------------------------------------------------------------------
// Custom competency CRUD
// ---------------------------------------------------------------------------

export interface CustomCompetencyLevelInput {
  level: number
  label?: string | null
  descriptor?: string | null
  behavioral_indicators: string[]
  example_behaviors: string[]
}

export interface CustomCompetencyCreate {
  name: string
  definition: string
  role_family: string
  cluster: string
  framework_source?: string | null
  levels?: CustomCompetencyLevelInput[]
}

export interface CustomCompetencyUpdate {
  name?: string
  definition?: string
  role_family?: string
  cluster?: string
  framework_source?: string | null
  // When provided, replaces ALL existing levels atomically.
  levels?: CustomCompetencyLevelInput[]
}

export interface FrameworkUsage {
  competency_id: string
  framework_count: number
  framework_titles: string[]
}

export interface ClusterOptions {
  options: Record<string, string[]>  // role_family -> sorted cluster names
}

export const createCustomCompetency = (
  body: CustomCompetencyCreate,
): Promise<CompetencyDetail> => post(`/api/v1/competencies/custom`, body)

export const updateCustomCompetency = (
  competencyId: string,
  body: CustomCompetencyUpdate,
): Promise<CompetencyDetail> =>
  patch(`/api/v1/competencies/custom/${competencyId}`, body)

export const getFrameworkUsage = (competencyId: string): Promise<FrameworkUsage> =>
  get(`/api/v1/competencies/custom/${competencyId}/framework-usage`)

export const getClusterOptions = (): Promise<ClusterOptions> =>
  get(`/api/v1/competencies/cluster-options`)

// ---------------------------------------------------------------------------
// Industry Library
// ---------------------------------------------------------------------------

export const getIndustries = (): Promise<IndustryOut[]> =>
  get(`/api/v1/library/industries`)

export const getIndustryDetail = (slug: string): Promise<IndustryDetailOut> =>
  get(`/api/v1/library/industries/${slug}`)

export const getIndustryInstruments = (slug: string): Promise<IndustryInstrumentOut[]> =>
  get(`/api/v1/library/industries/${slug}/instruments`)

// ---------------------------------------------------------------------------
// Survey import
// ---------------------------------------------------------------------------

export async function downloadImportTemplate(): Promise<void> {
  const res = await apiFetch("/api/v1/surveys/import/template", { cache: "no-store" })
  if (!res.ok) throw new Error("Could not download template")
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "Metricly_Survey_Template.xlsx"
  a.click()
  URL.revokeObjectURL(url)
}

export async function importSurveyFile(file: File): Promise<ImportResult> {
  const form = new FormData()
  form.append("file", file)
  const token = await getToken()
  const headers: Record<string, string> = {}
  if (token) headers["Authorization"] = `Bearer ${token}`
  const res = await fetch("/api/v1/surveys/import", { method: "POST", headers, body: form })
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(typeof payload.detail === "string" ? payload.detail : `Import failed: ${res.status}`)
  }
  return res.json()
}
