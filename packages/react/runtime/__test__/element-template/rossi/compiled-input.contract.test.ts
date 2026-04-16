import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { compileFixtureSource } from '../test-utils/debug/compiledFixtureCompiler.js';

import { adaptCompiledFixtureToRossiInput, adaptCompiledFixtureToRossiRequest } from './adaptCompiledFixture.js';
import { createCompiledArtifactAdapterSetup } from './createCompiledArtifactAdapterSetup.js';
import type {
  CompiledArtifactAdapterSetup,
  CompiledArtifactWorkspaceWriteOptions,
} from '/Users/bytedance/lynx/repos/lynx/rossi/src/runtime/compiled/index.js';
import { createLocalRossiBridge } from './localRossiBridge.js';
import type { RossiEtFixtureRequest } from './fixtureContract.js';

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
    expect(writes).toHaveLength(4);
    expect(writes[0]).toEqual({
      thread: 'main',
      code: expect.stringContaining(
        'file:///Users/bytedance/lynx/workspace.worktrees/element-template-demo/rspeedy/lynx-stack/packages/react/runtime/jsx-runtime/index.js',
      ),
      suggestedFileName: 'main-artifact.js',
    });
    expect(writes[0]?.code).toContain('__REGISTER_ELEMENT_TEMPLATES__');
    expect(writes[1]).toEqual({
      thread: 'main',
      code: expect.stringContaining('__ROSSI_COMPILED_ARTIFACT_RENDER_FIRST_SCREEN__'),
      suggestedFileName: 'main-entry.mjs',
    });
    expect(writes[1]?.code).toContain('compiledModule.mainProps ?? {"greeting":"hello"} ?? undefined');
    expect(writes[2]).toEqual({
      thread: 'background',
      code: expect.stringContaining(
        'file:///Users/bytedance/lynx/workspace.worktrees/element-template-demo/rspeedy/lynx-stack/packages/react/runtime/jsx-runtime/index.js',
      ),
      suggestedFileName: 'background-artifact.js',
    });
    expect(writes[2]?.code).toContain('__REGISTER_ELEMENT_TEMPLATES__');
    expect(writes[3]).toEqual({
      thread: 'background',
      code: expect.stringContaining('__ROSSI_COMPILED_ARTIFACT_ACCEPT_FIRST_SCREEN__'),
      suggestedFileName: 'background-entry.mjs',
    });

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

  it('uses Rossi root values when they are available and surfaces Rossi-owned adapter diagnostics', async () => {
    const mainArtifact = await compileFixtureSource(SOURCE_PATH, { target: 'LEPUS' });
    const backgroundArtifact = await compileFixtureSource(SOURCE_PATH, { target: 'JS' });
    const request = adaptCompiledFixtureToRossiRequest({
      mode: 'render',
      main: mainArtifact,
      background: backgroundArtifact,
    });
    const createCalls: unknown[] = [];
    const bridge = createLocalRossiBridge({
      rossiProjectName: 'rossi',
      compiledArtifactWorkspaceFactory: {
        async create() {
          return {
            rootDir: '/tmp/rossi-et-bridge',
            async writeModule(options: CompiledArtifactWorkspaceWriteOptions) {
              return {
                thread: options.thread,
                filePath: `/tmp/rossi-et-bridge/${options.thread}.js`,
                fileUrl: `file:///tmp/rossi-et-bridge/${options.thread}.js`,
              };
            },
            async dispose() {},
          };
        },
      },
      isolatedThreadLauncher: {
        async launch() {
          return {
            kind: 'worker-thread',
            async evaluateModule() {},
            async call() {
              return undefined;
            },
            async setGlobal() {},
            async getGlobal() {
              return undefined;
            },
            async dispose() {},
          };
        },
      },
      compiledArtifactAdapterFactory: {
        async create(setup: CompiledArtifactAdapterSetup<RossiEtFixtureRequest>) {
          createCalls.push(setup);
          return {
            handle: {
              workspace: {
                rootDir: '/tmp/rossi-et-bridge',
                async writeModule() {
                  throw new Error('not used');
                },
                async dispose() {},
              },
              threads: {
                main: {
                  kind: 'worker-thread',
                  async evaluateModule() {},
                  async call() {
                    return undefined;
                  },
                  async setGlobal() {},
                  async getGlobal() {
                    return undefined;
                  },
                  async dispose() {},
                },
              },
              async dispose() {},
            },
            mainSource: {
              async renderFirstScreen() {
                return {
                  ok: false,
                  diagnostics: [
                    {
                      level: 'error',
                      code: 'compiled-artifact-runtime-adapter-missing',
                      message: 'not implemented yet',
                      detail: {
                        adapter: 'main-source',
                      },
                    },
                  ],
                };
              },
            },
          };
        },
      },
    });

    const result = await bridge.runCompiledFixture(request);

    expect(bridge.supportsCompiledArtifactSubstrate).toBe(true);
    expect(createCalls).toHaveLength(1);
    expect(result.status).toBe('failed');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'compiled-artifact-runtime-adapter-missing',
      }),
    ]);
  });

  it('maps Rossi runtime throws into structured bridge diagnostics', async () => {
    const mainArtifact = await compileFixtureSource(SOURCE_PATH, { target: 'LEPUS' });
    const backgroundArtifact = await compileFixtureSource(SOURCE_PATH, { target: 'JS' });
    const request = adaptCompiledFixtureToRossiRequest({
      mode: 'render',
      main: mainArtifact,
      background: backgroundArtifact,
    });
    const bridge = createLocalRossiBridge({
      rossiProjectName: 'rossi',
      compiledArtifactWorkspaceFactory: {
        async create() {
          return {
            rootDir: '/tmp/rossi-et-bridge',
            async writeModule(options: CompiledArtifactWorkspaceWriteOptions) {
              return {
                thread: options.thread,
                filePath: `/tmp/rossi-et-bridge/${options.thread}.js`,
                fileUrl: `file:///tmp/rossi-et-bridge/${options.thread}.js`,
              };
            },
            async dispose() {},
          };
        },
      },
      isolatedThreadLauncher: {
        async launch() {
          return {
            kind: 'worker-thread',
            async evaluateModule() {},
            async call() {
              return undefined;
            },
            async setGlobal() {},
            async getGlobal() {
              return undefined;
            },
            async dispose() {},
          };
        },
      },
      compiledArtifactAdapterFactory: {
        async create(_setup: CompiledArtifactAdapterSetup<RossiEtFixtureRequest>) {
          return {
            handle: {
              workspace: {
                rootDir: '/tmp/rossi-et-bridge',
                async writeModule() {
                  throw new Error('not used');
                },
                async dispose() {},
              },
              threads: {
                main: {
                  kind: 'worker-thread',
                  async evaluateModule() {},
                  async call() {
                    return undefined;
                  },
                  async setGlobal() {},
                  async getGlobal() {
                    return undefined;
                  },
                  async dispose() {},
                },
              },
              async dispose() {},
            },
            mainSource: {
              async renderFirstScreen() {
                throw new Error('render exploded');
              },
            },
          };
        },
      },
    });

    const result = await bridge.runCompiledFixture(request);

    expect(result.status).toBe('failed');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'rossi-et-local-bridge-runtime-threw',
        detail: expect.objectContaining({
          stage: 'render-first-screen',
          errorMessage: 'render exploded',
        }),
      }),
    ]);
  });

  it('keeps cleanup throws inside structured bridge diagnostics', async () => {
    const mainArtifact = await compileFixtureSource(SOURCE_PATH, { target: 'LEPUS' });
    const backgroundArtifact = await compileFixtureSource(SOURCE_PATH, { target: 'JS' });
    const request = adaptCompiledFixtureToRossiRequest({
      mode: 'render',
      main: mainArtifact,
      background: backgroundArtifact,
    });
    const bridge = createLocalRossiBridge({
      rossiProjectName: 'rossi',
      compiledArtifactWorkspaceFactory: {
        async create() {
          return {
            rootDir: '/tmp/rossi-et-bridge',
            async writeModule(options: CompiledArtifactWorkspaceWriteOptions) {
              return {
                thread: options.thread,
                filePath: `/tmp/rossi-et-bridge/${options.thread}.js`,
                fileUrl: `file:///tmp/rossi-et-bridge/${options.thread}.js`,
              };
            },
            async dispose() {},
          };
        },
      },
      isolatedThreadLauncher: {
        async launch() {
          return {
            kind: 'worker-thread',
            async evaluateModule() {},
            async call() {
              return undefined;
            },
            async setGlobal() {},
            async getGlobal() {
              return undefined;
            },
            async dispose() {},
          };
        },
      },
      compiledArtifactAdapterFactory: {
        async create(_setup: CompiledArtifactAdapterSetup<RossiEtFixtureRequest>) {
          return {
            handle: {
              workspace: {
                rootDir: '/tmp/rossi-et-bridge',
                async writeModule() {
                  throw new Error('not used');
                },
                async dispose() {},
              },
              threads: {
                main: {
                  kind: 'worker-thread',
                  async evaluateModule() {},
                  async call() {
                    return undefined;
                  },
                  async setGlobal() {},
                  async getGlobal() {
                    return undefined;
                  },
                  async dispose() {},
                },
              },
              async dispose() {
                throw new Error('dispose exploded');
              },
            },
            mainSource: {
              async renderFirstScreen() {
                return {
                  ok: false,
                  diagnostics: [
                    {
                      level: 'error',
                      code: 'compiled-artifact-runtime-adapter-missing',
                      message: 'not implemented yet',
                    },
                  ],
                };
              },
            },
          };
        },
      },
    });

    const result = await bridge.runCompiledFixture(request);

    expect(result.status).toBe('failed');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'compiled-artifact-runtime-adapter-missing',
      }),
      expect.objectContaining({
        code: 'rossi-et-local-bridge-runtime-threw',
        detail: expect.objectContaining({
          stage: 'dispose',
          errorMessage: 'dispose exploded',
        }),
      }),
    ]);
  });
});
