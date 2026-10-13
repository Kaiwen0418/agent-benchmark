import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export function createHttpMetrics(service: 'hosted-sites' | 'hosted-orchestrator') {
  const samples = new Map<string, { count: number; sum: number; buckets: number[] }>();
  return {
    observe(request: IncomingMessage, response: ServerResponse, enabled = process.env.HOSTED_METRICS_ENABLED === 'true') {
      if (!enabled || (request.url ?? '').split('?')[0] === '/metrics') return;
      const path = (request.url ?? '/').split('?')[0];
      const route = path === '/health' ? 'health' : path.startsWith('/api/') ? 'api' : 'app';
      const started = performance.now();
      response.once('finish', () => {
        const statusClass = `${Math.max(1, Math.min(5, Math.floor(response.statusCode / 100)))}xx`;
        const labels = `service="${service}",route="${route}",status_class="${statusClass}"`;
        const sample = samples.get(labels) ?? { count: 0, sum: 0, buckets: buckets.map(() => 0) };
        const duration = (performance.now() - started) / 1000;
        sample.count += 1;
        sample.sum += duration;
        buckets.forEach((bound, i) => { if (duration <= bound) sample.buckets[i] += 1; });
        samples.set(labels, sample);
      });
    },
    render() {
      const lines = [
        '# HELP agentbench_http_requests_total Completed HTTP requests.',
        '# TYPE agentbench_http_requests_total counter',
        '# HELP agentbench_http_request_duration_seconds Completed HTTP request duration.',
        '# TYPE agentbench_http_request_duration_seconds histogram',
      ];
      for (const [labels, sample] of samples) {
        lines.push(`agentbench_http_requests_total{${labels}} ${sample.count}`);
        buckets.forEach((bound, i) => lines.push(`agentbench_http_request_duration_seconds_bucket{${labels},le="${bound}"} ${sample.buckets[i]}`));
        lines.push(`agentbench_http_request_duration_seconds_bucket{${labels},le="+Inf"} ${sample.count}`);
        lines.push(`agentbench_http_request_duration_seconds_sum{${labels}} ${sample.sum}`);
        lines.push(`agentbench_http_request_duration_seconds_count{${labels}} ${sample.count}`);
      }
      lines.push('# TYPE agentbench_process_resident_memory_bytes gauge');
      lines.push(`agentbench_process_resident_memory_bytes{service="${service}"} ${process.memoryUsage().rss}`);
      lines.push('# TYPE agentbench_process_uptime_seconds gauge');
      lines.push(`agentbench_process_uptime_seconds{service="${service}"} ${process.uptime()}`);
      return `${lines.join('\n')}\n`;
    },
  };
}

export function metricsAuthorized(request: IncomingMessage, secret = process.env.HOSTED_METRICS_TOKEN) {
  if (!secret) return false;
  const supplied = request.headers.authorization;
  if (typeof supplied !== 'string') return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(supplied);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
