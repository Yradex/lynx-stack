import { afterEach, vi } from 'vitest';

export interface ContextEvent {
  type: string;
  data: unknown;
}

export interface ContextEventTarget {
  addEventListener(type: string, listener: (event: ContextEvent) => void): void;
  removeEventListener(type: string, listener: (event: ContextEvent) => void): void;
  dispatchEvent(event: ContextEvent): number;
  postMessage(message: unknown): void;
}

let currentQueues:
  | {
    jsQueue: ContextEvent[];
    coreQueue: ContextEvent[];
    jsListeners: Map<string, Set<(event: ContextEvent) => void>>;
    coreListeners: Map<string, Set<(event: ContextEvent) => void>>;
  }
  | undefined;

function flush(
  queue: ContextEvent[],
  listeners: Map<string, Set<(event: ContextEvent) => void>>,
): void {
  if (queue.length === 0) {
    return;
  }

  const events = queue.splice(0, queue.length);
  for (const event of events) {
    const set = listeners.get(event.type);
    if (!set) {
      continue;
    }
    for (const listener of set) {
      listener(event);
    }
  }
}

export function flushJSContextEvents(): void {
  if (!currentQueues) {
    return;
  }
  flush(currentQueues.jsQueue, currentQueues.jsListeners);
}

export function flushCoreContextEvents(): void {
  if (!currentQueues) {
    return;
  }
  flush(currentQueues.coreQueue, currentQueues.coreListeners);
}

export function createCrossThreadContextPair(): {
  jsContext: ContextEventTarget;
  coreContext: ContextEventTarget;
  checkListenerLeaks: () => void;
} {
  const jsListeners = new Map<string, Set<(event: ContextEvent) => void>>();
  const coreListeners = new Map<string, Set<(event: ContextEvent) => void>>();
  const jsQueue: ContextEvent[] = [];
  const coreQueue: ContextEvent[] = [];
  interface ActiveListener {
    type: string;
    listener: (event: ContextEvent) => void;
    stack: string;
  }
  const activeJSListeners = new Set<ActiveListener>();
  const activeCoreListeners = new Set<ActiveListener>();

  currentQueues = {
    jsQueue,
    coreQueue,
    jsListeners,
    coreListeners,
  };

  const add = (
    store: Map<string, Set<(event: ContextEvent) => void>>,
    activeSet: Set<ActiveListener>,
    type: string,
    listener: (event: ContextEvent) => void,
  ) => {
    const set = store.get(type);
    if (set?.has(listener)) {
      return;
    }

    const stack = new Error().stack?.split('\n').slice(2).join('\n') || '';
    activeSet.add({ type, listener, stack });

    if (set) {
      set.add(listener);
    } else {
      store.set(type, new Set([listener]));
    }
  };

  const remove = (
    store: Map<string, Set<(event: ContextEvent) => void>>,
    activeSet: Set<ActiveListener>,
    type: string,
    listener: (event: ContextEvent) => void,
  ) => {
    const set = store.get(type);
    if (!set) {
      return;
    }
    const existed = set.delete(listener);
    if (existed) {
      for (const item of activeSet) {
        if (item.type === type && item.listener === listener) {
          activeSet.delete(item);
          break;
        }
      }
    }
    if (set.size === 0) {
      store.delete(type);
    }
  };

  const checkListenerLeaks = () => {
    let errorMsg = '';
    if (activeJSListeners.size > 0) {
      errorMsg += `Event listener leak detected in JS Context (${activeJSListeners.size} leaks):\n`;
      for (const item of activeJSListeners) {
        errorMsg += `  - [${item.type}] added at:\n${item.stack}\n`;
      }
    }
    if (activeCoreListeners.size > 0) {
      errorMsg += `Event listener leak detected in Core Context (${activeCoreListeners.size} leaks):\n`;
      for (const item of activeCoreListeners) {
        errorMsg += `  - [${item.type}] added at:\n${item.stack}\n`;
      }
    }
    if (errorMsg) {
      throw new Error(errorMsg);
    }
  };

  const jsContext: ContextEventTarget = {
    addEventListener: (type, listener) => add(jsListeners, activeJSListeners, type, listener),
    removeEventListener: (type, listener) => remove(jsListeners, activeJSListeners, type, listener),
    dispatchEvent: (event) => {
      coreQueue.push(event);
      return 0;
    },
    postMessage: (message) => {
      coreQueue.push({ type: 'message', data: message });
    },
  };

  const coreContext: ContextEventTarget = {
    addEventListener: (type, listener) => add(coreListeners, activeCoreListeners, type, listener),
    removeEventListener: (type, listener) => remove(coreListeners, activeCoreListeners, type, listener),
    dispatchEvent: (event) => {
      jsQueue.push(event);
      return 0;
    },
    postMessage: (message) => {
      jsQueue.push({ type: 'message', data: message });
    },
  };

  return { jsContext, coreContext, checkListenerLeaks };
}

let isThreadContextInstalled = false;
let currentCheckListenerLeaks: (() => void) | undefined;

export function installThreadContexts(): void {
  const { jsContext, coreContext, checkListenerLeaks } = createCrossThreadContextPair();
  currentCheckListenerLeaks = checkListenerLeaks;

  const currentLynx = (globalThis as unknown as { lynx?: any }).lynx;
  const baseLynx = (currentLynx && typeof currentLynx === 'object') ? currentLynx : {};

  vi.stubGlobal('lynx', {
    ...baseLynx,
    getJSContext: () => jsContext,
    getCoreContext: () => coreContext,
  });

  if (!isThreadContextInstalled) {
    isThreadContextInstalled = true;
    afterEach(() => {
      currentCheckListenerLeaks?.();
    });
  }
}
