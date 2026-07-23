import assert from "node:assert/strict";
import test from "node:test";
import { requireModelCatalogSyncAuth } from "../../lib/model-catalog-sync-auth";

test("model catalog sync fails closed without a configured secret", () => {
  const previous = process.env.MODEL_CATALOG_SYNC_SECRET;
  delete process.env.MODEL_CATALOG_SYNC_SECRET;
  try {
    const response = requireModelCatalogSyncAuth(new Request("https://example.test"));
    assert.equal(response?.status, 503);
  } finally {
    if (previous === undefined) delete process.env.MODEL_CATALOG_SYNC_SECRET;
    else process.env.MODEL_CATALOG_SYNC_SECRET = previous;
  }
});

test("model catalog sync requires an exact bearer secret", () => {
  const previous = process.env.MODEL_CATALOG_SYNC_SECRET;
  process.env.MODEL_CATALOG_SYNC_SECRET = "catalog-secret";
  try {
    assert.equal(
      requireModelCatalogSyncAuth(new Request("https://example.test", {
        headers: { Authorization: "Bearer wrong" },
      }))?.status,
      401,
    );
    assert.equal(
      requireModelCatalogSyncAuth(new Request("https://example.test", {
        headers: { Authorization: "Bearer catalog-secret" },
      })),
      null,
    );
  } finally {
    if (previous === undefined) delete process.env.MODEL_CATALOG_SYNC_SECRET;
    else process.env.MODEL_CATALOG_SYNC_SECRET = previous;
  }
});
