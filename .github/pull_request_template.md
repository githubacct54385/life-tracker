## Story

<!-- Story key and name, for example FIN-03: Import preview. Link the Linear issue. -->

## What changed

<!-- A few sentences. Say why, not only what. -->

## Screenshots

<!--
Required for any change to a page or component the user can see.
One row per changed screen. Show mobile (360 px), tablet (768 px), and desktop (1280 px).
Use demo mode with synthetic data only. No real names, amounts, health values, or odometer readings.
The agent fills this table with `pnpm pr-screenshots` (ADR-0019). Do not commit image files to the repo.
Write "No UI change" if this PR has no visible change.
-->

| Screen | Mobile (360 px) | Tablet (768 px) | Desktop (1280 px) |
|---|---|---|---|
| | before / after | before / after | before / after |

## Acceptance criteria

<!-- List each AC ID this PR touches, for example AC-FIN-03.2, and where it is proven (test file or manual-checks entry). -->

## Checklist

**Required**

- [ ] Every acceptance criterion touched has a passing `[AC-...]` test, or an entry in `docs/manual-checks.md`
- [ ] Tests are at the lowest level that can prove each criterion (see TESTING.md)
- [ ] Checked at mobile, tablet, and desktop widths (CSV import: desktop only)
- [ ] New API methods are in both `client.ts` and `demoApi.ts`, and the shared contract test passes
- [ ] No personal data, secrets, or real-looking fixtures in code, tests, comments, or screenshots
- [ ] No banned fields in logs or telemetry (all logging goes through `telemetry/logger.ts`)
- [ ] Any migration is additive and works with the code that is live now
- [ ] ARCHITECTURE.md, SPEC.md, BACKLOG.md, or DECISIONS.md updated if structure, behavior, or a decision changed

**Good practice**

- [ ] Small: one story or part of one. If larger, say why in "What changed"
- [ ] Keyboard can reach and operate every new control, and inputs have labels
- [ ] Text and key controls meet WCAG AA contrast, and nothing relies on colour alone
- [ ] No console errors or warnings in the browser during the manual check
- [ ] Empty, loading, and error states are handled and visible
- [ ] Server validates every input, including rows the browser sends back
- [ ] Failure path tested, not only the happy path
- [ ] Rollback is simple: say how to revert (for example, a feature is additive and can be reverted without a migration)
- [ ] No new dependency, or the new one is justified in "What changed"
- [ ] No new paid service or Azure resource (see Cost in AGENTS.md)

## Release notes

<!-- Anything to know before releasing: migrations, new app settings, manual steps. Write "None" if there are none. -->
