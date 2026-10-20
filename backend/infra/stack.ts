/**
 * Everything MarbleTime runs on in AWS (docs/03 §2): the API (HTTP API → one Lambda → one DynamoDB table),
 * realtime updates (WebSocket API), Web Push for parents, Cognito for parents, the character drawing worker, the
 * characters' spoken lines (Gemini voices from Google, cached in S3 behind CloudFront), and S3 + CloudFront for the
 * parent web app.
 * One stack per stage. The logical ids of the table, the user pool (and its client and domain) and the parent app's
 * bucket and distribution must never change: they hold real data.
 */
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {CfnOutput, CustomResource, Duration, RemovalPolicy, Stack, type StackProps} from 'aws-cdk-lib';
import {CorsHttpMethod, HttpApi, HttpMethod, HttpStage, WebSocketApi, WebSocketStage} from 'aws-cdk-lib/aws-apigatewayv2';
import {HttpUserPoolAuthorizer} from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import {HttpLambdaIntegration, WebSocketLambdaIntegration} from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import {CfnBudget} from 'aws-cdk-lib/aws-budgets';
import {AllowedMethods, CachePolicy, Distribution, KeyGroup, PriceClass, PublicKey, ViewerProtocolPolicy} from 'aws-cdk-lib/aws-cloudfront';
import {S3BucketOrigin} from 'aws-cdk-lib/aws-cloudfront-origins';
import {
  AccountRecovery, CfnManagedLoginBranding, FeaturePlan, ManagedLoginVersion, OAuthScope, UserPool, UserPoolClientIdentityProvider,
} from 'aws-cdk-lib/aws-cognito';
import {AttributeType, BillingMode, Table} from 'aws-cdk-lib/aws-dynamodb';
import {PolicyStatement} from 'aws-cdk-lib/aws-iam';
import {Architecture, Runtime} from 'aws-cdk-lib/aws-lambda';
import {NodejsFunction} from 'aws-cdk-lib/aws-lambda-nodejs';
import {LogGroup, RetentionDays} from 'aws-cdk-lib/aws-logs';
import {BlockPublicAccess, Bucket} from 'aws-cdk-lib/aws-s3';
import {BucketDeployment, CacheControl, Source} from 'aws-cdk-lib/aws-s3-deployment';
import {Provider} from 'aws-cdk-lib/custom-resources';
import type {Construct} from 'constructs';
import {routes} from '../src/http/routes';

export interface MarbleTimeStackProps extends StackProps {
  readonly stage: string;
  /** Where the $10/month budget alert goes; no budget without it. */
  readonly budgetEmail?: string;
  /** The characters' model: a Bedrock inference profile id, e.g. us.anthropic.claude-haiku-4-5-20251001-v1:0. */
  readonly modelId: string;
  /** Who makes the TV's lines: Amazon Polly (English, German, Spanish; no listening) or Google (Gemini). */
  readonly speech: 'polly' | 'google';
  /**
   * Google for the voices (Gemini-TTS) and listening (Gemini): the project, and the keyless Workload Identity
   * Federation from the Lambda's role (the pool provider and the service account it may act as). Needed with
   * speech=google (app.ts).
   */
  readonly google?: {project: string; wifProvider: string; serviceAccount: string};
  /** Anyone with the link can create a parent account; closed, parents are added by an admin (Cognito console). */
  readonly openSignUp: boolean;
}

/** Where a "us." cross-region inference profile may send requests (Claude's US profile lists the most; Nova's are among them). */
const US_PROFILE_REGIONS = ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'ca-central-1'];

/** The parent app's dev server (Vite). Cognito allows plain http only for localhost. */
const LOCAL_PWA = 'http://localhost:5173';
/** Where the parent app comes back after Cognito sign-in: CALLBACK_PATH in parent-web/src/auth/auth.ts (test/pwa-wiring.test.ts keeps them equal). */
const PWA_CALLBACK_PATH = '/auth/callback';

