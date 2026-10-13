import type { createOperationalObservability } from './observability.js';
export function createObservabilityMonitor(options: {
  telemetry: ReturnType<typeof createOperationalObservability>;
  queue: () => Promise<Array<{ partition: number; lease: boolean; pending: number; lag: number | null; oldestPendingAgeSeconds: number }>>;
  database: () => Promise<Record<string, number> | null>;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const successes: Record<string, number> = {};
  const inFlight = new Set<string>();
  async function refresh(source: 'redis' | 'database') {
    if (inFlight.has(source)) return;
    inFlight.add(source);
    if (successes[source] === undefined) options.telemetry.setGauge(`${source}_collector_up`, 0);
    try {
      if (source === 'redis') {
        const rows = await options.queue();
        for (const row of rows) {
          options.telemetry.setGauge('partition_lease', row.lease ? 1 : 0, row.partition);
          options.telemetry.setGauge('command_pending', row.pending, row.partition);
          options.telemetry.setGauge('command_lag_known', row.lag === null ? 0 : 1, row.partition);
          if (row.lag !== null) options.telemetry.setGauge('command_lag', row.lag, row.partition);
          options.telemetry.setGauge('oldest_pending_age_seconds', row.oldestPendingAgeSeconds, row.partition);
        }
      } else {
        const row = await options.database();
        if (!row) throw new Error('Database collector unavailable');
        for (const [name, value] of Object.entries(row)) options.telemetry.setGauge(name, value);
      }
      successes[source] = now();
      options.telemetry.setGauge(`${source}_collector_up`, 1);
    } catch {
      options.telemetry.setGauge(`${source}_collector_up`, 0);
      options.telemetry.record({ event: 'monitor.failed', source });
    } finally { inFlight.delete(source); }
  }
  return { refresh, render() {
    for (const source of ['redis', 'database']) if (successes[source] !== undefined) options.telemetry.setGauge(`${source}_snapshot_age_seconds`, Math.max(0, (now() - successes[source]) / 1000));
    return options.telemetry.render();
  } };
}
