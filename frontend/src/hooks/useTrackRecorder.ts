import { useCallback, useEffect, useRef, useState } from 'react'
import { v4 as uuid } from 'uuid'
import type { Session, TrackPoint, TrackPointInput } from '../amplify/types'
import { putTrackPoints } from '../services/appsyncService'

const FLUSH_INTERVAL_MS = 15000

export interface UseTrackRecorderOptions {
  session: Session | null
  autoStart?: boolean
  onError?: (message: string) => void
}

export interface TrackRecorderState {
  points: TrackPoint[]
  isTracking: boolean
  lastSyncAt?: number
  start: () => Promise<void>
  stop: () => void
  flushNow: () => Promise<void>
}

export const useTrackRecorder = ({
  session,
  autoStart = false,
  onError,
}: UseTrackRecorderOptions): TrackRecorderState => {
  const [points, setPoints] = useState<TrackPoint[]>([])
  const [isTracking, setIsTracking] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<number>()

  const bufferRef = useRef<TrackPointInput[]>([])
  const watchIdRef = useRef<number | null>(null)
  const isFlushingRef = useRef(false)

  const resetRecorder = useCallback(() => {
    setPoints([])
    bufferRef.current = []
    setIsTracking(false)
    setLastSyncAt(undefined)
  }, [])

  const stopWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setIsTracking(false)
  }, [])

  useEffect(() => {
    if (!session) {
      stopWatch()
      resetRecorder()
    }
  }, [session, resetRecorder, stopWatch])

  const flushNow = useCallback(async () => {
    if (!session || isFlushingRef.current) {
      return
    }

    const pending = bufferRef.current
    if (!pending.length) {
      return
    }

    if (!navigator.onLine) {
      return
    }

    isFlushingRef.current = true
    try {
      await putTrackPoints([...pending])
      bufferRef.current = []
      setLastSyncAt(Date.now())
    } catch (error) {
      console.error('[track-recorder] flush failed', error)
      onError?.('位置情報の送信に失敗しました。通信状況を確認してください。')
    } finally {
      isFlushingRef.current = false
    }
  }, [onError, session])

  const handlePosition = useCallback(
    (position: GeolocationPosition) => {
      if (!session) {
        return
      }

      const ts = new Date(position.timestamp || Date.now()).toISOString()
      const nextPoint: TrackPoint = {
        trackId: session.sessionId,
        pointId: uuid(),
        ts,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy ?? undefined,
        nickname: session.nickname,
      }

      bufferRef.current = [...bufferRef.current, nextPoint]
      setPoints((previous) => [...previous, nextPoint])
    },
    [session],
  )

  const handleError = useCallback(
    (error: GeolocationPositionError) => {
      console.error('[track-recorder] geolocation error', error)
      let message = '位置情報の取得に失敗しました。'

      if (error.code === error.PERMISSION_DENIED) {
        message =
          '位置情報利用が許可されていません。ブラウザ設定を確認してください。'
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        message = '現在位置を取得できませんでした。'
      } else if (error.code === error.TIMEOUT) {
        message = '位置情報の取得がタイムアウトしました。'
      }

      onError?.(message)
    },
    [onError],
  )

  const start = useCallback(async () => {
    if (!session) {
      onError?.('セッションを開始してください。')
      return
    }

    if (!('geolocation' in navigator)) {
      onError?.('この端末では位置情報が利用できません。')
      return
    }

    if (watchIdRef.current !== null) {
      return
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 20000,
      },
    )

    setIsTracking(true)
  }, [handleError, handlePosition, onError, session])

  const stop = useCallback(() => {
    stopWatch()
    void flushNow()
  }, [flushNow, stopWatch])

  useEffect(() => {
    if (!session || !autoStart) {
      return
    }

    void start()
  }, [autoStart, session, start])

  useEffect(() => {
    if (!isTracking) {
      return
    }

    const id = window.setInterval(() => {
      void flushNow()
    }, FLUSH_INTERVAL_MS)

    return () => {
      window.clearInterval(id)
      void flushNow()
    }
  }, [flushNow, isTracking])

  useEffect(() => {
    const handleOnline = () => {
      void flushNow()
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [flushNow])

  return {
    points,
    isTracking,
    lastSyncAt,
    start,
    stop,
    flushNow,
  }
}
