import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setupPage } from '../../../../src/element-template/runtime/page/page.js';
import { setRoot } from '../../../../src/element-template/runtime/page/root-instance.js';
import { renderMainThread } from '../../../../src/element-template/runtime/render/render-main-thread.js';
import { resetTemplateId } from '../../../../src/element-template/runtime/template/handle.js';
import { ElementTemplateRegistry } from '../../../../src/element-template/runtime/template/registry.js';
import { clearTemplates, registerBuiltinRawTextTemplate, registerTemplates } from '../../test-utils/debug/registry.js';
import { serializeToJSX } from '../../test-utils/debug/serializer.js';
import { installMockNativePapi, type MockNativePapi } from '../../test-utils/mock/mockNativePapi.js';

declare global {
  var __USE_ELEMENT_TEMPLATE__: boolean | undefined;
}

interface RegisteredTemplateFixture {
  templateId: string;
  compiledTemplate: unknown;
}

interface TransformResult {
  code?: string;
  elementTemplates?: RegisteredTemplateFixture[];
}

interface RenderedListFixture {
  page: {
    type: 'page';
    id: string;
    children: unknown[];
  };
  dispatchEvent: ReturnType<typeof vi.fn>;
  listElement: unknown;
}

const TRANSFORM_OPTIONS = {
  mode: 'test',
  pluginName: 'test-plugin',
  filename: 'index.tsx',
  sourcemap: false,
  cssScope: false,
  snapshot: {
    preserveJsx: false,
    runtimePkg: '@lynx-js/react/element-template/internal',
    filename: 'index.tsx',
    target: 'LEPUS',
    experimentalEnableElementTemplate: true,
  },
  shake: false,
  compat: true,
  directiveDCE: false,
  defineDCE: false,
  worklet: false,
  refresh: false,
} as const;

