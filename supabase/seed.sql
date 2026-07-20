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
  "description": "Run the published deterministic hosted-web hard benchmark suite.",
  "category": "browser",
  "difficulty": "hard",
  "provider": "hosted-web",
  "metadata": {},
  "isPublic": true
}$case$::jsonb,
  'hosted-web-hard-suite-v1.0.5',
  $catalog${
  "suiteSlug": "hosted-web-hard-suite-v1",
  "suiteVersion": "v1.0.5",
  "timeLimitMinutesPerTestcase": 10,
  "sessions": [
    {
      "app": "shopping-lite",
      "taskSlug": "shopping-constrained-checkout-hard",
      "title": "Shopping Checkout (Hard)",
      "startPath": "/shopping",
      "taskVersion": "v3",
      "seedVersion": "shopping-lite-hard-v2",
      "sequenceIndex": 0,
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
      "app": "forum-lite",
      "taskSlug": "forum-battery-moderation-hard",
      "title": "Forum Moderation (Hard)",
      "startPath": "/forum",
      "taskVersion": "v3",
      "seedVersion": "forum-lite-hard-v2",
      "sequenceIndex": 1,
      "weight": 1,
      "required": true,
      "metadata": {
        "questionVariants": [
          {
            "id": "charge-duplicate-triage",
            "goal": "Three threads report the same USB-C charging regression. Identify the canonical thread that carries the official fix link, reply there with that link, mark the two duplicate threads ('thr-charge-dup1' and 'thr-charge-dup2') as duplicates of the canonical thread, then lock the canonical thread with reason 'resolved with guide'.",
            "taskConfig": {
              "targetThreadId": "thr-charge-main",
              "expectedReplyValue": "https://support.example.com/hardware/usb-c-charging-fix",
              "expectedLockReason": "resolved with guide",
              "requiresMarkDuplicate": true,
              "canonicalThreadId": "thr-charge-main",
              "duplicateThreadIds": [
                "thr-charge-dup1",
                "thr-charge-dup2"
              ]
            }
          },
          {
            "id": "misfiled-safety-escalation",
            "goal": "A safety report about a smoking wall adapter was filed under the wrong category. Move the thread to the 'safety' category, reply with the official advisory link, then lock it with reason 'safety escalation'.",
            "taskConfig": {
              "targetThreadId": "thr-misfiled-safety",
              "expectedReplyValue": "https://support.example.com/safety/adapter-smoke",
              "expectedLockReason": "safety escalation",
              "requiresMove": true,
              "expectedCategory": "safety"
            }
          },
          {
            "id": "vague-title-cleanup",
            "goal": "A networking thread has an unhelpful title. Rename it to 'DNS resolution failures on wired connection', reply with the official DNS reset guide link, then lock it with reason 'resolved with guide'.",
            "taskConfig": {
              "targetThreadId": "thr-vague-title",
              "expectedReplyValue": "https://support.example.com/network/dns-reset",
              "expectedLockReason": "resolved with guide",
              "requiresEditTitle": true,
              "expectedTitle": "DNS resolution failures on wired connection"
            }
          },
          {
            "id": "hot-charge-consolidate",
            "goal": "A fast-charge overheating report was miscategorized and has a near-duplicate. Move the main thread to the 'safety' category, mark 'thr-hot-dup' as a duplicate of it, reply with the official advisory link, then lock it with reason 'safety escalation'.",
            "taskConfig": {
              "targetThreadId": "thr-hot-main",
              "expectedReplyValue": "https://support.example.com/safety/fast-charge-heat",
              "expectedLockReason": "safety escalation",
              "requiresMove": true,
              "expectedCategory": "safety",
              "requiresMarkDuplicate": true,
              "canonicalThreadId": "thr-hot-main",
              "duplicateThreadIds": [
                "thr-hot-dup"
              ]
            }
          },
          {
            "id": "hot-charge-full-escalation",
            "goal": "Fully triage the fast-charge overheating incident in this exact moderation order: report the main thread with reason 'thermal incident', move it to 'safety', rename it to 'Fast-charge overheating safety incident', mark 'thr-hot-dup' as its duplicate, reply with the official advisory link, lock it with reason 'safety escalation', then pin it. Do not lock early.",
            "taskConfig": {
              "targetThreadId": "thr-hot-main",
              "expectedReplyValue": "https://support.example.com/safety/fast-charge-heat",
              "expectedLockReason": "safety escalation",
              "requiresPin": true,
              "requiresReport": true,
              "expectedReportReason": "thermal incident",
              "requiresMove": true,
              "expectedCategory": "safety",
              "requiresEditTitle": true,
              "expectedTitle": "Fast-charge overheating safety incident",
              "requiresMarkDuplicate": true,
              "canonicalThreadId": "thr-hot-main",
              "duplicateThreadIds": [
                "thr-hot-dup"
              ],
              "requiredActionOrder": [
                "report",
                "move",
                "edit_title",
                "mark_duplicate",
                "lock",
                "pin"
              ]
            }
          }
        ]
      }
    },
    {
      "app": "repo-lite",
      "taskSlug": "repo-coherent-edit-hard",
      "title": "Repository Coherent Edit (Hard)",
      "startPath": "/repo",
      "taskVersion": "v3",
      "seedVersion": "repo-lite-hard-v2",
      "sequenceIndex": 2,
      "weight": 1,
      "required": true,
      "metadata": {
        "questionVariants": [
          {
            "id": "release-2-0-0",
            "goal": "Cut release 2.0.0: bump the version to `2.0.0` in both `package.json` and `src/version.ts`, add a `## 2.0.0` section to `CHANGELOG.md` so the version-consistency CI check passes, then open a merge request titled `Release 2.0.0` targeting `release`.",
            "taskConfig": {
              "filePath": "package.json",
              "expectedText": "\"version\": \"2.0.0\"",
              "forbiddenText": "\"version\": \"1.0.0\"",
              "expectedMrTitle": "Release 2.0.0",
              "expectedTargetBranch": "release",
              "secondaryFilePath": "src/version.ts",
              "secondaryExpectedText": "VERSION = \"2.0.0\"",
              "secondaryForbiddenText": "VERSION = \"1.0.0\"",
              "additionalFileEdits": [
                {
                  "filePath": "CHANGELOG.md",
                  "expectedText": "## 2.0.0"
                }
              ],
              "ciChecks": [
                {
                  "name": "Version consistency",
                  "token": "2.0.0",
                  "files": [
                    "package.json",
                    "src/version.ts",
                    "CHANGELOG.md"
                  ]
                }
              ]
            }
          },
          {
            "id": "rename-to-acme-cli",
            "goal": "Rename the project to `acme-cli`: update `name` in `package.json`, `APP_NAME` in `src/config.ts`, and reference `acme-cli` in `README.md` so the project-name CI check passes, then open a merge request titled `Rename project to acme-cli` targeting `main`.",
            "taskConfig": {
              "filePath": "package.json",
              "expectedText": "\"name\": \"acme-cli\"",
              "forbiddenText": "\"name\": \"demo-project\"",
              "expectedMrTitle": "Rename project to acme-cli",
              "expectedTargetBranch": "main",
              "secondaryFilePath": "src/config.ts",
              "secondaryExpectedText": "APP_NAME = \"acme-cli\"",
              "secondaryForbiddenText": "APP_NAME = \"demo-project\"",
              "additionalFileEdits": [
                {
                  "filePath": "README.md",
                  "expectedText": "acme-cli"
                }
              ],
              "ciChecks": [
                {
                  "name": "Project name consistency",
                  "token": "acme-cli",
                  "files": [
                    "package.json",
                    "src/config.ts",
                    "README.md"
                  ]
                }
              ]
            }
          },
          {
            "id": "api-v2-rollout",
            "goal": "Roll out API v2: set `API_VERSION` to `v2` in `src/api.ts`, update the stable version to `v2` in `docs/API.md`, note `API v2` in `README.md` so the API-version CI check passes, then open a merge request titled `Roll out API v2` targeting `develop`.",
            "taskConfig": {
              "filePath": "src/api.ts",
              "expectedText": "API_VERSION = \"v2\"",
              "forbiddenText": "API_VERSION = \"v1\"",
              "expectedMrTitle": "Roll out API v2",
              "expectedTargetBranch": "develop",
              "secondaryFilePath": "docs/API.md",
              "secondaryExpectedText": "Stable version: v2",
              "secondaryForbiddenText": "Stable version: v1",
              "additionalFileEdits": [
                {
                  "filePath": "README.md",
                  "expectedText": "API v2"
                }
              ],
              "ciChecks": [
                {
                  "name": "API version consistency",
                  "token": "v2",
                  "files": [
                    "src/api.ts",
                    "docs/API.md",
                    "README.md"
                  ]
                }
              ]
            }
          },
          {
            "id": "api-v3-conflict-rollout",
            "goal": "Roll out API v3 from feature branch `feature/api-v3`: update `API_VERSION` to `v3` in `src/api.ts`, set `Stable version: v3` in `docs/API.md`, and add `API v3` to `README.md`. Resolve the simulated target-branch conflict, commit with message `feat: roll out api v3`, request review from `mira`, then open merge request `Roll out API v3` targeting `develop`.",
            "taskConfig": {
              "filePath": "src/api.ts",
              "expectedText": "API_VERSION = \"v3\"",
              "forbiddenText": "API_VERSION = \"v1\"",
              "expectedMrTitle": "Roll out API v3",
              "expectedTargetBranch": "develop",
              "expectedSourceBranch": "feature/api-v3",
              "expectedCommitMessage": "feat: roll out api v3",
              "expectedReviewer": "mira",
              "requiresConflictResolution": true,
              "secondaryFilePath": "docs/API.md",
              "secondaryExpectedText": "Stable version: v3",
              "secondaryForbiddenText": "Stable version: v1",
              "additionalFileEdits": [
                {
                  "filePath": "README.md",
                  "expectedText": "API v3"
                }
              ],
              "ciChecks": [
                {
                  "name": "API version consistency",
                  "token": "v3",
                  "files": [
                    "src/api.ts",
                    "docs/API.md",
                    "README.md"
                  ]
                }
              ]
            }
          }
        ]
      }
    },
    {
      "app": "wiki-lite",
      "taskSlug": "wiki-release-answer-hard",
      "title": "Wiki Release Lookup (Hard)",
      "startPath": "/wiki",
      "taskVersion": "v4",
      "seedVersion": "wiki-lite-hard-v2",
      "sequenceIndex": 3,
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
      "taskSlug": "wiki-policy-answer-hard",
      "title": "Wiki Policy Lookup (Hard)",
      "startPath": "/wiki",
      "taskVersion": "v3",
      "seedVersion": "wiki-lite-hard-v2",
      "sequenceIndex": 4,
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
      "app": "notes-lite",
      "taskSlug": "notes-followup-create-hard",
      "title": "Notes Follow-up (Hard)",
      "startPath": "/notes",
      "taskVersion": "v4",
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
      "taskSlug": "calendar-event-create-hard",
      "title": "Calendar Event (Hard)",
      "startPath": "/calendar",
      "taskVersion": "v3",
      "seedVersion": "calendar-lite-hard-v2",
      "sequenceIndex": 6,
      "weight": 1,
      "required": true,
      "metadata": {
        "questionVariants": [
          {
            "id": "conflict-avoidance-single",
            "goal": "Mira needs a 45-minute event on July 9, 2026 with attendee mira@example.com. Use exactly the title of the note you completed earlier. Book it within business hours (09:00–17:00) at the earliest conflict-free time.",
            "taskConfig": {
              "expectedDate": "2026-07-09",
              "expectedStartTime": "12:00",
              "expectedDurationMinutes": 45,
              "expectedAttendeeEmail": "mira@example.com",
              "seedBusyEvents": [
                {
                  "id": "busy-mira-standup",
                  "title": "Team standup",
                  "date": "2026-07-09",
                  "startTime": "09:00",
                  "durationMinutes": 90,
                  "attendeeEmail": "mira@example.com"
                },
                {
                  "id": "busy-mira-review",
                  "title": "Design review",
                  "date": "2026-07-09",
                  "startTime": "11:00",
                  "durationMinutes": 60,
                  "attendeeEmail": "mira@example.com"
                },
                {
                  "id": "busy-mira-1on1",
                  "title": "1:1 with lead",
                  "date": "2026-07-09",
                  "startTime": "13:00",
                  "durationMinutes": 150,
                  "attendeeEmail": "mira@example.com"
                }
              ],
              "schedulingWindowStart": "09:00",
              "schedulingWindowEnd": "17:00"
            }
          },
          {
            "id": "shared-window-two-attendees",
            "goal": "Schedule a 30-minute event on July 13, 2026 with attendees mira@example.com and lead@example.com, using exactly the title of the note you completed earlier. Book the earliest time free for both attendees.",
            "taskConfig": {
              "expectedDate": "2026-07-13",
              "expectedStartTime": "10:30",
              "expectedDurationMinutes": 30,
              "expectedAttendeeEmail": "mira@example.com",
              "expectedSecondaryAttendeeEmail": "lead@example.com",
              "seedBusyEvents": [
                {
                  "id": "busy-mira-am",
                  "title": "Roadmap review",
                  "date": "2026-07-13",
                  "startTime": "09:00",
                  "durationMinutes": 60,
                  "attendeeEmail": "mira@example.com"
                },
                {
                  "id": "busy-mira-late",
                  "title": "Vendor call",
                  "date": "2026-07-13",
                  "startTime": "11:00",
                  "durationMinutes": 30,
                  "attendeeEmail": "mira@example.com"
                },
                {
                  "id": "busy-lead-am",
                  "title": "Hiring panel",
                  "date": "2026-07-13",
                  "startTime": "09:30",
                  "durationMinutes": 60,
                  "attendeeEmail": "lead@example.com"
                },
                {
                  "id": "busy-lead-noon",
                  "title": "Budget sync",
                  "date": "2026-07-13",
                  "startTime": "12:00",
                  "durationMinutes": 60,
                  "attendeeEmail": "lead@example.com"
                }
              ],
              "schedulingWindowStart": "09:00",
              "schedulingWindowEnd": "17:00"
            }
          },
          {
            "id": "timezone-overlap",
            "goal": "Schedule a 30-minute event on July 15, 2026 with attendees ny@example.com and berlin@example.com, using exactly the title of the note you completed earlier. All times are ET; account for Berlin being ET+6 and book the earliest shared free time.",
            "taskConfig": {
              "expectedDate": "2026-07-15",
              "expectedStartTime": "10:00",
              "expectedDurationMinutes": 30,
              "expectedAttendeeEmail": "ny@example.com",
              "expectedSecondaryAttendeeEmail": "berlin@example.com",
              "seedBusyEvents": [
                {
                  "id": "busy-ny-early",
                  "title": "Morning triage",
                  "date": "2026-07-15",
                  "startTime": "09:00",
                  "durationMinutes": 60,
                  "attendeeEmail": "ny@example.com"
                },
                {
                  "id": "busy-ny-mid",
                  "title": "Incident review",
                  "date": "2026-07-15",
                  "startTime": "10:30",
                  "durationMinutes": 90,
                  "attendeeEmail": "ny@example.com"
                }
              ],
              "schedulingWindowStart": "09:00",
              "schedulingWindowEnd": "12:00"
            }
          },
          {
            "id": "reschedule-longer-meeting",
            "goal": "Book a 60-minute event on July 16, 2026 with attendee evals@example.com, using exactly the title of the note you completed earlier. Book the earliest conflict-free business-hours time.",
            "taskConfig": {
              "expectedDate": "2026-07-16",
              "expectedStartTime": "12:00",
              "expectedDurationMinutes": 60,
              "expectedAttendeeEmail": "evals@example.com",
              "seedBusyEvents": [
                {
                  "id": "busy-evals-standup",
                  "title": "Standup",
                  "date": "2026-07-16",
                  "startTime": "09:00",
                  "durationMinutes": 60,
                  "attendeeEmail": "evals@example.com"
                },
                {
                  "id": "busy-evals-sync",
                  "title": "Metrics sync",
                  "date": "2026-07-16",
                  "startTime": "10:30",
                  "durationMinutes": 90,
                  "attendeeEmail": "evals@example.com"
                },
                {
                  "id": "busy-evals-lunch",
                  "title": "Lunch & learn",
                  "date": "2026-07-16",
                  "startTime": "13:00",
                  "durationMinutes": 60,
                  "attendeeEmail": "evals@example.com"
                },
                {
                  "id": "busy-evals-pm",
                  "title": "Customer review",
                  "date": "2026-07-16",
                  "startTime": "14:30",
                  "durationMinutes": 150,
                  "attendeeEmail": "evals@example.com"
                }
              ],
              "schedulingWindowStart": "09:00",
              "schedulingWindowEnd": "17:00"
            }
          },
          {
            "id": "recurring-resource-review",
            "goal": "Create a weekly three-occurrence event beginning July 20, 2026, using exactly the title of the note you completed earlier. Start at 15:00 ET for 30 minutes with mira@example.com and lead@example.com, and reserve resource 'Room Atlas'.",
            "taskConfig": {
              "expectedDate": "2026-07-20",
              "expectedStartTime": "15:00",
              "expectedDurationMinutes": 30,
              "expectedAttendeeEmail": "mira@example.com",
              "expectedSecondaryAttendeeEmail": "lead@example.com",
              "expectedResource": "Room Atlas",
              "expectedOccurrences": 3
            }
          }
        ]
      }
    }
  ],
  "consistencyChecks": [
    {
      "name": "Wiki release answer carried into note title",
      "sourceTaskSlug": "wiki-release-answer-hard",
      "sourcePath": "latestAnswer.answer",
      "targetTaskSlug": "notes-followup-create-hard",
      "targetPath": "notes[].title",
      "rule": "equal-normalized",
      "weight": 1,
      "required": true
    },
    {
      "name": "Wiki policy answer carried into note body",
      "sourceTaskSlug": "wiki-policy-answer-hard",
      "sourcePath": "latestAnswer.answer",
      "targetTaskSlug": "notes-followup-create-hard",
      "targetPath": "notes[].bodyDigest",
      "rule": "target-digest-matches-source",
      "weight": 1,
      "required": true
    },
    {
      "name": "Note title carried into calendar title",
      "sourceTaskSlug": "notes-followup-create-hard",
      "sourcePath": "notes[].title",
      "targetTaskSlug": "calendar-event-create-hard",
      "targetPath": "calendarEvents[].title",
      "rule": "equal-normalized",
      "weight": 1,
      "required": true
    }
  ]
}$catalog$::jsonb,
  '4d53f68938c5aaa3004c8ac317d515cf2fb5006698d7e69372b73bc00caea58b'
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
