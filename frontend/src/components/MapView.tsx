import { useEffect, useRef } from 'react'
import maplibregl, { Map } from 'maplibre-gl'
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
  features: points.length ? [buildLineFeature(points)] : [],
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

    const lineFeature: Feature<LineString> = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: points.map((point) => [point.lng, point.lat]),
      },
      properties: { trackId, nickname: points[0]?.nickname },
    }

    const lastPoint = points[points.length - 1]

    const pointFeature: Feature<Point> = {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [lastPoint.lng, lastPoint.lat],
      },
      properties: { trackId, nickname: lastPoint.nickname },
    }

    return [lineFeature, pointFeature]
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

const ensureSource = (
  map: Map,
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
}

export const MapView = ({
  selfPoints,
  peers,
  history,
  focus,
}: MapViewProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Map | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: focus ? [focus.lng, focus.lat] : [137.155, 35.083],
      zoom: focus ? 15 : 14,
      maxZoom: 19,
      attributionControl: false,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
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
        paint: {
          'line-color': '#ff7a1a',
          'line-width': 4,
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
        paint: {
          'line-color': '#ffae55',
          'line-width': 2,
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

      ensureSource(map, HISTORY_SOURCE, buildHistoryCollection([]))
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
      map.remove()
      mapRef.current = null
    }
  }, [focus])

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
    const map = mapRef.current
    if (!map) {
      return
    }

    const update = () => {
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

  return <div className="map-view" ref={containerRef} />
}
