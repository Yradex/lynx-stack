import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe } from 'vitest';

import { assertOrUpdateTextFile, expectReportErrorCount, runFixtureTests } from '../../../test-utils/fixtureRunner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '../../../fixtures/background/instance');

describe('Background instance fixtures', () => {
  runFixtureTests({
    fixturesRoot: FIXTURES_DIR,
    allowEmpty: true,
    async run({ fixtureDir, fixtureName, update }) {
      const modulePath = path.join(fixtureDir, 'case.ts');
      if (!fs.existsSync(modulePath)) {
        throw new Error(`Missing case.ts for fixture "${fixtureName}".`);
      }

      const mod = await import(`${modulePath}?t=${Date.now()}`);
      if (typeof mod.run !== 'function') {
        throw new Error(`Fixture "${fixtureName}" must export a run() function.`);
      }

      const result = await mod.run();
      const output = typeof mod.normalize === 'function' ? mod.normalize(result) : result;
      const serialized = typeof mod.serialize === 'function'
        ? String(mod.serialize(output))
        : JSON.stringify(output, null, 2);
      const outputPath = path.join(fixtureDir, mod.outputFile ?? 'output.json');

      assertOrUpdateTextFile({
        path: outputPath,
        actual: serialized,
        update,
        fixtureName,
        label: mod.outputLabel ?? 'output',
      });

      if (!mod.skipReportErrorCheck) {
        const expectedCalls = typeof mod.reportErrorCalls === 'number' ? mod.reportErrorCalls : 0;
        expectReportErrorCount(expectedCalls);
      }
    },
  });
});
