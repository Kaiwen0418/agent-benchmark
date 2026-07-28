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
  'hosted-web-suite-v3.0.10',
  $catalog${
  "suiteSlug": "hosted-web-suite-v1",
  "suiteVersion": "v3.0.10",
  "timeLimitMinutesPerTestcase": 10,
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
      "taskVersion": "v2",
      "seedVersion": "notes-lite-v2",
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
          },
          {
            "id": "update-support-followup",
            "goal": "Update the seeded note titled 'Old support follow-up' to title 'Support follow-up', body 'Email Mira after the replacement adapter ships.', and tag 'support'.",
            "taskConfig": {
              "expectedTitle": "Support follow-up",
              "expectedBody": "Email Mira after the replacement adapter ships.",
              "expectedTag": "support",
              "targetNoteId": "note-seed-support"
            }
          },
          {
            "id": "update-release-note",
            "goal": "Update the seeded note titled 'Old release reminder' to title 'Release reminder', body 'Confirm the hosted-web v3.0.1 smoke run before publishing notes.', and tag 'release'.",
            "taskConfig": {
              "expectedTitle": "Release reminder",
              "expectedBody": "Confirm the hosted-web v3.0.1 smoke run before publishing notes.",
              "expectedTag": "release",
              "targetNoteId": "note-seed-release"
            }
          },
          {
            "id": "update-ops-check",
            "goal": "Update the seeded note titled 'Old ops check' to title 'Ops check', body 'Review Redis health metrics after the next hosted suite run.', and tag 'ops'.",
            "taskConfig": {
              "expectedTitle": "Ops check",
              "expectedBody": "Review Redis health metrics after the next hosted suite run.",
              "expectedTag": "ops",
              "targetNoteId": "note-seed-ops"
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
      "taskVersion": "v2",
      "seedVersion": "calendar-lite-v2",
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
          },
          {
            "id": "architecture-review-plus-lead",
            "goal": "Create an event titled 'Architecture review' on July 8, 2026 at 14:30 for 45 minutes with attendees mira@example.com and lead@example.com.",
            "taskConfig": {
              "expectedTitle": "Architecture review",
              "expectedDate": "2026-07-08",
              "expectedStartTime": "14:30",
              "expectedDurationMinutes": 45,
              "expectedAttendeeEmail": "mira@example.com",
              "expectedSecondaryAttendeeEmail": "lead@example.com"
            }
          },
          {
            "id": "release-readiness-plus-pm",
            "goal": "Create an event titled 'Release readiness' on July 10, 2026 at 09:00 for 30 minutes with attendees ops@example.com and pm@example.com.",
            "taskConfig": {
              "expectedTitle": "Release readiness",
              "expectedDate": "2026-07-10",
              "expectedStartTime": "09:00",
              "expectedDurationMinutes": 30,
              "expectedAttendeeEmail": "ops@example.com",
              "expectedSecondaryAttendeeEmail": "pm@example.com"
            }
          },
          {
            "id": "scoring-retro-plus-analyst",
            "goal": "Create an event titled 'Scoring retrospective' on July 14, 2026 at 16:00 for 60 minutes with attendees evals@example.com and analyst@example.com.",
            "taskConfig": {
              "expectedTitle": "Scoring retrospective",
              "expectedDate": "2026-07-14",
              "expectedStartTime": "16:00",
              "expectedDurationMinutes": 60,
              "expectedAttendeeEmail": "evals@example.com",
              "expectedSecondaryAttendeeEmail": "analyst@example.com"
            }
          }
        ]
      }
    }
  ]
}$catalog$::jsonb,
  'ba0f288878e756fd7f19fdfa589b3043a8ea66db734e947ec41bc9804f45b7fb'
);

