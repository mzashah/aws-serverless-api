import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { getItem, putItem, updateItem, scanTable, queryTable, buildUpdateExpression } from '../lib/dynamodb';
import { success, created, notFound, badRequest, serverError, parseBody } from '../lib/response';

const ORDERS_TABLE = process.env.ORDERS_TABLE || 'orders';
const USERS_TABLE  = process.env.USERS_TABLE  || 'users';
const PROD_TABLE   = process.env.PRODUCTS_TABLE || 'products';

type Status = 'pending'|'confirmed'|'processing'|'shipped'|'delivered'|'cancelled'|'refunded';

const TRANSITIONS: Record<Status, Status[]> = {
  pending: ['confirmed','cancelled'], confirmed: ['processing','cancelled'],
  processing: ['shipped','cancelled'], shipped: ['delivered'],
  delivered: ['refunded'], cancelled: [], refunded: [],
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { httpMethod, pathParameters, queryStringParameters, body } = event;
  const id = pathParameters?.id;

  try {
    if (httpMethod === 'GET' && !id) {
      const userId = queryStringParameters?.userId;
      const limit  = parseInt(queryStringParameters?.limit || '20', 10);
      if (userId) {
        const { items } = await queryTable({
          TableName: ORDERS_TABLE, IndexName: 'userId-index',
          KeyConditionExpression: 'userId = :u',
          ExpressionAttributeValues: { ':u': userId },
          ScanIndexForward: false, Limit: limit,
        });
        return success({ orders: items, count: items.length });
      }
      const { items } = await scanTable({ TableName: ORDERS_TABLE, Limit: limit });
      return success({ orders: items, count: items.length });
    }

    if (httpMethod === 'GET' && id) {
      const order = await getItem({ TableName: ORDERS_TABLE, Key: { id } });
      return order ? success(order) : notFound('Order');
    }

    if (httpMethod === 'POST') {
      const data = parseBody<{userId:string;items:{productId:string;quantity:number}[];shippingAddress:Record<string,string>;notes?:string}>(body);
      if (!data.userId || !data.items?.length || !data.shippingAddress)
        return badRequest('userId, items, shippingAddress required');

      const user = await getItem({ TableName: USERS_TABLE, Key: { id: data.userId } });
      if (!user) return badRequest('User not found');

      let total = 0;
      const lineItems = [];
      for (const item of data.items) {
        if (!item.productId || item.quantity < 1) return badRequest('Each item needs productId and quantity >= 1');
        const product = await getItem({ TableName: PROD_TABLE, Key: { id: item.productId } });
        if (!product) return badRequest(`Product ${item.productId} not found`);
        total += product.price * item.quantity;
        lineItems.push({ productId: item.productId, quantity: item.quantity, price: product.price, name: product.name });
      }

      const now = new Date().toISOString();
      const order = {
        id: randomUUID(), userId: data.userId, items: lineItems,
        totalAmount: Math.round(total * 100) / 100,
        status: 'pending' as Status,
        shippingAddress: data.shippingAddress, notes: data.notes,
        createdAt: now, updatedAt: now,
      };
      await putItem({ TableName: ORDERS_TABLE, Item: order });
      return created(order);
    }

    if (httpMethod === 'PUT' && id) {
      const order = await getItem({ TableName: ORDERS_TABLE, Key: { id } }) as { status: Status } | undefined;
      if (!order) return notFound('Order');
      const updates = parseBody<{ status?: Status; notes?: string }>(body);
      if (updates.status) {
        const allowed = TRANSITIONS[order.status] || [];
        if (!allowed.includes(updates.status))
          return badRequest(`Cannot transition ${order.status} -> ${updates.status}. Allowed: ${allowed.join(', ') || 'none'}`);
      }
      const expr = buildUpdateExpression(updates as Record<string, unknown>);
      const updated = await updateItem({ TableName: ORDERS_TABLE, Key: { id }, ...expr, ReturnValues: 'ALL_NEW' });
      return success(updated);
    }

    if (httpMethod === 'DELETE' && id) {
      const order = await getItem({ TableName: ORDERS_TABLE, Key: { id } }) as { status: Status } | undefined;
      if (!order) return notFound('Order');
      if (!TRANSITIONS[order.status].includes('cancelled'))
        return badRequest(`Order in status ${order.status} cannot be cancelled`);
      await updateItem({
        TableName: ORDERS_TABLE, Key: { id },
        UpdateExpression: 'SET #s = :c, updatedAt = :n',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':c': 'cancelled', ':n': new Date().toISOString() },
      });
      return success({ message: 'Order cancelled' });
    }

    return badRequest(`${httpMethod} not supported`);
  } catch (err) {
    return serverError(err);
  }
};
