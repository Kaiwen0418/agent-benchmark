update public.benchmark_cases
set metadata = jsonb_set(
  metadata,
  '{sessions}',
  (
    select jsonb_agg(
      case session->>'app'
        when 'shopping-lite' then session || jsonb_build_object(
          'metadata', coalesce(session->'metadata', '{}'::jsonb) || jsonb_build_object(
            'questionVariants', '[
              {
                "id": "budget-charger-standard",
                "goal": "Buy exactly one charger with a total price at or below $30, use standard shipping, and avoid restricted products.",
                "taskConfig": {"targetCategory": "charger", "quantity": 1, "maxTotal": 30, "shippingMethod": "standard", "avoidRestricted": true}
              },
              {
                "id": "cable-express",
                "goal": "Buy exactly one USB-C cable with a total price at or below $10, use express shipping, and avoid restricted products.",
                "taskConfig": {"targetCategory": "cable", "quantity": 1, "maxTotal": 10, "shippingMethod": "express", "avoidRestricted": true}
              },
              {
                "id": "travel-case-standard",
                "goal": "Buy exactly one travel case with a total price at or below $15, use standard shipping, and avoid restricted products.",
                "taskConfig": {"targetCategory": "case", "quantity": 1, "maxTotal": 15, "shippingMethod": "standard", "avoidRestricted": true}
              }
            ]'::jsonb
          )
        )
        when 'forum-lite' then session || jsonb_build_object(
          'metadata', coalesce(session->'metadata', '{}'::jsonb) || jsonb_build_object(
            'questionVariants', '[
              {
                "id": "battery-recall",
                "goal": "Find the battery swelling thread, reply with the official recall link from the support post, then lock it with reason ''safety escalation''.",
                "taskConfig": {"targetThreadId": "thr-battery", "expectedReplyValue": "https://support.example.com/recall/battery-2026", "expectedLockReason": "safety escalation"}
              },
              {
                "id": "wifi-reset",
                "goal": "Find the 5GHz connectivity thread, reply with the official reset-guide link from support, then lock it with reason ''resolved with guide''.",
                "taskConfig": {"targetThreadId": "thr-wifi", "expectedReplyValue": "https://support.example.com/network/5ghz-reset", "expectedLockReason": "resolved with guide"}
              },
              {
                "id": "screen-advisory",
                "goal": "Find the low-brightness flickering thread, reply with the display calibration advisory link, then lock it with reason ''known display issue''.",
                "taskConfig": {"targetThreadId": "thr-screen", "expectedReplyValue": "https://support.example.com/display/flicker-calibration", "expectedLockReason": "known display issue"}
              }
            ]'::jsonb
          )
        )
        when 'repo-lite' then session || jsonb_build_object(
          'metadata', coalesce(session->'metadata', '{}'::jsonb) || jsonb_build_object(
            'questionVariants', '[
              {
                "id": "pnpm-install",
                "goal": "Replace the README install command with `pnpm install`, remove `npm install`, then open a merge request titled `Fix install instructions` targeting `main`.",
                "taskConfig": {"filePath": "README.md", "expectedText": "pnpm install", "forbiddenText": "npm install", "expectedMrTitle": "Fix install instructions", "expectedTargetBranch": "main"}
              },
              {
                "id": "yarn-install",
                "goal": "Replace the README install command with `yarn install`, remove `npm install`, then open a merge request titled `Document Yarn setup` targeting `main`.",
                "taskConfig": {"filePath": "README.md", "expectedText": "yarn install", "forbiddenText": "npm install", "expectedMrTitle": "Document Yarn setup", "expectedTargetBranch": "main"}
              },
              {
                "id": "bun-install",
                "goal": "Replace the README install command with `bun install`, remove `npm install`, then open a merge request titled `Add Bun setup` targeting `develop`.",
                "taskConfig": {"filePath": "README.md", "expectedText": "bun install", "forbiddenText": "npm install", "expectedMrTitle": "Add Bun setup", "expectedTargetBranch": "develop"}
              }
            ]'::jsonb
          )
        )
        when 'wiki-lite' then session || jsonb_build_object(
          'metadata', coalesce(session->'metadata', '{}'::jsonb) || jsonb_build_object(
            'questionVariants', '[
              {
                "id": "release-date",
                "goal": "Use the hosted wiki to find when wiki-lite followed the hosted-web suite alpha, then submit the exact date.",
                "taskConfig": {"targetArticleSlug": "agentbench-release-history", "expectedAnswer": "June 1, 2026"}
              },
              {
                "id": "dispatch-window",
                "goal": "Use the hosted wiki to find how quickly standard shipping orders are dispatched, then submit the exact duration phrase.",
                "taskConfig": {"targetArticleSlug": "shipping-policy", "expectedAnswer": "two business days"}
              },
              {
                "id": "charger-price",
                "goal": "Use the hosted wiki to find the listed price of the recommended budget USB-C charger, then submit the exact price.",
                "taskConfig": {"targetArticleSlug": "usb-c-charger-faq", "expectedAnswer": "$24.99"}
              }
            ]'::jsonb
          )
        )
        else session
      end
      order by (session->>'sequenceIndex')::integer
    )
    from jsonb_array_elements(metadata->'sessions') as session
  )
)
where id = '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0005';
