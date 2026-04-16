import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import type {
  ArtifactMaterializer,
  CompiledArtifactWorkspace,
} from '/Users/bytedance/lynx/repos/lynx/rossi/src/runtime/compiled/index.js';

import type { RossiEtFixtureRequest } from './fixtureContract.js';

const require = createRequire(import.meta.url);

function readSuggestedFileName(thread: 'main' | 'background', kind: 'artifact' | 'entry'): string {
  if (thread === 'main') {
    return kind === 'artifact' ? 'main-artifact.js' : 'main-entry.mjs';
  }

  return kind === 'artifact' ? 'background-artifact.js' : 'background-entry.mjs';
}

function readResolvedRuntimeUrls() {
  return {
    reactModuleUrl: pathToFileURL(require.resolve('@lynx-js/react')).href,
    jsxRuntimeUrl: pathToFileURL(require.resolve('@lynx-js/react/jsx-runtime')).href,
    internalModuleUrl: pathToFileURL(require.resolve('@lynx-js/react/internal')).href,
    elementTemplateModuleUrl: pathToFileURL(
      require.resolve('@lynx-js/react/element-template'),
    ).href,
    helperModuleUrl: pathToFileURL(
      path.resolve(
        path.dirname(new URL(import.meta.url).pathname),
        './runtime/plain-node-worker-runtime.js',
      ),
    ).href,
  };
}

function rewriteCompiledImports(code: string, urls: ReturnType<typeof readResolvedRuntimeUrls>): string {
  return code
    .replaceAll('"@lynx-js/react/jsx-runtime"', JSON.stringify(urls.jsxRuntimeUrl))
    .replaceAll('\'@lynx-js/react/jsx-runtime\'', JSON.stringify(urls.jsxRuntimeUrl))
    .replaceAll('"@lynx-js/react/internal"', JSON.stringify(urls.internalModuleUrl))
    .replaceAll('\'@lynx-js/react/internal\'', JSON.stringify(urls.internalModuleUrl))
    .replaceAll('"@lynx-js/react"', JSON.stringify(urls.reactModuleUrl))
    .replaceAll('\'@lynx-js/react\'', JSON.stringify(urls.reactModuleUrl));
}

function appendTemplateRegistration(code: string, templates: unknown[]): string {
  if (templates.length === 0) {
    return code;
  }

  return `${code}
if (globalThis.__REGISTER_ELEMENT_TEMPLATES__) {
  globalThis.__REGISTER_ELEMENT_TEMPLATES__(${JSON.stringify(templates)});
}
`;
}

function buildMainEntryCode(options: {
  helperModuleUrl: string;
  elementTemplateModuleUrl: string;
  artifactModuleUrl: string;
  props: Record<string, unknown> | undefined;
}): string {
  return `import { setupPlainNodeWorkerRuntime } from ${JSON.stringify(options.helperModuleUrl)};

const runtime = setupPlainNodeWorkerRuntime({ threadKind: 'main' });
const ElementTemplateRuntime = await import(${JSON.stringify(options.elementTemplateModuleUrl)});
const compiledModule = await import(${JSON.stringify(options.artifactModuleUrl)});

function readHydratePayload(events) {
  const hydrateEvent = events.findLast(event => event?.type === 'rLynxElementTemplateHydrate');
  return hydrateEvent?.data ?? [];
}

globalThis.__ROSSI_COMPILED_ARTIFACT_RENDER_FIRST_SCREEN__ = async function renderFirstScreen() {
  runtime.resetThreadState();

  const props = compiledModule.mainProps ?? ${JSON.stringify(options.props ?? null)} ?? undefined;
  const vnode = ElementTemplateRuntime.createElement(compiledModule.App, props ?? undefined);
  ElementTemplateRuntime.root.render(vnode);
  globalThis.renderPage(props ?? undefined);
  ElementTemplateRuntime.root.render(vnode);

  const outboundEvents = runtime.drainJsContextEvents();

  return {
    diagnostics: runtime.readReportErrors(),
    trace: [{ phase: 'first-screen-render' }],
    pageJsx: runtime.readPageJsx(),
    payload: {
      ...runtime.readFirstScreenPayload(),
      etHydratePayload: readHydratePayload(outboundEvents),
    },
  };
};

globalThis.__ROSSI_COMPILED_ARTIFACT_READ_PAGE_JSX__ = function readPageJsx() {
  return runtime.readPageJsx();
};
`;
}

