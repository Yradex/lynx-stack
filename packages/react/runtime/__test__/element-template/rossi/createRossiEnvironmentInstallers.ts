import type { ThreadEnvironmentInstaller } from '/Users/bytedance/lynx/repos/lynx/rossi/src/runtime/compiled/index.js';

import type { RossiEtFixtureRequest } from './fixtureContract.js';

function readThreadAssembly(
  request: RossiEtFixtureRequest,
  threadKind: 'main' | 'background',
) {
  return threadKind === 'main'
    ? request.assembly.environment.main
    : request.assembly.environment.background;
}

function readMainThreadAssembly(request: RossiEtFixtureRequest) {
  return request.assembly.environment.main;
}

async function installCommonThreadGlobals(options: {
  thread: Parameters<ThreadEnvironmentInstaller<RossiEtFixtureRequest>['install']>[0];
  flags: {
    lepus: boolean;
    js: boolean;
    mainThread: boolean;
    background: boolean;
  };
  assembly: NonNullable<ReturnType<typeof readThreadAssembly>>;
}): Promise<void> {
  await options.thread.setGlobal('__LEPUS__', options.flags.lepus);
  await options.thread.setGlobal('__JS__', options.flags.js);
  await options.thread.setGlobal('__MAIN_THREAD__', options.flags.mainThread);
  await options.thread.setGlobal('__BACKGROUND__', options.flags.background);
  await options.thread.setGlobal('__USE_ELEMENT_TEMPLATE__', true);
  await options.thread.setGlobal(
    '__ROSSI_ET_INSTALL_ELEMENT_TEMPLATE_NATIVE_SURFACE__',
    options.assembly.installElementTemplateNativeSurface,
  );
  await options.thread.setGlobal(
    '__ROSSI_ET_INSTALL_ELEMENT_TEMPLATE_REGISTRY__',
    options.assembly.installElementTemplateRegistry,
  );
  await options.thread.setGlobal(
    '__ROSSI_ET_INSTALL_RENDER_PAGE_ENTRYPOINT__',
    options.assembly.installRenderPageEntrypoint,
  );
  if (options.assembly.props) {
    await options.thread.setGlobal('__ROSSI_ET_PROPS__', options.assembly.props);
  }
}

/**
 * These installers translate ET-side environment hints into Rossi's generic
 * thread-setup seam. They install globals the future substrate can rely on,
 * while leaving render/update lifecycle ownership inside Rossi.
 */
export function createMainThreadEnvironmentInstaller(): ThreadEnvironmentInstaller<RossiEtFixtureRequest> {
  return {
    async install(thread, options) {
      const assembly = readMainThreadAssembly(options.request);

      await installCommonThreadGlobals({
        thread,
        flags: {
          lepus: true,
          js: false,
          mainThread: true,
          background: false,
        },
        assembly,
      });
    },
  };
}

export function createBackgroundThreadEnvironmentInstaller(): ThreadEnvironmentInstaller<RossiEtFixtureRequest> {
  return {
    async install(thread, options) {
      const assembly = readThreadAssembly(options.request, 'background');
      if (!assembly) {
        return;
      }

      await installCommonThreadGlobals({
        thread,
        flags: {
          lepus: false,
          js: true,
          mainThread: false,
          background: true,
        },
        assembly,
      });
    },
  };
}

export function createRossiEnvironmentInstallers() {
  return {
    main: createMainThreadEnvironmentInstaller(),
    background: createBackgroundThreadEnvironmentInstaller(),
  };
}
