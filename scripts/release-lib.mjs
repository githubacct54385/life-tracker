// Release tags and release notes (OPS-11). Pure functions, so the Release workflow's tag and notes logic is tested here
// and not for the first time on a real release.

/** A release tag is the date plus a counter for that day, for example v2026.11.25.2. Other tags (such as the badges release) are ignored. */
export const RELEASE_TAG = /^v(\d{4})\.(\d{2})\.(\d{2})\.(\d+)$/;

/** Release tags only, oldest first. */
export function releaseTags(tags) {
  const parts = (tag) => RELEASE_TAG.exec(tag).slice(1).map(Number);
  const compare = (a, b) => {
    const [x, y] = [parts(a), parts(b)];
    const at = x.findIndex((n, i) => n !== y[i]);
    return at === -1 ? 0 : x[at] - y[at];
  };
  return tags.filter((tag) => RELEASE_TAG.test(tag)).sort(compare);
}

/** The tag before this release, or null for the very first one. */
export const previousTag = (tags) => releaseTags(tags).at(-1) ?? null;

/** The next tag for `date` (a YYYY-MM-DD string, in UTC): the first of the day is .1, the next .2, and so on. */
export function nextTag(date, tags) {
  const [year, month, day] = date.split("-");
  const prefix = `v${year}.${month}.${day}.`;
  const used = releaseTags(tags)
    .filter((tag) => tag.startsWith(prefix))
    .map((tag) => Number(tag.slice(prefix.length)));
  return `${prefix}${Math.max(0, ...used) + 1}`;
}

/** "MIL-03: Mileage graphs (#12)" gives { key: "MIL-03", title: "Mileage graphs", pr: 12 }. A subject with no story key goes under "Other". */
export function parseSubject(subject) {
  const pr = /\s\(#(\d+)\)$/.exec(subject);
  const withoutPr = pr ? subject.slice(0, pr.index) : subject;
  const story = /^([A-Z]{2,5}-\d{2,3}):\s*(.+)$/.exec(withoutPr);
  return { key: story ? story[1] : "Other", title: story ? story[2] : withoutPr, pr: pr ? Number(pr[1]) : null };
}

const byKey = (a, b) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b, "en", { numeric: true }));

/**
 * The GitHub Release page: what changed, grouped by story key, and any migration that ran.
 * `subjects` are the squash-commit subjects since the previous release. `migrations` are the migration files added since then.
 * `previous` is null for the first tagged release, which has no list to compare with.
 */
export function renderNotes({ tag, previous, subjects, migrations, repoUrl, sha }) {
  const lines = [`## ${tag}`, "", `Deployed commit: [\`${sha.slice(0, 7)}\`](${repoUrl}/commit/${sha})`, ""];
  if (previous === null) {
    lines.push("This is the first tagged release. Earlier changes are in the commit history.", "");
  } else {
    const groups = new Map();
    for (const subject of subjects) {
      const { key, title, pr } = parseSubject(subject);
      groups.set(key, [...(groups.get(key) ?? []), { title, pr }]);
    }
    lines.push(`### What changed since ${previous}`, "");
    if (groups.size === 0) lines.push("No merged changes since the previous release.", "");
    for (const key of [...groups.keys()].sort(byKey)) {
      lines.push(`**${key}**`);
      for (const { title, pr } of groups.get(key)) lines.push(`- ${title}${pr ? ` ([#${pr}](${repoUrl}/pull/${pr}))` : ""}`);
      lines.push("");
    }
    lines.push("### Database migrations", "");
    lines.push(...(migrations.length === 0 ? ["None ran in this release."] : migrations.map((file) => `- \`${file}\``)), "");
  }
  lines.push("To go back, release a revert of the change. Migrations are not rolled back (see docs/setup.md).", "");
  return lines.join("\n");
}
