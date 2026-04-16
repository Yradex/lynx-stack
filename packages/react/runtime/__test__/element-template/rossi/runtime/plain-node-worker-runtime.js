function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createEventContext() {
  const listeners = new Map();
  const outboundEvents = [];

  function readListeners(type) {
    const existing = listeners.get(type);
    if (existing) {
      return existing;
    }

    const created = new Set();
    listeners.set(type, created);
    return created;
  }

  return {
    target: {
      addEventListener(type, listener) {
        readListeners(type).add(listener);
      },
      removeEventListener(type, listener) {
        listeners.get(type)?.delete(listener);
      },
      dispatchEvent(event) {
        outboundEvents.push(cloneJson(event));
        return 0;
      },
      postMessage(message) {
        outboundEvents.push({ type: 'message', data: cloneJson(message) });
      },
    },
    emit(event) {
      const typedListeners = listeners.get(event.type);
      if (!typedListeners) {
        return;
      }

      for (const listener of typedListeners) {
        listener(event);
      }
    },
    drain() {
      const events = outboundEvents.slice();
      outboundEvents.length = 0;
      return events;
    },
  };
}

function formatAttributeValue(value) {
  return typeof value === 'string' ? `"${value}"` : `{${JSON.stringify(value)}}`;
}

function serializeNodeToJsx(node, depth) {
  const indent = '  '.repeat(depth);
  const attributes = Object.entries(node.attributes ?? {}).map(
    ([key, value]) => `${key}=${formatAttributeValue(value)}`,
  );
  const openTag = attributes.length > 0
    ? `<${node.type} ${attributes.join(' ')}`
    : `<${node.type}`;

  if (!Array.isArray(node.children) || node.children.length === 0) {
    return `${indent}${openTag} />`;
  }

  const childLines = node.children.map(child => serializeNodeToJsx(child, depth + 1));
  return [
    `${indent}${openTag}>`,
    ...childLines,
    `${indent}</${node.type}>`,
  ].join('\n');
}

function createHostTreeNode(node, nextIdRef) {
  const id = `node-${nextIdRef.value++}`;
  const attributes = { ...(node.attributes ?? {}) };
  const text = typeof attributes.text === 'string' ? attributes.text : undefined;
  if (text !== undefined) {
    delete attributes.text;
  }

  return {
    id,
    tag: node.type,
    attrs: attributes,
    ...(text !== undefined ? { text } : {}),
    children: (node.children ?? []).map(child => createHostTreeNode(child, nextIdRef)),
  };
}

function instantiateCompiledNode(compiledNode, attributeSlots) {
  const attributes = {};
  for (const descriptor of compiledNode.attributesArray ?? []) {
    if (descriptor.kind !== 'attribute' || typeof descriptor.key !== 'string') {
      continue;
    }

    if (descriptor.binding === 'static') {
      attributes[descriptor.key] = descriptor.value;
      continue;
    }

    if (descriptor.binding === 'slot') {
      const slotIndex = descriptor.attrSlotIndex ?? -1;
      const slotValue = attributeSlots[slotIndex];
      if (slotValue !== undefined && slotValue !== null) {
        attributes[descriptor.key] = slotValue;
      }
    }
  }

  return {
    type: compiledNode.tag,
    attributes,
    children: (compiledNode.children ?? []).map(child => instantiateCompiledNode(child, [])),
  };
}

function createTemplateRegistry() {
  const templates = new Map();

  return {
    register(entries) {
      for (const entry of entries) {
        if (entry && typeof entry.templateId === 'string') {
          templates.set(entry.templateId, entry.compiledTemplate);
        }
      }
    },
    instantiate(templateKey, attributeSlots, options) {
      const compiledTemplate = templates.get(templateKey);
      if (!compiledTemplate) {
        throw new Error(`ElementTemplate '${templateKey}' is not registered.`);
      }

      return {
        templateId: templateKey,
        attributes: {},
        children: [],
        __attributeSlots: Array.isArray(attributeSlots) ? cloneJson(attributeSlots) : [],
        __options: options ?? undefined,
        ...instantiateCompiledNode(compiledTemplate, attributeSlots ?? []),
      };
    },
    serialize(instance) {
      const attributeSlots = instance.templateId === '__et_builtin_raw_text__'
        ? [String(instance.attributes?.text ?? '')]
        : cloneJson(instance.__attributeSlots ?? []);

      return {
        templateKey: instance.templateId,
        attributeSlots,
        elementSlots: [],
        options: cloneJson(instance.__options ?? { handleId: instance.__options?.handleId ?? 0 }),
      };
    },
  };
}

