import type {
  CompiledArtifactAdapterSetup,
  CompiledArtifactWorkspaceFactory,
} from '/Users/bytedance/lynx/repos/lynx/rossi/src/runtime/compiled/index.js';
import type { IsolatedThreadLauncher } from '/Users/bytedance/lynx/repos/lynx/rossi/src/runtime/isolated/index.js';

import type { RossiEtFixtureRequest } from './fixtureContract.js';
import { createRossiArtifactMaterializer } from './createRossiArtifactMaterializer.js';
import { createRossiEnvironmentInstallers } from './createRossiEnvironmentInstallers.js';

/**
 * This helper is the ET-side join point with Rossi's compiled-artifact
 * contracts. It packages ET-owned assembly hints into the generic substrate
 * setup Rossi's future adapter factory can consume.
 */
export function createCompiledArtifactAdapterSetup(options: {
  request: RossiEtFixtureRequest;
  workspaceFactory: CompiledArtifactWorkspaceFactory;
  launcher: IsolatedThreadLauncher;
}): CompiledArtifactAdapterSetup<RossiEtFixtureRequest> {
  const installers = createRossiEnvironmentInstallers();

  return {
    request: options.request,
    workspaceFactory: options.workspaceFactory,
    launcher: options.launcher,
    materializer: createRossiArtifactMaterializer(),
    installers: {
      main: installers.main,
      ...(options.request.input.background
        ? { background: installers.background }
        : {}),
    },
  };
}
