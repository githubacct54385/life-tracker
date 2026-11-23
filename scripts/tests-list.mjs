#!/usr/bin/env node
// Prints a plain-English list of what the automated tests check (OPS-12), built from the test names in the code.
//
//   pnpm tests:list                 every test, grouped by area, story and criterion
//   pnpm tests:list GRO             one area (also: a story such as GRO-02, or a criterion such as AC-GRO-02.4)
//   pnpm tests:list none            only the tests that name no acceptance criterion
//   pnpm tests:list GRO-02 --commands   also print the command that runs each test
//   pnpm tests:list --markdown      Markdown, for the CI job summary
import { collectTests, render } from "./tests-list-lib.mjs";

process.stdout.on("error", (error) => {
  if (error.code !== "EPIPE") throw error; // `| head` closing the pipe is not a failure
});

const args = process.argv.slice(2);
const filter = args.find((arg) => !arg.startsWith("--"));
process.stdout.write(render(collectTests(process.cwd()), { filter, markdown: args.includes("--markdown"), commands: args.includes("--commands") }));
