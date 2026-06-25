-- Generated from packages/test-cases. Run `pnpm catalog:generate`; do not edit by hand.
select public.publish_benchmark_case_catalog(
  $case${
  "id": "7e8a6df3-17c3-4ddb-9877-d0bd8a0f0005",
  "slug": "hosted-web-suite",
  "title": "Hosted Web Suite",
  "description": "Run the published deterministic hosted-web benchmark suite.",
  "category": "browser",
  "difficulty": "easy",
  "provider": "hosted-web",
  "metadata": {},
  "isPublic": true
}$case$::jsonb,
  'hosted-web-suite-v3.0.6',
  $catalog${
  "suiteSlug": "hosted-web-suite-v1",
  "suiteVersion": "v3.0.6",
  "sessions": [
    {
      "app": "shopping-lite",
      "taskSlug": "shopping-constrained-checkout",
      "title": "Shopping Checkout",
      "taskVersion": "v2",
      "seedVersion": "shopping-lite-v2",
      "sequenceIndex": 0,
      "weight": 1,
      "required": true,
      "metadata": {
        "questionVariants": [
          {
            "id": "budget-charger-standard",
            "goal": "Buy exactly one charger with a total price at or below $30, use standard shipping, and avoid restricted products.",
            "taskConfig": {
              "targetCategory": "charger",
              "quantity": 1,
              "maxTotal": 30,
              "shippingMethod": "standard",
              "avoidRestricted": true
            }
          },
          {
            "id": "cable-express",
            "goal": "Buy exactly one USB-C cable with a total price at or below $10, use express shipping, and avoid restricted products.",
            "taskConfig": {
              "targetCategory": "cable",
              "quantity": 1,
              "maxTotal": 10,
              "shippingMethod": "express",
              "avoidRestricted": true
            }
          },
          {
            "id": "travel-case-standard",
            "goal": "Buy exactly one travel case with a total price at or below $15, use standard shipping, and avoid restricted products.",
            "taskConfig": {
              "targetCategory": "case",
              "quantity": 1,
              "maxTotal": 15,
              "shippingMethod": "standard",
              "avoidRestricted": true
            }
          },
          {
            "id": "combo-charger-cable",
            "goal": "Buy one charger and one USB-C cable with a total price at or below $35, use standard shipping, and avoid restricted products.",
            "taskConfig": {
              "targetCategory": "charger",
              "quantity": 1,
              "maxTotal": 35,
              "shippingMethod": "standard",
              "avoidRestricted": true,
              "secondaryCategory": "cable",
              "secondaryQuantity": 1
            }
          },
          {
            "id": "travel-kit-free-shipping",
            "goal": "Buy one charger and one travel case with a total price at or below $40. Standard shipping is free for orders $35 and over; otherwise standard shipping costs $5. Avoid restricted products.",
            "taskConfig": {
              "targetCategory": "charger",
              "quantity": 1,
              "maxTotal": 40,
              "shippingMethod": "standard",
              "avoidRestricted": true,
              "secondaryCategory": "case",
              "secondaryQuantity": 1,
              "freeShippingThreshold": 35,
              "shippingCost": 5
            }
          },
          {
            "id": "cable-budget-shipping",
            "goal": "Buy one USB-C cable and one travel case with a total price at or below $25. Standard shipping is free for orders $20 and over; otherwise standard shipping costs $4. Avoid restricted products.",
            "taskConfig": {
              "targetCategory": "cable",
              "quantity": 1,
              "maxTotal": 25,
              "shippingMethod": "standard",
              "avoidRestricted": true,
              "secondaryCategory": "case",
              "secondaryQuantity": 1,
              "freeShippingThreshold": 20,
              "shippingCost": 4
            }
          }
        ]
      }
    },
    {
      "app": "forum-lite",
      "taskSlug": "forum-battery-moderation",
      "title": "Forum Moderation",
      "startPath": "/forum",
      "taskVersion": "v2",
      "seedVersion": "forum-lite-v2",
      "sequenceIndex": 1,
      "weight": 1,
      "required": true,
      "metadata": {
        "questionVariants": [
          {
            "id": "battery-recall",
            "goal": "Find the battery swelling thread, reply with the official recall link from the support post, then lock it with reason 'safety escalation'.",
            "taskConfig": {
              "targetThreadId": "thr-battery",
              "expectedReplyValue": "https://support.example.com/recall/battery-2026",
              "expectedLockReason": "safety escalation"
            }
          },
          {
            "id": "wifi-reset",
            "goal": "Find the 5GHz connectivity thread, reply with the official reset-guide link from support, then lock it with reason 'resolved with guide'.",
            "taskConfig": {
              "targetThreadId": "thr-wifi",
              "expectedReplyValue": "https://support.example.com/network/5ghz-reset",
              "expectedLockReason": "resolved with guide"
            }
          },
          {
            "id": "screen-advisory",
            "goal": "Find the low-brightness flickering thread, reply with the display calibration advisory link, then lock it with reason 'known display issue'.",
            "taskConfig": {
              "targetThreadId": "thr-screen",
              "expectedReplyValue": "https://support.example.com/display/flicker-calibration",
              "expectedLockReason": "known display issue"
            }
          },
          {
            "id": "battery-recall-pin",
            "goal": "Find the battery swelling thread, reply with the official recall link from the support post, lock it with reason 'safety escalation', then pin it.",
            "taskConfig": {
              "targetThreadId": "thr-battery",
              "expectedReplyValue": "https://support.example.com/recall/battery-2026",
              "expectedLockReason": "safety escalation",
              "requiresPin": true
            }
          },
          {
            "id": "wifi-reset-report",
            "goal": "Find the 5GHz connectivity thread, submit a moderation report with reason 'needs escalation', then reply with the reset-guide link and lock it with reason 'resolved with guide'.",
            "taskConfig": {
              "targetThreadId": "thr-wifi",
              "expectedReplyValue": "https://support.example.com/network/5ghz-reset",
              "expectedLockReason": "resolved with guide",
              "requiresReport": true,
              "expectedReportReason": "needs escalation"
            }
          },
          {
            "id": "screen-advisory-both",
            "goal": "Find the low-brightness flickering thread, submit a report with reason 'duplicate issue', reply with the display calibration advisory link, lock it with reason 'known display issue', then pin it.",
            "taskConfig": {
              "targetThreadId": "thr-screen",
              "expectedReplyValue": "https://support.example.com/display/flicker-calibration",
              "expectedLockReason": "known display issue",
              "requiresPin": true,
              "requiresReport": true,
              "expectedReportReason": "duplicate issue"
            }
          }
        ]
      }
    },
    {
      "app": "repo-lite",
      "taskSlug": "repo-readme-fix",
      "title": "Repository README Fix",
      "startPath": "/repo",
      "taskVersion": "v2",
      "seedVersion": "repo-lite-v2",
      "sequenceIndex": 2,
      "weight": 1,
      "required": true,
      "metadata": {
        "questionVariants": [
          {
            "id": "pnpm-install",
            "goal": "Replace the README install command with `pnpm install`, remove `npm install`, then open a merge request titled `Fix install instructions` targeting `main`.",
            "taskConfig": {
              "filePath": "README.md",
              "expectedText": "pnpm install",
              "forbiddenText": "npm install",
              "expectedMrTitle": "Fix install instructions",
              "expectedTargetBranch": "main"
            }
          },
          {
            "id": "yarn-install",
            "goal": "Replace the README install command with `yarn install`, remove `npm install`, then open a merge request titled `Document Yarn setup` targeting `main`.",
            "taskConfig": {
              "filePath": "README.md",
              "expectedText": "yarn install",
              "forbiddenText": "npm install",
              "expectedMrTitle": "Document Yarn setup",
              "expectedTargetBranch": "main"
            }
          },
          {
            "id": "bun-install",
            "goal": "Replace the README install command with `bun install`, remove `npm install`, then open a merge request titled `Add Bun setup` targeting `develop`.",
            "taskConfig": {
              "filePath": "README.md",
              "expectedText": "bun install",
              "forbiddenText": "npm install",
              "expectedMrTitle": "Add Bun setup",
              "expectedTargetBranch": "develop"
            }
          },
          {
            "id": "pnpm-install-and-version",
            "goal": "Replace the README install command with `pnpm install`, bump `package.json` version from `1.0.0` to `1.0.1`, then open a merge request titled `Fix install and bump version` targeting `main`.",
            "taskConfig": {
              "filePath": "README.md",
              "expectedText": "pnpm install",
              "forbiddenText": "npm install",
              "expectedMrTitle": "Fix install and bump version",
              "expectedTargetBranch": "main",
              "secondaryFilePath": "package.json",
              "secondaryExpectedText": "1.0.1",
              "secondaryForbiddenText": "1.0.0"
            }
          },
          {
            "id": "yarn-install-and-rename",
            "goal": "Replace the README install command with `yarn install`, rename the project in `package.json` from `demo-project` to `demo-yarn-project`, then open a merge request titled `Update README and rename project` targeting `main`.",
            "taskConfig": {
              "filePath": "README.md",
              "expectedText": "yarn install",
              "forbiddenText": "npm install",
              "expectedMrTitle": "Update README and rename project",
              "expectedTargetBranch": "main",
              "secondaryFilePath": "package.json",
              "secondaryExpectedText": "demo-yarn-project",
              "secondaryForbiddenText": "demo-project"
            }
          },
          {
            "id": "bun-install-and-script",
            "goal": "Replace the README install command with `bun install`, add a `test` script to `package.json`, then open a merge request titled `Add Bun and test script` targeting `develop`.",
            "taskConfig": {
              "filePath": "README.md",
              "expectedText": "bun install",
              "forbiddenText": "npm install",
              "expectedMrTitle": "Add Bun and test script",
              "expectedTargetBranch": "develop",
              "secondaryFilePath": "package.json",
              "secondaryExpectedText": "test"
            }
          }
        ]
      }
    },
    {
      "app": "wiki-lite",
      "taskSlug": "wiki-release-answer",
      "title": "Wiki Release Lookup",
      "startPath": "/wiki",
      "taskVersion": "v3",
      "seedVersion": "wiki-lite-v4",
      "sequenceIndex": 3,
      "weight": 1,
      "required": true,
      "metadata": {
        "questionVariants": [
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
          },
          {
            "id": "release-to-charger-price",
            "goal": "The release history article references the USB-C Charger FAQ for recommended accessories. Open both articles and submit the exact price of the recommended budget charger.",
            "taskConfig": {
              "targetArticleSlug": "usb-c-charger-faq",
              "secondaryArticleSlug": "agentbench-release-history",
              "answerContract": {
                "kind": "currency",
                "canonicalValue": "$24.99",
                "normalization": "trim",
                "sourceArticleSlug": "usb-c-charger-faq"
              }
            }
          },
          {
            "id": "dispatch-with-adapters",
            "goal": "The power adapter safety article references the shipping policy for dispatch timing. Open both articles and submit the standard shipping dispatch window.",
            "taskConfig": {
              "targetArticleSlug": "shipping-policy",
              "secondaryArticleSlug": "power-adapters",
              "answerContract": {
                "kind": "duration",
                "canonicalValue": "two business days",
                "normalization": "trim-casefold",
                "sourceArticleSlug": "shipping-policy"
              }
            }
          }
        ]
      }
    },
    {
      "app": "wiki-lite",
      "taskSlug": "wiki-policy-answer",
      "title": "Wiki Policy Lookup",
      "startPath": "/wiki",
      "taskVersion": "v2",
      "seedVersion": "wiki-lite-v4",
      "sequenceIndex": 4,
      "weight": 1,
      "required": true,
      "metadata": {
        "questionVariants": [
          {
            "id": "adapter-restriction",
            "goal": "Use the hosted wiki to find who restricted lab power adapters are reserved for, then submit only the group name.",
            "taskConfig": {
              "targetArticleSlug": "power-adapters",
              "answerContract": {
                "kind": "text",
                "canonicalValue": "internal certification teams",
                "normalization": "trim-casefold-punctuation",
                "sourceArticleSlug": "power-adapters"
              }
            }
          },
          {
            "id": "standard-dispatch",
            "goal": "Use the hosted wiki to find the standard shipping dispatch window, then submit only the duration.",
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
            "id": "express-cutoff",
            "goal": "Use the hosted wiki to find the express order same-day shipping cutoff time, then submit only the time.",
            "taskConfig": {
              "targetArticleSlug": "shipping-policy",
              "answerContract": {
                "kind": "text",
                "canonicalValue": "3pm",
                "normalization": "trim-casefold-punctuation",
                "sourceArticleSlug": "shipping-policy"
              }
            }
          },
          {
            "id": "adapter-to-shipping",
            "goal": "The shipping policy references the power adapter safety article for restricted equipment rules. Open both articles and submit who restricted lab power adapters are reserved for.",
            "taskConfig": {
              "targetArticleSlug": "power-adapters",
              "secondaryArticleSlug": "shipping-policy",
              "answerContract": {
                "kind": "text",
                "canonicalValue": "internal certification teams",
                "normalization": "trim-casefold-punctuation",
                "sourceArticleSlug": "power-adapters"
              }
            }
          },
          {
            "id": "express-to-history",
            "goal": "The release history article references the shipping policy for delivery details. Open both articles and submit the express order same-day shipping cutoff time.",
            "taskConfig": {
              "targetArticleSlug": "shipping-policy",
              "secondaryArticleSlug": "agentbench-release-history",
              "answerContract": {
                "kind": "text",
                "canonicalValue": "3pm",
                "normalization": "trim-casefold-punctuation",
                "sourceArticleSlug": "shipping-policy"
              }
            }
          }
        ]
      }
    },
    {
      "app": "notes-lite",
      "taskSlug": "notes-followup-create",
      "title": "Notes Follow-up",
      "startPath": "/notes",
      "taskVersion": "v1",
      "seedVersion": "notes-lite-v1",
      "sequenceIndex": 5,
      "weight": 1,
      "required": true,
      "metadata": {
        "questionVariants": [
          {
            "id": "support-followup",
            "goal": "Create a follow-up note titled 'Support follow-up' with body 'Email Mira after the replacement adapter ships.' and tag 'support'.",
            "taskConfig": {
              "expectedTitle": "Support follow-up",
              "expectedBody": "Email Mira after the replacement adapter ships.",
              "expectedTag": "support"
            }
          },
          {
            "id": "release-note",
            "goal": "Create a follow-up note titled 'Release reminder' with body 'Confirm the hosted-web v3.0.1 smoke run before publishing notes.' and tag 'release'.",
            "taskConfig": {
              "expectedTitle": "Release reminder",
              "expectedBody": "Confirm the hosted-web v3.0.1 smoke run before publishing notes.",
              "expectedTag": "release"
            }
          },
          {
            "id": "ops-check",
            "goal": "Create a follow-up note titled 'Ops check' with body 'Review Redis health metrics after the next hosted suite run.' and tag 'ops'.",
            "taskConfig": {
              "expectedTitle": "Ops check",
              "expectedBody": "Review Redis health metrics after the next hosted suite run.",
              "expectedTag": "ops"
            }
          }
        ]
      }
    },
    {
      "app": "calendar-lite",
      "taskSlug": "calendar-event-create",
      "title": "Calendar Event",
      "startPath": "/calendar",
      "taskVersion": "v1",
      "seedVersion": "calendar-lite-v1",
      "sequenceIndex": 6,
      "weight": 1,
      "required": true,
      "metadata": {
        "questionVariants": [
          {
            "id": "architecture-review",
            "goal": "Create an event titled 'Architecture review' on July 8, 2026 at 14:30 for 45 minutes with attendee mira@example.com.",
            "taskConfig": {
              "expectedTitle": "Architecture review",
              "expectedDate": "2026-07-08",
              "expectedStartTime": "14:30",
              "expectedDurationMinutes": 45,
              "expectedAttendeeEmail": "mira@example.com"
            }
          },
          {
            "id": "release-readiness",
            "goal": "Create an event titled 'Release readiness' on July 10, 2026 at 09:00 for 30 minutes with attendee ops@example.com.",
            "taskConfig": {
              "expectedTitle": "Release readiness",
              "expectedDate": "2026-07-10",
              "expectedStartTime": "09:00",
              "expectedDurationMinutes": 30,
              "expectedAttendeeEmail": "ops@example.com"
            }
          },
          {
            "id": "scoring-retro",
            "goal": "Create an event titled 'Scoring retrospective' on July 14, 2026 at 16:00 for 60 minutes with attendee evals@example.com.",
            "taskConfig": {
              "expectedTitle": "Scoring retrospective",
              "expectedDate": "2026-07-14",
              "expectedStartTime": "16:00",
              "expectedDurationMinutes": 60,
              "expectedAttendeeEmail": "evals@example.com"
            }
          }
        ]
      }
    }
  ]
}$catalog$::jsonb,
  'e6e705b644b3a6fd1c4533dd32512fd6c61d410c575e47da04f26b0702454d21'
);

insert into public.runners (id, name, status, capacity, current_load, last_heartbeat)
values (
  '7e8a6df3-17c3-4ddb-9877-d0bd8a0f1001',
  'mock-runner-eu-1',
  'online',
  2,
  0,
  now()
)
on conflict (id) do update
set
  name = excluded.name,
  status = excluded.status,
  capacity = excluded.capacity,
  current_load = excluded.current_load,
  last_heartbeat = excluded.last_heartbeat;
