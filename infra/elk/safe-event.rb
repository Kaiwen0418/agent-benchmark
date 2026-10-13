require 'json'

def register(params)
  @environment = params.fetch('environment')
  raise 'Invalid deployment environment' unless %w[development test production].include?(@environment)
end

def filter(event)
  message = event.get('message')
  return [] unless message.is_a?(String) && message.bytesize <= 4096
  begin
    data = JSON.parse(message)
  rescue JSON::ParserError
    return []
  end
  return [] unless data.is_a?(Hash)
  operational = %w[command.queued command.started command.completed command.retry command.dead_letter command.reclaimed worker.lease_failure callback.delivered callback.retry callback.dead monitor.failed]
  if operational.include?(data['event'])
    return [] unless data['service'] == 'hosted-orchestrator' && %w[api worker all].include?(data['role'])
    safe = { '@timestamp' => event.get('@timestamp'), 'environment' => @environment,
      'event' => data['event'], 'service' => data['service'], 'role' => data['role'] }
    if data['event'].start_with?('command.')
      types = %w[attempt.init session.snapshot session.access session.event attempt.complete-session attempt.timeout attempt.cancel maintenance.cleanup other]
      return [] unless types.include?(data['command_type'])
      safe['command_type'] = data['command_type']
    end
    %w[command_id run_id attempt_id session_id].each do |key|
      value = data[key]
      safe[key] = value if value.is_a?(String) && value.match?(/\A[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\z/i)
    end
    safe['source'] = data['source'] if %w[redis database].include?(data['source'])
    safe['partition'] = data['partition'] if data['partition'].is_a?(Integer) && data['partition'].between?(0, 1023)
    safe['status'] = data['status'] if data['status'].is_a?(Integer) && data['status'].between?(100, 599)
    duration = data['duration_ms']
    safe['duration_ms'] = duration if duration.is_a?(Numeric) && duration.finite? && duration.between?(0, 86400000)
    return [LogStash::Event.new(safe)]
  end
  return [] unless data['event'] == 'http.request'
  return [] unless %w[gateway hosted-sites hosted-orchestrator].include?(data['service'])
  return [] unless %w[GET POST PUT PATCH DELETE HEAD OPTIONS OTHER].include?(data['method'])
  return [] unless %w[health api app other].include?(data['route'])
  status = data['status'].to_s
  duration = (data['service'] == 'gateway' ? data['duration_seconds'] : data['duration_ms']).to_s
  return [] unless status.match?(/\A[1-5][0-9]{2}\z/) && duration.match?(/\A[0-9]+(?:\.[0-9]+)?\z/)
  duration_ms = duration.to_f * (data['service'] == 'gateway' ? 1000 : 1)
  return [] unless duration_ms.finite? && duration_ms <= 86400000
  safe = {
    '@timestamp' => event.get('@timestamp'), 'environment' => @environment,
    'event' => 'http.request', 'service' => data['service'],
    'method' => data['method'], 'route' => data['route'],
    'status' => status.to_i, 'duration_ms' => duration_ms
  }
  request_id = data['request_id']
  if request_id.is_a?(String) && request_id.match?(/\A(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\z/i)
    safe['request_id'] = request_id
  end
  # Build a fresh event; raw GELF fields, messages and nested payloads never reach ES.
  [LogStash::Event.new(safe)]
end

test 'operational logs preserve correlation but exclude payloads and error text' do
  parameters { { 'environment' => 'test' } }
  in_event do
    { 'message' => JSON.generate({ 'event' => 'command.completed', 'service' => 'hosted-orchestrator',
      'role' => 'worker', 'command_type' => 'attempt.init', 'command_id' => '12345678-1234-1234-1234-123456789abc',
      'run_id' => 'private-token', 'status' => 200, 'duration_ms' => 15,
      'error' => 'private-key', 'payload' => { 'canonicalValue' => 'hidden' } }) }
  end
  expect('only safe lifecycle fields') do |events|
    events.length == 1 && events[0].get('command_id') == '12345678-1234-1234-1234-123456789abc' &&
      events[0].get('payload').nil? && events[0].get('error').nil? && events[0].get('run_id').nil?
  end
end

test 'normalize gateway seconds to milliseconds' do
  parameters { { 'environment' => 'test' } }
  in_event do
    { 'message' => JSON.generate({ 'event' => 'http.request', 'service' => 'gateway',
      'method' => 'GET', 'route' => 'health', 'status' => 200, 'duration_seconds' => 0.25 }) }
  end
  expect('correct timing units') { |events| events.length == 1 && events[0].get('duration_ms') == 250 }
end

test 'drop unstructured credential-bearing errors' do
  parameters { { 'environment' => 'test' } }
  in_event { { 'message' => 'Error: session=private-token' } }
  expect('no output') { |events| events.empty? }
end

test 'allow only safe HTTP fields' do
  parameters { { 'environment' => 'test' } }
  in_event do
    { 'message' => JSON.generate({ 'event' => 'http.request', 'service' => 'hosted-sites',
      'method' => 'GET', 'route' => 'app', 'status' => 200, 'duration_ms' => 1,
      'request_id' => 'private-token', 'session' => 'secret', 'taskConfig' => { 'answer' => 'hidden' } }) }
  end
  expect('strip all private fields') do |events|
    events.length == 1 && events[0].get('status') == 200 &&
      events[0].get('message').nil? && events[0].get('session').nil? &&
      events[0].get('taskConfig').nil? && events[0].get('request_id').nil?
  end
end
