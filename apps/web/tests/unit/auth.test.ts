import assert from "node:assert/strict";
import test from "node:test";
import { isVerifiedGithubEmail } from "../../auth";
import {
  decodeGuestCookie,
  encodeGuestCookie,
  getCurrentUser,
} from "../../lib/auth";

test("authentication remains guest-only when Auth.js runtime secrets are absent", async () => {
  assert.equal(await getCurrentUser(), null);
});

test("guest cookies are signed, tamper-evident, and support one-time legacy upgrade", () => {
  const guestId = "713ad893-06aa-4a6a-9189-bb46018ed91d";
  const secret = "unit-test-auth-secret";
  const encoded = encodeGuestCookie(guestId, secret);

  assert.notEqual(encoded, guestId);
  assert.deepEqual(decodeGuestCookie(encoded, { secret }), { guestId, legacy: false });
  assert.equal(decodeGuestCookie(`${encoded}x`, { secret }), null);
  assert.deepEqual(decodeGuestCookie(guestId, { secret }), { guestId, legacy: true });
  assert.equal(decodeGuestCookie(guestId, { secret, allowLegacy: false }), null);
});

test("GitHub linking requires the exact verified provider email", async () => {
  const fetcher = async () => new Response(JSON.stringify([
    { email: "user@example.test", primary: true, verified: true },
    { email: "old@example.test", primary: false, verified: false },
  ]), { status: 200 });

  assert.equal(await isVerifiedGithubEmail(
    "test-token",
    "USER@example.test",
    fetcher,
  ), true);
  assert.equal(await isVerifiedGithubEmail(
    "test-token",
    "old@example.test",
    fetcher,
  ), false);
  assert.equal(await isVerifiedGithubEmail(
    "test-token",
    "missing@example.test",
    fetcher,
  ), false);
});
