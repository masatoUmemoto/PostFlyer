import type { GraphQLResult } from '@aws-amplify/api'
import { getGraphQLClient } from '../amplify/client'
import {
  createSessionMutation,
  endSessionMutation,
  listSessionsByTimeQuery,
  listTrackPointsByTimeQuery,
  listTrackPointsQuery,
  putTrackPointsMutation,
} from '../amplify/graphql'
import type {
  CreateSessionInput,
  EndSessionInput,
  ListSessionsByTimeVariables,
  ListTrackPointsByTimeVariables,
  ListTrackPointsVariables,
  Session,
  TrackPoint,
  TrackPointInput,
} from '../amplify/types'

const unwrap = <T extends Record<string, unknown>, K extends keyof T>(
  result: GraphQLResult<T>,
  key: K,
) => {
  if (result.errors?.length) {
    throw new Error(result.errors.map((error) => error.message).join('; '))
  }

  const value = result.data?.[key]
  if (value === undefined || value === null) {
    throw new Error('Unexpected empty GraphQL response')
  }

  return value as T[K]
}

export const createSession = async (input: CreateSessionInput) => {
  const client = await getGraphQLClient()
  const result = (await client.graphql({
    query: createSessionMutation,
    variables: { input },
    authMode: 'iam',
  })) as GraphQLResult<{ createSession: Session }>

  return unwrap(result, 'createSession')
}

export const endSession = async (input: EndSessionInput) => {
  const client = await getGraphQLClient()
  const result = (await client.graphql({
    query: endSessionMutation,
    variables: { input },
    authMode: 'iam',
  })) as GraphQLResult<{ endSession: Session }>

  return unwrap(result, 'endSession')
}

export const putTrackPoints = async (items: TrackPointInput[]) => {
  const client = await getGraphQLClient()
  const result = (await client.graphql({
    query: putTrackPointsMutation,
    variables: { items },
    authMode: 'iam',
  })) as GraphQLResult<{ putTrackPoints: TrackPoint[] }>

  return unwrap(result, 'putTrackPoints')
}

export const listTrackPointsByTime = async (
  variables: ListTrackPointsByTimeVariables,
) => {
  const client = await getGraphQLClient()
  const result = (await client.graphql({
    query: listTrackPointsByTimeQuery,
    variables,
    authMode: 'iam',
  })) as GraphQLResult<{ listTrackPointsByTime: TrackPoint[] }>

  return unwrap(result, 'listTrackPointsByTime')
}

export const listTrackPoints = async (variables: ListTrackPointsVariables) => {
  const client = await getGraphQLClient()
  const result = (await client.graphql({
    query: listTrackPointsQuery,
    variables,
    authMode: 'iam',
  })) as GraphQLResult<{ listTrackPoints: TrackPoint[] }>

  return unwrap(result, 'listTrackPoints')
}

export const listSessionsByTime = async (
  variables: ListSessionsByTimeVariables,
) => {
  const client = await getGraphQLClient()
  const result = (await client.graphql({
    query: listSessionsByTimeQuery,
    variables,
    authMode: 'iam',
  })) as GraphQLResult<{ listSessionsByTime: Session[] }>

  return unwrap(result, 'listSessionsByTime')
}
