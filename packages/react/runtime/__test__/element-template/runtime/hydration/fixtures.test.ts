import path from 'node:path';
import { fileURLToPath } from 'node:url';

import fs from 'node:fs';

import { describe } from 'vitest';

import {
  assertOrUpdateTextFile,
  expectReportErrorCount,
  formatFixtureOutput,
  runFixtureTests,
} from '../../test-utils/debug/fixtureRunner.js';

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
      const result = await caseModule.run({ fixtureDir, fixtureName });
      const reportErrorCount = caseModule.reportErrorCount ?? 0;
      let output = result;
      let files: Record<string, unknown> | undefined;
      if (result && typeof result === 'object' && !Array.isArray(result)) {
        const candidate = result as { output?: unknown; files?: Record<string, unknown> };
        if ('output' in candidate || 'files' in candidate) {
          output = candidate.output;
          files = candidate.files;
        }
      }

      expectReportErrorCount(reportErrorCount);
      if (files) {
        for (const [fileName, value] of Object.entries(files)) {
          assertOrUpdateTextFile({
            path: path.join(fixtureDir, fileName),
            actual: formatFixtureOutput(value),
            update,
            fixtureName,
            label: fileName,
          });
        }
      }
      const hasOutputFile = files ? Object.prototype.hasOwnProperty.call(files, 'output.txt') : false;
      if (output !== undefined && !hasOutputFile) {
        assertOrUpdateTextFile({
          path: path.join(fixtureDir, 'output.txt'),
          actual: formatFixtureOutput(output),
          update,
          fixtureName,
          label: 'output',
        });
      }
    },
  });
});
