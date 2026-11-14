import type { Reporter } from "vitest/node";

/**
 * Prints, at the end of every run, each suite or test that did not run
 * because its data or setup is absent (the `[corpus-gated] NOT RUN` lines the
 * helpers in describe-with-corpus.ts emit). The default reporter hides console
 * output from skipped tests, so without this a green run would not say what
 * it left out.
 */
export default class SkipSummaryReporter implements Reporter {
  private readonly lines = new Set<string>();

  onUserConsoleLog(log: { content: string }): void {
    for (const line of log.content.split("\n")) {
      if (line.startsWith("[corpus-gated] NOT RUN")) this.lines.add(line.replace("[corpus-gated] NOT RUN: ", ""));
    }
  }

  onTestRunEnd(): void {
    if (this.lines.size === 0) return;
    const body = [...this.lines].sort().map((l) => `  - ${l}`).join("\n");
    process.stdout.write(
      `\nNot run (${this.lines.size}): data or setup not present in this checkout. See docs/TESTING.md.\n${body}\n`,
    );
  }
}
