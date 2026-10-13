export const commandTypes = ['attempt.init', 'session.snapshot', 'session.access', 'session.event', 'attempt.complete-session', 'attempt.timeout', 'attempt.cancel', 'maintenance.cleanup', 'other'] as const;
export const operationalEvents = ['command.queued', 'command.started', 'command.completed', 'command.retry', 'command.dead_letter', 'command.reclaimed', 'worker.lease_failure', 'callback.delivered', 'callback.retry', 'callback.dead', 'monitor.failed'] as const;
export type OperationalEvent = {
  event: 'command.queued' | 'command.started' | 'command.completed' | 'command.retry' | 'command.dead_letter' | 'command.reclaimed' | 'worker.lease_failure' | 'callback.delivered' | 'callback.retry' | 'callback.dead' | 'monitor.failed';
  command_type?: string;
  command_id?: string;
  run_id?: string;
  attempt_id?: string;
  session_id?: string;
  partition?: number;
  status?: number;
  duration_ms?: number;
  source?: 'redis' | 'database';
};

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const bounds = [0.01, 0.05, 0.1, 0.5, 1, 5, 15, 30, 60];
export function correlationIds(payload: Record<string, unknown>) {
  const ids: Record<string, string> = {};
  for (const [source, target] of [['runId', 'run_id'], ['attemptId', 'attempt_id'], ['sessionId', 'session_id']]) {
    if (typeof payload[source] === 'string' && uuid.test(payload[source])) ids[target] = payload[source];
  }
  return ids;
}

export function createOperationalObservability(role: 'api' | 'worker' | 'all', options: {
  enabled?: boolean; logs?: boolean; emit?: (line: string) => void;
} = {}) {
  const enabled = options.enabled ?? process.env.HOSTED_METRICS_ENABLED === 'true';
  const logs = options.logs ?? process.env.HOSTED_STRUCTURED_LOGS === 'true';
  const counters = new Map<string, number>();
  const durations = new Map<string, { count: number; sum: number; buckets: number[] }>();
  const gauges = new Map<string, number>();
  function record(input: OperationalEvent) {
    // Diagnostics must never change command acknowledgement or callback delivery.
    try {
      if (!operationalEvents.includes(input.event)) return;
      const type = commandTypes.includes(input.command_type as typeof commandTypes[number]) ? input.command_type! : 'other';
      const record: Record<string, string | number> = { event: input.event, service: 'hosted-orchestrator', role };
      if (input.source === 'redis' || input.source === 'database') record.source = input.source;
      if (input.event.startsWith('command.')) record.command_type = type;
      for (const key of ['command_id', 'run_id', 'attempt_id', 'session_id'] as const) {
        if (typeof input[key] === 'string' && uuid.test(input[key])) record[key] = input[key];
      }
      if (Number.isInteger(input.partition) && input.partition! >= 0 && input.partition! < 1024) record.partition = input.partition!;
      if (Number.isInteger(input.status) && input.status! >= 100 && input.status! <= 599) record.status = input.status!;
      if (Number.isFinite(input.duration_ms) && input.duration_ms! >= 0 && input.duration_ms! <= 86_400_000) record.duration_ms = input.duration_ms!;
      if (logs) {
        try { (options.emit ?? console.log)(JSON.stringify(record)); } catch { /* Keep metric accounting independent of the log sink. */ }
      }
      if (!enabled) return;
      const labels = `event="${input.event}",command_type="${type}"`;
      counters.set(labels, (counters.get(labels) ?? 0) + 1);
      if ((input.event === 'command.completed' || input.event.startsWith('callback.')) && typeof record.duration_ms === 'number') {
        const kind = input.event === 'command.completed' ? 'command' : 'callback';
        const key = `kind="${kind}",command_type="${type}"`;
        const sample = durations.get(key) ?? { count: 0, sum: 0, buckets: bounds.map(() => 0) };
        const seconds = record.duration_ms / 1000;
        sample.count++; sample.sum += seconds;
        bounds.forEach((bound, i) => { if (seconds <= bound) sample.buckets[i]++; });
        durations.set(key, sample);
      }
    } catch { /* Observability is best effort; raw failures are intentionally not logged. */ }
  }
  return {
    record,
    setGauge(name: string, value: number, partition?: number) {
      if (!enabled || !/^[a-z_]+$/.test(name) || !Number.isFinite(value)) return;
      const labels = partition === undefined ? '' : `,partition="${partition}"`;
      gauges.set(`agentbench_orchestrator_${name}{service="hosted-orchestrator",role="${role}"${labels}}`, value);
    },
    render() {
      const lines = ['# TYPE agentbench_orchestrator_events_total counter'];
      for (const [labels, value] of counters) lines.push(`agentbench_orchestrator_events_total{service="hosted-orchestrator",role="${role}",${labels}} ${value}`);
      lines.push('# TYPE agentbench_orchestrator_operation_duration_seconds histogram');
      for (const [labels, sample] of durations) {
        const base = `service="hosted-orchestrator",role="${role}",${labels}`;
        bounds.forEach((bound, i) => lines.push(`agentbench_orchestrator_operation_duration_seconds_bucket{${base},le="${bound}"} ${sample.buckets[i]}`));
        lines.push(`agentbench_orchestrator_operation_duration_seconds_bucket{${base},le="+Inf"} ${sample.count}`);
        lines.push(`agentbench_orchestrator_operation_duration_seconds_sum{${base}} ${sample.sum}`);
        lines.push(`agentbench_orchestrator_operation_duration_seconds_count{${base}} ${sample.count}`);
      }
      for (const [key, value] of gauges) lines.push(`${key} ${value}`);
      return `${lines.join('\n')}\n`;
    },
  };
}
