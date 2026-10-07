/**
 * A CloudFormation custom resource that makes the Web Push (VAPID) key pair once and keeps it in SSM Parameter
 * Store: the private key as a SecureString, the public key as a String. Later deploys keep the keys (browsers'
 * subscriptions are tied to them). The keys never go into the template or the resource's response.
 */
import {DeleteParametersCommand, GetParametersCommand, PutParameterCommand, SSMClient} from '@aws-sdk/client-ssm';
import webpush from 'web-push';

interface Event {
  RequestType: 'Create' | 'Update' | 'Delete';
  PhysicalResourceId?: string;
  ResourceProperties: {PublicName: string; PrivateName: string; KeepOnDelete: string};
}

const ssm = new SSMClient({});

export async function handler(event: Event) {
  const {PublicName, PrivateName, KeepOnDelete} = event.ResourceProperties;
  if (event.RequestType === 'Delete') {
    if (KeepOnDelete !== 'true') await ssm.send(new DeleteParametersCommand({Names: [PublicName, PrivateName]}));
    return {PhysicalResourceId: event.PhysicalResourceId};
  }
  const {Parameters = []} = await ssm.send(new GetParametersCommand({Names: [PublicName, PrivateName]}));
  if (Parameters.length < 2) {
    const keys = webpush.generateVAPIDKeys();
    await ssm.send(new PutParameterCommand({Name: PrivateName, Value: keys.privateKey, Type: 'SecureString', Overwrite: true}));
    await ssm.send(new PutParameterCommand({Name: PublicName, Value: keys.publicKey, Type: 'String', Overwrite: true}));
  }
  return {PhysicalResourceId: `vapid-${PublicName}`};
}
