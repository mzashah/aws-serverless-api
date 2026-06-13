import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB Tables
    const usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: 'users',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: true,
    });
    usersTable.addGlobalSecondaryIndex({
      indexName: 'email-index',
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
    });

    const productsTable = new dynamodb.Table(this, 'ProductsTable', {
      tableName: 'products',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    productsTable.addGlobalSecondaryIndex({
      indexName: 'category-index',
      partitionKey: { name: 'category', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    });

    const ordersTable = new dynamodb.Table(this, 'OrdersTable', {
      tableName: 'orders',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    ordersTable.addGlobalSecondaryIndex({
      indexName: 'userId-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    });

    // Cognito User Pool
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'serverless-api-users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      authFlows: { userSrp: true, userPassword: true },
      generateSecret: false,
    });

    // Lambda environment
    const lambdaEnv = {
      USERS_TABLE: usersTable.tableName,
      PRODUCTS_TABLE: productsTable.tableName,
      ORDERS_TABLE: ordersTable.tableName,
      NODE_ENV: 'production',
    };

    // Lambda functions
    const usersHandler = new NodejsFunction(this, 'UsersHandler', {
      functionName: 'serverless-api-users',
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../src/handlers/users.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: lambdaEnv,
      bundling: { minify: true },
    });

    const productsHandler = new NodejsFunction(this, 'ProductsHandler', {
      functionName: 'serverless-api-products',
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../src/handlers/products.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: lambdaEnv,
      bundling: { minify: true },
    });

    const ordersHandler = new NodejsFunction(this, 'OrdersHandler', {
      functionName: 'serverless-api-orders',
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../src/handlers/orders.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: lambdaEnv,
      bundling: { minify: true },
    });

    // DynamoDB permissions
    usersTable.grantReadWriteData(usersHandler);
    productsTable.grantReadWriteData(productsHandler);
    ordersTable.grantReadWriteData(ordersHandler);
    usersTable.grantReadData(ordersHandler);
    productsTable.grantReadData(ordersHandler);

    // API Gateway
    const api = new apigateway.RestApi(this, 'ServerlessApi', {
      restApiName: 'Serverless API',
      deployOptions: { stageName: 'v1' },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      cognitoUserPools: [userPool],
    });
    const auth = { authorizer, authorizationType: apigateway.AuthorizationType.COGNITO };

    // Routes
    const addCrud = (resource: apigateway.IResource, handler: lambda.IFunction) => {
      const list = resource;
      const item = resource.addResource('{id}');
      list.addMethod('GET',  new apigateway.LambdaIntegration(handler), auth);
      list.addMethod('POST', new apigateway.LambdaIntegration(handler), auth);
      item.addMethod('GET',    new apigateway.LambdaIntegration(handler), auth);
      item.addMethod('PUT',    new apigateway.LambdaIntegration(handler), auth);
      item.addMethod('DELETE', new apigateway.LambdaIntegration(handler), auth);
    };

    addCrud(api.root.addResource('users'),    usersHandler);
    addCrud(api.root.addResource('products'), productsHandler);
    addCrud(api.root.addResource('orders'),   ordersHandler);

    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
  }
}
