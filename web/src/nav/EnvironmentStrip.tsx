import { BUILD, versionText, type BuildInfo } from "../version";

/**
 * A thin strip at the top of every page on staging and on local builds, so real data is not entered by mistake
 * (AC-OPS-11.9). Production shows nothing. `info` is a prop only so a test can try each environment.
 */
export function EnvironmentStrip({ info = BUILD }: { info?: BuildInfo }) {
  if (info.label === null) return null;
  return (
    <aside aria-label="Environment" data-environment={info.environment} className="bg-ink px-3 py-1 text-center text-xs font-bold text-bg">
      {info.label} · {versionText(info)}
    </aside>
  );
}
