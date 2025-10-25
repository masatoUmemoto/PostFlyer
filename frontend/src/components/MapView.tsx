import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader } from '@googlemaps/js-api-loader'
import type { TrackPoint } from '../amplify/types'

type LatLngLiteral = { lat: number; lng: number }

const TOYOTASHI_STATION_CENTER: LatLngLiteral = {
  lat: 35.083639,
  lng: 137.156471,
}

const hasValidCoordinates = (point?: TrackPoint | null): point is TrackPoint =>
  !!point && Number.isFinite(point.lat) && Number.isFinite(point.lng)

const hasValidLatLng = (
  value?: { lat: number; lng: number } | null,
): value is { lat: number; lng: number } =>
  !!value && Number.isFinite(value.lat) && Number.isFinite(value.lng)

const toLatLngLiteral = (point: TrackPoint): LatLngLiteral => ({
  lat: point.lat,
  lng: point.lng,
})

interface CameraState {
  center: LatLngLiteral
  zoom: number
}

export interface MapViewProps {
  selfPoints: TrackPoint[]
  peers: Record<string, TrackPoint[]>
  history: TrackPoint[]
  focus?: TrackPoint | null
  defaultCenter?: { lat: number; lng: number } | null
}

export const MapView = ({
  selfPoints,
  peers,
  history,
  focus,
  defaultCenter,
}: MapViewProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const googleMapsRef = useRef<typeof google.maps | null>(null)

  const selfPolylineRef = useRef<google.maps.Polyline | null>(null)
  const selfMarkerRef = useRef<google.maps.Marker | null>(null)
  const peerPolylinesRef = useRef(new Map<string, google.maps.Polyline>())
  const peerMarkersRef = useRef(new Map<string, google.maps.Marker>())
  const historyPolylinesRef = useRef(new Map<string, google.maps.Polyline>())
  const [mapVersion, setMapVersion] = useState(0)

  const normalizedDefaultCenter = useMemo<LatLngLiteral | null>(() => {
    const value = defaultCenter ?? null
    return hasValidLatLng(value) ? { lat: value.lat, lng: value.lng } : null
  }, [defaultCenter])

  const initialCameraRef = useRef<CameraState | null>(null)
  if (!initialCameraRef.current) {
    if (focus && hasValidCoordinates(focus)) {
      initialCameraRef.current = {
        center: toLatLngLiteral(focus),
        zoom: 15,
      }
    } else if (normalizedDefaultCenter) {
      initialCameraRef.current = {
        center: normalizedDefaultCenter,
        zoom: 15,
      }
    } else {
      initialCameraRef.current = {
        center: { ...TOYOTASHI_STATION_CENTER },
        zoom: 15,
      }
    }
  }

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  useEffect(() => {
    if (!apiKey) {
      console.error(
        'VITE_GOOGLE_MAPS_API_KEY is not set. Unable to load Google Maps.',
      )
    }
  }, [apiKey])

  const loader = useMemo(() => {
    if (!apiKey) {
      return null
    }

    return new Loader({
      apiKey,
      language: 'ja',
      region: 'JP',
      version: 'weekly',
    })
  }, [apiKey])

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !loader) {
      return
    }

    let cancelled = false

    loader
      .load()
      .then((google) => {
        if (cancelled || !containerRef.current) {
          return
        }

        googleMapsRef.current = google.maps
        const camera =
          initialCameraRef.current ?? {
            center: { ...TOYOTASHI_STATION_CENTER },
            zoom: 15,
          }

        const map = new google.maps.Map(containerRef.current, {
          center: camera.center,
          zoom: camera.zoom,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
          scaleControl: true,
          gestureHandling: 'greedy',
        })

        mapRef.current = map
        setMapVersion((version) => version + 1)
      })
      .catch((error) => {
        console.error('Failed to load Google Maps', error)
      })

    return () => {
      cancelled = true

      peerMarkersRef.current.forEach((marker) => marker.setMap(null))
      peerMarkersRef.current.clear()

      peerPolylinesRef.current.forEach((polyline) => polyline.setMap(null))
      peerPolylinesRef.current.clear()

      historyPolylinesRef.current.forEach((polyline) => polyline.setMap(null))
      historyPolylinesRef.current.clear()

      selfMarkerRef.current?.setMap(null)
      selfMarkerRef.current = null

      selfPolylineRef.current?.setMap(null)
      selfPolylineRef.current = null

      mapRef.current = null
      googleMapsRef.current = null
    }
  }, [loader])

  useEffect(() => {
    const map = mapRef.current
    const googleMaps = googleMapsRef.current
    if (!map || !googleMaps) {
      return
    }

    const path = selfPoints
      .filter((point) => hasValidCoordinates(point))
      .map(toLatLngLiteral)

    if (path.length >= 2) {
      const polyline =
        selfPolylineRef.current ??
        new googleMaps.Polyline({
          geodesic: true,
          strokeColor: '#ff7a1a',
          strokeOpacity: 0.45,
          strokeWeight: 16,
          zIndex: 5,
        })

      polyline.setPath(path)
      polyline.setMap(map)
      selfPolylineRef.current = polyline
    } else if (selfPolylineRef.current) {
      selfPolylineRef.current.setMap(null)
      selfPolylineRef.current = null
    }

    const lastPoint = path[path.length - 1]
    if (lastPoint) {
      const marker =
        selfMarkerRef.current ??
        new googleMaps.Marker({
          zIndex: 10,
          icon: {
            path: googleMaps.SymbolPath.CIRCLE,
            fillColor: '#ff6600',
            fillOpacity: 1,
            strokeColor: '#fff2e4',
            strokeOpacity: 1,
            strokeWeight: 2,
            scale: 8,
          },
        })

      marker.setPosition(lastPoint)
      marker.setMap(map)
      selfMarkerRef.current = marker
    } else if (selfMarkerRef.current) {
      selfMarkerRef.current.setMap(null)
      selfMarkerRef.current = null
    }
  }, [selfPoints, mapVersion])

  useEffect(() => {
    const map = mapRef.current
    const googleMaps = googleMapsRef.current
    if (!map || !googleMaps) {
      return
    }

    const nextKeys = new Set(Object.keys(peers))

    peerPolylinesRef.current.forEach((polyline, key) => {
      if (!nextKeys.has(key)) {
        polyline.setMap(null)
        peerPolylinesRef.current.delete(key)
      }
    })

    peerMarkersRef.current.forEach((marker, key) => {
      if (!nextKeys.has(key)) {
        marker.setMap(null)
        peerMarkersRef.current.delete(key)
      }
    })

    nextKeys.forEach((trackId) => {
      const trackPoints = peers[trackId] ?? []
      const path = trackPoints
        .filter((point) => hasValidCoordinates(point))
        .map(toLatLngLiteral)

      if (path.length >= 2) {
        const polyline =
          peerPolylinesRef.current.get(trackId) ??
          new googleMaps.Polyline({
            geodesic: true,
            strokeColor: '#ffae55',
            strokeOpacity: 0.35,
            strokeWeight: 8,
            zIndex: 3,
            icons: [
              {
                icon: {
                  path: 'M 0,-1 0,1',
                  strokeOpacity: 1,
                  strokeColor: '#ffae55',
                  strokeWeight: 4,
                },
                offset: '0',
                repeat: '16px',
              },
            ],
          })

        polyline.setPath(path)
        polyline.setMap(map)
        peerPolylinesRef.current.set(trackId, polyline)
      } else {
        const polyline = peerPolylinesRef.current.get(trackId)
        if (polyline) {
          polyline.setMap(null)
          peerPolylinesRef.current.delete(trackId)
        }
      }

      const lastPoint = path[path.length - 1]
      if (lastPoint) {
        const marker =
          peerMarkersRef.current.get(trackId) ??
          new googleMaps.Marker({
            zIndex: 6,
            icon: {
              path: googleMaps.SymbolPath.CIRCLE,
              fillColor: '#ffc27d',
              fillOpacity: 1,
              strokeColor: '#fff2e4',
              strokeOpacity: 1,
              strokeWeight: 1,
              scale: 6,
            },
          })

        marker.setPosition(lastPoint)
        const nickname = trackPoints[trackPoints.length - 1]?.nickname ?? ''
        marker.setTitle(nickname || undefined)
        marker.setMap(map)
        peerMarkersRef.current.set(trackId, marker)
      } else {
        const marker = peerMarkersRef.current.get(trackId)
        if (marker) {
          marker.setMap(null)
          peerMarkersRef.current.delete(trackId)
        }
      }
    })
  }, [peers, mapVersion])

  useEffect(() => {
    const map = mapRef.current
    const googleMaps = googleMapsRef.current
    if (!map || !googleMaps) {
      return
    }

    const groupedHistory = history.reduce<Map<string, TrackPoint[]>>(
      (acc, point) => {
        if (!point.trackId) {
          return acc
        }

        const bucket = acc.get(point.trackId)
        if (bucket) {
          bucket.push(point)
        } else {
          acc.set(point.trackId, [point])
        }
        return acc
      },
      new Map(),
    )

    const nextKeys = new Set(groupedHistory.keys())

    historyPolylinesRef.current.forEach((polyline, key) => {
      if (!nextKeys.has(key)) {
        polyline.setMap(null)
        historyPolylinesRef.current.delete(key)
      }
    })

    groupedHistory.forEach((trackPoints, trackId) => {
      const sorted = [...trackPoints].sort(
        (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime(),
      )
      const path = sorted
        .map((point) => (hasValidCoordinates(point) ? toLatLngLiteral(point) : null))
        .filter((value): value is LatLngLiteral => !!value)

      if (path.length >= 2) {
        const polyline =
          historyPolylinesRef.current.get(trackId) ??
          new googleMaps.Polyline({
            geodesic: true,
            strokeColor: '#ff9444',
            strokeOpacity: 0.4,
            strokeWeight: 6,
            zIndex: 2,
          })

        polyline.setPath(path)
        polyline.setMap(map)
        historyPolylinesRef.current.set(trackId, polyline)
      } else {
        const polyline = historyPolylinesRef.current.get(trackId)
        if (polyline) {
          polyline.setMap(null)
          historyPolylinesRef.current.delete(trackId)
        }
      }
    })

  }, [history, mapVersion])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !focus || !hasValidCoordinates(focus)) {
      return
    }

    map.panTo(toLatLngLiteral(focus))
    const currentZoom = map.getZoom() ?? 0
    if (currentZoom < 15) {
      map.setZoom(15)
    }
  }, [focus, mapVersion])

  useEffect(() => {
    const map = mapRef.current
    if (!map || focus || !normalizedDefaultCenter) {
      return
    }

    const target = normalizedDefaultCenter
    const currentCenter = map.getCenter()
    const currentLat = currentCenter?.lat()
    const currentLng = currentCenter?.lng()
    if (
      typeof currentLat === 'number' &&
      typeof currentLng === 'number' &&
      Math.abs(currentLat - target.lat) < 1e-6 &&
      Math.abs(currentLng - target.lng) < 1e-6
    ) {
      return
    }

    map.panTo(target)
    const currentZoom = map.getZoom() ?? 0
    const desiredZoom = Math.max(currentZoom, 15)
    if (currentZoom < desiredZoom) {
      map.setZoom(desiredZoom)
    }
  }, [normalizedDefaultCenter, focus, mapVersion])

  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current) {
      return
    }

    if (!('ResizeObserver' in window)) {
      return
    }

    const observer = new ResizeObserver(() => {
      const map = mapRef.current
      const googleMaps = googleMapsRef.current
      if (!map || !googleMaps) {
        return
      }

      googleMaps.event.trigger(map, 'resize')
    })

    observer.observe(containerRef.current)

    return () => observer.disconnect()
  }, [mapVersion])

  return <div className="map-view" ref={containerRef} />
}
