import { useCallback, useEffect, useRef, useState } from 'react'
import { listTrackPointsByTime } from '../services/appsyncService'
import type { TrackPoint } from '../amplify/types'

export interface LiveTracksOptions {
  enabled: boolean
  trackWindowMinutes?: number
  pollingIntervalMs?: number
  excludeTrackId?: string
  onError?: (message: string) => void
}

export interface LiveTracksState {
  grouped: Record<string, TrackPoint[]>
  flat: TrackPoint[]
  lastFetchedAt?: number
}

const groupByTrack = (points: TrackPoint[]) => {
  return points.reduce<Record<string, TrackPoint[]>>((acc, point) => {
    const key = point.trackId
    acc[key] = acc[key] ? [...acc[key], point] : [point]
    return acc
  }, {})
}

export const useLiveTracks = ({
  enabled,
  trackWindowMinutes = 10,
  pollingIntervalMs = 15000,
  excludeTrackId,
  onError,
}: LiveTracksOptions): LiveTracksState => {
  const [flat, setFlat] = useState<TrackPoint[]>([])
  const [lastFetchedAt, setLastFetchedAt] = useState<number>()
  const pollingRef = useRef<number | undefined>(undefined)

  const fetchLatest = useCallback(async () => {
    const now = Date.now()
    const end = new Date(now).toISOString()
    const start = new Date(now - trackWindowMinutes * 60_000).toISOString()

    try {
      const data = await listTrackPointsByTime({
        start,
        end,
        limit: 2000,
      })

      const filtered = excludeTrackId
        ? data.filter((point) => point.trackId !== excludeTrackId)
        : data

      const sorted = [...filtered].sort(
        (a, b) =>
          new Date(a.ts).getTime() - new Date(b.ts).getTime() ||
          a.trackId.localeCompare(b.trackId),
      )

      setFlat(sorted)
      setLastFetchedAt(now)
    } catch (error) {
      console.error('[live-tracks] fetch failed', error)
      onError?.('最新データの取得に失敗しました。')
    }
  }, [excludeTrackId, onError, trackWindowMinutes])

  useEffect(() => {
    if (!enabled) {
      return
    }

    void fetchLatest()

    pollingRef.current = window.setInterval(() => {
      void fetchLatest()
    }, pollingIntervalMs)

    return () => {
      if (pollingRef.current !== undefined) {
        window.clearInterval(pollingRef.current)
      }
    }
  }, [enabled, fetchLatest, pollingIntervalMs])

  return {
    flat,
    grouped: groupByTrack(flat),
    lastFetchedAt,
  }
}
