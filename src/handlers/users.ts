import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { getItem, putItem, updateItem, scanTable, queryTable, buildUpdateExpression } from '../lib/dynamodb';
import { success, created, notFound, badRequest, serverError, parseBody } from '../lib/response';

const TABLE = process.env.USERS_TABLE || 'users';

interface User {
  id: string; email: string; firstName: string; lastName: string;
  phone?: string; role: string; isActive: boolean; createdAt: string; updatedAt: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { httpMethod, pathParameters, queryStringParameters, body } = event;
  const id = pathParameters?.id;

  try {
    if (httpMethod === 'GET' && !id) {
      const limit = parseInt(queryStringParameters?.limit || '20', 10);
      const { items } = await scanTable({
        TableName: TABLE,
        FilterExpression: 'isActive = :a',
        ExpressionAttributeValues: { ':a': true },
        Limit: limit,
      });
      return success({ users: items, count: items.length });
    }

    if (httpMethod === 'GET' && id) {
      const user = await getItem({ TableName: TABLE, Key: { id } });
      return user ? success(user) : notFound('User');
    }

    if (httpMethod === 'POST') {
      const data = parseBody<Partial<User>>(body);
      if (!data.email || !data.firstName || !data.lastName)
        return badRequest('email, firstName, lastName are required');

      const existing = await queryTable({
        TableName: TABLE, IndexName: 'email-index',
        KeyConditionExpression: 'email = :e',
        ExpressionAttributeValues: { ':e': data.email.toLowerCase() },
      });
      if (existing.items.length > 0) return badRequest('Email already in use');

      const now = new Date().toISOString();
      const user: User = {
        id: randomUUID(), email: data.email.toLowerCase(),
        firstName: data.firstName, lastName: data.lastName,
        phone: data.phone, role: data.role || 'user',
        isActive: true, createdAt: now, updatedAt: now,
      };
      await putItem({ TableName: TABLE, Item: user });
      return created(user);
    }

    if (httpMethod === 'PUT' && id) {
      const existing = await getItem({ TableName: TABLE, Key: { id } });
      if (!existing) return notFound('User');
      const updates = parseBody<Partial<User>>(body);
      ['id', 'createdAt'].forEach(f => delete (updates as Record<string, unknown>)[f]);
      const expr = buildUpdateExpression(updates as Record<string, unknown>);
      const updated = await updateItem({ TableName: TABLE, Key: { id }, ...expr, ReturnValues: 'ALL_NEW' });
      return success(updated);
    }

    if (httpMethod === 'DELETE' && id) {
      const existing = await getItem({ TableName: TABLE, Key: { id } });
      if (!existing) return notFound('User');
      await updateItem({
        TableName: TABLE, Key: { id },
        UpdateExpression: 'SET isActive = :f, updatedAt = :n',
        ExpressionAttributeValues: { ':f': false, ':n': new Date().toISOString() },
      });
      return success({ message: 'User deleted' });
    }

    return badRequest(`${httpMethod} not supported`);
  } catch (err) {
    return serverError(err);
  }
};
