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
  let addEventListenerCount = 0;
  let removeEventListenerCount = 0;

  currentQueues = {
    jsQueue,
    coreQueue,
    jsListeners,
    coreListeners,
  };

  const add = (
    store: Map<string, Set<(event: ContextEvent) => void>>,
    type: string,
    listener: (event: ContextEvent) => void,
    isJSContext: boolean,
  ) => {
    if (!isJSContext) {
      addEventListenerCount++;
    }
    const set = store.get(type);
    if (set) {
      set.add(listener);
      return;
    }
    store.set(type, new Set([listener]));
  };

  const remove = (
    store: Map<string, Set<(event: ContextEvent) => void>>,
    type: string,
    listener: (event: ContextEvent) => void,
    isJSContext: boolean,
  ) => {
    const set = store.get(type);
    if (!set) {
      return;
    }
    const existed = set.delete(listener);
    if (existed && !isJSContext) {
      removeEventListenerCount++;
    }
    if (set.size === 0) {
      store.delete(type);
    }
  };

  const checkListenerLeaks = () => {
    if (addEventListenerCount !== removeEventListenerCount) {
      throw new Error(
        `Event listener leak detected in JS Context: addEventListener called ${addEventListenerCount} times, but removeEventListener called ${removeEventListenerCount} times.`,
      );
    }
  };

  const jsContext: ContextEventTarget = {
    addEventListener: (type, listener) => add(jsListeners, type, listener, true),
    removeEventListener: (type, listener) => remove(jsListeners, type, listener, true),
    dispatchEvent: (event) => {
      coreQueue.push(event);
      return 0;
    },
    postMessage: (message) => {
      coreQueue.push({ type: 'message', data: message });
    },
  };

  const coreContext: ContextEventTarget = {
    addEventListener: (type, listener) => add(coreListeners, type, listener, false),
    removeEventListener: (type, listener) => remove(coreListeners, type, listener, false),
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
