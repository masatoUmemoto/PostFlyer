import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import type {
  Feature,
  FeatureCollection,
  LineString,
  Point,
  Geometry,
} from 'geojson'
import type { TrackPoint } from '../amplify/types'

const SELF_TRACK_SOURCE = 'self-track'
const SELF_POINT_SOURCE = 'self-point'
const PEERS_SOURCE = 'peers'
const HISTORY_SOURCE = 'history'
const HISTORY_LINE_SOURCE = 'history-line'

const emptyCollection: FeatureCollection<Geometry> = {
  type: 'FeatureCollection',
  features: [],
}

const buildLineFeature = (points: TrackPoint[]): Feature<LineString> => ({
  type: 'Feature',
  geometry: {
    type: 'LineString',
    coordinates: points.map((point) => [point.lng, point.lat]),
  },
  properties: {},
})

const buildSelfCollection = (
  points: TrackPoint[],
): FeatureCollection<LineString> => ({
  type: 'FeatureCollection',
  features: points.length >= 2 ? [buildLineFeature(points)] : [],
})

const buildPointCollection = (
  point: TrackPoint | null,
): FeatureCollection<Point> =>
  point
    ? {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [point.lng, point.lat],
            },
            properties: {
              nickname: point.nickname,
            },
          },
        ],
      }
    : {
        type: 'FeatureCollection',
        features: [],
      }

const buildPeerCollection = (
  grouped: Record<string, TrackPoint[]>,
): FeatureCollection<LineString | Point> => ({
  type: 'FeatureCollection',
  features: Object.entries(grouped).flatMap(([trackId, points]) => {
    if (!points.length) {
      return []
    }

    const lastPoint = points[points.length - 1]
    const features: Feature<LineString | Point>[] = []

    if (points.length >= 2) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: points.map((point) => [point.lng, point.lat]),
        },
        properties: { trackId, nickname: points[0]?.nickname },
      })
    }

    const pointFeature: Feature<Point> = {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [lastPoint.lng, lastPoint.lat],
      },
      properties: { trackId, nickname: lastPoint.nickname },
    }

    features.push(pointFeature)

    return features
  }),
})

const buildHistoryCollection = (
  points: TrackPoint[],
): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: points.map((point) => ({
    type: 'Feature' as const,
    geometry: {
      type: 'Point' as const,
      coordinates: [point.lng, point.lat],
    },
    properties: {
      nickname: point.nickname,
      ts: point.ts,
    },
  })),
})

const buildHistoryLineCollection = (
  points: TrackPoint[],
): FeatureCollection<LineString> => {
  const grouped = points.reduce<Map<string, TrackPoint[]>>((acc, point) => {
    const key = point.trackId ?? ''
    if (!key) {
      return acc
    }
    const bucket = acc.get(key)
    if (bucket) {
      bucket.push(point)
    } else {
      acc.set(key, [point])
    }
    return acc
  }, new Map())

  const features: Feature<LineString>[] = []
  grouped.forEach((trackPoints, trackId) => {
    if (trackPoints.length < 2) {
      return
    }
    const sorted = [...trackPoints].sort(
      (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime(),
    )
    const coordinates = sorted
      .map((point) => {
        if (!Number.isFinite(point.lng) || !Number.isFinite(point.lat)) {
          return null
        }
        return [point.lng, point.lat] as [number, number]
      })
      .filter(Boolean) as [number, number][]

    if (coordinates.length < 2) {
      return
    }

    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates,
      },
      properties: {
        trackId,
        nickname: sorted[sorted.length - 1]?.nickname ?? '',
      },
    })
  })

  return {
    type: 'FeatureCollection',
    features,
  }
}

const escapeHtml = (value: string) =>
  String(value).replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case "'":
        return '&#39;'
      default:
        return character
    }
  })

type MaplibreMap = maplibregl.Map

