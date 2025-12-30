// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

export function serializeToJSX(element: any, indent: string = ''): string {
  if (!element) return '';
  if (element.type === 'rawText') {
    return `${indent}<raw-text text="${element.text}" />`;
  }

  let tag = element.tag || element.type || 'unknown';
  let attributes = { ...(element.attributes || element.parts || element.props || {}) };
  const children = element.children || [];
  const slots = element.slots || {};

  const allChildren: any[] = [...children];
  Object.keys(slots).sort().forEach(slotId => {
    allChildren.push(...slots[slotId]);
  });

  if (tag === 'slot') {
    return allChildren
      .map((child) => serializeToJSX(child, indent))
      .filter(Boolean)
      .join('\n');
  }

  const attrStr = Object.entries(attributes)
    .map(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        return ` ${key}={${JSON.stringify(value)}}`;
      }
      return ` ${key}="${value}"`;
    })
    .join('');

  if (allChildren.length === 0) {
    return `${indent}<${tag}${attrStr} />`;
  }

  const childrenStr = allChildren
    .map((child) => serializeToJSX(child, indent + '  '))
    .join('\n');

  return `${indent}<${tag}${attrStr}>\n${childrenStr}\n${indent}</${tag}>`;
}

export function serializeBackgroundTree(node: any, indent = ''): string {
  let type = node.type;
  // Normalize template keys for stability if needed, but here they seem deterministic
  // if (type.startsWith('_et_')) type = '_et_ANY';

  let attrStr = '';
  for (const [key, value] of Object.entries(node.attributes)) {
    if (key === 'children') continue;
    attrStr += ` ${key}=${JSON.stringify(value)}`;
  }

  let res = `${indent}<${type}${attrStr}`;
  if (type === 'raw-text') {
    res += ` text=${JSON.stringify(node.text)}`;
  }

  let child = node.firstChild;
  if (child) {
    res += '>\n';
    while (child) {
      res += serializeBackgroundTree(child, indent + '  ');
      child = child.nextSibling;
    }
    res += `${indent}</${type}>\n`;
  } else {
    res += ' />\n';
  }
  return res;
}
