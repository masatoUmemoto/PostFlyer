import type { ResourcesConfig } from '@aws-amplify/core'

const awsExports: ResourcesConfig = {
  Auth: {
    Cognito: {
      identityPoolId: 'ap-northeast-1:e28e97b5-06b5-4524-8f58-2a75faf33b24',
      allowGuestAccess: true,
    },
  },
  API: {
    GraphQL: {
      endpoint:
        'https://s2cb6xugzvf7llk3xahqoywuai.appsync-api.ap-northeast-1.amazonaws.com/graphql',
      region: 'ap-northeast-1',
      defaultAuthMode: 'iam',
    },
  },
}

export default awsExports
