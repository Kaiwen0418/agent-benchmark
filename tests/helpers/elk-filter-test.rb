# Exercise the actual filter and its embedded Logstash test cases without a JVM.
require 'json'
module LogStash
  class Event
    def initialize(data)
      @data = { '@timestamp' => '2026-01-01T00:00:00Z', '@version' => '1' }.merge(data)
    end
    def get(key)
      @data[key]
    end
    def to_hash
      @data
    end
  end
end

def parameters(&block)
  register(block.call)
end
def in_event(&block)
  @events = filter(LogStash::Event.new(block.call))
end
def expect(name, &block)
  raise name unless block.call(@events)
end
def test(name, &block)
  block.call
  puts "Passed: #{name}"
end

load File.expand_path('../../infra/elk/safe-event.rb', __dir__)
register({ 'environment' => 'test' })
baseline = { 'event' => 'http.request', 'service' => 'hosted-sites', 'method' => 'GET',
  'route' => 'app', 'status' => 200, 'duration_ms' => 12 }
[nil, [], 'secret', baseline.merge('status' => 999), baseline.merge('route' => '/?session=secret'),
  baseline.merge('duration_ms' => -1), baseline.merge('method' => 'secret'),
  baseline.merge('service' => 'secret')].each do |input|
  raise 'Accepted invalid input' unless filter(LogStash::Event.new({ 'message' => JSON.generate(input) })).empty?
end
raise 'Accepted oversized input' unless filter(LogStash::Event.new({ 'message' => 'x' * 4097 })).empty?
puts 'Malformed and oversized records rejected.'