select public.publish_benchmark_case_catalog(
  $case${
  "id": "bb7e5cd4-f3ed-4aa0-9fcc-46fec39997eb",
  "slug": "hosted-web-hard-suite",
  "title": "Hosted Web Hard Suite",
  "description": "Run the capability-complete deterministic hosted-web hard benchmark suite.",
  "category": "browser",
  "difficulty": "hard",
  "provider": "hosted-web",
  "metadata": {},
  "isPublic": true
}$case$::jsonb,
  'hosted-web-hard-suite-v1.1.0',
  $catalog${
  "suiteSlug": "hosted-web-hard-suite-v1",
  "suiteVersion": "v1.1.0",
  "timeLimitMinutesPerTestcase": 10,
  "sessions": [
    {
      "app": "wiki-lite",
      "taskSlug": "capability-wiki-release-research",
      "title": "Release Evidence Reconciliation",
      "startPath": "/wiki",
      "taskVersion": "v1",
      "seedVersion": "wiki-lite-hard-v2",
      "sequenceIndex": 0,
      "weight": 1,
      "required": true,
      "metadata": {
        "questionVariants": [
          {
            "id": "current-return-window",
            "goal": "A Q2 2026 changelog announces an updated return window. Follow the changelog to the current returns policy, ignore the deprecated 2025 policy, and submit only the current return window duration.",
            "taskConfig": {
              "targetArticleSlug": "returns-policy",
              "secondaryArticleSlug": "changelog-2026-q2",
              "answerContract": {
                "kind": "duration",
                "canonicalValue": "30 days",
                "normalization": "trim-casefold",
                "sourceArticleSlug": "returns-policy"
              }
            }
          },
          {
            "id": "current-warranty-coverage",
            "goal": "Compare the legacy and current warranty policies. Open the legacy page for context, then submit only the current warranty coverage duration from the current Warranty Policy article.",
            "taskConfig": {
              "targetArticleSlug": "warranty-policy",
              "secondaryArticleSlug": "warranty-policy-legacy",
              "answerContract": {
                "kind": "duration",
                "canonicalValue": "24 months",
                "normalization": "trim-casefold",
                "sourceArticleSlug": "warranty-policy"
              }
            }
          },
          {
            "id": "recommended-probook-charger",
            "goal": "The laptop charger buying guide recommends an in-stock charger for the ProBook. Verify compatibility in the charger compatibility matrix, then submit the exact recommended charger name.",
            "taskConfig": {
              "targetArticleSlug": "laptop-charger-guide",
              "secondaryArticleSlug": "charger-compatibility-matrix",
              "answerContract": {
                "kind": "text",
                "canonicalValue": "ProBook 30W Travel Charger",
                "normalization": "trim-casefold",
                "sourceArticleSlug": "laptop-charger-guide"
              }
            }
          },
          {
            "id": "current-api-rate-limit",
            "goal": "Use the API changelog to identify the current API reference version, open that version's article (not a deprecated one), and submit only its current per-token rate limit.",
            "taskConfig": {
              "targetArticleSlug": "api-reference-v3",
              "secondaryArticleSlug": "api-changelog",
              "answerContract": {
                "kind": "text",
                "canonicalValue": "240 requests per minute",
                "normalization": "trim-casefold-punctuation",
                "sourceArticleSlug": "api-reference-v3"
              }
            }
          },
          {
            "id": "current-data-retention",
            "goal": "The security overview references the current data retention policy. Open both, ignore the deprecated 2024 retention note, and submit only the current retention period.",
            "taskConfig": {
              "targetArticleSlug": "data-retention-policy",
              "secondaryArticleSlug": "security-overview",
              "answerContract": {
                "kind": "duration",
                "canonicalValue": "90 days",
                "normalization": "trim-casefold",
                "sourceArticleSlug": "data-retention-policy"
              }
            }
          },
          {
            "id": "verified-api-rate-limit",
            "goal": "Triangulate the current API rate limit: open the API changelog, the current v3 API reference, and the security overview that defines token scope. Ignore deprecated API versions and submit only the current per-token rate limit.",
            "taskConfig": {
              "targetArticleSlug": "api-reference-v3",
              "requiredArticleSlugs": [
                "api-changelog",
                "api-reference-v3",
                "security-overview"
              ],
              "answerContract": {
                "kind": "text",
                "canonicalValue": "240 requests per minute",
                "normalization": "trim-casefold-punctuation",
                "sourceArticleSlug": "api-reference-v3"
              }
            }
          }
        ]
      }
    },
    {
      "app": "wiki-lite",
      "taskSlug": "capability-wiki-policy-research",
      "title": "Policy Evidence Reconciliation",
      "startPath": "/wiki",
      "taskVersion": "v1",
      "seedVersion": "wiki-lite-hard-v2",
      "sequenceIndex": 1,
      "weight": 1,
      "required": true,
      "metadata": {
        "questionVariants": [
          {
            "id": "current-return-window",
            "goal": "A Q2 2026 changelog announces an updated return window. Follow the changelog to the current returns policy, ignore the deprecated 2025 policy, and submit only the current return window duration.",
            "taskConfig": {
              "targetArticleSlug": "returns-policy",
              "secondaryArticleSlug": "changelog-2026-q2",
              "answerContract": {
                "kind": "duration",
                "canonicalValue": "30 days",
                "normalization": "trim-casefold",
                "sourceArticleSlug": "returns-policy"
              }
            }
          },
          {
            "id": "current-warranty-coverage",
            "goal": "Compare the legacy and current warranty policies. Open the legacy page for context, then submit only the current warranty coverage duration from the current Warranty Policy article.",
            "taskConfig": {
              "targetArticleSlug": "warranty-policy",
              "secondaryArticleSlug": "warranty-policy-legacy",
              "answerContract": {
                "kind": "duration",
                "canonicalValue": "24 months",
                "normalization": "trim-casefold",
                "sourceArticleSlug": "warranty-policy"
              }
            }
          },
          {
            "id": "recommended-probook-charger",
            "goal": "The laptop charger buying guide recommends an in-stock charger for the ProBook. Verify compatibility in the charger compatibility matrix, then submit the exact recommended charger name.",
            "taskConfig": {
              "targetArticleSlug": "laptop-charger-guide",
              "secondaryArticleSlug": "charger-compatibility-matrix",
              "answerContract": {
                "kind": "text",
                "canonicalValue": "ProBook 30W Travel Charger",
                "normalization": "trim-casefold",
                "sourceArticleSlug": "laptop-charger-guide"
              }
            }
          },
          {
            "id": "current-api-rate-limit",
            "goal": "Use the API changelog to identify the current API reference version, open that version's article (not a deprecated one), and submit only its current per-token rate limit.",
            "taskConfig": {
              "targetArticleSlug": "api-reference-v3",
              "secondaryArticleSlug": "api-changelog",
              "answerContract": {
                "kind": "text",
                "canonicalValue": "240 requests per minute",
                "normalization": "trim-casefold-punctuation",
                "sourceArticleSlug": "api-reference-v3"
              }
            }
          },
          {
            "id": "current-data-retention",
            "goal": "The security overview references the current data retention policy. Open both, ignore the deprecated 2024 retention note, and submit only the current retention period.",
            "taskConfig": {
              "targetArticleSlug": "data-retention-policy",
              "secondaryArticleSlug": "security-overview",
              "answerContract": {
                "kind": "duration",
                "canonicalValue": "90 days",
                "normalization": "trim-casefold",
                "sourceArticleSlug": "data-retention-policy"
              }
            }
          },
          {
            "id": "verified-api-rate-limit",
            "goal": "Triangulate the current API rate limit: open the API changelog, the current v3 API reference, and the security overview that defines token scope. Ignore deprecated API versions and submit only the current per-token rate limit.",
            "taskConfig": {
              "targetArticleSlug": "api-reference-v3",
              "requiredArticleSlugs": [
                "api-changelog",
                "api-reference-v3",
                "security-overview"
              ],
              "answerContract": {
                "kind": "text",
                "canonicalValue": "240 requests per minute",
                "normalization": "trim-casefold-punctuation",
                "sourceArticleSlug": "api-reference-v3"
              }
            }
          }
        ]
      }
    },
    {
      "app": "sheets-lite",
      "taskSlug": "capability-procurement-analysis",
      "title": "Procurement Analysis",
      "startPath": "/sheets",
      "taskVersion": "v2",
      "seedVersion": "sheets-lite-v2",
      "sequenceIndex": 2,
      "weight": 1,
      "required": true,
      "metadata": {
        "questionVariants": [
          {
            "id": "active-equipment-under-cap",
            "goal": "A previous analyst left a plausible but unverified row in Analysis. Join Orders to Vendors, repair or remove that row as needed, and leave exactly the equipment orders whose vendor status is active and whose landed total is at most 1,000. For each row, copy the vendor name, calculate subtotal = units × unit price, tax = subtotal × tax rate, landed total = subtotal + tax + shipping, set decision to APPROVE, then run validation. If validation reports discrepancies, inspect and repair the analysis before validating again.",
            "taskConfig": {
              "expectedRows": [
                {
                  "orderId": "PO-101",
                  "vendorName": "Northstar Components",
                  "subtotal": 600,
                  "tax": 120,
                  "landedTotal": 745,
                  "decision": "APPROVE"
                },
                {
                  "orderId": "PO-104",
                  "vendorName": "Cedar Supply",
                  "subtotal": 720,
                  "tax": 144,
                  "landedTotal": 894,
                  "decision": "APPROVE"
                }
              ]
            }
          },
          {
            "id": "equipment-exception-audit",
            "goal": "A previous analyst left a plausible but unverified row in Analysis. Join Orders to Vendors, repair or remove that row as needed, and leave exactly the equipment orders that need exception review because the vendor is not active or the landed total exceeds 1,000. For each row, copy the vendor name, calculate subtotal = units × unit price, tax = subtotal × tax rate, landed total = subtotal + tax + shipping, set decision to REVIEW, then run validation. If validation reports discrepancies, inspect and repair the analysis before validating again.",
            "taskConfig": {
              "expectedRows": [
                {
                  "orderId": "PO-102",
                  "vendorName": "Bluebird Industrial",
                  "subtotal": 600,
                  "tax": 120,
                  "landedTotal": 740,
                  "decision": "REVIEW"
                },
                {
                  "orderId": "PO-105",
                  "vendorName": "Delta Systems",
                  "subtotal": 600,
                  "tax": 120,
                  "landedTotal": 735,
                  "decision": "REVIEW"
                },
                {
                  "orderId": "PO-106",
                  "vendorName": "Northstar Components",
                  "subtotal": 1100,
                  "tax": 220,
                  "landedTotal": 1360,
                  "decision": "REVIEW"
                }
              ]
            }
          }
        ]
      }
    },
    {
      "app": "shopping-lite",
      "taskSlug": "capability-constrained-purchase",
      "title": "Constrained Purchase",
      "startPath": "/shopping",
      "taskVersion": "v1",
      "seedVersion": "shopping-lite-hard-v2",
      "sequenceIndex": 3,
      "weight": 1,
      "required": true,
      "metadata": {
        "questionVariants": [
          {
            "id": "out-of-stock-compatible-charger",
            "goal": "Buy exactly one charger that is compatible with the ProBook laptop, with a total at or below $35, using standard shipping. Avoid restricted products. The obvious high-wattage option is out of stock, so choose the compatible charger that is actually in stock.",
            "taskConfig": {
              "targetCategory": "charger",
              "quantity": 1,
              "maxTotal": 35,
              "shippingMethod": "standard",
              "avoidRestricted": true,
              "requiredDevice": "ProBook"
            }
          },
          {
            "id": "coupon-cable-bundle",
            "goal": "Buy exactly three USB-C cables for a team with a total at or below $28, using standard shipping. The order only fits the budget after applying coupon code CABLE20 for 20% off. Avoid restricted products.",
            "taskConfig": {
              "targetCategory": "cable",
              "quantity": 3,
              "maxTotal": 28,
              "shippingMethod": "standard",
              "avoidRestricted": true,
              "couponCode": "CABLE20",
              "discountPercent": 20
            }
          },
          {
            "id": "team-charger-order",
            "goal": "Buy exactly five chargers for a team with a total at or below $120, using standard shipping. Only the in-stock budget charger keeps the order within budget. Avoid restricted products.",
            "taskConfig": {
              "targetCategory": "charger",
              "quantity": 5,
              "maxTotal": 120,
              "shippingMethod": "standard",
              "avoidRestricted": true
            }
          },
          {
            "id": "probook-team-travel-kit",
            "goal": "Equip two ProBook users: buy exactly two ProBook-compatible chargers and two USB-C cables, avoid restricted and out-of-stock products, and use standard shipping. Apply coupon CABLE20 for 20% off. Standard shipping is free when the pre-discount subtotal reaches $70; otherwise it costs $8. Keep the final total at or below $61.",
            "taskConfig": {
              "targetCategory": "charger",
              "quantity": 2,
              "maxTotal": 61,
              "shippingMethod": "standard",
              "avoidRestricted": true,
              "secondaryCategory": "cable",
              "secondaryQuantity": 2,
              "freeShippingThreshold": 70,
              "shippingCost": 8,
              "requiredDevice": "ProBook",
              "couponCode": "CABLE20",
              "discountPercent": 20
            }
          },
          {
            "id": "airlite-field-kit",
            "goal": "Assemble three AirLite field kits: buy exactly three AirLite-compatible chargers and three travel cases, avoid restricted and out-of-stock products, and use standard shipping. Standard shipping is free when the subtotal reaches $120; otherwise it costs $9. Keep the final total at or below $130.",
            "taskConfig": {
              "targetCategory": "charger",
              "quantity": 3,
              "maxTotal": 130,
              "shippingMethod": "standard",
              "avoidRestricted": true,
              "secondaryCategory": "case",
              "secondaryQuantity": 3,
              "freeShippingThreshold": 120,
              "shippingCost": 9,
              "requiredDevice": "AirLite"
            }
          }
        ]
      }
    },
    {
      "app": "inbox-lite",
      "taskSlug": "capability-policy-revision-message",
      "title": "Policy Revision Message",
      "startPath": "/inbox",
      "taskVersion": "v2",
      "seedVersion": "inbox-lite-v2",
      "sequenceIndex": 4,
      "weight": 1,
      "required": true,
      "metadata": {
        "questionVariants": [
          {
            "id": "vendor-policy-revision-carry",
            "goal": "Review the Northwind payment-term exception thread and its attached routing policy. First save one provisional draft using the attached recipient and subject and exactly the answer you submitted in the earlier wiki policy-lookup task as its body. Then recheck the pending amendment until revised routing appears, update that same draft in place, and send it exactly once. Do not include the confidential marker, copy the vendor, create a replacement draft, or modify the unrelated catering thread.",
            "taskConfig": {
              "targetThreadId": "thread-northwind-contract",
              "expectedRecipients": [
                "finance-approvals@acme.test"
              ],
              "expectedSubject": "Approval: Northwind policy revision",
              "forbiddenValues": [
                "CANARY-VENDOR-7Q9"
              ],
              "prohibitedRecipients": [
                "northwind@outside.test"
              ],
              "policyAmendment": {
                "requiredRechecks": 2,
                "pendingMessage": "Legal has not approved the routing amendment yet. Recheck once more.",
                "appliedMessage": "Amended routing approved: update the saved draft to finance-approvals@acme.test with subject 'Approval: Northwind policy revision'.",
                "provisionalRecipients": [
                  "legal-approvals@acme.test"
                ],
                "provisionalSubject": "Approval: Northwind contract exception"
              }
            }
          },
          {
            "id": "incident-policy-revision-carry",
            "goal": "Review the Incident 482 update thread and its attached routing policy. First save one provisional draft using the attached recipient and subject and exactly the answer you submitted in the earlier wiki policy-lookup task as its body. Then recheck the pending amendment until revised routing appears, update that same draft in place, and send it exactly once. Do not include the investigation marker, send anything to press, create a replacement draft, or modify the unrelated catering thread.",
            "taskConfig": {
              "targetThreadId": "thread-incident-update",
              "expectedRecipients": [
                "legal-incident-approvals@acme.test"
              ],
              "expectedSubject": "Approval: Incident 482 policy revision",
              "forbiddenValues": [
                "CANARY-INCIDENT-4X2"
              ],
              "prohibitedRecipients": [
                "press@outside.test"
              ],
              "policyAmendment": {
                "requiredRechecks": 2,
                "pendingMessage": "Security has not approved the routing amendment yet. Recheck once more.",
                "appliedMessage": "Amended routing approved: update the saved draft to legal-incident-approvals@acme.test with subject 'Approval: Incident 482 policy revision'.",
                "provisionalRecipients": [
                  "security-approvals@acme.test"
                ],
                "provisionalSubject": "Approval: Incident 482 status"
              }
            }
          }
        ]
      }
    },
    {
      "app": "notes-lite",
      "taskSlug": "capability-evidence-handoff",
      "title": "Evidence Handoff",
      "startPath": "/notes",
      "taskVersion": "v1",
      "seedVersion": "notes-lite-hard-v3",
      "sequenceIndex": 5,
      "weight": 1,
      "required": true,
      "metadata": {
        "questionVariants": [
          {
            "id": "carry-release-answer",
            "goal": "Open the note you need to file as a follow-up. Set the title to exactly the answer you submitted in the earlier wiki release-lookup task, set the body to exactly the answer you submitted in the later wiki policy-lookup task (no extra words in either field), and set the tag to 'release'.",
            "taskConfig": {
              "expectedTag": "release",
              "targetNoteId": "note-seed-release"
            }
          },
          {
            "id": "carry-release-summary",
            "goal": "Create a summary note. Set the title to exactly the answer you submitted in the earlier wiki release-lookup task, set the body to exactly the answer you submitted in the later wiki policy-lookup task (no extra words in either field), and set the tag to 'summary'.",
            "taskConfig": {
              "expectedTag": "summary"
            }
          },
          {
            "id": "release-rollout-note-set",
            "goal": "Create and organize all three rollout notes: (1) title 'API v3 implementation', body 'Track the implementation branch and conflict resolution.', tag 'implementation'; (2) title 'API v3 verification', body 'Record CI, reviewer, and compatibility evidence.', tag 'verification'; and (3) title 'API v3 release', body 'Schedule publication after verification passes.', tag 'release'. Then create a fourth handoff note whose title is exactly the answer you submitted in the earlier wiki release-lookup task, whose body is exactly the answer you submitted in the later wiki policy-lookup task, and whose tag is 'handoff'.",
            "taskConfig": {
              "expectedTag": "handoff",
              "expectedNotes": [
                {
                  "title": "API v3 implementation",
                  "body": "Track the implementation branch and conflict resolution.",
                  "tag": "implementation"
                },
                {
                  "title": "API v3 verification",
                  "body": "Record CI, reviewer, and compatibility evidence.",
                  "tag": "verification"
                },
                {
                  "title": "API v3 release",
                  "body": "Schedule publication after verification passes.",
                  "tag": "release"
                }
              ]
            }
          }
        ]
      }
    },
    {
      "app": "calendar-lite",
      "taskSlug": "capability-coordinated-schedule",
      "title": "Coordinated Schedule",
      "startPath": "/calendar",
      "taskVersion": "v2",
      "seedVersion": "calendar-lite-campaign-v2",
      "sequenceIndex": 6,
      "weight": 1,
      "required": true,
      "metadata": {
        "questionVariants": [
          {
            "id": "mira-delayed-approval",
            "goal": "Create a tentative 30-minute event on July 22, 2026 with mira@example.com at the earliest currently free time in the 09:00–13:00 window, using exactly the title of the note you completed earlier. Then recheck availability until Mira's actor update appears and reschedule that same event in place to the earliest free time after the update. Do not create a replacement event.",
            "taskConfig": {
              "expectedDate": "2026-07-22",
              "expectedStartTime": "11:00",
              "expectedDurationMinutes": 30,
              "expectedAttendeeEmail": "mira@example.com",
              "seedBusyEvents": [
                {
                  "id": "busy-mira-planning",
                  "title": "Planning",
                  "date": "2026-07-22",
                  "startTime": "09:00",
                  "durationMinutes": 60,
                  "attendeeEmail": "mira@example.com"
                }
              ],
              "schedulingWindowStart": "09:00",
              "schedulingWindowEnd": "13:00",
              "actorUpdate": {
                "requiredRechecks": 2,
                "pendingMessage": "Mira's approval is still pending. Recheck once more.",
                "appliedMessage": "Mira approved and added a customer call to her calendar.",
                "provisionalStartTime": "10:00",
                "busyEvent": {
                  "id": "actor-mira-customer",
                  "title": "Customer call",
                  "date": "2026-07-22",
                  "startTime": "10:00",
                  "durationMinutes": 60,
                  "attendeeEmail": "mira@example.com"
                }
              }
            }
          },
          {
            "id": "shared-room-actor-update",
            "goal": "Create a tentative 45-minute event on July 23, 2026 with mira@example.com and lead@example.com at the earliest currently free time in the 09:00–14:00 window, using exactly the title of the note you completed earlier. Then recheck availability until the shared-room actor update appears and reschedule that same event in place to the earliest free time after the update. Do not create a replacement event.",
            "taskConfig": {
              "expectedDate": "2026-07-23",
              "expectedStartTime": "11:30",
              "expectedDurationMinutes": 45,
              "expectedAttendeeEmail": "mira@example.com",
              "expectedSecondaryAttendeeEmail": "lead@example.com",
              "seedBusyEvents": [
                {
                  "id": "busy-shared-kickoff",
                  "title": "Kickoff",
                  "date": "2026-07-23",
                  "startTime": "09:00",
                  "durationMinutes": 60,
                  "attendeeEmail": "mira@example.com",
                  "secondaryAttendeeEmail": "lead@example.com"
                }
              ],
              "schedulingWindowStart": "09:00",
              "schedulingWindowEnd": "14:00",
              "actorUpdate": {
                "requiredRechecks": 2,
                "pendingMessage": "The room owner has not confirmed the release yet. Recheck once more.",
                "appliedMessage": "The room owner confirmed a maintenance hold for both attendees.",
                "provisionalStartTime": "10:00",
                "busyEvent": {
                  "id": "actor-room-maintenance",
                  "title": "Room maintenance hold",
                  "date": "2026-07-23",
                  "startTime": "10:00",
                  "durationMinutes": 90,
                  "attendeeEmail": "mira@example.com",
                  "secondaryAttendeeEmail": "lead@example.com"
                }
              }
            }
          }
        ]
      }
    }
  ],
  "consistencyChecks": [
    {
      "name": "Release evidence carried into handoff title",
      "sourceTaskSlug": "capability-wiki-release-research",
      "sourcePath": "latestAnswer.answer",
      "targetTaskSlug": "capability-evidence-handoff",
      "targetPath": "notes[].title",
      "rule": "equal-normalized",
      "weight": 1,
      "required": true
    },
    {
      "name": "Policy evidence carried into revision message",
      "sourceTaskSlug": "capability-wiki-policy-research",
      "sourcePath": "latestAnswer.answer",
      "targetTaskSlug": "capability-policy-revision-message",
      "targetPath": "sentMessages[].bodyDigest",
      "rule": "target-digest-matches-source",
      "weight": 1,
      "required": true
    },
    {
      "name": "Policy evidence carried into handoff body",
      "sourceTaskSlug": "capability-wiki-policy-research",
      "sourcePath": "latestAnswer.answer",
      "targetTaskSlug": "capability-evidence-handoff",
      "targetPath": "notes[].bodyDigest",
      "rule": "target-digest-matches-source",
      "weight": 1,
      "required": true
    },
    {
      "name": "Handoff title carried into coordinated schedule",
      "sourceTaskSlug": "capability-evidence-handoff",
      "sourcePath": "notes[].title",
      "targetTaskSlug": "capability-coordinated-schedule",
      "targetPath": "calendarEvents[].title",
      "rule": "equal-normalized",
      "weight": 1,
      "required": true
    }
  ],
  "capabilityMatrix": {
    "schemaVersion": 1,
    "capabilities": [
      {
        "id": "research-evidence",
        "title": "Research and evidence reconciliation",
        "required": true
      },
      {
        "id": "transaction-quantitative",
        "title": "Transaction and quantitative reasoning",
        "required": true
      },
      {
        "id": "communication-privacy",
        "title": "Communication, policy, and privacy",
        "required": true
      },
      {
        "id": "coordination",
        "title": "Scheduling and multi-actor coordination",
        "required": true
      },
      {
        "id": "recovery-self-correction",
        "title": "Recovery and self-correction",
        "required": true
      },
      {
        "id": "long-horizon-planning",
        "title": "Long-horizon campaign planning",
        "required": true
      }
    ],
    "dimensions": [
      {
        "id": "final-state-correctness",
        "weight": 0.6,
        "required": true
      },
      {
        "id": "dependency-consistency",
        "weight": 0.15,
        "required": true
      },
      {
        "id": "evidence-verification",
        "weight": 0.1,
        "required": true
      },
      {
        "id": "recovery-safety",
        "weight": 0.1,
        "required": true
      },
      {
        "id": "interaction-cost",
        "weight": 0.05,
        "required": false
      }
    ],
    "coverage": [
      {
        "taskSlug": "capability-wiki-release-research",
        "variantId": "current-return-window",
        "capabilityIds": [
          "research-evidence",
          "long-horizon-planning"
        ],
        "dimensionIds": [
          "final-state-correctness",
          "interaction-cost",
          "evidence-verification"
        ],
        "interactionBudget": {
          "preferredMaxActions": 12,
          "hardMaxActions": 24
        }
      },
      {
        "taskSlug": "capability-wiki-release-research",
        "variantId": "current-warranty-coverage",
        "capabilityIds": [
          "research-evidence",
          "long-horizon-planning"
        ],
        "dimensionIds": [
          "final-state-correctness",
          "interaction-cost",
          "evidence-verification"
        ],
        "interactionBudget": {
          "preferredMaxActions": 12,
          "hardMaxActions": 24
        }
      },
      {
        "taskSlug": "capability-wiki-release-research",
        "variantId": "recommended-probook-charger",
        "capabilityIds": [
          "research-evidence",
          "long-horizon-planning"
        ],
        "dimensionIds": [
          "final-state-correctness",
          "interaction-cost",
          "evidence-verification"
        ],
        "interactionBudget": {
          "preferredMaxActions": 12,
          "hardMaxActions": 24
        }
      },
      {
        "taskSlug": "capability-wiki-release-research",
        "variantId": "current-api-rate-limit",
        "capabilityIds": [
          "research-evidence",
          "long-horizon-planning"
        ],
        "dimensionIds": [
          "final-state-correctness",
          "interaction-cost",
          "evidence-verification"
        ],
        "interactionBudget": {
          "preferredMaxActions": 12,
          "hardMaxActions": 24
        }
      },
      {
        "taskSlug": "capability-wiki-release-research",
        "variantId": "current-data-retention",
        "capabilityIds": [
          "research-evidence",
          "long-horizon-planning"
        ],
        "dimensionIds": [
          "final-state-correctness",
          "interaction-cost",
          "evidence-verification"
        ],
        "interactionBudget": {
          "preferredMaxActions": 12,
          "hardMaxActions": 24
        }
      },
      {
        "taskSlug": "capability-wiki-release-research",
        "variantId": "verified-api-rate-limit",
        "capabilityIds": [
          "research-evidence",
          "long-horizon-planning"
        ],
        "dimensionIds": [
          "final-state-correctness",
          "interaction-cost",
          "evidence-verification"
        ],
        "interactionBudget": {
          "preferredMaxActions": 12,
          "hardMaxActions": 24
        }
      },
      {
        "taskSlug": "capability-wiki-policy-research",
        "variantId": "current-return-window",
        "capabilityIds": [
          "research-evidence",
          "communication-privacy",
          "long-horizon-planning"
        ],
        "dimensionIds": [
          "final-state-correctness",
          "interaction-cost",
          "evidence-verification"
        ],
        "interactionBudget": {
          "preferredMaxActions": 12,
          "hardMaxActions": 24
        }
      },
      {
        "taskSlug": "capability-wiki-policy-research",
        "variantId": "current-warranty-coverage",
        "capabilityIds": [
          "research-evidence",
          "communication-privacy",
          "long-horizon-planning"
        ],
        "dimensionIds": [
          "final-state-correctness",
          "interaction-cost",
          "evidence-verification"
        ],
        "interactionBudget": {
          "preferredMaxActions": 12,
          "hardMaxActions": 24
        }
      },
      {
        "taskSlug": "capability-wiki-policy-research",
        "variantId": "recommended-probook-charger",
        "capabilityIds": [
          "research-evidence",
          "communication-privacy",
          "long-horizon-planning"
        ],
        "dimensionIds": [
          "final-state-correctness",
          "interaction-cost",
          "evidence-verification"
        ],
        "interactionBudget": {
          "preferredMaxActions": 12,
          "hardMaxActions": 24
        }
      },
      {
        "taskSlug": "capability-wiki-policy-research",
        "variantId": "current-api-rate-limit",
        "capabilityIds": [
          "research-evidence",
          "communication-privacy",
          "long-horizon-planning"
        ],
        "dimensionIds": [
          "final-state-correctness",
          "interaction-cost",
          "evidence-verification"
        ],
        "interactionBudget": {
          "preferredMaxActions": 12,
          "hardMaxActions": 24
        }
      },
      {
        "taskSlug": "capability-wiki-policy-research",
        "variantId": "current-data-retention",
        "capabilityIds": [
          "research-evidence",
          "communication-privacy",
          "long-horizon-planning"
        ],
        "dimensionIds": [
          "final-state-correctness",
          "interaction-cost",
          "evidence-verification"
        ],
        "interactionBudget": {
          "preferredMaxActions": 12,
          "hardMaxActions": 24
        }
      },
      {
        "taskSlug": "capability-wiki-policy-research",
        "variantId": "verified-api-rate-limit",
        "capabilityIds": [
          "research-evidence",
          "communication-privacy",
          "long-horizon-planning"
        ],
        "dimensionIds": [
          "final-state-correctness",
          "interaction-cost",
          "evidence-verification"
        ],
        "interactionBudget": {
          "preferredMaxActions": 12,
          "hardMaxActions": 24
        }
      },
      {
        "taskSlug": "capability-procurement-analysis",
        "variantId": "active-equipment-under-cap",
        "capabilityIds": [
          "transaction-quantitative",
          "recovery-self-correction",
          "long-horizon-planning"
        ],
        "dimensionIds": [
          "final-state-correctness",
          "interaction-cost",
          "evidence-verification",
          "recovery-safety"
        ],
        "interactionBudget": {
          "preferredMaxActions": 18,
          "hardMaxActions": 36
        }
      },
      {
        "taskSlug": "capability-procurement-analysis",
        "variantId": "equipment-exception-audit",
        "capabilityIds": [
          "transaction-quantitative",
          "recovery-self-correction",
          "long-horizon-planning"
        ],
        "dimensionIds": [
          "final-state-correctness",
          "interaction-cost",
          "evidence-verification",
          "recovery-safety"
        ],
        "interactionBudget": {
          "preferredMaxActions": 18,
          "hardMaxActions": 36
        }
      },
      {
        "taskSlug": "capability-constrained-purchase",
        "variantId": "out-of-stock-compatible-charger",
        "capabilityIds": [
          "transaction-quantitative",
          "long-horizon-planning"
        ],
        "dimensionIds": [
          "final-state-correctness",
          "interaction-cost",
          "dependency-consistency"
        ],
        "interactionBudget": {
          "preferredMaxActions": 14,
          "hardMaxActions": 28
        }
      },
      {
        "taskSlug": "capability-constrained-purchase",
        "variantId": "coupon-cable-bundle",
        "capabilityIds": [
          "transaction-quantitative",
          "long-horizon-planning"
        ],
        "dimensionIds": [
          "final-state-correctness",
          "interaction-cost",
          "dependency-consistency"
        ],
        "interactionBudget": {
          "preferredMaxActions": 14,
          "hardMaxActions": 28
        }
      },
      {
        "taskSlug": "capability-constrained-purchase",
        "variantId": "team-charger-order",
        "capabilityIds": [
          "transaction-quantitative",
          "long-horizon-planning"
        ],
        "dimensionIds": [
          "final-state-correctness",
          "interaction-cost",
          "dependency-consistency"
        ],
        "interactionBudget": {
          "preferredMaxActions": 14,
          "hardMaxActions": 28
        }
      },
      {
        "taskSlug": "capability-constrained-purchase",
        "variantId": "probook-team-travel-kit",
        "capabilityIds": [
          "transaction-quantitative",
          "long-horizon-planning"
        ],
        "dimensionIds": [
          "final-state-correctness",
          "interaction-cost",
          "dependency-consistency"
        ],
        "interactionBudget": {
          "preferredMaxActions": 14,
          "hardMaxActions": 28
        }
      },
      {
        "taskSlug": "capability-constrained-purchase",
        "variantId": "airlite-field-kit",
        "capabilityIds": [
          "transaction-quantitative",
          "long-horizon-planning"
        ],
        "dimensionIds": [
          "final-state-correctness",
          "interaction-cost",
          "dependency-consistency"
        ],
        "interactionBudget": {
          "preferredMaxActions": 14,
          "hardMaxActions": 28
        }
      },
      {
        "taskSlug": "capability-policy-revision-message",
        "variantId": "vendor-policy-revision-carry",
        "capabilityIds": [
          "communication-privacy",
          "recovery-self-correction",
          "long-horizon-planning"
        ],
        "dimensionIds": [
          "final-state-correctness",
          "interaction-cost",
          "dependency-consistency",
          "recovery-safety"
        ],
        "interactionBudget": {
          "preferredMaxActions": 12,
          "hardMaxActions": 24
        }
      },
      {
        "taskSlug": "capability-policy-revision-message",
        "variantId": "incident-policy-revision-carry",
        "capabilityIds": [
          "communication-privacy",
          "recovery-self-correction",
          "long-horizon-planning"
        ],
        "dimensionIds": [
          "final-state-correctness",
          "interaction-cost",
          "dependency-consistency",
          "recovery-safety"
        ],
        "interactionBudget": {
          "preferredMaxActions": 12,
          "hardMaxActions": 24
        }
      },
      {
        "taskSlug": "capability-evidence-handoff",
        "variantId": "carry-release-answer",
        "capabilityIds": [
          "communication-privacy",
          "coordination",
          "long-horizon-planning"
        ],
        "dimensionIds": [
          "final-state-correctness",
          "interaction-cost",
          "dependency-consistency"
        ],
        "interactionBudget": {
          "preferredMaxActions": 12,
          "hardMaxActions": 24
        }
      },
      {
        "taskSlug": "capability-evidence-handoff",
        "variantId": "carry-release-summary",
        "capabilityIds": [
          "communication-privacy",
          "coordination",
          "long-horizon-planning"
        ],
        "dimensionIds": [
          "final-state-correctness",
          "interaction-cost",
          "dependency-consistency"
        ],
        "interactionBudget": {
          "preferredMaxActions": 12,
          "hardMaxActions": 24
        }
      },
      {
        "taskSlug": "capability-evidence-handoff",
        "variantId": "release-rollout-note-set",
        "capabilityIds": [
          "communication-privacy",
          "coordination",
          "long-horizon-planning"
        ],
        "dimensionIds": [
          "final-state-correctness",
          "interaction-cost",
          "dependency-consistency"
        ],
        "interactionBudget": {
          "preferredMaxActions": 12,
          "hardMaxActions": 24
        }
      },
      {
        "taskSlug": "capability-coordinated-schedule",
        "variantId": "mira-delayed-approval",
        "capabilityIds": [
          "coordination",
          "recovery-self-correction",
          "long-horizon-planning"
        ],
        "dimensionIds": [
          "final-state-correctness",
          "interaction-cost",
          "dependency-consistency",
          "recovery-safety"
        ],
        "interactionBudget": {
          "preferredMaxActions": 16,
          "hardMaxActions": 32
        }
      },
      {
        "taskSlug": "capability-coordinated-schedule",
        "variantId": "shared-room-actor-update",
        "capabilityIds": [
          "coordination",
          "recovery-self-correction",
          "long-horizon-planning"
        ],
        "dimensionIds": [
          "final-state-correctness",
          "interaction-cost",
          "dependency-consistency",
          "recovery-safety"
        ],
        "interactionBudget": {
          "preferredMaxActions": 16,
          "hardMaxActions": 32
        }
      }
    ]
  },
  "scenarioGraph": {
    "schemaVersion": 1,
    "nodes": [
      {
        "id": "release-evidence",
        "taskSlug": "capability-wiki-release-research",
        "kind": "required",
        "capabilityIds": [
          "research-evidence",
          "long-horizon-planning"
        ],
        "weight": 1
      },
      {
        "id": "policy-evidence",
        "taskSlug": "capability-wiki-policy-research",
        "kind": "required",
        "capabilityIds": [
          "research-evidence",
          "communication-privacy",
          "long-horizon-planning"
        ],
        "weight": 1
      },
      {
        "id": "procurement-analysis",
        "taskSlug": "capability-procurement-analysis",
        "kind": "required",
        "capabilityIds": [
          "transaction-quantitative",
          "recovery-self-correction",
          "long-horizon-planning"
        ],
        "weight": 1
      },
      {
        "id": "constrained-purchase",
        "taskSlug": "capability-constrained-purchase",
        "kind": "required",
        "capabilityIds": [
          "transaction-quantitative",
          "long-horizon-planning"
        ],
        "weight": 1
      },
      {
        "id": "policy-revision-message",
        "taskSlug": "capability-policy-revision-message",
        "kind": "required",
        "capabilityIds": [
          "communication-privacy",
          "recovery-self-correction",
          "long-horizon-planning"
        ],
        "weight": 1
      },
      {
        "id": "evidence-handoff",
        "taskSlug": "capability-evidence-handoff",
        "kind": "required",
        "capabilityIds": [
          "communication-privacy",
          "coordination",
          "long-horizon-planning"
        ],
        "weight": 1
      },
      {
        "id": "coordinated-schedule",
        "taskSlug": "capability-coordinated-schedule",
        "kind": "required",
        "capabilityIds": [
          "coordination",
          "recovery-self-correction",
          "long-horizon-planning"
        ],
        "weight": 1
      },
      {
        "id": "unrelated-inbox-detour",
        "taskSlug": "capability-policy-revision-message",
        "kind": "distractor",
        "capabilityIds": [
          "communication-privacy",
          "long-horizon-planning"
        ],
        "weight": 1,
        "avoidanceEvaluatorName": "optional unrelated thread untouched"
      }
    ],
    "edges": [
      {
        "id": "release-to-handoff",
        "fromNodeId": "release-evidence",
        "toNodeId": "evidence-handoff",
        "relation": "informs",
        "required": true,
        "weight": 1
      },
      {
        "id": "policy-to-handoff",
        "fromNodeId": "policy-evidence",
        "toNodeId": "evidence-handoff",
        "relation": "informs",
        "required": true,
        "weight": 1
      },
      {
        "id": "analysis-to-purchase",
        "fromNodeId": "procurement-analysis",
        "toNodeId": "constrained-purchase",
        "relation": "requires",
        "required": true,
        "weight": 1
      },
      {
        "id": "policy-to-message-revision",
        "fromNodeId": "policy-evidence",
        "toNodeId": "policy-revision-message",
        "relation": "revises",
        "required": true,
        "weight": 1,
        "proofEvaluatorName": "policy revision observed and applied"
      },
      {
        "id": "purchase-to-message",
        "fromNodeId": "constrained-purchase",
        "toNodeId": "policy-revision-message",
        "relation": "requires",
        "required": true,
        "weight": 1
      },
      {
        "id": "handoff-to-schedule",
        "fromNodeId": "evidence-handoff",
        "toNodeId": "coordinated-schedule",
        "relation": "informs",
        "required": true,
        "weight": 1
      }
    ],
    "faultSchedule": [
      {
        "id": "stale-procurement-view",
        "nodeId": "procurement-analysis",
        "kind": "stale-view",
        "trigger": {
          "action": "read",
          "occurrence": 2
        },
        "maxApplications": 1,
        "requiredRecovery": true,
        "weight": 1
      },
      {
        "id": "rejected-policy-message",
        "nodeId": "policy-revision-message",
        "kind": "rejected-mutation",
        "trigger": {
          "action": "mutation",
          "occurrence": 1
        },
        "maxApplications": 1,
        "requiredRecovery": true,
        "weight": 1
      },
      {
        "id": "interrupted-calendar-navigation",
        "nodeId": "coordinated-schedule",
        "kind": "interrupted-navigation",
        "trigger": {
          "action": "navigation",
          "occurrence": 2
        },
        "maxApplications": 1,
        "requiredRecovery": true,
        "weight": 1
      }
    ]
  }
}$catalog$::jsonb,
  '3b9ac858657f78fbc53cadf82dfc40b2756dfdc316766fa411301608266c9a8e'
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
