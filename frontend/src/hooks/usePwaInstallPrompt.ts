import { useCallback, useEffect, useRef, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt: () => Promise<void>
}

const isStandaloneDisplay = () => {
  if (typeof window === 'undefined') {
    return false
  }

  if ((window.navigator as unknown as { standalone?: boolean }).standalone) {
    return true
  }

  return window.matchMedia?.('(display-mode: standalone)')?.matches ?? false
}

export const usePwaInstallPrompt = () => {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalone, setIsStandalone] = useState(isStandaloneDisplay)
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    promptRef.current = promptEvent
  }, [promptEvent])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setPromptEvent(event as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setPromptEvent(null)
      setIsStandalone(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    if (typeof window.matchMedia === 'function') {
      const mediaQuery = window.matchMedia('(display-mode: standalone)')
      const handleChange = (event: MediaQueryListEvent) => {
        setIsStandalone(event.matches)
      }

      setIsStandalone(mediaQuery.matches)

      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', handleChange)
      } else {
        mediaQuery.addListener(handleChange)
      }

      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
        window.removeEventListener('appinstalled', handleAppInstalled)
        if (typeof mediaQuery.removeEventListener === 'function') {
          mediaQuery.removeEventListener('change', handleChange)
        } else {
          mediaQuery.removeListener(handleChange)
        }
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    const event = promptRef.current
    if (!event) {
      return false
    }

    await event.prompt()
    const choice = await event.userChoice
    setPromptEvent(null)
    return choice.outcome === 'accepted'
  }, [])

  const dismiss = useCallback(() => {
    setPromptEvent(null)
  }, [])

  return {
    canInstall: Boolean(promptEvent),
    promptInstall,
    dismiss,
    isStandalone,
  }
}
