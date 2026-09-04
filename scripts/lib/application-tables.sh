#!/usr/bin/env bash

# Durable application tables copied during a full PostgreSQL migration.
APPLICATION_TABLES=(
  auth_users
  auth_accounts
  auth_sessions
  auth_verification_tokens
  profiles
  benchmark_cases
  benchmark_case_revisions
  model_catalog
  model_catalog_sync_runs
  benchmark_runs
  run_events
  artifacts
  benchmark_attempts
  hosted_web_sessions
  hosted_web_results
  benchmark_attempt_scores
  hosted_web_events
  hosted_web_access_logs
  hosted_callback_outbox
  orchestrator_command_dead_letters
)
