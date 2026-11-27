/**
 * A ref for the element that holds a chart. Recharts draws its parts as SVG layers that Chrome puts in the keyboard tab order even
 * though they are not controls and say nothing, so a keyboard user would press Tab about five times per chart for nothing. This marks
 * every drawing layer `tabindex="-1"` (reachable by script, never by Tab), and keeps doing so as the chart redraws. The element
 * itself keeps its `role="img"` and label, and the mouse tooltips still work. The text table next to each chart is the keyboard view.
 */
export function keepOutOfTabOrder(element: HTMLElement | null): (() => void) | void {
  if (!element) return;
  const mark = () => element.querySelectorAll("svg, svg *").forEach((node) => node.getAttribute("tabindex") === null && node.setAttribute("tabindex", "-1"));
  mark();
  const observer = new MutationObserver(mark);
  observer.observe(element, { childList: true, subtree: true });
  return () => observer.disconnect();
}