export class MarbleTimeStack extends Stack {
  constructor(scope: Construct, id: string, props: MarbleTimeStackProps) {
    super(scope, id, props);
    const dev = props.stage === 'dev';
    // Dev data can go with the stack; anything else is kept if the stack is deleted.
    const removalPolicy = dev ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN;

    // ---------- Data: one table; the key design is in src/repo/dynamo.ts ----------
    const table = new Table(this, 'Table', {
      partitionKey: {name: 'PK', type: AttributeType.STRING},
      sortKey: {name: 'SK', type: AttributeType.STRING},
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      pointInTimeRecoverySpecification: {pointInTimeRecoveryEnabled: !dev},
      removalPolicy,
    });
    table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: {name: 'GSI1PK', type: AttributeType.STRING},
      sortKey: {name: 'GSI1SK', type: AttributeType.STRING},
    });

    // ---------- Parent web app: a private bucket behind CloudFront ----------
    const site = new Bucket(this, 'Site', {blockPublicAccess: BlockPublicAccess.BLOCK_ALL, enforceSSL: true, removalPolicy, autoDeleteObjects: dev});
    const pwa = new Distribution(this, 'Pwa', {
      defaultBehavior: {origin: S3BucketOrigin.withOriginAccessControl(site), viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS},
      defaultRootObject: 'index.html',
      // A single-page app: other paths (e.g. /pair/K7QX4M from a TV's QR code) get index.html.
      errorResponses: [403, 404].map(httpStatus => ({httpStatus, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: Duration.seconds(0)})),
      priceClass: PriceClass.PRICE_CLASS_100,
    });
    const pwaUrl = `https://${pwa.distributionDomainName}`;

    // ---------- Parents: Cognito, email + password, on Cognito's managed login pages ----------
    const userPool = new UserPool(this, 'Parents', {
      featurePlan: FeaturePlan.ESSENTIALS,
      selfSignUpEnabled: props.openSignUp,
      signInAliases: {email: true},
      autoVerify: {email: true},
      standardAttributes: {email: {required: true, mutable: true}},
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      removalPolicy,
    });
    const appUrls = (path: string) => [LOCAL_PWA, pwaUrl].map(origin => `${origin}${path}`);
    const client = userPool.addClient('Pwa', {
      generateSecret: false, // a browser app can't keep a secret: authorization code + PKCE
      oAuth: {
        flows: {authorizationCodeGrant: true},
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
        callbackUrls: appUrls(PWA_CALLBACK_PATH),
        logoutUrls: appUrls('/'),
      },
      supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO],
      preventUserExistenceErrors: true,
    });
    const domain = userPool.addDomain('Login', {
      cognitoDomain: {domainPrefix: `marbletime-${props.stage}-${this.account}`}, // unique per account and stage
      managedLoginVersion: ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });
    // Managed login shows no page for an app client without a style; Cognito's default look is fine.
    new CfnManagedLoginBranding(this, 'LoginStyle', {
      userPoolId: userPool.userPoolId, clientId: client.userPoolClientId, useCognitoProvidedValues: true,
    }).node.addDependency(domain);

    // ---------- API: one Lambda for every route (fewer cold starts) behind an HTTP API ----------
    const fn = new NodejsFunction(this, 'ApiFunction', {
      entry: join(__dirname, '../src/lambda.ts'),
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: 512,
      // The art director (a few seconds) and speech run inside requests; API Gateway waits 30 s at most.
      timeout: Duration.seconds(28),
      environment: {TABLE_NAME: table.tableName, PWA_URL: pwaUrl, MODEL_ID: props.modelId, NODE_OPTIONS: '--enable-source-maps'},
      // Every SDK goes into the bundle at the version the tests ran with (the CloudFront signer isn't in the runtime).
      bundling: {minify: true, sourceMap: true, target: 'node22', externalModules: []},
      logGroup: new LogGroup(this, 'ApiLogs', {retention: RetentionDays.TWO_WEEKS, removalPolicy: RemovalPolicy.DESTROY}),
    });
    table.grantReadWriteData(fn);

    // ---------- The worker, started by the API (async invoke): each new character's drawing, and the rest of the tries
    // of a speech line its request couldn't finish ----------
    const worker = new NodejsFunction(this, 'CharactersFunction', {
      entry: join(__dirname, '../src/characters-lambda.ts'),
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: 1024,
      // Up to 3 rounds of drawing (median ~25 s, slowest measured 141 s) and picture checks.
      timeout: Duration.minutes(10),
      // It settles every character itself (ready or needs_help); a retry would only draw again.
      retryAttempts: 0,
      environment: {TABLE_NAME: table.tableName, MODEL_ID: props.modelId, NODE_OPTIONS: '--enable-source-maps'},
      bundling: {
        minify: true, sourceMap: true, target: 'node22', externalModules: [],
        // The rasteriser's native Skia binary is installed beside the bundle for Lambda (arm64 Linux, glibc), whatever
        // machine runs the synth: npm picks @napi-rs/canvas's optional package by these settings.
        nodeModules: ['@napi-rs/canvas'],
        environment: {npm_config_os: 'linux', npm_config_cpu: 'arm64', npm_config_libc: 'glibc'},
        // npm may still add the musl build (26 MB) that Lambda's glibc Linux never loads.
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (_input: string, output: string) => [`rm -rf "${output}/node_modules/@napi-rs/canvas-linux-arm64-musl"`],
        },
      },
      logGroup: new LogGroup(this, 'CharactersLogs', {retention: RetentionDays.TWO_WEEKS, removalPolicy: RemovalPolicy.DESTROY}),
    });
    table.grantReadWriteData(worker);
    fn.addEnvironment('DRAWING_FUNCTION', worker.functionName);
    worker.grantInvoke(fn);
    // InvokeModel through the inference profile needs the profile and the model in every region it routes to.
    // The API calls the art director; the worker draws and checks.
    const baseModel = props.modelId.replace(/^(us|eu|apac|jp|au|global)\./, '');
    const modelRegions = props.modelId.startsWith('us.') ? US_PROFILE_REGIONS : ['*'];
    const invokeModel = new PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: [
        `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${props.modelId}`,
        ...modelRegions.map(region => `arn:aws:bedrock:${region}::foundation-model/${baseModel}`),
      ],
    });
    fn.addToRolePolicy(invokeModel);
    worker.addToRolePolicy(invokeModel);

    // ---------- Speech: the TV's lines (Polly or Gemini voices) cached in a private bucket, handed out as CloudFront signed URLs ----------
    // An S3 presigned URL dies with the Lambda credentials that signed it (hours); a CloudFront signed URL lasts the
    // day the contract promises. The key pair is made once by a custom resource; its private key stays in SSM.
    const speechBucket = new Bucket(this, 'SpeechCache', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL, enforceSSL: true, removalPolicy: RemovalPolicy.DESTROY, autoDeleteObjects: true,
      lifecycleRules: [{expiration: Duration.days(30)}],
    });
    const speechKeyName = `/marbletime/${props.stage}/speech/private`;
    const speechKeyArn = `arn:aws:ssm:${this.region}:${this.account}:parameter${speechKeyName}`;
    const speechKeysFn = new NodejsFunction(this, 'SpeechKeysFunction', {
      entry: join(__dirname, '../src/speech-keys-lambda.ts'),
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(30),
      bundling: {minify: true, sourceMap: true, target: 'node22'},
      logGroup: new LogGroup(this, 'SpeechKeysLogs', {retention: RetentionDays.TWO_WEEKS, removalPolicy: RemovalPolicy.DESTROY}),
    });
    speechKeysFn.addToRolePolicy(new PolicyStatement({actions: ['ssm:GetParameter', 'ssm:PutParameter', 'ssm:DeleteParameter'], resources: [speechKeyArn]}));
    const speechKeys = new CustomResource(this, 'SpeechKeys', {
      serviceToken: new Provider(this, 'SpeechKeysProvider', {onEventHandler: speechKeysFn}).serviceToken,
      properties: {PrivateName: speechKeyName, KeepOnDelete: String(!dev)},
    });
    const speechPublicKey = new PublicKey(this, 'SpeechPublicKey', {encodedKey: speechKeys.getAttString('PublicKey')});
    const speechCdn = new Distribution(this, 'SpeechCdn', {
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(speechBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        trustedKeyGroups: [new KeyGroup(this, 'SpeechKeyGroup', {items: [speechPublicKey]})],
      },
      priceClass: PriceClass.PRICE_CLASS_100,
    });
    speechBucket.grantRead(fn);
    // The API makes lines; the worker goes on with the ones a request couldn't finish in 24 s (it stores, never reads).
    for (const maker of [fn, worker]) {
      speechBucket.grantPut(maker);
      maker.addToRolePolicy(new PolicyStatement({actions: ['ssm:GetParameter'], resources: [speechKeyArn]}));
      maker.addEnvironment('SPEECH_PROVIDER', props.speech);
      if (props.speech === 'polly') {
        // Polly's SynthesizeSpeech has no resource to scope it to.
        maker.addToRolePolicy(new PolicyStatement({actions: ['polly:SynthesizeSpeech'], resources: ['*']}));
      } else {
        // Gemini-TTS and Gemini listening, reached with Workload Identity Federation from the function's role (not built
        // yet: README).
        if (!props.google) throw new Error('speech=google needs the Google setup');
        maker.addEnvironment('GOOGLE_CLOUD_PROJECT', props.google.project);
        maker.addEnvironment('GOOGLE_WIF_PROVIDER', props.google.wifProvider);
        maker.addEnvironment('GOOGLE_SERVICE_ACCOUNT', props.google.serviceAccount);
      }
      maker.addEnvironment('SPEECH_BUCKET', speechBucket.bucketName);
      maker.addEnvironment('SPEECH_CDN_URL', `https://${speechCdn.distributionDomainName}`);
      maker.addEnvironment('SPEECH_KEY_ID', speechPublicKey.publicKeyId);
      maker.addEnvironment('SPEECH_KEY_PARAM', speechKeyName);
    }

    // ---------- Realtime: a WebSocket API; TVs and parent apps hear {"type": "changed"} when their family changes ----------
    const realtimeFn = new NodejsFunction(this, 'RealtimeFunction', {
      entry: join(__dirname, '../src/realtime-lambda.ts'),
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: {
        TABLE_NAME: table.tableName, USER_POOL_ID: userPool.userPoolId, USER_POOL_CLIENT_ID: client.userPoolClientId, NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {minify: true, sourceMap: true, target: 'node22'},
      logGroup: new LogGroup(this, 'RealtimeLogs', {retention: RetentionDays.TWO_WEEKS, removalPolicy: RemovalPolicy.DESTROY}),
    });
    table.grantReadWriteData(realtimeFn);
    const realtimeIntegration = new WebSocketLambdaIntegration('Realtime', realtimeFn);
    const realtimeApi = new WebSocketApi(this, 'Realtime', {
      connectRouteOptions: {integration: realtimeIntegration},
      disconnectRouteOptions: {integration: realtimeIntegration},
      // The Lambda's answer goes back to the client: {"type": "pong"} for a ping.
      defaultRouteOptions: {integration: realtimeIntegration, returnResponse: true},
    });
    const realtimeStage = new WebSocketStage(this, 'RealtimeStage', {
      webSocketApi: realtimeApi, stageName: props.stage, autoDeploy: true, throttle: {rateLimit: 25, burstLimit: 50},
    });
    // The API and the drawing worker tell connections about changes (PostToConnection; a gone connection answers 410).
    for (const sender of [fn, worker]) {
      realtimeStage.grantManagementApiAccess(sender);
      sender.addEnvironment('REALTIME_ENDPOINT', realtimeStage.callbackUrl);
    }
    fn.addEnvironment('REALTIME_URL', realtimeStage.url);

    // ---------- Web Push: the VAPID key pair, made once by a custom resource and kept in SSM ----------
    // The private key is a SecureString; it never appears in the template, the resource's response or a log.
    const vapidNames = {PublicName: `/marbletime/${props.stage}/vapid/public`, PrivateName: `/marbletime/${props.stage}/vapid/private`};
    const vapidArns = Object.values(vapidNames).map(name => `arn:aws:ssm:${this.region}:${this.account}:parameter${name}`);
    const vapidFn = new NodejsFunction(this, 'VapidKeysFunction', {
      entry: join(__dirname, '../src/vapid-keys-lambda.ts'),
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(30),
      bundling: {minify: true, sourceMap: true, target: 'node22'},
      logGroup: new LogGroup(this, 'VapidKeysLogs', {retention: RetentionDays.TWO_WEEKS, removalPolicy: RemovalPolicy.DESTROY}),
    });
    vapidFn.addToRolePolicy(new PolicyStatement({actions: ['ssm:GetParameters', 'ssm:PutParameter', 'ssm:DeleteParameters'], resources: vapidArns}));
    const vapidKeys = new CustomResource(this, 'VapidKeys', {
      serviceToken: new Provider(this, 'VapidKeysProvider', {onEventHandler: vapidFn}).serviceToken,
      // Dev deletes the keys with the stack; other stages keep them, so browsers stay subscribed.
      properties: {...vapidNames, KeepOnDelete: String(!dev)},
    });
    fn.addToRolePolicy(new PolicyStatement({actions: ['ssm:GetParameter'], resources: vapidArns}));
    fn.addEnvironment('VAPID_PUBLIC_PARAM', vapidNames.PublicName);
    fn.addEnvironment('VAPID_PRIVATE_PARAM', vapidNames.PrivateName);
    fn.node.addDependency(vapidKeys); // the keys exist before the API that reads them

    const api = new HttpApi(this, 'Api', {
      createDefaultStage: false,
      corsPreflight: {
        allowOrigins: [LOCAL_PWA, pwaUrl],
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.PATCH, CorsHttpMethod.DELETE, CorsHttpMethod.OPTIONS],
        allowHeaders: ['authorization', 'content-type', 'if-none-match'],
        exposeHeaders: ['etag'],
        maxAge: Duration.hours(1),
      },
    });
    // A ceiling, so a runaway client can't run up the bill (each TV polls every few seconds).
    new HttpStage(this, 'DefaultStage', {httpApi: api, autoDeploy: true, throttle: {rateLimit: 25, burstLimit: 50}});

    // Parent routes need a Cognito token (access or ID token for this app client); TV routes check the device token in the Lambda.
    // One invoke permission for the whole API instead of one per route keeps the function's policy small.
    const integration = new HttpLambdaIntegration('Lambda', fn, {scopePermissionToRoute: false});
    const authorizer = new HttpUserPoolAuthorizer('Parent', userPool, {userPoolClients: [client]});
    for (const route of routes) {
      api.addRoutes({path: route.path, methods: [HttpMethod[route.method]], integration, ...(route.auth === 'parent' && {authorizer})});
    }

    // The parent app's files, if built, plus the settings it can read at start-up (known only after deploy).
    // Files under assets/ have a hash in their name and never change: phones keep them for a year, and old ones
    // stay for a phone still on the old index.html. Everything else (index.html, sw.js, config.json…) is
    // checked on every visit, so a deploy reaches phones at once.
    const dist = join(__dirname, '../../parent-web/dist');
    if (existsSync(dist)) {
      const assets = new BucketDeployment(this, 'DeployPwaAssets', {
        sources: [Source.asset(dist)],
        exclude: ['*'],
        include: ['assets/*'],
        prune: false,
        cacheControl: [CacheControl.setPublic(), CacheControl.maxAge(Duration.days(365)), CacheControl.immutable()],
        destinationBucket: site,
      });
      const pages = new BucketDeployment(this, 'DeployPwa', {
        sources: [
          Source.asset(dist),
          Source.jsonData('config.json', {
            apiUrl: api.apiEndpoint, region: this.region, userPoolId: userPool.userPoolId, userPoolClientId: client.userPoolClientId, cognitoDomain: domain.baseUrl(),
            realtimeUrl: realtimeStage.url,
          }),
        ],
        exclude: ['assets/*'], // uploaded above, and never pruned here
        cacheControl: [CacheControl.noCache()],
        destinationBucket: site,
        distribution: pwa,
        distributionPaths: ['/*'],
      });
      pages.node.addDependency(assets); // a new index.html only once the files it loads are there
    }

    if (props.budgetEmail) {
      const subscribers = [{subscriptionType: 'EMAIL', address: props.budgetEmail}];
      new CfnBudget(this, 'Budget', {
        budget: {budgetName: `marbletime-${props.stage}`, budgetType: 'COST', timeUnit: 'MONTHLY', budgetLimit: {amount: 10, unit: 'USD'}},
        notificationsWithSubscribers: [
          {notification: {notificationType: 'ACTUAL', comparisonOperator: 'GREATER_THAN', threshold: 80, thresholdType: 'PERCENTAGE'}, subscribers},
          {notification: {notificationType: 'FORECASTED', comparisonOperator: 'GREATER_THAN', threshold: 100, thresholdType: 'PERCENTAGE'}, subscribers},
        ],
      });
    }

    new CfnOutput(this, 'ApiUrl', {value: api.apiEndpoint});
    new CfnOutput(this, 'PwaUrl', {value: pwaUrl});
    new CfnOutput(this, 'UserPoolId', {value: userPool.userPoolId});
    new CfnOutput(this, 'UserPoolClientId', {value: client.userPoolClientId});
    new CfnOutput(this, 'CognitoDomain', {value: domain.baseUrl()});
    new CfnOutput(this, 'RealtimeUrl', {value: realtimeStage.url});
  }
}
