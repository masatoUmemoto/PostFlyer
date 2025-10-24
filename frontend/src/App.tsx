import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'
import { v4 as uuid } from 'uuid'
import './App.css'
import { ensureAmplifyConfigured } from './amplify/client'
import type { Session, TrackPoint } from './amplify/types'
import { MapView } from './components/MapView'
import { useLiveTracks } from './hooks/useLiveTracks'
import { usePwaInstallPrompt } from './hooks/usePwaInstallPrompt'
import { useTrackRecorder } from './hooks/useTrackRecorder'
import {
  createSession,
  endSession as endSessionMutation,
  listTrackPointsByTime,
} from './services/appsyncService'

const DEVICE_ID_KEY = 'flyers:deviceId'
const SESSION_KEY = 'flyers:session'
const INSTALL_DISMISSED_KEY = 'flyers:installDismissed'
const FAST_SYNC_INTERVAL_MS = 15000
const SLOW_SYNC_INTERVAL_MS = 60000

const UNKNOWN_NICKNAME = '投稿者不明'
const LAST_LOCATION_KEY = 'flyers:lastLocation'

type LatLng = { lat: number; lng: number }

const normalizeNickname = (nickname?: string | null) => {
  const trimmed = nickname?.trim()
  return trimmed && trimmed.length ? trimmed : UNKNOWN_NICKNAME
}

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
  const [selectedHistoryNickname, setSelectedHistoryNickname] = useState<
    string | null
  >(null)
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
  const [installDismissed, setInstallDismissed] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }
    return localStorage.getItem(INSTALL_DISMISSED_KEY) === '1'
  })
  const [storedCenter, setStoredCenter] = useState<LatLng | null>(() => {
    if (typeof window === 'undefined') {
      return null
    }
    try {
      const raw = window.localStorage.getItem(LAST_LOCATION_KEY)
      if (!raw) {
        return null
      }
      const parsed = JSON.parse(raw) as unknown
      if (
        parsed &&
        typeof (parsed as { lat?: unknown }).lat === 'number' &&
        typeof (parsed as { lng?: unknown }).lng === 'number' &&
        Number.isFinite((parsed as { lat: number }).lat) &&
        Number.isFinite((parsed as { lng: number }).lng)
      ) {
        return {
          lat: (parsed as { lat: number }).lat,
          lng: (parsed as { lng: number }).lng,
        }
      }
    } catch (error) {
      console.warn('Failed to load stored map center', error)
    }
    return null
  })
  const {
    canInstall,
    promptInstall,
    dismiss: dismissInstallPrompt,
    isStandalone,
  } = usePwaInstallPrompt()
  const isIos = useMemo(() => {
    if (typeof navigator === 'undefined') {
      return false
    }
    return /iphone|ipad|ipod/i.test(navigator.userAgent)
  }, [])
  const [isPromptingInstall, setIsPromptingInstall] = useState(false)
  const persistInstallDismissed = useCallback((value: boolean) => {
    if (typeof window === 'undefined') {
      setInstallDismissed(value)
      return
    }
    if (value) {
      localStorage.setItem(INSTALL_DISMISSED_KEY, '1')
    } else {
      localStorage.removeItem(INSTALL_DISMISSED_KEY)
    }
    setInstallDismissed(value)
  }, [])

  const [historyStart, setHistoryStart] = useState(() =>
    toDateLocal(new Date(Date.now() - 60 * 60 * 1000)),
  )
  const [historyEnd, setHistoryEnd] = useState(() => toDateLocal(new Date()))
  const isActive = isSessionActive(session)
  const showInstallBanner =
    !isStandalone && !installDismissed && (canInstall || isIos)
  const installDescription = canInstall
    ? 'インストールするとオフラインでも利用でき、専用アプリのように起動できます。'
    : '共有メニューから「ホーム画面に追加」を選ぶと、専用アプリのように使えます。'
  const installHint = !canInstall && isIos
    ? 'Safariの共有アイコンから「ホーム画面に追加」を選択してください。'
    : null
  const previousIsActiveRef = useRef(isActive)

  useEffect(() => {
    ensureAmplifyConfigured()
  }, [])

  useEffect(() => {
    if (isStandalone) {
      persistInstallDismissed(true)
    }
  }, [isStandalone, persistInstallDismissed])

  const handleInstallClick = useCallback(async () => {
    if (!canInstall) {
      return
    }

    setIsPromptingInstall(true)
    setErrorMessage(null)
    try {
      const accepted = await promptInstall()
      if (accepted) {
        setStatusMessage('ホーム画面アイコンの追加を開始しました。')
        persistInstallDismissed(true)
      } else {
        setStatusMessage('ホーム画面への追加はキャンセルされました。')
      }
    } catch (error) {
      console.error('Failed to prompt install', error)
      setErrorMessage(
        'インストールの呼び出しに失敗しました。ブラウザの共有メニューから「ホーム画面に追加」を選択してください。',
      )
    } finally {
      setIsPromptingInstall(false)
      dismissInstallPrompt()
    }
  }, [
    canInstall,
    dismissInstallPrompt,
    persistInstallDismissed,
    promptInstall,
  ])

  const handleDismissInstallBanner = useCallback(() => {
    persistInstallDismissed(true)
    dismissInstallPrompt()
  }, [dismissInstallPrompt, persistInstallDismissed])

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

  useEffect(() => {
    if (!selfPoints.length) {
      return
    }

    const last = selfPoints[selfPoints.length - 1]
    const nextCenter: LatLng = { lat: last.lat, lng: last.lng }
    setStoredCenter(nextCenter)

    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          LAST_LOCATION_KEY,
          JSON.stringify(nextCenter),
        )
      } catch (error) {
        console.warn('Failed to persist map center', error)
      }
    }
  }, [selfPoints])

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
      const availableNicknames = new Set(
        sorted.map((point) => normalizeNickname(point.nickname)),
      )
      setSelectedHistoryNickname((current) =>
        current && availableNicknames.has(current) ? current : null,
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

  const historyContributors = useMemo(() => {
    if (!historyPoints.length) {
      return []
    }

    const counts = historyPoints.reduce<Record<string, number>>(
      (acc, point) => {
        const key = normalizeNickname(point.nickname)
        acc[key] = (acc[key] ?? 0) + 1
        return acc
      },
      {},
    )

    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort(
        (a, b) =>
          b.count - a.count || a.name.localeCompare(b.name, 'ja'),
      )
  }, [historyPoints])

  const filteredHistoryPoints = useMemo(() => {
    if (!selectedHistoryNickname) {
      return historyPoints
    }
    return historyPoints.filter(
      (point) => normalizeNickname(point.nickname) === selectedHistoryNickname,
    )
  }, [historyPoints, selectedHistoryNickname])

  const historySelectionLabel = selectedHistoryNickname ?? 'すべて'

  const handleContributorSelect = useCallback((name: string) => {
    setSelectedHistoryNickname((current) =>
      current === name ? null : name,
    )
  }, [])

  const handleShowAllHistory = useCallback(() => {
    setSelectedHistoryNickname(null)
  }, [])

  const mapDefaultCenter = useMemo<LatLng | null>(() => {
    if (storedCenter) {
      return storedCenter
    }

    const latestFiltered =
      filteredHistoryPoints[filteredHistoryPoints.length - 1] ?? null
    if (latestFiltered) {
      return { lat: latestFiltered.lat, lng: latestFiltered.lng }
    }

    const latestHistory =
      historyPoints[historyPoints.length - 1] ?? null
    if (latestHistory) {
      return { lat: latestHistory.lat, lng: latestHistory.lng }
    }

    for (const track of Object.values(peerTracks)) {
      if (track.length) {
        const lastPoint = track[track.length - 1]
        return { lat: lastPoint.lat, lng: lastPoint.lng }
      }
    }

    return null
  }, [filteredHistoryPoints, historyPoints, peerTracks, storedCenter])

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
      {showInstallBanner ? (
        <section
          className="install-banner"
          role="region"
          aria-label="アプリインストールのご案内"
        >
          <div className="install-banner__inner">
            <div className="install-banner__copy">
              <p className="install-banner__title">
                ホーム画面に追加してネイティブアプリのように利用
              </p>
              <p className="install-banner__description">{installDescription}</p>
              {installHint ? (
                <p className="install-banner__hint">{installHint}</p>
              ) : null}
            </div>
            <div className="install-banner__actions">
              {canInstall ? (
                <button
                  type="button"
                  className="button button--primary install-banner__button"
                  onClick={handleInstallClick}
                  disabled={isPromptingInstall}
                >
                  {isPromptingInstall ? '確認中…' : 'インストール'}
                </button>
              ) : null}
              <button
                type="button"
                className="install-banner__dismiss"
                onClick={handleDismissInstallBanner}
              >
                閉じる
              </button>
            </div>
          </div>
        </section>
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
              <div>
                表示中の点数: {filteredHistoryPoints.length.toLocaleString()}
              </div>
              <div>表示対象: {historySelectionLabel}</div>
              {historyContributors.length ? (
                <ul className="history__contributors">
                  <li className="history__contributors-item">
                    <button
                      type="button"
                      onClick={handleShowAllHistory}
                      className={`history__contributor-button${
                        selectedHistoryNickname === null
                          ? ' history__contributor-button--active'
                          : ''
                      }`}
                      aria-pressed={selectedHistoryNickname === null}
                    >
                      すべて表示
                    </button>
                  </li>
                  {historyContributors.map(({ name }) => {
                    const isActive = selectedHistoryNickname === name
                    return (
                      <li className="history__contributors-item" key={name}>
                        <button
                          type="button"
                          onClick={() => handleContributorSelect(name)}
                          className={`history__contributor-button${
                            isActive
                              ? ' history__contributor-button--active'
                              : ''
                          }`}
                          aria-pressed={isActive}
                        >
                          {name}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
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
            history={filteredHistoryPoints}
            focus={activePoint}
            defaultCenter={mapDefaultCenter}
          />
        </section>
      </main>
    </div>
  )
}

export default App
