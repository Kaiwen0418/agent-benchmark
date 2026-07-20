export type LeaderboardVersionCandidate = {
  version: string;
  slug: string;
  tag: string;
};

export type LeaderboardVersionGroup = {
  version: string;
  versions: string[];
  slug: string;
  tag: string;
};

type ParsedSuiteVersion = {
  major: number;
  minor: number;
  patch: number;
};

function parseSuiteVersion(version: string): ParsedSuiteVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function versionFamily(version: string) {
  const parsed = parseSuiteVersion(version);
  if (!parsed) {
    return { key: `exact:${version}`, label: version };
  }

  return {
    key: `${parsed.major}.${parsed.minor}`,
    label: `v${parsed.major}.${parsed.minor}.x`,
  };
}

function compareVersions(left: string, right: string) {
  const leftParsed = parseSuiteVersion(left);
  const rightParsed = parseSuiteVersion(right);

  if (leftParsed && rightParsed) {
    return rightParsed.major - leftParsed.major
      || rightParsed.minor - leftParsed.minor
      || rightParsed.patch - leftParsed.patch
      || right.localeCompare(left, undefined, { numeric: true, sensitivity: "base" });
  }

  return right.localeCompare(left, undefined, { numeric: true, sensitivity: "base" });
}

export function groupLeaderboardVersions(candidates: LeaderboardVersionCandidate[]): LeaderboardVersionGroup[] {
  const groups = new Map<string, LeaderboardVersionGroup>();

  for (const candidate of candidates) {
    const family = versionFamily(candidate.version);
    const key = `${candidate.slug}:${family.key}`;
    const existing = groups.get(key);

    if (existing) {
      if (!existing.versions.includes(candidate.version)) {
        existing.versions.push(candidate.version);
      }
      continue;
    }

    groups.set(key, {
      version: family.label,
      versions: [candidate.version],
      slug: candidate.slug,
      tag: candidate.tag,
    });
  }

  return [...groups.values()]
    .map((group) => ({ ...group, versions: group.versions.sort(compareVersions) }))
    .sort((left, right) => {
      if (left.tag !== right.tag) {
        return right.tag.localeCompare(left.tag);
      }
      return compareVersions(left.versions[0] ?? left.version, right.versions[0] ?? right.version);
    });
}
