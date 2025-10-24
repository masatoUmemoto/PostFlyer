export const createSessionMutation = /* GraphQL */ `
  mutation CreateSession($input: CreateSessionInput!) {
    createSession(input: $input) {
      sessionId
      nickname
      deviceId
      startedAt
      endedAt
    }
  }
`

export const endSessionMutation = /* GraphQL */ `
  mutation EndSession($input: EndSessionInput!) {
    endSession(input: $input) {
      sessionId
      nickname
      deviceId
      startedAt
      endedAt
    }
  }
`

export const putTrackPointsMutation = /* GraphQL */ `
  mutation PutTrackPoints($items: [TrackPointInput!]!) {
    putTrackPoints(items: $items) {
      trackId
      pointId
      ts
      lat
      lng
      accuracy
      nickname
    }
  }
`

export const listTrackPointsByTimeQuery = /* GraphQL */ `
  query ListTrackPointsByTime($start: AWSDateTime!, $end: AWSDateTime!, $limit: Int, $nextToken: String) {
    listTrackPointsByTime(start: $start, end: $end, limit: $limit, nextToken: $nextToken) {
      trackId
      pointId
      ts
      lat
      lng
      accuracy
      nickname
    }
  }
`

export const listTrackPointsQuery = /* GraphQL */ `
  query ListTrackPoints($trackId: ID!, $from: AWSDateTime, $to: AWSDateTime, $limit: Int, $nextToken: String) {
    listTrackPoints(trackId: $trackId, from: $from, to: $to, limit: $limit, nextToken: $nextToken) {
      trackId
      pointId
      ts
      lat
      lng
      accuracy
      nickname
    }
  }
`

export const listSessionsByTimeQuery = /* GraphQL */ `
  query ListSessionsByTime($start: AWSDateTime!, $end: AWSDateTime!, $limit: Int, $nextToken: String) {
    listSessionsByTime(start: $start, end: $end, limit: $limit, nextToken: $nextToken) {
      sessionId
      nickname
      deviceId
      startedAt
      endedAt
    }
  }
`
