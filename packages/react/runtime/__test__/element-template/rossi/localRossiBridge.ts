import type {
  CompiledArtifactAdapterFactory,
  CompiledArtifactWorkspaceFactory,
} from '/Users/bytedance/lynx/repos/lynx/rossi/src/runtime/compiled/index.js';
import type { TraceEvent } from '/Users/bytedance/lynx/repos/lynx/rossi/src/core/types.js';
import type { DualThreadRunResult } from '/Users/bytedance/lynx/repos/lynx/rossi/src/runtime/dual-thread/types.js';
import type { IsolatedThreadLauncher } from '/Users/bytedance/lynx/repos/lynx/rossi/src/runtime/isolated/index.js';

import { createCompiledArtifactAdapterSetup } from './createCompiledArtifactAdapterSetup.js';
import type { RossiEtFixtureRequest, RossiEtObservedResult } from './fixtureContract.js';

export interface RossiRootModuleLike {
  rossiProjectName?: unknown;
  load?: unknown;
  DualThreadOrchestrator?: unknown;
  Bridge?: unknown;
  HostTreeProjection?: unknown;
  compiledArtifactAdapterFactory?: unknown;
  compiledArtifactWorkspaceFactory?: unknown;
  isolatedThreadLauncher?: unknown;
}

export interface RossiEtLocalBridge {
  kind: 'et-test-local-bridge';
  projectName: string | null;
  supportsCompiledArtifactSubstrate: boolean;
  runCompiledFixture(request: RossiEtFixtureRequest): Promise<RossiEtObservedResult>;
}

function createFailedResult(
  diagnostics: RossiEtObservedResult['diagnostics'],
): RossiEtObservedResult {
  return {
    status: 'failed',
    runner: 'rossi',
    tree: null,
    trace: [],
    diagnostics: [...diagnostics],
  };
}

