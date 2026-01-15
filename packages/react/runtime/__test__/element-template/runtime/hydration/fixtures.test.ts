import path from 'node:path';
import { fileURLToPath } from 'node:url';

import fs from 'node:fs';

import { describe } from 'vitest';

import {
  assertOrUpdateTextFile,
  expectReportErrorCount,
  formatFixtureOutput,
  runFixtureTests,
} from '../../test-utils/fixtureRunner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '../../fixtures/hydrate');

describe('Hydration fixtures', () => {
  runFixtureTests({
    fixturesRoot: FIXTURES_DIR,
    allowEmpty: true,
    async run({ fixtureDir, fixtureName, update }) {
      const casePath = fs.existsSync(path.join(fixtureDir, 'case.ts'))
        ? path.join(fixtureDir, 'case.ts')
        : path.join(fixtureDir, 'case.tsx');

      if (!fs.existsSync(casePath)) {
        throw new Error(`Missing case file for fixture "${fixtureName}".`);
      }

      const relativePath = path.relative(__dirname, casePath);
      const modulePath = (relativePath.startsWith('.') ? relativePath : `./${relativePath}`)
        .split(path.sep)
        .join('/');
      const caseModule = (await import(modulePath)) as {
        run: (context: { fixtureDir: string; fixtureName: string }) => Promise<unknown> | unknown;
        reportErrorCount?: number;
      };
      const output = await caseModule.run({ fixtureDir, fixtureName });
      const reportErrorCount = caseModule.reportErrorCount ?? 0;

      expectReportErrorCount(reportErrorCount);
      assertOrUpdateTextFile({
        path: path.join(fixtureDir, 'output.txt'),
        actual: formatFixtureOutput(output),
        update,
        fixtureName,
        label: 'output',
      });
    },
  });
});
