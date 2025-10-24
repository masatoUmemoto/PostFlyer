/* eslint-disable */
// this is an auto generated file. This will be overwritten

export const createSession = /* GraphQL */ `
  mutation CreateSession(
    $input: CreateSessionInput!
    $condition: ModelSessionConditionInput
  ) {
    createSession(input: $input, condition: $condition) {
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
export const updateSession = /* GraphQL */ `
  mutation UpdateSession(
    $input: UpdateSessionInput!
    $condition: ModelSessionConditionInput
  ) {
    updateSession(input: $input, condition: $condition) {
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
export const createTrackPoint = /* GraphQL */ `
  mutation CreateTrackPoint(
    $input: CreateTrackPointInput!
    $condition: ModelTrackPointConditionInput
  ) {
    createTrackPoint(input: $input, condition: $condition) {
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
  }
`;
