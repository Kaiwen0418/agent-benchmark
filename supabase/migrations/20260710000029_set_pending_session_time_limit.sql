-- Preserve the deadline already shown to an active agent, but ensure every
-- session that has not started yet uses the new ten-minute contract.
update public.hosted_web_sessions
set metadata = jsonb_set(
  coalesce(metadata, '{}'::jsonb),
  '{timeLimitMinutesPerTestcase}',
  '10'::jsonb,
  true
)
where status = 'created'
  and coalesce(metadata ->> 'timeLimitMinutesPerTestcase', '') is distinct from '10';
