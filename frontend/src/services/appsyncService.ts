import type { GraphQLResult } from '@aws-amplify/api'
import { getGraphQLClient } from '../amplify/client'
import {
  createSessionMutation,
  createTrackPointMutation,
  endSessionMutation,
  listSessionsByTimeQuery,
  listTrackPointsByTimeQuery,
  listTrackPointsQuery,
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

const unwrapConnectionItems = <Item>(
  result: GraphQLResult<Record<string, { items?: (Item | null)[] | null } | null>>,
  key: keyof Record<string, unknown>,
) => {
  if (result.errors?.length) {
    throw new Error(result.errors.map((error) => error.message).join('; '))
  }

  const connection = result.data?.[key]
  if (!connection || typeof connection !== 'object') {
    throw new Error('Unexpected empty GraphQL connection response')
  }

  const items = connection.items ?? []
  return items.filter(Boolean) as Item[]
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
  if (!items.length) {
    return []
  }

  const client = await getGraphQLClient()
  const saved: TrackPoint[] = []

  for (const item of items) {
    const result = (await client.graphql({
      query: createTrackPointMutation,
      variables: { input: item },
      authMode: 'iam',
    })) as GraphQLResult<{ createTrackPoint: TrackPoint }>

    saved.push(unwrap(result, 'createTrackPoint'))
  }

  return saved
}

export const listTrackPointsByTime = async (
  variables: ListTrackPointsByTimeVariables,
) => {
  const client = await getGraphQLClient()

  const filter = {
    ts: {
      between: [variables.start, variables.end],
    },
  }

  const result = (await client.graphql({
    query: listTrackPointsByTimeQuery,
    variables: {
      filter,
      limit: variables.limit,
      nextToken: variables.nextToken,
    },
    authMode: 'iam',
  })) as GraphQLResult<
    Record<string, { items?: (TrackPoint | null)[] | null } | null>
  >

  return unwrapConnectionItems(result, 'listTrackPointsByTime')
}

export const listTrackPoints = async (variables: ListTrackPointsVariables) => {
  const client = await getGraphQLClient()

  const { from, to, ...rest } = variables
  const filter: Record<string, unknown> = {}

  if (from && to) {
    filter.ts = { between: [from, to] }
  } else if (from) {
    filter.ts = { ge: from }
  } else if (to) {
    filter.ts = { le: to }
  }

  const result = (await client.graphql({
    query: listTrackPointsQuery,
    variables: {
      trackId: rest.trackId,
      filter: Object.keys(filter).length ? filter : undefined,
      limit: rest.limit,
      nextToken: rest.nextToken,
      sortDirection: 'ASC',
    },
    authMode: 'iam',
  })) as GraphQLResult<
    Record<string, { items?: (TrackPoint | null)[] | null } | null>
  >

  return unwrapConnectionItems(result, 'listTrackPoints')
}

export const listSessionsByTime = async (
  variables: ListSessionsByTimeVariables,
) => {
  const client = await getGraphQLClient()

  const filter = {
    startedAt: {
      between: [variables.start, variables.end],
    },
  }

  const result = (await client.graphql({
    query: listSessionsByTimeQuery,
    variables: {
      filter,
      limit: variables.limit,
      nextToken: variables.nextToken,
    },
    authMode: 'iam',
  })) as GraphQLResult<
    Record<string, { items?: (Session | null)[] | null } | null>
  >

  return unwrapConnectionItems(result, 'listSessionsByTime')
}
