import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { observeHttpRequest } from '@agentbench/shared/http-logging';

function capture(url = '/shopping?session=private-token', method = 'GET', id = 'private-header') {
  const lines: string[] = [];
  const headers: Record<string, string> = {};
  const response = Object.assign(new EventEmitter(), {
    statusCode: 200,
    setHeader: (key: string, value: string) => { headers[key] = value; },
  });
  const request = { url, method, headers: { 'x-request-id': id, authorization: 'private-key' } } as IncomingMessage;
  observeHttpRequest(request, response as unknown as ServerResponse, 'hosted-sites', true, line => lines.push(line));
  return { lines, headers, response };
}

test('request logging never serializes URLs, secrets or unknown headers', () => {
  const fixture = capture();
  assert.equal(fixture.lines.length, 0);
  fixture.response.statusCode = 403;
  fixture.response.emit('finish');
  fixture.response.emit('finish');
  assert.equal(fixture.lines.length, 1);
  assert.doesNotMatch(fixture.lines[0], /private|session|shopping|authorization/);
  const record = JSON.parse(fixture.lines[0]);
  assert.equal(record.status, 403);
  assert.equal(record.route, 'app');
  assert.equal(record.request_id, fixture.headers['x-request-id']);
  assert.ok(record.duration_ms >= 0);
});

test('safe gateway request IDs correlate without accepting arbitrary header values', () => {
  const fixture = capture('/api/attempts?token=private', 'POST', '1234567890abcdef1234567890abcdef');
  fixture.response.emit('finish');
  const record = JSON.parse(fixture.lines[0]);
  assert.equal(record.request_id, '1234567890abcdef1234567890abcdef');
  assert.equal(record.route, 'api');
  assert.equal(record.method, 'POST');
});

test('health classification and unknown methods remain bounded', () => {
  const fixture = capture('/health?secret=private', 'PRIVATE_METHOD');
  fixture.response.emit('finish');
  const record = JSON.parse(fixture.lines[0]);
  assert.equal(record.route, 'health');
  assert.equal(record.method, 'OTHER');
});

test('disabled logging does not mutate responses or attach listeners', () => {
  const response = new EventEmitter() as unknown as ServerResponse;
  observeHttpRequest({} as IncomingMessage, response, 'hosted-orchestrator', false, () => assert.fail('unexpected log'));
  assert.equal(response.listenerCount('finish'), 0);
});
