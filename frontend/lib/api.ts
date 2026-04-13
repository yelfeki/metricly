import type {
  CronbachAlphaResponse,
  QuestionOut,
  ResponseOut,
  SurveyListItem,
  SurveyOut,
  SurveyResults,
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
  status?: "draft" | "published"
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
  position?: number
}

export const addQuestion = (surveyId: string, body: QuestionCreatePayload): Promise<QuestionOut> =>
  post(`/api/v1/surveys/${surveyId}/questions`, body)

export const updateQuestion = (id: string, body: QuestionUpdatePayload): Promise<QuestionOut> =>
  patch(`/api/v1/questions/${id}`, body)

export const deleteQuestion = (id: string): Promise<void> =>
  del(`/api/v1/questions/${id}`)

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