function buildBackgroundEntryCode(options: {
  helperModuleUrl: string;
  elementTemplateModuleUrl: string;
  artifactModuleUrl: string;
  props: Record<string, unknown> | undefined;
}): string {
  return `import { setupPlainNodeWorkerRuntime } from ${JSON.stringify(options.helperModuleUrl)};

const runtime = setupPlainNodeWorkerRuntime({ threadKind: 'background' });
const ElementTemplateRuntime = await import(${JSON.stringify(options.elementTemplateModuleUrl)});
const compiledModule = await import(${JSON.stringify(options.artifactModuleUrl)});

const pendingUpdates = [];
const props = compiledModule.backgroundProps ?? ${JSON.stringify(options.props ?? null)} ?? undefined;

globalThis.__ROSSI_COMPILED_ARTIFACT_BOOTSTRAP__ = async function bootstrapBackground() {
  ElementTemplateRuntime.root.render(
    ElementTemplateRuntime.createElement(compiledModule.App, props ?? undefined),
  );

  return {
    diagnostics: runtime.readReportErrors(),
  };
};

globalThis.__ROSSI_COMPILED_ARTIFACT_ACCEPT_FIRST_SCREEN__ = async function acceptFirstScreen(payload) {
  runtime.emitCoreEvent({
    type: 'rLynxElementTemplateHydrate',
    data: payload?.etHydratePayload ?? [],
  });

  const updateEvents = runtime
    .drainCoreContextEvents()
    .filter(event => event?.type === 'rLynxElementTemplateUpdate');
  for (const event of updateEvents) {
    pendingUpdates.push(event.data);
  }

  return {
    diagnostics: runtime.readReportErrors(),
  };
};

globalThis.__ROSSI_COMPILED_ARTIFACT_READ_UPDATES__ = async function readUpdates() {
  const updates = pendingUpdates.slice();
  pendingUpdates.length = 0;
  return updates;
};
`;
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
      const urls = readResolvedRuntimeUrls();
      const mainArtifactEntry = await workspace.writeModule({
        thread: 'main',
        code: appendTemplateRegistration(
          rewriteCompiledImports(request.input.main.code, urls),
          request.input.main.elementTemplates,
        ),
        suggestedFileName: readSuggestedFileName('main', 'artifact'),
      });

      const mainEntry = await workspace.writeModule({
        thread: 'main',
        code: buildMainEntryCode({
          helperModuleUrl: urls.helperModuleUrl,
          elementTemplateModuleUrl: urls.elementTemplateModuleUrl,
          artifactModuleUrl: mainArtifactEntry.fileUrl,
          props: request.input.props?.main,
        }),
        suggestedFileName: readSuggestedFileName('main', 'entry'),
      });

      if (!request.input.background) {
        return {
          main: {
            entryUrl: mainEntry.fileUrl,
          },
        };
      }

      const backgroundArtifactEntry = await workspace.writeModule({
        thread: 'background',
        code: appendTemplateRegistration(
          rewriteCompiledImports(request.input.background.code, urls),
          request.input.background.elementTemplates,
        ),
        suggestedFileName: readSuggestedFileName('background', 'artifact'),
      });
      const backgroundEntry = await workspace.writeModule({
        thread: 'background',
        code: buildBackgroundEntryCode({
          helperModuleUrl: urls.helperModuleUrl,
          elementTemplateModuleUrl: urls.elementTemplateModuleUrl,
          artifactModuleUrl: backgroundArtifactEntry.fileUrl,
          props: request.input.props?.background,
        }),
        suggestedFileName: readSuggestedFileName('background', 'entry'),
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