const ensureSource = (
  map: MaplibreMap,
  id: string,
  data: FeatureCollection | Feature,
) => {
  const source = map.getSource(id) as maplibregl.GeoJSONSource | undefined
  if (source) {
    source.setData(data)
    return
  }

  map.addSource(id, {
    type: 'geojson',
    data,
  })
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
  const mapRef = useRef<MaplibreMap | null>(null)
  const latestHistoryRef = useRef<TrackPoint[]>([])
  const historyPopupRef = useRef<maplibregl.Popup | null>(null)
  const initialCameraRef = useRef<{ center: [number, number]; zoom: number } | null>(
    null,
  )

  if (!initialCameraRef.current) {
    if (focus) {
      initialCameraRef.current = {
        center: [focus.lng, focus.lat] as [number, number],
        zoom: 15,
      }
    } else if (defaultCenter) {
      initialCameraRef.current = {
        center: [defaultCenter.lng, defaultCenter.lat] as [number, number],
        zoom: 12,
      }
    } else {
      initialCameraRef.current = {
        center: [0, 0] as [number, number],
        zoom: 2,
      }
    }
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return
    }

    const initialCamera =
      initialCameraRef.current ?? { center: [0, 0] as [number, number], zoom: 2 }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: initialCamera.center,
      zoom: initialCamera.zoom,
      maxZoom: 19,
      pitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: false,
    })

    map.touchZoomRotate.disableRotation()
    map.addControl(
      new maplibregl.NavigationControl({
        visualizePitch: false,
        showCompass: false,
      }),
      'top-right',
    )
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: {
          enableHighAccuracy: true,
        },
        trackUserLocation: true,
      }),
      'top-right',
    )
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120 }))
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: '© OpenStreetMap contributors © CARTO',
      }),
      'bottom-right',
    )

    map.on('load', () => {
      ensureSource(map, SELF_TRACK_SOURCE, emptyCollection)
      map.addLayer({
        id: 'self-track-line',
        type: 'line',
        source: SELF_TRACK_SOURCE,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#ff7a1a',
          'line-opacity': 0.45,
          'line-width': 8,
        },
      })

      ensureSource(map, SELF_POINT_SOURCE, buildPointCollection(null))
      map.addLayer({
        id: 'self-track-point',
        type: 'circle',
        source: SELF_POINT_SOURCE,
        paint: {
          'circle-radius': 6,
          'circle-color': '#ff6600',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff2e4',
        },
      })

      ensureSource(map, PEERS_SOURCE, buildPeerCollection({}))
      map.addLayer({
        id: 'peers-lines',
        type: 'line',
        source: PEERS_SOURCE,
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#ffae55',
          'line-opacity': 0.35,
          'line-width': 4,
          'line-dasharray': [2, 2],
        },
      })
      map.addLayer({
        id: 'peers-points',
        type: 'circle',
        source: PEERS_SOURCE,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 4,
          'circle-color': '#ffc27d',
          'circle-stroke-width': 1,
          'circle-stroke-color': '#fff2e4',
        },
      })

      ensureSource(
        map,
        HISTORY_LINE_SOURCE,
        buildHistoryLineCollection(latestHistoryRef.current),
      )
      map.addLayer({
        id: 'history-lines',
        type: 'line',
        source: HISTORY_LINE_SOURCE,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#ff9444',
          'line-opacity': 0.4,
          'line-width': 3,
        },
      })

      ensureSource(
        map,
        HISTORY_SOURCE,
        buildHistoryCollection(latestHistoryRef.current),
      )
      map.addLayer({
        id: 'history-points',
        type: 'circle',
        source: HISTORY_SOURCE,
        paint: {
          'circle-radius': 4,
          'circle-color': '#ffb86c',
          'circle-opacity': 0.75,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#fff2e4',
        },
      })
    })

    mapRef.current = map

    return () => {
      historyPopupRef.current?.remove()
      historyPopupRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) {
      return
    }

    const update = () => {
      ensureSource(map, SELF_TRACK_SOURCE, buildSelfCollection(selfPoints))

      ensureSource(
        map,
        SELF_POINT_SOURCE,
        buildPointCollection(selfPoints[selfPoints.length - 1] ?? null),
      )

      if (focus) {
        map.easeTo({
          center: [focus.lng, focus.lat],
          duration: 1000,
        })
      }
    }

    if (map.isStyleLoaded()) {
      update()
      return
    }

    const handleLoad = () => update()
    map.once('load', handleLoad)

    return () => {
      map.off('load', handleLoad)
    }
  }, [focus, selfPoints])

  useEffect(() => {
    const map = mapRef.current
    if (!map || focus || !defaultCenter) {
      return
    }

    const target = [defaultCenter.lng, defaultCenter.lat] as [number, number]
    const currentCenter = map.getCenter()
    if (
      Math.abs(currentCenter.lng - target[0]) < 1e-6 &&
      Math.abs(currentCenter.lat - target[1]) < 1e-6
    ) {
      return
    }

    const desiredZoom = Math.max(map.getZoom(), 12)

    const animateToTarget = () => {
      map.easeTo({
        center: target,
        duration: 800,
        zoom: desiredZoom,
      })
    }

    if (map.isStyleLoaded()) {
      animateToTarget()
      return
    }

    map.once('load', animateToTarget)
    return () => {
      map.off('load', animateToTarget)
    }
  }, [defaultCenter, focus])

  useEffect(() => {
    const map = mapRef.current
    if (!map) {
      return
    }

    const update = () => {
      ensureSource(map, PEERS_SOURCE, buildPeerCollection(peers))
    }

    if (map.isStyleLoaded()) {
      update()
      return
    }

    const handleLoad = () => update()
    map.once('load', handleLoad)

    return () => {
      map.off('load', handleLoad)
    }
  }, [peers])

  useEffect(() => {
    latestHistoryRef.current = history

    const map = mapRef.current
    if (!map) {
      return
    }

    const update = () => {
      ensureSource(
        map,
        HISTORY_LINE_SOURCE,
        buildHistoryLineCollection(history),
      )
      ensureSource(map, HISTORY_SOURCE, buildHistoryCollection(history))
    }

    if (map.isStyleLoaded()) {
      update()
      return
    }

    const handleLoad = () => update()
    map.once('load', handleLoad)

    return () => {
      map.off('load', handleLoad)
    }
  }, [history])

  useEffect(() => {
    const map = mapRef.current
    if (!map) {
      return
    }

    const showHistoryPopup = (event: maplibregl.MapLayerMouseEvent) => {
      const feature = event.features?.[0]
      if (!feature || feature.geometry?.type !== 'Point') {
        return
      }

      const coordinates = (
        feature.geometry.coordinates as number[]
      ).slice(0, 2) as [number, number]
      const nickname = feature.properties?.nickname
      const timestamp = feature.properties?.ts

      const displayNickname = nickname
        ? escapeHtml(nickname)
        : '投稿者不明'

      let timestampLabel = ''
      if (typeof timestamp === 'string') {
        const parsed = new Date(timestamp)
        timestampLabel = Number.isNaN(parsed.getTime())
          ? escapeHtml(timestamp)
          : escapeHtml(parsed.toLocaleString())
      }

      const popup =
        historyPopupRef.current ??
        new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 12,
        })

      popup
        .setLngLat(coordinates)
        .setHTML(
          `<div class="map-popup"><div class="map-popup__name">${displayNickname}</div>${
            timestampLabel
              ? `<div class="map-popup__time">${timestampLabel}</div>`
              : ''
          }</div>`,
        )
        .addTo(map)

      historyPopupRef.current = popup
    }

    const handleMouseEnter = (event: maplibregl.MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = 'pointer'
      showHistoryPopup(event)
    }

    const handleMouseMove = (event: maplibregl.MapLayerMouseEvent) => {
      showHistoryPopup(event)
    }

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = ''
      historyPopupRef.current?.remove()
      historyPopupRef.current = null
    }

    const handleLoad = () => {
      map.on('mouseenter', 'history-points', handleMouseEnter)
      map.on('mousemove', 'history-points', handleMouseMove)
      map.on('mouseleave', 'history-points', handleMouseLeave)
      map.on('click', 'history-points', showHistoryPopup)
    }

    if (map.isStyleLoaded()) {
      handleLoad()
    } else {
      map.on('load', handleLoad)
    }

    return () => {
      map.off('load', handleLoad)
      map.off('mouseenter', 'history-points', handleMouseEnter)
      map.off('mousemove', 'history-points', handleMouseMove)
      map.off('mouseleave', 'history-points', handleMouseLeave)
      map.off('click', 'history-points', showHistoryPopup)
      map.getCanvas().style.cursor = ''
      historyPopupRef.current?.remove()
      historyPopupRef.current = null
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current) {
      return
    }

    if (!('ResizeObserver' in window)) {
      return
    }

    const observer = new ResizeObserver(() => {
      mapRef.current?.resize()
    })

    observer.observe(containerRef.current)

    return () => observer.disconnect()
  }, [])

  return <div className="map-view" ref={containerRef} />
}
