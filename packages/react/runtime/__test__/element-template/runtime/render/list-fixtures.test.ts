import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe } from 'vitest';

import { runRenderFixtureTests } from '../../test-utils/debug/renderFixtureRunner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '../../fixtures/render-list');

describe('List render fixtures', () => {
  runRenderFixtureTests(FIXTURES_DIR);
});
