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

const MAX_PAGE_SIZE = 1000

export class TrackPointBatchError extends Error {
  readonly completed: TrackPoint[]
  readonly pending: TrackPointInput[]

  constructor(
    message: string,
    completed: TrackPoint[],
    pending: TrackPointInput[],
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'TrackPointBatchError'
    this.completed = completed
    this.pending = pending
  }
}

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

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    try {
      const result = (await client.graphql({
        query: createTrackPointMutation,
        variables: { input: item },
        authMode: 'iam',
      })) as GraphQLResult<{ createTrackPoint: TrackPoint }>

      saved.push(unwrap(result, 'createTrackPoint'))
    } catch (error) {
      const pending = items.slice(index)
      throw new TrackPointBatchError(
        'Failed to persist all track points',
        [...saved],
        pending,
        { cause: error },
      )
    }
  }

  return saved
}

export const listTrackPointsByTime = async (
  variables: ListTrackPointsByTimeVariables,
) => {
  const client = await getGraphQLClient()

  const { start, end, limit, nextToken: initialNextToken } = variables
  const filter = {
    ts: {
      between: [start, end],
    },
  }

  const items: TrackPoint[] = []
  let nextToken: string | undefined | null = initialNextToken ?? undefined
  let remaining =
    typeof limit === 'number' && Number.isFinite(limit) ? limit : undefined

  do {
    if (remaining !== undefined && remaining <= 0) {
      break
    }

    const pageLimit =
      remaining !== undefined
        ? Math.min(Math.max(remaining, 1), MAX_PAGE_SIZE)
        : MAX_PAGE_SIZE

    const result = (await client.graphql({
      query: listTrackPointsByTimeQuery,
      variables: {
        filter,
        limit: pageLimit,
        nextToken,
      },
      authMode: 'iam',
    })) as GraphQLResult<{
      listTrackPointsByTime?: {
        items?: (TrackPoint | null)[] | null
        nextToken?: string | null
      } | null
    }>

    if (result.errors?.length) {
      throw new Error(result.errors.map((error) => error.message).join('; '))
    }

    const connection = result.data?.listTrackPointsByTime
    if (!connection || typeof connection !== 'object') {
      throw new Error('Unexpected empty GraphQL connection response')
    }

    const pageItems = (connection.items ?? []).filter(
      Boolean,
    ) as TrackPoint[]
    items.push(...pageItems)

    if (remaining !== undefined) {
      remaining -= pageItems.length
      if (remaining <= 0) {
        break
      }
    }

    nextToken = connection.nextToken ?? undefined

    if (!nextToken || pageItems.length === 0) {
      break
    }
  } while (true)

  return items
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
