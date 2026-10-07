/** Sends to an open WebSocket connection through API Gateway's management API (needs execute-api:ManageConnections). */
import {ApiGatewayManagementApiClient, PostToConnectionCommand} from '@aws-sdk/client-apigatewaymanagementapi';
import type {SendRealtime} from '../domain/realtime';

/** `endpoint` is the stage's https callback address, e.g. https://abc123.execute-api.us-east-1.amazonaws.com/dev. */
export function apiGatewaySender(endpoint: string): SendRealtime {
  const client = new ApiGatewayManagementApiClient({endpoint});
  return async (connectionId, message) => {
    try {
      await client.send(new PostToConnectionCommand({ConnectionId: connectionId, Data: Buffer.from(message)}));
      return true;
    } catch (error) {
      // 410: the client went away without a $disconnect reaching us.
      if (error instanceof Error && error.name === 'GoneException') return false;
      throw error;
    }
  };
}
