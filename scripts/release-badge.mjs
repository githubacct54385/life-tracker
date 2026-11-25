#!/usr/bin/env node
// Draws the README's latest-release badge (OPS-11): node scripts/release-badge.mjs <tag> <output .svg file>
import { writeFileSync } from "node:fs";
import { releaseBadge, renderBadgeSvg } from "./badges-lib.mjs";

const [tag, file] = process.argv.slice(2);
if (!tag || !file) {
  console.error("Usage: node scripts/release-badge.mjs <tag> <output .svg file>");
  process.exit(2);
}
// "none" draws the placeholder shown until the first release exists.
writeFileSync(file, renderBadgeSvg(releaseBadge(tag === "none" ? null : tag)));
