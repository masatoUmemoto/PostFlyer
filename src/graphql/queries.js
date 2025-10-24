/* eslint-disable */
// this is an auto generated file. This will be overwritten

export const getSession = /* GraphQL */ `
  query GetSession($sessionId: ID!) {
    getSession(sessionId: $sessionId) {
      sessionId
      nickname
      deviceId
      startedAt
      endedAt
      createdAt
      updatedAt
      __typename
    }
  }
`;
export const listSessions = /* GraphQL */ `
  query ListSessions(
    $sessionId: ID
    $filter: ModelSessionFilterInput
    $limit: Int
    $nextToken: String
    $sortDirection: ModelSortDirection
  ) {
    listSessions(
      sessionId: $sessionId
      filter: $filter
      limit: $limit
      nextToken: $nextToken
      sortDirection: $sortDirection
    ) {
      items {
        sessionId
        nickname
        deviceId
        startedAt
        endedAt
        createdAt
        updatedAt
        __typename
      }
      nextToken
      __typename
    }
  }
`;
export const listTrackPoints = /* GraphQL */ `
  query ListTrackPoints(
    $trackId: ID
    $tsPointId: ModelTrackPointPrimaryCompositeKeyConditionInput
    $filter: ModelTrackPointFilterInput
    $limit: Int
    $nextToken: String
    $sortDirection: ModelSortDirection
  ) {
    listTrackPoints(
      trackId: $trackId
      tsPointId: $tsPointId
      filter: $filter
      limit: $limit
      nextToken: $nextToken
      sortDirection: $sortDirection
    ) {
      items {
        trackId
        ts
        pointId
        lat
        lng
        accuracy
        nickname
        createdAt
        updatedAt
        __typename
      }
      nextToken
      __typename
    }
  }
`;
