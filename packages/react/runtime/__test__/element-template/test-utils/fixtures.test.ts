import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe } from 'vitest';

import { runFixtureTests } from '../test-utils/fixtureRunner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures/utils');

describe('Test utils fixtures', () => {
  runFixtureTests({
    fixturesRoot: FIXTURES_DIR,
    allowEmpty: true,
    async run() {
      throw new Error('Fixture runner not implemented for Test utils fixtures.');
    },
  });
});
