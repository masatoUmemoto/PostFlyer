import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'
import { v4 as uuid } from 'uuid'
import './App.css'
import { ensureAmplifyConfigured } from './amplify/client'
import type { Session, TrackPoint } from './amplify/types'
import { MapView } from './components/MapView'
import { useLiveTracks } from './hooks/useLiveTracks'
import { useTrackRecorder } from './hooks/useTrackRecorder'
import {
  createSession,
  endSession as endSessionMutation,
  listTrackPointsByTime,
} from './services/appsyncService'

const DEVICE_ID_KEY = 'flyers:deviceId'
const SESSION_KEY = 'flyers:session'
const FAST_SYNC_INTERVAL_MS = 15000
const SLOW_SYNC_INTERVAL_MS = 60000

const MOBILE_BREAKPOINT = 880

const isCompactViewport = () => {
  if (typeof window === 'undefined') {
    return false
  }

  if (typeof window.matchMedia === 'function') {
    return window
      .matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
      .matches
  }

  return window.innerWidth < MOBILE_BREAKPOINT
}

const getInitialControlsOpen = () => !isCompactViewport()

const toDateLocal = (date: Date) => {
  const pad = (value: number) => value.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`
}

const parseStoredSession = (): Session | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) {
      return null
    }
    return JSON.parse(raw) as Session
  } catch (error) {
    console.warn('Failed to parse stored session', error)
    return null
  }
}

const persistSession = (session: Session | null) => {
  if (!session) {
    localStorage.removeItem(SESSION_KEY)
    return
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

const loadDeviceId = () => {
  const existing = localStorage.getItem(DEVICE_ID_KEY)
  if (existing) {
    return existing
  }
  const next = uuid()
  localStorage.setItem(DEVICE_ID_KEY, next)
  return next
}

const isSessionActive = (session: Session | null) =>
  Boolean(session && !session.endedAt)

type LocationPermissionState =
  | 'checking'
  | 'granted'
  | 'prompt'
  | 'denied'
  | 'unsupported'

function App() {
  const [deviceId] = useState(() => loadDeviceId())
  const [session, setSession] = useState<Session | null>(() =>
    parseStoredSession(),
  )
  const [nickname, setNickname] = useState('')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isEnding, setIsEnding] = useState(false)
  const [historyPoints, setHistoryPoints] = useState<TrackPoint[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isControlsOpen, setIsControlsOpen] = useState(() =>
    getInitialControlsOpen(),
  )
  const [locationPermission, setLocationPermission] =
    useState<LocationPermissionState>('checking')
  const [isRequestingLocation, setIsRequestingLocation] = useState(false)
  const [locationPromptError, setLocationPromptError] = useState<string | null>(
    null,
  )

  const [historyStart, setHistoryStart] = useState(() =>
    toDateLocal(new Date(Date.now() - 60 * 60 * 1000)),
  )
  const [historyEnd, setHistoryEnd] = useState(() => toDateLocal(new Date()))
  const isActive = isSessionActive(session)
  const previousIsActiveRef = useRef(isActive)

  useEffect(() => {
    ensureAmplifyConfigured()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      setLocationPermission('unsupported')
      return
    }

    if (!('geolocation' in navigator)) {
      setLocationPermission('unsupported')
      return
    }

    let isMounted = true
    let permissionStatus: PermissionStatus | null = null

    const updateState = (state: PermissionState) => {
      if (!isMounted) {
        return
      }
      setLocationPermission(state)
    }

    const permissions = navigator.permissions

    if (permissions && permissions.query) {
      permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((status) => {
          if (!isMounted) {
            return
          }
          permissionStatus = status
          updateState(status.state)
          status.onchange = () => updateState(status.state)
        })
        .catch(() => {
          updateState('prompt')
        })
    } else {
      setLocationPermission('prompt')
    }

    return () => {
      isMounted = false
      if (permissionStatus) {
        permissionStatus.onchange = null
      }
    }
  }, [])

  useEffect(() => {
    if (locationPermission === 'granted' || locationPermission === 'prompt') {
      setLocationPromptError(null)
    }
  }, [locationPermission])

  const handleRecorderError = useCallback((message: string) => {
    setErrorMessage(message)
  }, [])

  const requestLocationAccess = useCallback(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setLocationPermission('unsupported')
      setLocationPromptError('この端末では位置情報が利用できません。')
      return
    }

    setLocationPromptError(null)
    setIsRequestingLocation(true)

    navigator.geolocation.getCurrentPosition(
      () => {
        setIsRequestingLocation(false)
        setLocationPermission('granted')
      },
      (error) => {
        setIsRequestingLocation(false)
        if (error.code === error.PERMISSION_DENIED) {
          setLocationPermission('denied')
          setLocationPromptError(
            '位置情報の利用が拒否されました。ブラウザまたは端末の設定から許可してください。',
          )
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setLocationPromptError(
            '端末の位置情報サービスが無効になっている可能性があります。GPSを有効にして再試行してください。',
          )
        } else if (error.code === error.TIMEOUT) {
          setLocationPromptError(
            '位置情報の取得がタイムアウトしました。通信状況を確認のうえ再試行してください。',
          )
        } else {
          setLocationPromptError(
            '位置情報の取得に失敗しました。時間をおいてから再度お試しください。',
          )
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      },
    )
  }, [])

  const {
    points: selfPoints,
    isTracking,
    lastSyncAt,
    stop: stopRecorder,
    flushNow,
    movementState,
  } = useTrackRecorder({
    session,
    autoStart: locationPermission === 'granted',
    onError: handleRecorderError,
  })

  const liveTrackPollingInterval =
    movementState === 'fast' ? FAST_SYNC_INTERVAL_MS : SLOW_SYNC_INTERVAL_MS

  const { grouped: peerTracks, lastFetchedAt } = useLiveTracks({
    enabled: true,
    trackWindowMinutes: 15,
    pollingIntervalMs: liveTrackPollingInterval,
    excludeTrackId: session?.sessionId,
    onError: handleRecorderError,
  })

  useEffect(() => {
    persistSession(session)
  }, [session])

  useEffect(() => {
    if (locationPermission !== 'granted' && isTracking) {
      stopRecorder()
    }
  }, [isTracking, locationPermission, stopRecorder])

  useEffect(() => {
    if (!isCompactViewport()) {
      previousIsActiveRef.current = isActive
      return
    }

    if (!previousIsActiveRef.current && isActive) {
      setIsControlsOpen(false)
    }

    if (previousIsActiveRef.current && !isActive) {
      setIsControlsOpen(true)
    }

    previousIsActiveRef.current = isActive
  }, [isActive])

  useEffect(() => {
    if (!errorMessage || !isCompactViewport()) {
      return
    }

    setIsControlsOpen(true)
  }, [errorMessage])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleResize = () => {
      if (!isCompactViewport()) {
        setIsControlsOpen(true)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const startSession = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setErrorMessage(null)
      const trimmed = nickname.trim()
      const nicknameToUse =
        trimmed || `ゲスト-${deviceId.slice(0, 4).toUpperCase()}`

      setIsSubmitting(true)
      try {
        const newSession: Session = await createSession({
          sessionId: uuid(),
          nickname: nicknameToUse,
          deviceId,
          startedAt: new Date().toISOString(),
        })

        setSession(newSession)
        setNickname('')
        setStatusMessage('セッションを開始しました。')
      } catch (error) {
        console.error('Failed to create session', error)
        setErrorMessage('セッションの作成に失敗しました。再度お試しください。')
      } finally {
        setIsSubmitting(false)
      }
    },
    [deviceId, nickname],
  )

  const endSession = useCallback(async () => {
    if (!session) {
      return
    }

    setIsEnding(true)
    setErrorMessage(null)
    try {
      stopRecorder()
      await flushNow()
      const ended = await endSessionMutation({
        sessionId: session.sessionId,
        endedAt: new Date().toISOString(),
      })
      setSession(ended)
      setStatusMessage('セッションを終了しました。お疲れさまでした。')
    } catch (error) {
      console.error('Failed to end session', error)
      setErrorMessage('セッションの終了に失敗しました。通信状況をご確認ください。')
    } finally {
      setIsEnding(false)
    }
  }, [flushNow, session, stopRecorder])

  const loadHistory = useCallback(async () => {
    if (!historyStart || !historyEnd) {
      setErrorMessage('日付範囲を入力してください。')
      return
    }

    const startDate = new Date(`${historyStart}T00:00:00`)
    const endDate = new Date(`${historyEnd}T23:59:59.999`)
    if (startDate > endDate) {
      setErrorMessage('開始日は終了日より前に設定してください。')
      return
    }

    setIsLoadingHistory(true)
    setErrorMessage(null)
    try {
      const data = await listTrackPointsByTime({
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        limit: 5000,
      })
      const sorted = [...data].sort(
        (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime(),
      )
      setHistoryPoints(sorted)
      setStatusMessage('履歴データを読み込みました。')
    } catch (error) {
      console.error('Failed to load history', error)
      setErrorMessage('履歴データの取得に失敗しました。')
    } finally {
      setIsLoadingHistory(false)
    }
  }, [historyEnd, historyStart])

  const toggleControls = useCallback(() => {
    setIsControlsOpen((value) => !value)
  }, [])

  const activePoint = useMemo(
    () => selfPoints[selfPoints.length - 1] ?? null,
    [selfPoints],
  )

  const showLocationOverlay = locationPermission !== 'granted'
  const locationOverlayDescription = useMemo(() => {
    switch (locationPermission) {
      case 'checking':
        return '位置情報の状態を確認しています…'
      case 'prompt':
        return 'このアプリでは現在地を利用します。位置情報の利用を許可してください。'
      case 'denied':
        return '位置情報の利用が拒否されています。ブラウザや端末の設定から許可を行ってください。'
      case 'unsupported':
        return 'このブラウザまたは端末では位置情報が利用できません。別の環境をご利用ください。'
      default:
        return ''
    }
  }, [locationPermission])
  const canRequestLocation =
    locationPermission === 'prompt' || locationPermission === 'denied'
  const locationRequestButtonLabel =
    locationPermission === 'denied'
      ? '再度許可を試す'
      : '位置情報の利用を許可する'

  const controlsPanelClassName = [
    'panel',
    'panel--controls',
    isControlsOpen ? 'panel--controls-open' : 'panel--controls-closed',
  ].join(' ')
  const panelToggleClassName = [
    'panel__toggle',
    isControlsOpen ? 'panel__toggle--open' : null,
  ]
    .filter(Boolean)
    .join(' ')
  const controlsBodyId = 'controls-panel-body'

  return (
    <div className="app">
      {showLocationOverlay ? (
        <div
          className="location-overlay"
          role="dialog"
          aria-modal="true"
          aria-live="assertive"
        >
          <div className="location-overlay__card">
            <h2 className="location-overlay__title">位置情報を有効にしてください</h2>
            {locationOverlayDescription ? (
              <p className="location-overlay__description">
                {locationOverlayDescription}
              </p>
            ) : null}
            {locationPromptError ? (
              <p className="location-overlay__error">{locationPromptError}</p>
            ) : null}
            {canRequestLocation ? (
              <button
                type="button"
                className="button button--primary location-overlay__action"
                onClick={requestLocationAccess}
                disabled={isRequestingLocation}
              >
                {isRequestingLocation ? '確認中…' : locationRequestButtonLabel}
              </button>
            ) : null}
            {locationPermission === 'denied' ? (
              <p className="location-overlay__hint">
                ブラウザの「サイトの設定」から位置情報を許可した後、ページを再読み込みしてください。
              </p>
            ) : null}
            {locationPermission === 'unsupported' ? (
              <p className="location-overlay__hint">
                端末の設定でGPSが利用可能かご確認ください。
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      <header className="app__header">
        <div>
          <h1>PostFlyers Tracker</h1>
          <p className="app__subtitle">
            ニックネームだけで参加できるチラシ配布軌跡アプリ
          </p>
        </div>
        {isActive ? (
          <button
            className="button button--danger"
            onClick={endSession}
            disabled={isEnding}
          >
            {isEnding ? '終了中...' : 'セッションを終了'}
          </button>
        ) : null}
      </header>

      <main className="app__main">
        <section className={controlsPanelClassName}>
          <button
            type="button"
            className={panelToggleClassName}
            onClick={toggleControls}
            aria-expanded={isControlsOpen}
            aria-controls={controlsBodyId}
          >
            <span className="panel__toggle-grip" aria-hidden="true" />
            <span className="panel__toggle-label">
              {isControlsOpen ? 'パネルを閉じる' : '操作メニューを開く'}
            </span>
          </button>
          <div className="panel__content" id={controlsBodyId}>
          <h2>参加</h2>
          {isActive ? (
            <div className="status-box">
              <div>
                <strong>{session?.nickname}</strong> として参加中
              </div>
              <div className="status-box__meta">
                開始時刻: {session?.startedAt}
              </div>
              <div className="status-box__meta">
                {isTracking
                  ? '位置情報を取得しています。'
                  : '位置情報は停止しています。'}
                {lastSyncAt
                  ? ` 最終送信: ${new Date(lastSyncAt).toLocaleTimeString()}`
                  : null}
              </div>
            </div>
          ) : (
              <form className="form" onSubmit={startSession}>
              <label className="form__label" htmlFor="nickname">
                ニックネーム（任意）
              </label>
              <input
                id="nickname"
                name="nickname"
                type="text"
                placeholder="例: PostFlyers太郎"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                className="form__input"
                autoComplete="off"
              />
              <button
                type="submit"
                className="button button--primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? '参加中...' : 'セッションを開始'}
              </button>
            </form>
          )}

          <div className="history">
            <h3>プレビューの日付設定</h3>
            <p className="history__description">
              履歴プレビューに表示する日付範囲を選択してください。
            </p>
            <div className="history__inputs">
              <label className="form__label" htmlFor="history-start">
                プレビュー開始日
              </label>
              <input
                id="history-start"
                type="date"
                className="form__input"
                value={historyStart}
                onChange={(event) => setHistoryStart(event.target.value)}
              />

              <label className="form__label" htmlFor="history-end">
                プレビュー終了日
              </label>
              <input
                id="history-end"
                type="date"
                className="form__input"
                value={historyEnd}
                onChange={(event) => setHistoryEnd(event.target.value)}
              />
            </div>
            <button
              className="button"
              onClick={loadHistory}
              disabled={isLoadingHistory}
            >
              {isLoadingHistory ? '読み込み中...' : '履歴を取得'}
            </button>
            <div className="history__meta">
              表示中の点数: {historyPoints.length}
            </div>
          </div>

          <div className="status">
            {statusMessage ? (
              <p className="status__message">{statusMessage}</p>
            ) : null}
            {errorMessage ? (
              <p className="status__error">{errorMessage}</p>
            ) : null}
          </div>

          <div className="meta">
            <span>端末ID: {deviceId.slice(0, 8)}...</span>
            <span>
              他参加者の更新:{' '}
              {lastFetchedAt
                ? new Date(lastFetchedAt).toLocaleTimeString()
                : '取得前'}
            </span>
          </div>
          </div>
        </section>

        <section className="panel panel--map">
          <MapView
            selfPoints={selfPoints}
            peers={peerTracks}
            history={historyPoints}
            focus={activePoint}
          />
        </section>
      </main>
    </div>
  )
}

export default App
