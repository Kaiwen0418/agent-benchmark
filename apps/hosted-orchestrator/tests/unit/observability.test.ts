import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperationalObservability, correlationIds } from '../../src/observability.js';
import { createObservabilityMonitor } from '../../src/observability-monitor.js';

test('lifecycle logs keep validated IDs while metrics use bounded labels', () => {
  const logs: string[] = [];
  const telemetry = createOperationalObservability('worker', { enabled: true, logs: true, emit: line => logs.push(line) });
  const id = '12345678-1234-1234-1234-123456789abc';
  const ids = correlationIds({ runId: id, sessionId: 'private-token', payload: { answer: 'hidden' } });
  telemetry.record({ event: 'command.completed', command_type: 'private-value', command_id: id,
    duration_ms: 125, status: 200, partition: 2, ...ids });
  assert.equal(JSON.parse(logs[0]).command_type, 'other');
  assert.equal(JSON.parse(logs[0]).run_id, id);
  assert.doesNotMatch(logs[0], /private|hidden|payload/);
  const metrics = telemetry.render();
  assert.doesNotMatch(metrics, /12345678|private|run_id|session_id/);
  assert.match(metrics, /kind="command".*le="\+Inf"\} 1/);
  assert.match(metrics, /duration_seconds_sum.* 0.125/);
});

test('broken log sinks cannot throw into command processing', () => {
  const telemetry = createOperationalObservability('api', { enabled: true, logs: true, emit: () => { throw new Error('secret'); } });
  assert.doesNotThrow(() => telemetry.record({ event: 'command.queued', command_type: 'attempt.init' }));
  assert.match(telemetry.render(), /event="command.queued".* 1/);
});

test('disabled diagnostics and invalid fields cannot leak or inflate metrics', () => {
  const logs: string[] = [];
  const telemetry = createOperationalObservability('api', { enabled: false, logs: true, emit: line => logs.push(line) });
  telemetry.record({ event: 'callback.retry', duration_ms: Infinity, partition: -1, status: 999, run_id: 'credential' });
  assert.deepEqual(JSON.parse(logs[0]), { event: 'callback.retry', service: 'hosted-orchestrator', role: 'api' });
  telemetry.setGauge('callback_backlog', 2);
  assert.doesNotMatch(telemetry.render(), /callback_backlog|events_total\{/);
  telemetry.record({ event: 'private-event' } as never);
  assert.equal(logs.length, 1);
});

test('callback histograms and gauge validation use bounded values', () => {
  const telemetry = createOperationalObservability('worker', { enabled: true, logs: false });
  telemetry.record({ event: 'callback.delivered', duration_ms: 100 });
  telemetry.record({ event: 'callback.retry', duration_ms: 500 });
  telemetry.setGauge('callback_backlog', 3);
  telemetry.setGauge('secret-token', 1);
  telemetry.setGauge('invalid', NaN);
  const metrics = telemetry.render();
  assert.match(metrics, /kind="callback".*le="0.1"\} 1/);
  assert.match(metrics, /kind="callback".*le="0.5"\} 2/);
  assert.match(metrics, /callback_backlog.* 3/);
  assert.doesNotMatch(metrics, /secret-token|invalid/);
});

test('snapshot failures retain previous values with explicit failure and age', async () => {
  let now = 1000; let fail = false;
  const telemetry = createOperationalObservability('api', { enabled: true, logs: false });
  const monitor = createObservabilityMonitor({ telemetry, now: () => now,
    queue: async () => { if (fail) throw new Error('private-redis-uri'); return [{ partition: 0, lease: true, pending: 2, lag: null, oldestPendingAgeSeconds: 5 }]; },
    database: async () => ({ callback_backlog: 3 }),
  });
  await monitor.refresh('redis'); await monitor.refresh('database');
  assert.match(monitor.render(), /command_lag_known.* 0/);
  assert.doesNotMatch(monitor.render(), /command_lag\{/);
  fail = true; now += 20000;
  await monitor.refresh('redis');
  const metrics = monitor.render();
  assert.match(metrics, /redis_collector_up.* 0/);
  assert.match(metrics, /command_pending.* 2/);
  assert.match(metrics, /redis_snapshot_age_seconds.* 20/);
  assert.doesNotMatch(metrics, /private-redis/);
});

test('collectors do not overlap and missing durable storage is unavailable', async () => {
  let count = 0; let release!: () => void;
  const telemetry = createOperationalObservability('api', { enabled: true, logs: false });
  const monitor = createObservabilityMonitor({ telemetry,
    queue: async () => { count++; await new Promise<void>(resolve => { release = resolve; }); return []; },
    database: async () => null,
  });
  const first = monitor.refresh('redis'); await monitor.refresh('redis');
  assert.match(monitor.render(), /redis_collector_up.* 0/);
  assert.equal(count, 1); release(); await first;
  await monitor.refresh('database');
  assert.match(monitor.render(), /database_collector_up.* 0/);
  assert.doesNotMatch(monitor.render(), /callback_backlog/);
});
