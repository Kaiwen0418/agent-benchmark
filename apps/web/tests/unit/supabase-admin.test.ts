import assert from "node:assert/strict";
import test from "node:test";
import {
  createSupabaseAdminClient,
  SupabaseServiceUnavailableError,
} from "../../lib/supabase/admin";

test("missing Supabase credentials fail closed instead of creating a local store", () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    assert.throws(
      () => createSupabaseAdminClient(),
      (error) => error instanceof SupabaseServiceUnavailableError && error.status === 503,
    );
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});
