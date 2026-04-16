import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { compileFixtureSource } from '../test-utils/debug/compiledFixtureCompiler.js';

import { adaptCompiledFixtureToRossiInput, adaptCompiledFixtureToRossiRequest } from './adaptCompiledFixture.js';
import { createLocalRossiBridge } from './localRossiBridge.js';
import { readFixtureExpectations } from './readFixtureExpectations.js';
import { runRossiFixture } from './runRossiFixture.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.resolve(__dirname, './fixtures/render/basic-page');
const SOURCE_PATH = path.join(FIXTURE_DIR, 'source.tsx');

describe.skip('Rossi render fixture scaffold', () => {
  it('shows the intended compile -> adapt -> run -> compare shape', async () => {
    const mainArtifact = await compileFixtureSource(SOURCE_PATH, { target: 'LEPUS' });
    const backgroundArtifact = await compileFixtureSource(SOURCE_PATH, { target: 'JS' });
    const compiledInput = adaptCompiledFixtureToRossiInput({
      mode: 'render',
      main: mainArtifact,
      background: backgroundArtifact,
    });
    const request = adaptCompiledFixtureToRossiRequest({
      mode: 'render',
      main: mainArtifact,
      background: backgroundArtifact,
    });
    const expected = readFixtureExpectations(FIXTURE_DIR);

    const rossi = await import('/Users/bytedance/lynx/repos/lynx/rossi/src/index.ts');
    const bridge = createLocalRossiBridge(rossi);
    const result = await runRossiFixture({
      request,
      bridge,
    });

    expect(FIXTURE_DIR).toContain('/rossi/fixtures/render/basic-page');
    expect(compiledInput.main.target).toBe('LEPUS');
    expect(compiledInput.background?.target).toBe('JS');
    expect(typeof rossi.rossiProjectName).toBe('string');
    expect(bridge.kind).toBe('et-test-local-bridge');
    expect(bridge.projectName).toBe('rossi');
    expect(bridge.supportsCompiledArtifactSubstrate).toBe(true);
    expect(request.assembly.materializer.kind).toBe('et-test-artifact-materializer');
    expect(request.assembly.environment.main.installRenderPageEntrypoint).toBe(true);
    expect(request.assembly.environment.background?.installRenderPageEntrypoint).toBe(false);
    expect(result.runner).toBe('rossi');
    expect(result.status).toBe('failed');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'compiled-artifact-runtime-adapter-missing',
      }),
    ]);
    expect(expected.tree).toContain('Hello Rossi');
    expect(expected.trace).toEqual([{ phase: 'first-screen-render' }]);
    expect(expected.diagnostics).toEqual([]);
  });
});