describe('ET list first-screen contract', () => {
  let mockNativePapi: MockNativePapi;

  beforeEach(() => {
    vi.resetAllMocks();
    mockNativePapi = installMockNativePapi({ clearTemplatesOnCleanup: true });
    clearTemplates();
    ElementTemplateRegistry.clear();
    resetTemplateId();
    registerBuiltinRawTextTemplate();

    globalThis.__USE_ELEMENT_TEMPLATE__ = true;
    globalThis.__LEPUS__ = true;
    globalThis.__JS__ = false;
    globalThis.__MAIN_THREAD__ = true;
    globalThis.__BACKGROUND__ = false;

    const globalWithInject = globalThis as typeof globalThis & {
      lynxCoreInject?: {
        tt?: {
          _params?: {
            initData: Record<string, unknown>;
            updateData: Record<string, unknown>;
          };
        };
      };
    };
    globalWithInject.lynxCoreInject ??= {};
    globalWithInject.lynxCoreInject.tt ??= {};
    globalWithInject.lynxCoreInject.tt._params ??= { initData: {}, updateData: {} };
  });

  afterEach(() => {
    clearTemplates();
    ElementTemplateRegistry.clear();
    resetTemplateId();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates a list container and materializes mapped list-item cells on demand', async () => {
    const { dispatchEvent, listElement, page } = await compileAndRender(`
      export function App() {
        const users = ['Ada', 'Linus'];
        return (
          <view>
            <list>
              {users.map((name) => (
                <list-item item-key={name}>
                  <text>{name}</text>
                </list-item>
              ))}
            </list>
          </view>
        );
      }
    `);

    expect(mockNativePapi.nativeLog.some(([name]) => name === '__CreateList')).toBe(true);
    expect(page.children).toHaveLength(1);
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'rLynxElementTemplateHydrate',
        data: expect.any(Array),
      }),
    );
    // Match the Snapshot list baseline: the container exists first, cells are pulled by native callbacks.
    expect(serializeToJSX(listElement)).toBe('<list />');

    mockNativePapi.triggerComponentAtIndex(listElement, 0, 11);
    expect(serializeToJSX(listElement).match(/<list-item/g)?.length ?? 0).toBe(1);
    mockNativePapi.triggerComponentAtIndex(listElement, 0, 12);
    expect(serializeToJSX(listElement).match(/<list-item/g)?.length ?? 0).toBe(1);

    mockNativePapi.triggerComponentAtIndexes(listElement, [0, 1], [21, 22], false, false);

    const listJsx = serializeToJSX(listElement);
    expect(listJsx.match(/<list-item/g)?.length ?? 0).toBe(2);
    expect(listJsx).toContain('text="Ada"');
    expect(listJsx).toContain('text="Linus"');
  });

  it('supports fragment-wrapped list-item sequences', async () => {
    const { listElement } = await compileAndRender(`
      export function App() {
        const users = ['Ada', 'Linus'];
        return (
          <view>
            <list>
              <>
                {users.map((name) => (
                  <list-item item-key={name}>
                    <text>{name}</text>
                  </list-item>
                ))}
              </>
            </list>
          </view>
        );
      }
    `);

    expect(mockNativePapi.nativeLog.some(([name]) => name === '__CreateList')).toBe(true);
    // Match the Snapshot list baseline: the container exists first, cells are pulled by native callbacks.
    expect(serializeToJSX(listElement)).toBe('<list />');

    mockNativePapi.triggerComponentAtIndex(listElement, 0, 11);
    mockNativePapi.triggerComponentAtIndex(listElement, 1, 22);

    const listJsx = serializeToJSX(listElement);
    expect(listJsx.match(/<list-item/g)?.length ?? 0).toBe(2);
    expect(listJsx).toContain('text="Ada"');
    expect(listJsx).toContain('text="Linus"');
  });

  it('skips null branches while preserving remaining list-item order', async () => {
    const { listElement } = await compileAndRender(`
      export function App() {
        const users = [
          { key: 'Ada', visible: true },
          { key: 'Skip', visible: false },
          { key: 'Linus', visible: true },
        ];
        return (
          <view>
            <list>
              {users.map((user) => user.visible ? (
                <list-item item-key={user.key}>
                  <text>{user.key}</text>
                </list-item>
              ) : null)}
            </list>
          </view>
        );
      }
    `);

    expect(mockNativePapi.nativeLog.some(([name]) => name === '__CreateList')).toBe(true);
    // Match the Snapshot list baseline: the container exists first, cells are pulled by native callbacks.
    expect(serializeToJSX(listElement)).toBe('<list />');

    mockNativePapi.triggerComponentAtIndex(listElement, 0, 11);
    mockNativePapi.triggerComponentAtIndex(listElement, 1, 22);

    const listJsx = serializeToJSX(listElement);
    expect(listJsx.match(/<list-item/g)?.length ?? 0).toBe(2);
    expect(listJsx).toContain('text="Ada"');
    expect(listJsx).toContain('text="Linus"');
    expect(listJsx).not.toContain('text="Skip"');
  });

  async function compileAndRender(source: string): Promise<RenderedListFixture> {
    const { transformReactLynx } = await import('@lynx-js/react-transform');
    const result = await transformReactLynx(
      source,
      TRANSFORM_OPTIONS as Parameters<typeof transformReactLynx>[1],
    ) as TransformResult;

    registerTemplates(result.elementTemplates ?? []);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lynx-et-list-'));
    const tempImportPath = path.join(tempDir, 'temp_actual.js');
    try {
      let outputCode = result.code ?? '';
      outputCode = outputCode.replace(
        /from ["']react\/jsx-runtime["']/g,
        'from "@lynx-js/react/jsx-runtime"',
      );
      fs.writeFileSync(tempImportPath, outputCode);

      const module = (await import(
        `${pathToFileURL(tempImportPath).href}?t=${Date.now()}`
      )) as { App: unknown };
      const dispatchEvent = vi.fn();
      const page = { type: 'page' as const, id: '0', children: [] as unknown[] };
      setRoot({ __jsx: { type: module.App, props: {}, key: null, ref: null } });
      setupPage(page as unknown as FiberElement);
      globalThis.lynx = {
        ...(globalThis.lynx ?? {}),
        reportError: vi.fn(),
        getJSContext: vi.fn(() => ({ dispatchEvent })),
      } as typeof lynx;

      renderMainThread();

      const listElement = findFirstTag(page, 'list');
      if (!listElement) {
        throw new Error('Expected renderMainThread() to materialize a native list container.');
      }

      return {
        page,
        dispatchEvent,
        listElement,
      };
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  function findFirstTag(node: unknown, tag: string): unknown {
    if (!node || typeof node !== 'object') {
      return undefined;
    }

    const record = node as {
      tag?: string;
      type?: string;
      children?: unknown[];
    };
    if (record.tag === tag || record.type === tag) {
      return node;
    }

    for (const child of record.children ?? []) {
      const found = findFirstTag(child, tag);
      if (found) {
        return found;
      }
    }

    return undefined;
  }
});
