import assert from "node:assert/strict";
import test from "node:test";
import { groupLeaderboardVersions } from "../../lib/leaderboard-versions";

test("groups patch releases from the same major and minor line", () => {
  const groups = groupLeaderboardVersions([
    { slug: "hosted-web-hard-suite", version: "v1.0.1", tag: "hard" },
    { slug: "hosted-web-hard-suite", version: "1.0.3", tag: "hard" },
    { slug: "hosted-web-hard-suite", version: "v1.0.5", tag: "hard" },
  ]);

  assert.deepEqual(groups, [{
    slug: "hosted-web-hard-suite",
    version: "v1.0.x",
    versions: ["v1.0.5", "1.0.3", "v1.0.1"],
    tag: "hard",
  }]);
});

test("keeps different major or minor release lines on separate boards", () => {
  const groups = groupLeaderboardVersions([
    { slug: "hosted-web-hard-suite", version: "v1.0.5", tag: "hard" },
    { slug: "hosted-web-hard-suite", version: "v1.1.0", tag: "hard" },
    { slug: "hosted-web-hard-suite", version: "v2.0.0", tag: "hard" },
  ]);

  assert.deepEqual(groups.map((group) => group.version), ["v2.0.x", "v1.1.x", "v1.0.x"]);
});

test("keeps legacy and malformed versions exact instead of guessing compatibility", () => {
  const groups = groupLeaderboardVersions([
    { slug: "hosted-web-suite", version: "v1", tag: "easy" },
    { slug: "hosted-web-suite", version: "1.03", tag: "easy" },
    { slug: "hosted-web-suite", version: "v1", tag: "easy" },
  ]);

  assert.deepEqual(groups.map((group) => ({ version: group.version, versions: group.versions })), [
    { version: "v1", versions: ["v1"] },
    { version: "1.03", versions: ["1.03"] },
  ]);
});

test("does not combine the same release line across different suite slugs", () => {
  const groups = groupLeaderboardVersions([
    { slug: "hosted-web-hard-suite", version: "v1.0.5", tag: "hard" },
    { slug: "hosted-web-suite", version: "v1.0.4", tag: "easy" },
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.slug), ["hosted-web-hard-suite", "hosted-web-suite"]);
});
