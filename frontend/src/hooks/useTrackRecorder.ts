import { useCallback, useEffect, useRef, useState } from 'react'
import { v4 as uuid } from 'uuid'
import type { Session, TrackPoint, TrackPointInput } from '../amplify/types'
import { putTrackPoints } from '../services/appsyncService'

const FAST_FLUSH_INTERVAL_MS = 15000
const SLOW_FLUSH_INTERVAL_MS = 60000
const SPEED_FAST_THRESHOLD_MPS = 5
const SPEED_SLOW_THRESHOLD_MPS = 3
const EARTH_RADIUS_M = 6371000
const SLOW_MOVEMENT_MIN_DISTANCE_M = 25
const SLOW_MOVEMENT_MIN_INTERVAL_MS = 180000 // ensure we still persist at least once every ~3 min when idle

type LatLng = { readonly latitude: number; readonly longitude: number }

const toRadians = (value: number) => (value * Math.PI) / 180

const getDistanceMeters = (from: LatLng, to: LatLng) => {
  const deltaLat = toRadians(to.latitude - from.latitude)
  const deltaLng = toRadians(to.longitude - from.longitude)
  const lat1 = toRadians(from.latitude)
  const lat2 = toRadians(to.latitude)
  const sinDeltaLat = Math.sin(deltaLat / 2)
  const sinDeltaLng = Math.sin(deltaLng / 2)

  const haversine =
    sinDeltaLat * sinDeltaLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDeltaLng * sinDeltaLng
  const arc = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  return EARTH_RADIUS_M * arc
}

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
  flushNow: () => Promise<boolean>
  movementState: 'slow' | 'fast'
  flushIntervalMs: number
  speedMps: number | null
}

export const useTrackRecorder = ({
  session,
  autoStart = false,
  onError,
}: UseTrackRecorderOptions): TrackRecorderState => {
  const [points, setPoints] = useState<TrackPoint[]>([])
  const [isTracking, setIsTracking] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<number>()
  const [movementState, setMovementState] = useState<'slow' | 'fast'>('slow')
  const [speedMps, setSpeedMps] = useState<number | null>(null)

  const bufferRef = useRef<TrackPointInput[]>([])
  const watchIdRef = useRef<number | null>(null)
  const isFlushingRef = useRef(false)
  const flushPromiseRef = useRef<Promise<boolean> | null>(null)
  const lastPositionRef = useRef<GeolocationPosition | null>(null)
  const lastRecordedPointRef = useRef<TrackPoint | null>(null)

  const resetRecorder = useCallback(() => {
    setPoints([])
    bufferRef.current = []
    setIsTracking(false)
    setLastSyncAt(undefined)
    setMovementState('slow')
    setSpeedMps(null)
    lastPositionRef.current = null
    lastRecordedPointRef.current = null
  }, [])

  const stopWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setIsTracking(false)
    setMovementState('slow')
    setSpeedMps(null)
    lastPositionRef.current = null
    lastRecordedPointRef.current = null
  }, [])

  useEffect(() => {
    if (!session) {
      stopWatch()
      resetRecorder()
    }
  }, [session, resetRecorder, stopWatch])

  const flushNow = useCallback(async (): Promise<boolean> => {
    if (flushPromiseRef.current) {
      return flushPromiseRef.current
    }

    if (!session) {
      return bufferRef.current.length === 0
    }

    const pending = bufferRef.current
    if (!pending.length) {
      return true
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return false
    }

    const toFlush = [...pending]
    bufferRef.current = []
    isFlushingRef.current = true

    const promise = (async () => {
      try {
        await putTrackPoints(toFlush)
        if (toFlush.length) {
          setLastSyncAt(Date.now())
        }
        return true
      } catch (error) {
        console.error('[track-recorder] flush failed', error)
        bufferRef.current = [...toFlush, ...bufferRef.current]
        onError?.('位置情報の送信に失敗しました。通信状況を確認してください。')
        return false
      } finally {
        isFlushingRef.current = false
        flushPromiseRef.current = null
      }
    })()

    flushPromiseRef.current = promise
    return promise
  }, [onError, session])

  const applySpeedMeasurement = useCallback((speed: number | null) => {
    setSpeedMps(speed)
    setMovementState((previous) => {
      let next = previous

      if (speed === null) {
        next = 'slow'
      } else if (speed >= SPEED_FAST_THRESHOLD_MPS) {
        next = 'fast'
      } else if (speed <= SPEED_SLOW_THRESHOLD_MPS) {
        next = 'slow'
      }

      return next === previous ? previous : next
    })
  }, [])

  const handlePosition = useCallback(
    (position: GeolocationPosition) => {
      if (!session) {
        return
      }

      const previousPosition = lastPositionRef.current
      lastPositionRef.current = position

      const currentTimestamp =
        typeof position.timestamp === 'number'
          ? position.timestamp
          : Date.now()
      const ts = new Date(currentTimestamp).toISOString()
      const { latitude, longitude } = position.coords
      const accuracy = position.coords.accuracy ?? undefined

      const rawSpeed = position.coords.speed
      let derivedSpeed: number | null =
        typeof rawSpeed === 'number' && Number.isFinite(rawSpeed) && rawSpeed >= 0
          ? rawSpeed
          : null

      if (derivedSpeed === null && previousPosition) {
        const previousTimestamp =
          typeof previousPosition.timestamp === 'number'
            ? previousPosition.timestamp
            : Date.now()
        const deltaSeconds = (currentTimestamp - previousTimestamp) / 1000

        if (deltaSeconds > 0) {
          const distance = getDistanceMeters(
            previousPosition.coords,
            position.coords,
          )
          if (Number.isFinite(distance) && distance >= 0) {
            derivedSpeed = distance / deltaSeconds
          }
        }
      }

      const isSlowMovement =
        derivedSpeed === null || derivedSpeed <= SPEED_SLOW_THRESHOLD_MPS

      let shouldRecord = true

      if (isSlowMovement) {
        const lastRecorded = lastRecordedPointRef.current
        if (lastRecorded) {
          const distanceFromLastRecorded = getDistanceMeters(
            { latitude: lastRecorded.lat, longitude: lastRecorded.lng },
            { latitude, longitude },
          )
          const timeSinceLastRecorded =
            currentTimestamp - new Date(lastRecorded.ts).getTime()

          if (
            distanceFromLastRecorded < SLOW_MOVEMENT_MIN_DISTANCE_M &&
            timeSinceLastRecorded < SLOW_MOVEMENT_MIN_INTERVAL_MS
          ) {
            shouldRecord = false
          }
        }
      }

      if (shouldRecord) {
        const nextPoint: TrackPoint = {
          trackId: session.sessionId,
          pointId: uuid(),
          ts,
          lat: latitude,
          lng: longitude,
          accuracy,
          nickname: session.nickname,
        }

        bufferRef.current = [...bufferRef.current, nextPoint]
        setPoints((previous) => [...previous, nextPoint])
        lastRecordedPointRef.current = nextPoint
      }

      applySpeedMeasurement(
        derivedSpeed !== null && Number.isFinite(derivedSpeed)
          ? derivedSpeed
          : null,
      )
    },
    [applySpeedMeasurement, session],
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

  const flushIntervalMs =
    movementState === 'fast'
      ? FAST_FLUSH_INTERVAL_MS
      : SLOW_FLUSH_INTERVAL_MS

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
    }, flushIntervalMs)

    return () => {
      window.clearInterval(id)
      void flushNow()
    }
  }, [flushIntervalMs, flushNow, isTracking])

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
    movementState,
    flushIntervalMs,
    speedMps,
  }
}
