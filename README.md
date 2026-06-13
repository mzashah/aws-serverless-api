# AWS Serverless API

Production-ready AWS Serverless REST API built with Lambda, DynamoDB, API Gateway, Cognito, and CDK.

## Architecture

```
  Client
    |
    v
+------------------+
|   API Gateway    |  REST API + Cognito Authorizer
+--------+---------+
         |
  +------+------+------+
  |      |             |
/users /products    /orders
  |      |             |
Lambda  Lambda       Lambda
  |      |             |
  +------+------+------+
         |
   +-----v------+
   |  DynamoDB  |
   | users      |
   | products   |
   | orders     |
   +------------+
```

## Features

- Lambda functions for CRUD on Users, Products, Orders
- DynamoDB tables with GSIs for querying
- API Gateway REST API with Cognito authorizer
- Cognito User Pool for authentication
- IAM least-privilege roles
- TypeScript throughout
- AWS CDK v2 infrastructure-as-code

## Prerequisites

- Node.js 20+
- AWS CLI configured
- AWS CDK v2: `npm install -g aws-cdk`

## Deployment

```bash
git clone https://github.com/mzashah/aws-serverless-api
cd aws-serverless-api
npm install

# Bootstrap CDK (first time only per account/region)
cdk bootstrap aws://ACCOUNT_ID/REGION

# Deploy
cdk deploy --all
```

## API Endpoints

All require `Authorization: Bearer <cognito_token>` header.

### Users
```
GET    /users          List users
GET    /users/{id}     Get user
POST   /users          Create user
PUT    /users/{id}     Update user
DELETE /users/{id}     Delete user
```

### Products
```
GET    /products            List products (supports ?category=)
GET    /products/{id}       Get product
POST   /products            Create product
PUT    /products/{id}       Update product
DELETE /products/{id}       Delete product
```

### Orders
```
GET    /orders              List orders (supports ?userId=)
GET    /orders/{id}         Get order
POST   /orders              Create order
PUT    /orders/{id}         Update status
DELETE /orders/{id}         Cancel order
```

## Order Status Flow

```
pending -> confirmed -> processing -> shipped -> delivered -> refunded
   \-> cancelled at any pre-shipped stage
```

## Tech Stack

- Node.js 20 Lambda
- TypeScript 5
- DynamoDB with DocumentClient
- API Gateway REST
- Cognito User Pool
- AWS CDK v2

## License

MIT
