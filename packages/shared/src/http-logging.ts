import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export function observeHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  service: 'hosted-sites' | 'hosted-orchestrator',
  enabled = process.env.HOSTED_STRUCTURED_LOGS === 'true',
  emit: (record: string) => void = console.log,
) {
  if (!enabled) return;
  if ((request.url ?? '').split('?')[0] === '/metrics') return;
  const started = performance.now();
  const incomingId = request.headers['x-request-id'];
  const requestId = typeof incomingId === 'string' && /^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(incomingId)
    ? incomingId : randomUUID();
  response.setHeader('x-request-id', requestId);
  // Classify paths without retaining URLs, query parameters, headers or bodies.
  const path = (request.url ?? '/').split('?')[0];
  const route = path === '/health' ? 'health' : path.startsWith('/api/') ? 'api' : 'app';
  const method = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(request.method ?? '')
    ? request.method : 'OTHER';
  response.once('finish', () => {
    emit(JSON.stringify({
      event: 'http.request', service, request_id: requestId, method, route,
      status: response.statusCode,
      duration_ms: Math.round((performance.now() - started) * 1000) / 1000,
    }));
  });
}
