export interface Session {
  sessionId: string
  nickname: string
  deviceId?: string | null
  startedAt: string
  endedAt?: string | null
}

export interface TrackPoint {
  trackId: string
  pointId: string
  ts: string
  lat: number
  lng: number
  accuracy?: number | null
  nickname: string
}

export interface CreateSessionInput {
  sessionId: string
  nickname: string
  deviceId?: string | null
  startedAt: string
}

export interface EndSessionInput {
  sessionId: string
  endedAt: string
}

export interface TrackPointInput {
  trackId: string
  pointId: string
  ts: string
  lat: number
  lng: number
  accuracy?: number | null
  nickname: string
}

export interface ListSessionsByTimeVariables {
  start: string
  end: string
  limit?: number
  nextToken?: string
}

export interface ListTrackPointsVariables {
  trackId: string
  from?: string
  to?: string
  limit?: number
  nextToken?: string
}

export interface ListTrackPointsByTimeVariables {
  start: string
  end: string
  limit?: number
  nextToken?: string
}
