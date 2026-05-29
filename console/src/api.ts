import axios from 'axios'
import type { AssessResult, Incident, LatestSignals, OperatorAction } from './types'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const http = axios.create({ baseURL: BASE, timeout: 180_000 })

export async function runAssessment(zone: string | null, windowMinutes = 30): Promise<AssessResult> {
  const { data } = await http.post<AssessResult>('/assess', {
    zone: zone || null,
    window_minutes: windowMinutes,
  })
  return data
}

export async function listIncidents(limit = 20): Promise<Incident[]> {
  const { data } = await http.get<{ incidents: Incident[]; count: number }>('/incidents', {
    params: { limit },
  })
  return data.incidents
}

export async function getIncident(id: string): Promise<Incident> {
  const { data } = await http.get<Incident>(`/incidents/${id}`)
  return data
}

export async function getSignals(stream: 'crowd' | 'traffic' | 'sentiment', minutes = 30) {
  const { data } = await http.get<Record<string, unknown>[]>(`/signals/${stream}`, {
    params: { minutes },
    timeout: 15_000,
  })
  return data
}

export async function getLatestSignals(zone: string): Promise<LatestSignals> {
  const { data } = await http.get<LatestSignals>(`/signals/latest/${zone}`, { timeout: 15_000 })
  return data
}

export async function approve(
  incidentId: string,
  action: OperatorAction,
  note = '',
): Promise<void> {
  await http.post('/approve', { incident_id: incidentId, action, note })
}
