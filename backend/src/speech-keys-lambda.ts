/**
 * A CloudFormation custom resource that makes the key pair for the spoken lines' CloudFront signed URLs once: the
 * private key goes to SSM Parameter Store (SecureString) and never anywhere else; the public key (not a secret)
 * comes back as the resource's `PublicKey` attribute, for the CloudFront public key the distribution trusts. Later
 * deploys keep the pair (CloudFront can't change a public key in place).
 */
import {createPublicKey, generateKeyPairSync} from 'node:crypto';
import {DeleteParameterCommand, GetParameterCommand, PutParameterCommand, SSMClient} from '@aws-sdk/client-ssm';

interface Event {
  RequestType: 'Create' | 'Update' | 'Delete';
  PhysicalResourceId?: string;
  ResourceProperties: {PrivateName: string; KeepOnDelete: string};
}

const ssm = new SSMClient({});

async function existingKey(name: string): Promise<string | undefined> {
  try {
    return (await ssm.send(new GetParameterCommand({Name: name, WithDecryption: true}))).Parameter?.Value;
  } catch (error) {
    if (error instanceof Error && error.name === 'ParameterNotFound') return undefined;
    throw error;
  }
}

export async function handler(event: Event) {
  const {PrivateName, KeepOnDelete} = event.ResourceProperties;
  if (event.RequestType === 'Delete') {
    if (KeepOnDelete !== 'true') {
      await ssm.send(new DeleteParameterCommand({Name: PrivateName})).catch(error => {
        if (!(error instanceof Error && error.name === 'ParameterNotFound')) throw error;
      });
    }
    return {PhysicalResourceId: event.PhysicalResourceId};
  }
  let privateKey = await existingKey(PrivateName);
  if (!privateKey) {
    const pair = generateKeyPairSync('rsa', {modulusLength: 2048});
    privateKey = pair.privateKey.export({type: 'pkcs1', format: 'pem'}).toString();
    await ssm.send(new PutParameterCommand({Name: PrivateName, Value: privateKey, Type: 'SecureString', Overwrite: true}));
  }
  const publicKey = createPublicKey(privateKey).export({type: 'spki', format: 'pem'}).toString();
  return {PhysicalResourceId: `speech-keys-${PrivateName}`, Data: {PublicKey: publicKey}};
}
