/**
 * Everything MarbleTime runs on in AWS (docs/03 §2): the API (HTTP API → one Lambda → one DynamoDB table),
 * Cognito for parents, and S3 + CloudFront for the parent web app. One stack per stage.
 */
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {CfnOutput, Duration, RemovalPolicy, Stack, type StackProps} from 'aws-cdk-lib';
import {CorsHttpMethod, HttpApi, HttpMethod, HttpStage} from 'aws-cdk-lib/aws-apigatewayv2';
import {HttpUserPoolAuthorizer} from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import {HttpLambdaIntegration} from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import {CfnBudget} from 'aws-cdk-lib/aws-budgets';
import {Distribution, PriceClass, ViewerProtocolPolicy} from 'aws-cdk-lib/aws-cloudfront';
import {S3BucketOrigin} from 'aws-cdk-lib/aws-cloudfront-origins';
import {
  AccountRecovery, CfnManagedLoginBranding, FeaturePlan, ManagedLoginVersion, OAuthScope, UserPool, UserPoolClientIdentityProvider,
} from 'aws-cdk-lib/aws-cognito';
import {AttributeType, BillingMode, Table} from 'aws-cdk-lib/aws-dynamodb';
import {Architecture, Runtime} from 'aws-cdk-lib/aws-lambda';
import {NodejsFunction} from 'aws-cdk-lib/aws-lambda-nodejs';
import {LogGroup, RetentionDays} from 'aws-cdk-lib/aws-logs';
import {BlockPublicAccess, Bucket} from 'aws-cdk-lib/aws-s3';
import {BucketDeployment, Source} from 'aws-cdk-lib/aws-s3-deployment';
import type {Construct} from 'constructs';
import {routes} from '../src/http/routes';

export interface MarbleTimeStackProps extends StackProps {
  readonly stage: string;
  /** Where the $10/month budget alert goes; no budget without it. */
  readonly budgetEmail?: string;
}

/** The parent app's dev server (Vite). Cognito allows plain http only for localhost. */
const LOCAL_PWA = 'http://localhost:5173';

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
      selfSignUpEnabled: true,
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
        callbackUrls: [...appUrls('/'), ...appUrls('/callback')],
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
      timeout: Duration.seconds(10),
      environment: {TABLE_NAME: table.tableName, PWA_URL: pwaUrl, NODE_OPTIONS: '--enable-source-maps'},
      bundling: {minify: true, sourceMap: true, target: 'node22'},
      logGroup: new LogGroup(this, 'ApiLogs', {retention: RetentionDays.TWO_WEEKS, removalPolicy: RemovalPolicy.DESTROY}),
    });
    table.grantReadWriteData(fn);

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
    const dist = join(__dirname, '../../parent-web/dist');
    if (existsSync(dist)) {
      new BucketDeployment(this, 'DeployPwa', {
        sources: [
          Source.asset(dist),
          Source.jsonData('config.json', {
            apiUrl: api.apiEndpoint, region: this.region, userPoolId: userPool.userPoolId, userPoolClientId: client.userPoolClientId, cognitoDomain: domain.baseUrl(),
          }),
        ],
        destinationBucket: site,
        distribution: pwa,
        distributionPaths: ['/*'],
      });
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
  }
}
