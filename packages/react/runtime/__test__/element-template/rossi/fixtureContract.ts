export type RossiEtCompiledTarget = 'LEPUS' | 'JS' | 'MIXED';

export interface RossiEtCompiledArtifact {
  code: string;
  elementTemplates: unknown[];
  target: RossiEtCompiledTarget;
}

export interface RossiEtCompiledInput {
  mode: 'render' | 'patch' | 'interaction';
  main: RossiEtCompiledArtifact;
  background?: RossiEtCompiledArtifact;
  props?: {
    main?: Record<string, unknown>;
    background?: Record<string, unknown>;
  };
}

export interface RossiEtFixtureRequest {
  input: RossiEtCompiledInput;
  assembly: {
    materializer: {
      kind: 'et-test-artifact-materializer';
      ownership: 'caller';
      workspaceLayout: 'per-thread-entry-modules';
      entryExports: {
        componentExport: 'App';
        mainPropsExport: 'mainProps';
        backgroundPropsExport: 'backgroundProps';
      };
    };
    environment: {
      main: {
        thread: 'main';
        installThreadFlags: true;
        installElementTemplateNativeSurface: true;
        installElementTemplateRegistry: true;
        installRenderPageEntrypoint: true;
        props?: Record<string, unknown>;
      };
      background?: {
        thread: 'background';
        installThreadFlags: true;
        installElementTemplateNativeSurface: true;
        installElementTemplateRegistry: true;
        installRenderPageEntrypoint: false;
        props?: Record<string, unknown>;
      };
    };
  };
}

export interface RossiEtExpectation {
  treePath?: string;
  tracePath?: string;
  diagnosticsPath?: string;
}

export interface RossiEtExpectedOutputs {
  tree?: string;
  trace?: unknown;
  diagnostics?: unknown;
}

export interface RossiEtObservedResult {
  status: 'scaffold';
  runner: 'rossi';
  tree: string | null;
  trace: unknown[];
  diagnostics: unknown[];
}
