import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { getItem, putItem, updateItem, scanTable, queryTable, buildUpdateExpression } from '../lib/dynamodb';
import { success, created, notFound, badRequest, serverError, parseBody } from '../lib/response';

const TABLE = process.env.PRODUCTS_TABLE || 'products';

interface Product {
  id: string; name: string; description: string; price: number;
  category: string; stock: number; images: string[]; sku: string;
  isActive: boolean; createdAt: string; updatedAt: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { httpMethod, pathParameters, queryStringParameters, body } = event;
  const id = pathParameters?.id;

  try {
    if (httpMethod === 'GET' && !id) {
      const category = queryStringParameters?.category;
      const limit = parseInt(queryStringParameters?.limit || '20', 10);
      if (category) {
        const { items } = await queryTable({
          TableName: TABLE, IndexName: 'category-index',
          KeyConditionExpression: 'category = :c',
          FilterExpression: 'isActive = :a',
          ExpressionAttributeValues: { ':c': category, ':a': true },
          Limit: limit,
        });
        return success({ products: items, count: items.length, category });
      }
      const { items } = await scanTable({
        TableName: TABLE, FilterExpression: 'isActive = :a',
        ExpressionAttributeValues: { ':a': true }, Limit: limit,
      });
      return success({ products: items, count: items.length });
    }

    if (httpMethod === 'GET' && id) {
      const product = await getItem({ TableName: TABLE, Key: { id } });
      return product ? success(product) : notFound('Product');
    }

    if (httpMethod === 'POST') {
      const data = parseBody<Partial<Product>>(body);
      if (!data.name || !data.price || !data.category)
        return badRequest('name, price, category are required');
      if (data.price <= 0) return badRequest('price must be positive');

      const now = new Date().toISOString();
      const product: Product = {
        id: randomUUID(), name: data.name,
        description: data.description || '', price: data.price,
        category: data.category, stock: data.stock || 0,
        images: data.images || [],
        sku: data.sku || `SKU-${randomUUID().slice(0,8).toUpperCase()}`,
        isActive: true, createdAt: now, updatedAt: now,
      };
      await putItem({ TableName: TABLE, Item: product });
      return created(product);
    }

    if (httpMethod === 'PUT' && id) {
      const existing = await getItem({ TableName: TABLE, Key: { id } });
      if (!existing) return notFound('Product');
      const updates = parseBody<Partial<Product>>(body);
      if (updates.price !== undefined && updates.price <= 0) return badRequest('price must be positive');
      ['id', 'createdAt', 'sku'].forEach(f => delete (updates as Record<string, unknown>)[f]);
      const expr = buildUpdateExpression(updates as Record<string, unknown>);
      const updated = await updateItem({ TableName: TABLE, Key: { id }, ...expr, ReturnValues: 'ALL_NEW' });
      return success(updated);
    }

    if (httpMethod === 'DELETE' && id) {
      const existing = await getItem({ TableName: TABLE, Key: { id } });
      if (!existing) return notFound('Product');
      await updateItem({
        TableName: TABLE, Key: { id },
        UpdateExpression: 'SET isActive = :f, updatedAt = :n',
        ExpressionAttributeValues: { ':f': false, ':n': new Date().toISOString() },
      });
      return success({ message: 'Product deleted' });
    }

    return badRequest(`${httpMethod} not supported`);
  } catch (err) {
    return serverError(err);
  }
};
