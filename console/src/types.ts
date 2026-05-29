export type Severity = 'informational' | 'moderate' | 'severe'
export type Priority = 'immediate' | 'staged'
export type OperatorAction = 'approve' | 'dismiss' | 'edit'

export interface Action {
  step: number
  description: string
  priority: Priority
}

export interface Assessment {
  severity: Severity
  confidence: number
  signals_used: string[]
  primary_signal: string
  rationale: string
  timestamp: string
}

export interface Plan {
  actions: Action[]
  reassess_in_minutes: number
  escalate_immediately: boolean
  escalation_reason: string | null
}

export interface Packet {
  headline: string
  severity: Severity
  location: string
  summary: string
  evidence: string[]
  recommended_actions: string[]
}

export interface AssessResult {
  incident_id: string
  assessment: Assessment
  plan: Plan
  packet: Packet
  escalate: boolean
  zone: string | null
  window_minutes: number
  pipeline_started_at: string
  pipeline_completed_at: string
}

export interface LatestSignals {
  zone: string
  density: number
  headcount: number
  speed_avg: number
  vehicle_count: number
  incident: string
  sentiment_score: number
  keywords: string[]
  timestamp: string | null
}

export interface Incident {
  incident_id: string
  severity: Severity
  location: string
  headline: string
  summary: string
  evidence: string[]
  recommended_actions: string[]
  operator_action: string
  created_at: string
  assessment?: Assessment
  plan?: Plan
}
