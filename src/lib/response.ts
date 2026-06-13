import { APIGatewayProxyResult } from 'aws-lambda';

const H = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Content-Type': 'application/json',
};

const r = (statusCode: number, body: unknown): APIGatewayProxyResult =>
  ({ statusCode, headers: H, body: typeof body === 'string' ? body : JSON.stringify(body) });

export const success    = (b: unknown, s = 200) => r(s, b);
export const created    = (b: unknown)           => r(201, b);
export const noContent  = ()                     => r(204, '');
export const badRequest = (msg: string, d?: unknown) => r(400, { error: 'Bad Request', message: msg, ...(d ? { details: d } : {}) });
export const unauthorized= (msg = 'Unauthorized') => r(401, { error: 'Unauthorized', message: msg });
export const forbidden  = (msg = 'Forbidden')    => r(403, { error: 'Forbidden', message: msg });
export const notFound   = (res = 'Resource')     => r(404, { error: 'Not Found', message: `${res} not found` });
export const conflict   = (msg: string)          => r(409, { error: 'Conflict', message: msg });
export const serverError= (err?: unknown) => { console.error('Error:', err); return r(500, { error: 'Internal Server Error' }); };
export const parseBody  = <T>(body: string | null): T => { if (!body) throw new Error('Empty body'); return JSON.parse(body) as T; };
