import type { CompiledFixtureArtifact } from '../test-utils/debug/compiledFixtureCompiler.js';

import type { RossiEtCompiledArtifact, RossiEtCompiledInput, RossiEtFixtureRequest } from './fixtureContract.js';

function toRossiEtCompiledArtifact(artifact: CompiledFixtureArtifact): RossiEtCompiledArtifact {
  return {
    code: artifact.code,
    elementTemplates: artifact.elementTemplates,
    target: artifact.target,
  };
}

function createFixtureAssembly(
  input: RossiEtCompiledInput,
): RossiEtFixtureRequest['assembly'] {
  return {
    materializer: {
      kind: 'et-test-artifact-materializer',
      ownership: 'caller',
      workspaceLayout: 'per-thread-entry-modules',
      entryExports: {
        componentExport: 'App',
        mainPropsExport: 'mainProps',
        backgroundPropsExport: 'backgroundProps',
      },
    },
    environment: {
      main: {
        thread: 'main',
        installThreadFlags: true,
        installElementTemplateNativeSurface: true,
        installElementTemplateRegistry: true,
        installRenderPageEntrypoint: true,
        ...(input.props?.main ? { props: input.props.main } : {}),
      },
      ...(input.background
        ? {
          background: {
            thread: 'background' as const,
            installThreadFlags: true,
            installElementTemplateNativeSurface: true,
            installElementTemplateRegistry: true,
            installRenderPageEntrypoint: false,
            ...(input.props?.background ? { props: input.props.background } : {}),
          },
        }
        : {}),
    },
  };
}

export function adaptCompiledFixtureToRossiInput(options: {
  main: CompiledFixtureArtifact;
  background?: CompiledFixtureArtifact;
  mode?: RossiEtCompiledInput['mode'];
  props?: RossiEtCompiledInput['props'];
}): RossiEtCompiledInput {
  const {
    main,
    background,
    mode = 'render',
    props,
  } = options;

  return {
    mode,
    main: toRossiEtCompiledArtifact(main),
    ...(background ? { background: toRossiEtCompiledArtifact(background) } : {}),
    ...(props ? { props } : {}),
  };
}

export function adaptCompiledFixtureToRossiRequest(options: {
  main: CompiledFixtureArtifact;
  background?: CompiledFixtureArtifact;
  mode?: RossiEtCompiledInput['mode'];
  props?: RossiEtCompiledInput['props'];
}): RossiEtFixtureRequest {
  const input = adaptCompiledFixtureToRossiInput(options);

  return {
    input,
    assembly: createFixtureAssembly(input),
  };
}
