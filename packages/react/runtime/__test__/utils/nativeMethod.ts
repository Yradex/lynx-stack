/*
// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
*/
import { format as prettyFormat, plugins } from 'pretty-format';
// import { globalEnvManager } from "./inject";
const { ReactTestComponent } = plugins;

interface Element {
  type: string;
  props: any;
  children: any[];
}

interface ElementOptions {
  onCreateElement?: ((element: Element) => void) | undefined;
}

export let uiSignNext: number = 0;
export const parentMap: WeakMap<Element, Element> = new WeakMap<Element, Element>();
// export const elementPrototype = Object.create(null);
export const options: ElementOptions = {};

export const elementTree: any = new (class {
  root: Element | undefined = undefined;

  __CreatePage(_tag: string, parentComponentUniqueId: number): Element {
    return (this.root ??= this.__CreateElement('page', parentComponentUniqueId));
  }

  __CreateRawText(text: string): Element {
    const r = this.__CreateElement('raw-text', 0);
    // @ts-ignore
    r.props.text = text;
    this.root ??= r;
    return r;
  }

  __GetElementUniqueID(e: Element): number {
    // @ts-ignore
    return (e as any).$$uiSign;
  }

  __SetClasses(e: Element, cls: string): void {
    e.props.class = cls;
  }

  __CreateElement(tag: string, parentComponentUniqueId: number): Element {
    const json: any = {
      type: tag,
      children: [],
      props: {},
      parentComponentUniqueId,
    };
    Object.defineProperty(json, '$$typeof', {
      value: Symbol.for('react.test.json'),
    });
    Object.defineProperty(json, '$$uiSign', {
      value: uiSignNext++,
    });

    options.onCreateElement?.(json);

    this.root ??= json;
    return json;
  }

  __CreateView(parentComponentUniqueId: number): Element {
    return this.__CreateElement('view', parentComponentUniqueId);
  }
  __FirstElement(e: Element): Element {
    return e.children[0];
  }

  __CreateText(parentComponentUniqueId: number): Element {
    const r = this.__CreateElement('text', parentComponentUniqueId);
    this.root ??= r;
    return r;
  }

  __CreateImage(parentComponentUniqueId: number): Element {
    const r = this.__CreateElement('image', parentComponentUniqueId);
    this.root ??= r;
    return r;
  }

  __CreateWrapperElement(parentComponentUniqueId: number): Element {
    return this.__CreateElement('wrapper', parentComponentUniqueId);
  }

  __AddInlineStyle(e: Element, key: number, value: string): void {
    const style = e.props.style || {};
    style[key] = value;
    e.props.style = style;
  }

  __AppendElement(parent: Element, child: Element): void {
    parent.children.push(child);
    parentMap.set(child, parent);
  }

  __SetCSSId(e: Element | Element[], id: string, entryName?: string): void {
    const cssId = `${entryName ?? 'default-entry-from-native'}:${id}`;
    if (Array.isArray(e)) {
      e.forEach(item => {
        item.props.cssId = cssId;
      });
    } else {
      e.props.cssId = cssId;
    }
  }

  __SetAttribute(e: Element, key: string, value: any): void {
    if (
      key === 'style'
      || key === 'class'
      || key === 'className'
      || key === 'key'
      || key === 'id'
      || key === 'ref'
      || (/^data-/.exec(key))
      || (/^(bind|catch|global-bind|capture-bind|capture-catch)[A-Za-z]/.exec(
        key,
      ))
    ) {
      throw new Error(`Cannot use __SetAttribute for "${key}"`);
    }

    if (key === 'update-list-info') {
      (e.props[key] ??= []).push(value);
      return;
    }

    if (value === null) {
      delete e.props[key];
      return;
    }
    e.props[key] = value;
  }

  __GetAttributes(e: Element): Record<string, any> {
    return e.props;
  }

  __AddEvent(e: Element, eventType: string, eventName: string, event: string | Record<string, any>): void {
    if (typeof event === 'undefined') {
      if (e.props.event) {
        delete e.props.event[`${eventType}:${eventName}`];
      }
      return;
    }
    if (typeof event !== 'string' && event['type'] === undefined) {
      throw new Error(`event must be string, but got ${typeof event}`);
      // console.error(`event must be string, but got ${typeof event}`);
    }
    (e.props.event ??= {})[`${eventType}:${eventName}`] = event;
  }

  __GetEvent(
    e: Element,
    eventType: string,
    eventName: string,
  ): { type: string; name: string; jsFunction: any } | undefined {
    const jsFunction = e.props.event?.[`${eventType}:${eventName}`];
    if (typeof jsFunction !== 'undefined') {
      return {
        type: eventType,
        name: eventName,
        jsFunction,
      };
    }
    return undefined;
  }

  __SetID(e: Element, id: string): void {
    e.props.id = id;
  }

  __SetInlineStyles(e: Element, styles: string | Record<string, string>): void {
    e.props.style = styles;
  }

  __AddDataset(e: Element, key: string, value: string): void {
    (e.props.dataset ??= {})[key] = value;
  }

  __SetDataset(e: Element, dataset: any): void {
    e.props.dataset = dataset;
  }

  __SetGestureDetector(e: Element, id: number, type: number, config: any, relationMap: Record<string, number[]>): void {
    e.props.gesture = {
      id,
      type,
      config,
      relationMap,
    };
  }

  __GetDataset(e: Element): any {
    return e.props.dataset;
  }

  __RemoveElement(parent: Element, child: Element): void {
    parent.children.forEach((ch, index) => {
      if (ch === child) {
        parent.children.splice(index, 1);
        return;
      }
    });
    parentMap.delete(child);
  }

  __InsertElementBefore(
    parent: Element,
    child: Element,
    ref?: Element | number,
  ): void {
    if (typeof ref === 'undefined') {
      parent.children.push(child);
    } else {
      const index = parent.children.indexOf(ref);
      parent.children.splice(index, 0, child);
    }
    parentMap.set(child, parent);
  }

  __ReplaceElement(newElement: Element, oldElement: Element): void {
    const parent = parentMap.get(oldElement);
    if (!parent) {
      /* c8 ignore next */
      throw new Error('unreachable');
    }
    parent.children.forEach((ch, index) => {
      if (ch === oldElement) {
        parent.children[index] = newElement;
        return;
      }
    });
  }

  __FlushElementTree(): void {}

  __UpdateListComponents(_list: Element, _components: string[]): void {}

  __UpdateListCallbacks(
    list: Element,
    componentAtIndex: (
      list: Element,
      listID: number,
      cellIndex: number,
      operationID: number,
      enable_reuse_notification: boolean,
    ) => void,
    enqueueComponent: (list: Element, listID: number, sign: number) => void,
    componentAtIndexes: (
      list: Element,
      listID: number,
      cellIndexes: number[],
      operationIDs: number[],
      enableReuseNotification: boolean,
      asyncFlush: boolean,
    ) => void,
  ): void {
    Object.defineProperties(list, {
      componentAtIndex: {
        enumerable: false,
        configurable: true,
        value: componentAtIndex,
      },
      enqueueComponent: {
        enumerable: false,
        configurable: true,
        value: enqueueComponent,
      },
      componentAtIndexes: {
        enumerable: false,
        configurable: true,
        value: componentAtIndexes,
      },
    });
  }

  __CreateList(
    parentComponentUniqueId: number,
    componentAtIndex: any,
    enqueueComponent: any,
    componentAtIndexes: any,
  ): Element {
    const e = this.__CreateElement('list', parentComponentUniqueId);

    Object.defineProperties(e, {
      componentAtIndex: {
        enumerable: false,
        configurable: true,
        value: componentAtIndex,
      },
      enqueueComponent: {
        enumerable: false,
        configurable: true,
        value: enqueueComponent,
      },
      componentAtIndexes: {
        enumerable: false,
        configurable: true,
        value: componentAtIndexes,
      },
    });

    return e;
  }

  __GetTag(ele: Element): string {
    return ele.type;
  }

  __GetAttributeByName(ele: Element, name: string): any {
    return ele.props[name];
  }

  clear(): void {
    this.root = undefined as any;
    uiSignNext = 0;
  }

  toTree(): Element | undefined {
    return this.root;
  }

  sendEvent(e: Element, eventType: string, eventName: string, data: any): void {
    const eventHandler = e.props?.event?.[`${eventType}:${eventName}`];
    if (eventHandler) {
      // @ts-ignore
      globalThis.lynxCoreInject.tt.publishEvent(eventHandler, data);
    }
  }

  getElementById(id: string): Element | undefined {
    const find = (e: Element): Element | undefined => {
      if (typeof e === 'string') {
        return;
      }
      if (e.props.id === id) {
        return e;
      }
      for (const child of e.children) {
        const result = find(child);
        if (result) {
          return result;
        }
      }
      return undefined;
    };
    return find(this.root!);
  }

  triggerComponentAtIndex(e: Element, index: number, ...args: any[]): number {
    // @ts-ignore
    const { componentAtIndex, $$uiSign } = e;
    return componentAtIndex(e, $$uiSign, index, ...args);
  }

  triggerComponentAtIndexes(
    e: Element,
    indexes: number[],
    operationIDs: number[],
    enableReuseNotification: boolean,
    asyncFlush: boolean,
  ): void {
    // @ts-ignore
    const { componentAtIndexes, $$uiSign } = e;
    return componentAtIndexes(e, $$uiSign, indexes, operationIDs, enableReuseNotification, asyncFlush);
  }

  triggerEnqueueComponent(e: Element, uiSign: number): void {
    // @ts-ignore
    const { enqueueComponent } = e;
    enqueueComponent(e, (e as any).$$uiSign, uiSign);
  }

  toJSON(): string {
    return prettyFormat(this.toTree(), {
      plugins: [ReactTestComponent],
      printFunctionName: false,
    });
  }
})();

export const nativeMethodQueue: [string, any[]][] = [];

Object.defineProperty(nativeMethodQueue, 'clear', {
  value: () => {
    nativeMethodQueue.length = 0;
  },
});

export function withQueue<T>(
  name: string,
  fn: (this: T, ...args: any[]) => any,
): (this: T, ...args: any[]) => any {
  return function(this: T, ...args: any[]) {
    nativeMethodQueue.push([name, args]);
    return fn.apply(this, args);
  };
}

// export function withLog<T>(name: string, fn: (this: T, ...args: any[]) => any) {
//   return function (this: T, ...args: any[]) {
//     // console.log(name, ...args);
//     try {
//       // console2.profile(name);
//       return fn.apply(this, args);
//     } finally {
//       // console2.profileEnd(name);
//     }
//   };
// }

export function waitSchedule(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      setTimeout(resolve);
    });
  });
}
