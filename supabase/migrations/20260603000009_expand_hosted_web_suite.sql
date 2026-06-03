update public.benchmark_cases
set
  description = 'Run a four-step hosted suite across shopping-lite, forum-lite, repo-lite, and wiki-lite.',
  metadata = '{
    "suiteSlug": "hosted-web-suite-v1",
    "suiteVersion": "v1",
    "sessions": [
      {
        "app": "shopping-lite",
        "taskSlug": "shopping-constrained-checkout",
        "title": "Shopping Checkout",
        "goal": "Buy exactly one USB-C charger at or below $30 with standard shipping, and avoid restricted products.",
        "taskVersion": "v1",
        "seedVersion": "shopping-lite-v1",
        "sequenceIndex": 0,
        "weight": 1,
        "required": true
      },
      {
        "app": "forum-lite",
        "taskSlug": "forum-battery-moderation",
        "title": "Forum Moderation",
        "goal": "Find the thread about battery swelling, reply with the official recall link from the policy post, then lock the thread with reason ''safety escalation''.",
        "startPath": "/forum",
        "taskVersion": "v1",
        "seedVersion": "forum-lite-v1",
        "sequenceIndex": 1,
        "weight": 1,
        "required": true
      },
      {
        "app": "repo-lite",
        "taskSlug": "repo-readme-fix",
        "title": "Repository README Fix",
        "goal": "Fix the README install command to use pnpm, then open a merge request titled \"Fix install instructions\" targeting main.",
        "startPath": "/repo",
        "taskVersion": "v1",
        "seedVersion": "repo-lite-v1",
        "sequenceIndex": 2,
        "weight": 1,
        "required": true
      },
      {
        "app": "wiki-lite",
        "taskSlug": "wiki-release-answer",
        "title": "Wiki Release Lookup",
        "goal": "Use the hosted wiki to find when wiki-lite followed the hosted-web suite alpha, then submit the date exactly as written.",
        "startPath": "/wiki",
        "taskVersion": "v1",
        "seedVersion": "wiki-lite-v1",
        "sequenceIndex": 3,
        "weight": 1,
        "required": true
      }
    ]
  }'::jsonb
where id = '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0005';
