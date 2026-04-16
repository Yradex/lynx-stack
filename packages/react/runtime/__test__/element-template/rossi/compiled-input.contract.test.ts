import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { compileFixtureSource } from '../test-utils/debug/compiledFixtureCompiler.js';

import { adaptCompiledFixtureToRossiInput, adaptCompiledFixtureToRossiRequest } from './adaptCompiledFixture.js';
import { createCompiledArtifactAdapterSetup } from './createCompiledArtifactAdapterSetup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.resolve(__dirname, './fixtures/render/basic-page');
const SOURCE_PATH = path.join(FIXTURE_DIR, 'source.tsx');

function summarizeCompiledInput(input: ReturnType<typeof adaptCompiledFixtureToRossiInput>) {
  return {
    mode: input.mode,
    main: {
      target: input.main.target,
      codeLength: input.main.code.length,
      hasJsxRuntimeImport: input.main.code.includes('@lynx-js/react/jsx-runtime'),
      templateCount: input.main.elementTemplates.length,
      templateIds: input.main.elementTemplates.map(template =>
        typeof template === 'object'
          && template !== null
          && 'templateId' in template
          && typeof template.templateId === 'string'
          ? template.templateId
          : '[unknown]'
      ),
    },
    background: input.background
      ? {
        target: input.background.target,
        codeLength: input.background.code.length,
        hasJsxRuntimeImport: input.background.code.includes('@lynx-js/react/jsx-runtime'),
        templateCount: input.background.elementTemplates.length,
        templateIds: input.background.elementTemplates.map(template =>
          typeof template === 'object'
            && template !== null
            && 'templateId' in template
            && typeof template.templateId === 'string'
            ? template.templateId
            : '[unknown]'
        ),
      }
      : null,
  };
}

function summarizeExecutionAssembly(
  request: ReturnType<typeof adaptCompiledFixtureToRossiRequest>,
) {
  return {
    materializer: request.assembly.materializer,
    main: request.assembly.environment.main,
    background: request.assembly.environment.background ?? null,
  };
}

describe('Rossi compiled input contract', () => {
  it('runs ET transform and produces a stable compiled-artifact handoff shape', async () => {
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

    const summary = summarizeCompiledInput(compiledInput);
    const assemblySummary = summarizeExecutionAssembly(request);

    expect(summary.mode).toBe('render');
    expect(summary.main.target).toBe('LEPUS');
    expect(summary.main.codeLength).toBeGreaterThan(0);
    expect(summary.main.hasJsxRuntimeImport).toBe(true);
    expect(summary.main.templateCount).toBeGreaterThan(0);
    expect(summary.main.templateIds.every(id => typeof id === 'string' && id.length > 0)).toBe(true);

    expect(summary.background).not.toBeNull();
    expect(summary.background?.target).toBe('JS');
    expect(summary.background?.codeLength).toBeGreaterThan(0);
    expect(summary.background?.hasJsxRuntimeImport).toBe(true);
    expect(summary.background?.templateCount).toBeGreaterThan(0);
    expect(summary.background?.templateIds.every(id => typeof id === 'string' && id.length > 0)).toBe(true);

    expect(summary.background?.templateIds).toEqual(summary.main.templateIds);

    expect(assemblySummary.materializer).toEqual({
      kind: 'et-test-artifact-materializer',
      ownership: 'caller',
      workspaceLayout: 'per-thread-entry-modules',
      entryExports: {
        componentExport: 'App',
        mainPropsExport: 'mainProps',
        backgroundPropsExport: 'backgroundProps',
      },
    });
    expect(assemblySummary.main).toEqual({
      thread: 'main',
      installThreadFlags: true,
      installElementTemplateNativeSurface: true,
      installElementTemplateRegistry: true,
      installRenderPageEntrypoint: true,
    });
    expect(assemblySummary.background).toEqual({
      thread: 'background',
      installThreadFlags: true,
      installElementTemplateNativeSurface: true,
      installElementTemplateRegistry: true,
      installRenderPageEntrypoint: false,
    });
  });

  it('adapts ET fixture requests into Rossi compiled-artifact substrate contracts', async () => {
    const mainArtifact = await compileFixtureSource(SOURCE_PATH, { target: 'LEPUS' });
    const backgroundArtifact = await compileFixtureSource(SOURCE_PATH, { target: 'JS' });
    const request = adaptCompiledFixtureToRossiRequest({
      mode: 'render',
      main: mainArtifact,
      background: backgroundArtifact,
      props: {
        main: { greeting: 'hello' },
        background: { seed: 1 },
      },
    });

    const writes: Array<{ thread: string; code: string; suggestedFileName?: string }> = [];
    const globals = new Map<string, unknown>();
    const setup = createCompiledArtifactAdapterSetup({
      request,
      workspaceFactory: {
        async create() {
          return {
            rootDir: '/tmp/rossi-et-contract',
            async writeModule(options) {
              writes.push(options);
              return {
                thread: options.thread,
                filePath: `/tmp/rossi-et-contract/${options.thread}.js`,
                fileUrl: `file:///tmp/rossi-et-contract/${options.thread}.js`,
              };
            },
            async dispose() {},
          };
        },
      },
      launcher: {
        async launch() {
          return {
            kind: 'worker-thread',
            async evaluateModule() {},
            async call() {
              return undefined;
            },
            async setGlobal(name, value) {
              globals.set(name, value);
            },
            async getGlobal(name) {
              return globals.get(name);
            },
            async dispose() {},
          };
        },
      },
    });

    const workspace = await setup.workspaceFactory.create({
      workspaceRoot: '/tmp',
      namespace: 'rossi-et-contract',
    });
    const materialized = await setup.materializer.materialize(workspace, request);

    expect(materialized).toEqual({
      main: {
        entryUrl: 'file:///tmp/rossi-et-contract/main.js',
      },
      background: {
        entryUrl: 'file:///tmp/rossi-et-contract/background.js',
      },
    });
    expect(writes).toEqual([
      {
        thread: 'main',
        code: request.input.main.code,
        suggestedFileName: 'main-entry.js',
      },
      {
        thread: 'background',
        code: request.input.background?.code ?? '',
        suggestedFileName: 'background-entry.js',
      },
    ]);

    const thread = await setup.launcher.launch({
      name: 'rossi-et-main',
      cwd: '/tmp',
    });
    await setup.installers.main.install(thread, {
      threadKind: 'main',
      request,
    });
    await setup.installers.background?.install(thread, {
      threadKind: 'background',
      request,
    });

    expect(globals.get('__LEPUS__')).toBe(false);
    expect(globals.get('__JS__')).toBe(true);
    expect(globals.get('__MAIN_THREAD__')).toBe(false);
    expect(globals.get('__BACKGROUND__')).toBe(true);
    expect(globals.get('__USE_ELEMENT_TEMPLATE__')).toBe(true);
    expect(globals.get('__ROSSI_ET_INSTALL_ELEMENT_TEMPLATE_NATIVE_SURFACE__')).toBe(true);
    expect(globals.get('__ROSSI_ET_INSTALL_ELEMENT_TEMPLATE_REGISTRY__')).toBe(true);
    expect(globals.get('__ROSSI_ET_INSTALL_RENDER_PAGE_ENTRYPOINT__')).toBe(false);
    expect(globals.get('__ROSSI_ET_PROPS__')).toEqual({ seed: 1 });
  });
});
