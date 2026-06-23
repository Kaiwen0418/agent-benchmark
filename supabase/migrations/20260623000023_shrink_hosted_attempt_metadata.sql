update public.benchmark_attempts
set metadata = metadata - 'sessions'
where provider = 'hosted-web'
  and metadata ? 'sessions';