function createThrownFailureResult(
  request: RossiEtFixtureRequest,
  stage: 'create' | 'render-first-screen' | 'bootstrap' | 'dispose',
  error: unknown,
): RossiEtObservedResult {
  return createFailedResult([
    {
      level: 'error',
      code: 'rossi-et-local-bridge-runtime-threw',
      message: `Rossi compiled-artifact ${stage} threw before producing structured diagnostics.`,
      detail: {
        mode: request.input.mode,
        hasBackgroundArtifact: !!request.input.background,
        stage,
        errorName: error instanceof Error ? error.name : null,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    },
  ]);
}

function appendCleanupFailure(
  current: RossiEtObservedResult | null,
  disposeFailure: RossiEtObservedResult,
): RossiEtObservedResult {
  if (current === null) {
    return disposeFailure;
  }

  const disposeDiagnostics = [...disposeFailure.diagnostics];
  if (current.status === 'failed') {
    return {
      ...current,
      diagnostics: [...current.diagnostics, ...disposeDiagnostics],
    };
  }

  return {
    status: 'failed',
    runner: current.runner,
    tree: current.tree,
    trace: current.trace,
    diagnostics: [...current.diagnostics, ...disposeDiagnostics],
  };
}

function readCompiledArtifactAdapterFactory(
  rossiModule: RossiRootModuleLike,
): CompiledArtifactAdapterFactory | null {
  const candidate = rossiModule.compiledArtifactAdapterFactory;
  if (
    candidate
    && typeof candidate === 'object'
    && 'create' in candidate
    && typeof candidate.create === 'function'
  ) {
    return candidate as CompiledArtifactAdapterFactory;
  }

  return null;
}

function readCompiledArtifactWorkspaceFactory(
  rossiModule: RossiRootModuleLike,
): CompiledArtifactWorkspaceFactory | null {
  const candidate = rossiModule.compiledArtifactWorkspaceFactory;
  if (
    candidate
    && typeof candidate === 'object'
    && 'create' in candidate
    && typeof candidate.create === 'function'
  ) {
    return candidate as CompiledArtifactWorkspaceFactory;
  }

  return null;
}

function readIsolatedThreadLauncher(
  rossiModule: RossiRootModuleLike,
): IsolatedThreadLauncher | null {
  const candidate = rossiModule.isolatedThreadLauncher;
  if (
    candidate
    && typeof candidate === 'object'
    && 'launch' in candidate
    && typeof candidate.launch === 'function'
  ) {
    return candidate as IsolatedThreadLauncher;
  }

  return null;
}

function readDualThreadOrchestrator(
  rossiModule: RossiRootModuleLike,
):
  | (new(options: {
    bridge: object;
    mainThreadSource: object;
    backgroundProducer: object;
    projection: object;
  }) => { run(): Promise<DualThreadRunResult> })
  | null
{
  const candidate = rossiModule.DualThreadOrchestrator;
  return typeof candidate === 'function' ? candidate as never : null;
}

function readBridgeConstructor(
  rossiModule: RossiRootModuleLike,
): (new() => object) | null {
  const candidate = rossiModule.Bridge;
  return typeof candidate === 'function' ? candidate as never : null;
}

function readHostTreeProjectionConstructor(
  rossiModule: RossiRootModuleLike,
): (new() => object) | null {
  const candidate = rossiModule.HostTreeProjection;
  return typeof candidate === 'function' ? candidate as never : null;
}

function normalizeFixtureTrace(trace: readonly TraceEvent[]): unknown[] {
  return trace
    .filter(event => event.phase === 'first-screen-render')
    .map(event => ({
      phase: event.phase,
    }));
}

/**
 * Keep the first bridge local to the ET test area so Rossi's global public
 * surface does not need to change before the contract is proven useful.
 */
export function createLocalRossiBridge(
  rossiModule: RossiRootModuleLike,
): RossiEtLocalBridge {
  const projectName = typeof rossiModule.rossiProjectName === 'string'
    ? rossiModule.rossiProjectName
    : null;
  const adapterFactory = readCompiledArtifactAdapterFactory(rossiModule);
  const workspaceFactory = readCompiledArtifactWorkspaceFactory(rossiModule);
  const launcher = readIsolatedThreadLauncher(rossiModule);
  const Orchestrator = readDualThreadOrchestrator(rossiModule);
  const Bridge = readBridgeConstructor(rossiModule);
  const HostTreeProjection = readHostTreeProjectionConstructor(rossiModule);
  const supportsCompiledArtifactSubstrate = !!adapterFactory && !!workspaceFactory && !!launcher;

  return {
    kind: 'et-test-local-bridge',
    projectName,
    supportsCompiledArtifactSubstrate,
    async runCompiledFixture(request) {
      if (adapterFactory && workspaceFactory && launcher) {
        let adapter:
          | Awaited<ReturnType<CompiledArtifactAdapterFactory['create']>>
          | null = null;
        let result: RossiEtObservedResult | null = null;

        try {
          try {
            adapter = await adapterFactory.create(
              createCompiledArtifactAdapterSetup({
                request,
                workspaceFactory,
                launcher,
              }),
            );
          } catch (error) {
            result = createThrownFailureResult(request, 'create', error);
          }

          if (result === null && adapter !== null) {
            if (Orchestrator && Bridge && HostTreeProjection && adapter.backgroundProducer) {
              try {
                const orchestrator = new Orchestrator({
                  bridge: new Bridge(),
                  mainThreadSource: adapter.mainSource,
                  backgroundProducer: adapter.backgroundProducer,
                  projection: new HostTreeProjection(),
                });
                const runResult = await orchestrator.run();
                if (runResult.status !== 'ok') {
                  result = createFailedResult(runResult.diagnostics);
                } else {
                  const tree = await adapter.handle.threads.main.call(
                    '__ROSSI_COMPILED_ARTIFACT_READ_PAGE_JSX__',
                    [],
                  );
                  result = {
                    status: 'ok',
                    runner: 'rossi',
                    tree: typeof tree === 'string' ? tree : null,
                    trace: normalizeFixtureTrace(runResult.trace),
                    diagnostics: runResult.diagnostics,
                  };
                }
              } catch (error) {
                result = createThrownFailureResult(request, 'render-first-screen', error);
              }
            } else {
              try {
                const renderResult = await adapter.mainSource.renderFirstScreen();
                if (!renderResult.ok) {
                  result = createFailedResult(renderResult.diagnostics);
                }
              } catch (error) {
                result = createThrownFailureResult(request, 'render-first-screen', error);
              }
            }
          }

          if (result === null) {
            result = {
              status: 'scaffold',
              runner: 'rossi',
              tree: null,
              trace: [],
              diagnostics: [
                {
                  level: 'info',
                  code: 'rossi-et-local-bridge-observation-unimplemented',
                  message:
                    'Rossi substrate wiring is now active, but ET-facing observation assembly is not implemented yet.',
                  detail: {
                    mode: request.input.mode,
                    hasBackgroundArtifact: !!request.input.background,
                  },
                },
              ],
            };
          }
        } finally {
          if (adapter !== null) {
            try {
              await adapter.handle.dispose();
            } catch (error) {
              result = appendCleanupFailure(
                result,
                createThrownFailureResult(request, 'dispose', error),
              );
            }
          }
        }

        return result ?? createThrownFailureResult(
          request,
          'dispose',
          new Error('Rossi ET bridge reached an unexpected empty result state.'),
        );
      }

      return {
        status: 'scaffold',
        runner: 'rossi',
        tree: null,
        trace: [],
        diagnostics: [
          {
            level: 'info',
            code: 'rossi-et-local-bridge-unimplemented',
            message:
              'The ET-local Rossi bridge is only documenting the intended compiled-input plus execution-assembly handoff. No real Rossi substrate or runtime adapter is wired yet.',
            detail: {
              mode: request.input.mode,
              hasBackgroundArtifact: !!request.input.background,
              materializer: request.assembly.materializer.kind,
              mainEnvironment: request.assembly.environment.main.thread,
              hasBackgroundEnvironment: !!request.assembly.environment.background,
              supportsCompiledArtifactSubstrate,
            },
          },
        ],
      };
    },
  };
}
