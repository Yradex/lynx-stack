import fs from 'node:fs';
import path from 'node:path';

import type { RossiEtExpectation, RossiEtExpectedOutputs } from './fixtureContract.js';

export function resolveFixtureExpectationPaths(fixtureDir: string): RossiEtExpectation {
  return {
    treePath: path.join(fixtureDir, 'expect.tree.txt'),
    tracePath: path.join(fixtureDir, 'expect.trace.json'),
    diagnosticsPath: path.join(fixtureDir, 'expect.diagnostics.json'),
  };
}

export function readFixtureExpectations(fixtureDir: string): RossiEtExpectedOutputs {
  const paths = resolveFixtureExpectationPaths(fixtureDir);

  return {
    ...(paths.treePath && fs.existsSync(paths.treePath)
      ? { tree: fs.readFileSync(paths.treePath, 'utf8').trimEnd() }
      : {}),
    ...(paths.tracePath && fs.existsSync(paths.tracePath)
      ? { trace: JSON.parse(fs.readFileSync(paths.tracePath, 'utf8')) }
      : {}),
    ...(paths.diagnosticsPath && fs.existsSync(paths.diagnosticsPath)
      ? { diagnostics: JSON.parse(fs.readFileSync(paths.diagnosticsPath, 'utf8')) }
      : {}),
  };
}
