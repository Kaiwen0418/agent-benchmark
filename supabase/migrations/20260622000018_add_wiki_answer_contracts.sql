update public.benchmark_cases
set metadata = jsonb_set(
  jsonb_set(metadata, '{suiteVersion}', '"v2"'::jsonb),
  '{sessions}',
  (
    select jsonb_agg(
      case
        when session->>'app' = 'wiki-lite' then
          session || jsonb_build_object(
            'taskVersion', 'v2',
            'seedVersion', 'wiki-lite-v2',
            'metadata', coalesce(session->'metadata', '{}'::jsonb) || jsonb_build_object(
              'questionVariants', '[
                {
                  "id": "release-date",
                  "goal": "Use the hosted wiki to find when wiki-lite followed the hosted-web suite alpha, then submit only the date.",
                  "taskConfig": {
                    "targetArticleSlug": "agentbench-release-history",
                    "answerContract": {
                      "kind": "date",
                      "canonicalValue": "June 1, 2026",
                      "normalization": "trim-casefold-punctuation",
                      "sourceArticleSlug": "agentbench-release-history"
                    }
                  }
                },
                {
                  "id": "dispatch-window",
                  "goal": "Use the hosted wiki to find how quickly standard shipping orders are dispatched, then submit only the duration without surrounding words.",
                  "taskConfig": {
                    "targetArticleSlug": "shipping-policy",
                    "answerContract": {
                      "kind": "duration",
                      "canonicalValue": "two business days",
                      "normalization": "trim-casefold",
                      "sourceArticleSlug": "shipping-policy"
                    }
                  }
                },
                {
                  "id": "charger-price",
                  "goal": "Use the hosted wiki to find the listed price of the recommended budget USB-C charger, then submit only the exact price.",
                  "taskConfig": {
                    "targetArticleSlug": "usb-c-charger-faq",
                    "answerContract": {
                      "kind": "currency",
                      "canonicalValue": "$24.99",
                      "normalization": "trim",
                      "sourceArticleSlug": "usb-c-charger-faq"
                    }
                  }
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
