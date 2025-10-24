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
  mutation EndSession($input: UpdateSessionInput!) {
    endSession: updateSession(input: $input) {
      sessionId
      nickname
      deviceId
      startedAt
      endedAt
    }
  }
`

export const createTrackPointMutation = /* GraphQL */ `
  mutation CreateTrackPoint($input: CreateTrackPointInput!) {
    createTrackPoint(input: $input) {
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
  query ListTrackPointsByTime($filter: ModelTrackPointFilterInput, $limit: Int, $nextToken: String) {
    listTrackPointsByTime: listTrackPoints(
      filter: $filter
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        trackId
        pointId
        ts
        lat
        lng
        accuracy
        nickname
      }
      nextToken
    }
  }
`

export const listTrackPointsQuery = /* GraphQL */ `
  query ListTrackPoints($trackId: ID!, $filter: ModelTrackPointFilterInput, $limit: Int, $nextToken: String, $sortDirection: ModelSortDirection) {
    listTrackPoints(
      trackId: $trackId
      filter: $filter
      limit: $limit
      nextToken: $nextToken
      sortDirection: $sortDirection
    ) {
      items {
        trackId
        pointId
        ts
        lat
        lng
        accuracy
        nickname
      }
      nextToken
    }
  }
`

export const listSessionsByTimeQuery = /* GraphQL */ `
  query ListSessionsByTime($filter: ModelSessionFilterInput, $limit: Int, $nextToken: String) {
    listSessionsByTime: listSessions(
      filter: $filter
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        sessionId
        nickname
        deviceId
        startedAt
        endedAt
      }
      nextToken
    }
  }
`
