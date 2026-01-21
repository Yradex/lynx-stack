// Copyright 2025 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

export type SerializedETInstance = [
  number,
  string,
  Record<number, SerializedETInstance[]> | undefined,
  Record<number, Record<string, unknown>> | undefined,
];

export type ElementTemplatePatchStream = (number | string | null | unknown[])[];

export interface ElementTemplateFlushOptions {
  // triggerLayout?: boolean;
  // operationID?: any;
  // __lynx_timing_flag?: string;
  // nativeUpdateDataOrder?: number;
  // elementID?: number;
  // listID?: number;
  // listReuseNotification?: {
  //   listElement: FiberElement;
  //   itemKey: string;
  // };
  pipelineOptions?: PipelineOptions;
  // elementIDs?: number[];
  // operationIDs?: any[];
  // asyncFlush?: boolean;
  // triggerDataUpdated?: boolean;
}

export interface ElementTemplateCommitContext {
  patches: ElementTemplatePatchStream;
  flushOptions: ElementTemplateFlushOptions;
}