export function setupPlainNodeWorkerRuntime(options) {
  const threadKind = options.threadKind;
  const templateRegistry = createTemplateRegistry();
  const jsContext = createEventContext();
  const coreContext = createEventContext();
  const lifecycleEvents = [];
  const reportErrors = [];
  let nextNodeId = 1;
  let page = null;

  function attachNodeId(node) {
    if (!node || typeof node !== 'object' || typeof node.__mockNativeId === 'number') {
      return;
    }

    Object.defineProperty(node, '__mockNativeId', {
      value: nextNodeId++,
      writable: true,
      configurable: true,
    });
  }

  function ensureAttributes(node) {
    if (!node.attributes || typeof node.attributes !== 'object') {
      node.attributes = {};
    }
    return node.attributes;
  }

  const lynx = {
    __initData: {},
    reportError(error) {
      reportErrors.push(error instanceof Error ? error : new Error(String(error)));
    },
    getJSContext() {
      return jsContext.target;
    },
    getCoreContext() {
      return coreContext.target;
    },
    performance: {
      isProfileRecording() {
        return false;
      },
    },
  };

  globalThis.__DEV__ = true;
  globalThis.__PROFILE__ = false;
  globalThis.__ALOG__ = false;
  globalThis.__ENABLE_SSR__ = false;
  globalThis.__USE_ELEMENT_TEMPLATE__ = true;
  globalThis.__FIRST_SCREEN_SYNC_TIMING__ = 'immediately';
  globalThis.__LEPUS__ = threadKind === 'main';
  globalThis.__JS__ = threadKind === 'background';
  globalThis.__MAIN_THREAD__ = threadKind === 'main';
  globalThis.__BACKGROUND__ = threadKind === 'background';
  globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
  globalThis.cancelAnimationFrame = handle => clearTimeout(handle);
  globalThis.lynxCoreInject = {
    tt: {
      _params: {
        initData: {},
        updateData: {},
      },
    },
  };
  globalThis.lynx = lynx;
  globalThis.SystemInfo = {};
  globalThis._ReportError = function reportError(error) {
    lynx.reportError(error);
  };
  globalThis.__OnLifecycleEvent = function onLifecycleEvent(event) {
    lifecycleEvents.push(cloneJson(event));
  };
  globalThis.__REGISTER_ELEMENT_TEMPLATES__ = templates => {
    templateRegistry.register(templates);
  };

  globalThis.__CreatePage = function createPage(id, cssId) {
    page = {
      type: 'page',
      id,
      cssId,
      attributes: {},
      children: [],
    };
    attachNodeId(page);
    return page;
  };

  globalThis.__AppendElement = function appendElement(parent, child) {
    if (!parent.children) {
      parent.children = [];
    }
    attachNodeId(child);
    parent.children.push(child);
  };

  globalThis.__CreateElementTemplate = function createElementTemplate(
    templateKey,
    _bundleUrl,
    attributeSlots,
    _elementSlots,
    options,
  ) {
    const instance = templateRegistry.instantiate(templateKey, attributeSlots, options);
    attachNodeId(instance);
    return instance;
  };

  globalThis.__SerializeElementTemplate = function serializeElementTemplate(instance) {
    return templateRegistry.serialize(instance);
  };

  globalThis.__SetAttributeOfElementTemplate = function setAttributeOfElementTemplate(
    instance,
    slotIndex,
    value,
  ) {
    if (!Array.isArray(instance.__attributeSlots)) {
      instance.__attributeSlots = [];
    }
    instance.__attributeSlots[slotIndex] = value;
  };

  globalThis.__InsertNodeToElementTemplate = function insertNodeToElementTemplate() {};
  globalThis.__RemoveNodeFromElementTemplate = function removeNodeFromElementTemplate() {};
  globalThis.__FlushElementTree = function flushElementTree() {};
  globalThis.__GetElementUniqueID = function getElementUniqueId(node) {
    attachNodeId(node);
    return node?.__mockNativeId ?? 0;
  };
  globalThis.__SetAttribute = function setAttribute(node, key, value) {
    const attributes = ensureAttributes(node);
    attributes[key] = value;
  };
  globalThis.__SetCSSId = function setCssId(nodeOrNodes, value, entryName) {
    const cssId = `${entryName ?? 'default-entry-from-native'}:${value}`;
    const apply = node => {
      const attributes = ensureAttributes(node);
      attributes.cssId = cssId;
    };

    if (Array.isArray(nodeOrNodes)) {
      nodeOrNodes.forEach(apply);
      return;
    }

    apply(nodeOrNodes);
  };
  globalThis.__SetID = function setId(node, value) {
    const attributes = ensureAttributes(node);
    attributes.id = value;
  };
  globalThis.__SetClasses = function setClasses(node, value) {
    const attributes = ensureAttributes(node);
    attributes.class = value;
  };
  globalThis.__SetInlineStyles = function setInlineStyles(node, value) {
    const attributes = ensureAttributes(node);
    attributes.style = value;
  };
  globalThis.__AddDataset = function addDataset(node, key, value) {
    const attributes = ensureAttributes(node);
    const dataset = attributes.dataset && typeof attributes.dataset === 'object'
      ? attributes.dataset
      : {};
    dataset[key] = value;
    attributes.dataset = dataset;
  };
  globalThis.__SetDataset = function setDataset(node, value) {
    const attributes = ensureAttributes(node);
    attributes.dataset = value ?? {};
  };
  globalThis.__CreateList = function createList(parentComponentUniqueId) {
    const list = {
      type: 'list',
      parentComponentUniqueId,
      attributes: {},
      children: [],
    };
    attachNodeId(list);
    return list;
  };
  globalThis.__UpdateListCallbacks = function updateListCallbacks() {};
  globalThis.__GetPageElement = function getPageElement() {
    return page;
  };
  globalThis.__GetTemplateParts = function getTemplateParts() {
    return {};
  };

  return {
    emitCoreEvent(event) {
      coreContext.emit(cloneJson(event));
    },
    drainJsContextEvents() {
      return jsContext.drain();
    },
    drainCoreContextEvents() {
      return coreContext.drain();
    },
    readReportErrors() {
      return reportErrors.map(error => ({
        name: error.name,
        message: error.message,
      }));
    },
    readLifecycleEvents() {
      return lifecycleEvents.slice();
    },
    readPageJsx() {
      return page ? serializeNodeToJsx(page, 0) : '<empty>';
    },
    readFirstScreenPayload() {
      if (!page) {
        return {
          root: null,
          jsReadyEventIdSwap: {},
        };
      }

      const nextIdRef = { value: 1 };
      return {
        root: createHostTreeNode(page, nextIdRef),
        jsReadyEventIdSwap: {},
      };
    },
    resetThreadState() {
      page = null;
      reportErrors.length = 0;
      lifecycleEvents.length = 0;
      jsContext.drain();
      coreContext.drain();
    },
  };
}
