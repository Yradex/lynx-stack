import type {
  ArtifactMaterializer,
  CompiledArtifactWorkspace,
} from '/Users/bytedance/lynx/repos/lynx/rossi/src/runtime/compiled/index.js';

import type { RossiEtFixtureRequest } from './fixtureContract.js';

function readSuggestedFileName(thread: 'main' | 'background'): string {
  return thread === 'main' ? 'main-entry.js' : 'background-entry.js';
}

/**
 * ET fixtures describe how compiled artifacts should be written into Rossi's
 * workspace boundary, but they do not take ownership of runtime lifecycle
 * semantics after those entry modules exist.
 */
export function createRossiArtifactMaterializer(): ArtifactMaterializer<RossiEtFixtureRequest> {
  return {
    async materialize(
      workspace: CompiledArtifactWorkspace,
      request: RossiEtFixtureRequest,
    ) {
      const mainEntry = await workspace.writeModule({
        thread: 'main',
        code: request.input.main.code,
        suggestedFileName: readSuggestedFileName('main'),
      });

      if (!request.input.background) {
        return {
          main: {
            entryUrl: mainEntry.fileUrl,
          },
        };
      }

      const backgroundEntry = await workspace.writeModule({
        thread: 'background',
        code: request.input.background.code,
        suggestedFileName: readSuggestedFileName('background'),
      });

      return {
        main: {
          entryUrl: mainEntry.fileUrl,
        },
        background: {
          entryUrl: backgroundEntry.fileUrl,
        },
      };
    },
  };
}
