import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand, PutCommand, UpdateCommand, DeleteCommand,
  ScanCommand, QueryCommand,
  GetCommandInput, PutCommandInput, UpdateCommandInput,
  DeleteCommandInput, ScanCommandInput, QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  maxAttempts: 3,
});

export const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true, convertEmptyValues: false },
});

export const getItem    = async (p: GetCommandInput)    => (await docClient.send(new GetCommand(p))).Item;
export const putItem    = async (p: PutCommandInput)    => docClient.send(new PutCommand(p));
export const deleteItem = async (p: DeleteCommandInput) => docClient.send(new DeleteCommand(p));

export const updateItem = async (p: UpdateCommandInput) => {
  const r = await docClient.send(new UpdateCommand(p));
  return r.Attributes;
};

export const scanTable = async (p: ScanCommandInput) => {
  const r = await docClient.send(new ScanCommand(p));
  return { items: r.Items || [], lastKey: r.LastEvaluatedKey };
};

export const queryTable = async (p: QueryCommandInput) => {
  const r = await docClient.send(new QueryCommand(p));
  return { items: r.Items || [], lastKey: r.LastEvaluatedKey };
};

export function buildUpdateExpression(updates: Record<string, unknown>) {
  const keys = Object.keys(updates).filter(k => updates[k] !== undefined);
  if (!keys.length) throw new Error('No fields to update');

  const names: Record<string, string>  = {};
  const values: Record<string, unknown> = {};
  const parts = keys.map(k => { names[`#${k}`] = k; values[`:${k}`] = updates[k]; return `#${k} = :${k}`; });
  names['#ua'] = 'updatedAt';
  values[':ua'] = new Date().toISOString();
  parts.push('#ua = :ua');

  return { UpdateExpression: `SET ${parts.join(', ')}`, ExpressionAttributeNames: names, ExpressionAttributeValues: values };
}
