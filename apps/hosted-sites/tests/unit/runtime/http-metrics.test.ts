import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHttpMetrics, metricsAuthorized } from '@agentbench/shared/http-metrics';

test('request counters and cumulative histogram exclude secret-bearing labels', () => {
  const metrics = createHttpMetrics('hosted-sites');
  const response = Object.assign(new EventEmitter(), { statusCode: 503 });
  metrics.observe({ url: '/api/private-value?session=private-token' } as IncomingMessage, response as unknown as ServerResponse, true);
  response.emit('finish');
  response.emit('finish');
  const text = metrics.render();
  assert.match(text, /agentbench_http_requests_total\{service="hosted-sites",route="api",status_class="5xx"\} 1/);
  assert.match(text, /le="\+Inf"\} 1/);
  assert.match(text, /agentbench_http_request_duration_seconds_count.* 1/);
  assert.doesNotMatch(text, /private|session/);
  assert.match(text, /agentbench_process_resident_memory_bytes/);
  assert.match(text, /agentbench_process_heap_used_bytes.* [0-9]+/);
  assert.match(text, /agentbench_process_cpu_seconds_total.* [0-9]+/);
});

test('scraping and disabled requests do not inflate request metrics', () => {
  const metrics = createHttpMetrics('hosted-orchestrator');
  const response = new EventEmitter() as unknown as ServerResponse;
  metrics.observe({ url: '/metrics?ignored=yes' } as IncomingMessage, response, true);
  metrics.observe({ url: '/health' } as IncomingMessage, response, false);
  assert.equal(response.listenerCount('finish'), 0);
  assert.doesNotMatch(metrics.render(), /agentbench_http_requests_total\{/);
});

test('metrics require the distinct bearer credential and fail closed', () => {
  const request = (authorization?: string) => ({ headers: { authorization } }) as IncomingMessage;
  assert.equal(metricsAuthorized(request('Bearer metrics-secret'), 'metrics-secret'), true);
  assert.equal(metricsAuthorized(request('Bearer wrong'), 'metrics-secret'), false);
  assert.equal(metricsAuthorized(request('Basic metrics-secret'), 'metrics-secret'), false);
  assert.equal(metricsAuthorized(request(), 'metrics-secret'), false);
  assert.equal(metricsAuthorized(request('Bearer metrics-secret'), ''), false);
});
