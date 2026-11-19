import { useId } from "react";
import { Link } from "react-router";
import { Icon, type IconName } from "./Icon";

/**
 * A big tappable row on a section's home screen: an icon, the destination, and one line saying what it is for.
 * Only the title is the link (stretched over the whole row), so its name is exactly the title and the description
 * is read after it. Padding on the link keeps its own box at least 44 px tall.
 */
export function HubLink({ to, icon, title, description }: { to: string; icon: IconName; title: string; description: string }) {
  const descriptionId = useId();
  return (
    <div className="group relative flex min-h-16 items-center gap-3 rounded-xl border border-line bg-card p-4 text-ink hover:border-g300 hover:shadow-sm focus-within:border-g500">
      <span aria-hidden="true" className="flex size-10 flex-none items-center justify-center rounded-lg bg-g100 text-gtext">
        <Icon name={icon} className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <Link to={to} aria-describedby={descriptionId} className="-my-2.5 block rounded-md py-2.5 font-bold after:absolute after:inset-0 after:rounded-xl">
          {title}
        </Link>
        <span id={descriptionId} className="block text-sm text-muted">
          {description}
        </span>
      </span>
      <Icon name="chevron" className="size-5 flex-none text-muted group-hover:text-gtext" />
    </div>
  );
}
