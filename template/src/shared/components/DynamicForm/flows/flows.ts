import type { BuiltForm } from '@shared/components/DynamicForm/types';
import { fromJson } from '@shared/components/DynamicForm/utils/fromJson';

import { demoCodeFlow } from './demoCodeFlow';
import { demoJsonFlow } from './demoJsonFlow';

// THIS FILE CHANGES PER PROJECT: it lists the flows the `DynamicFormFlow` route can open.
// A code flow comes from `defineFlow`; a JSON flow is bundled here, or fetched and passed to
// `fromJson` by your own code.

const demoJson = fromJson(demoJsonFlow);

const FLOWS: Readonly<Record<string, BuiltForm | undefined>> = {
  [demoCodeFlow.id]: demoCodeFlow,
  'demo-json': demoJson.success ? demoJson.form : undefined,
};

/** The flow with this id, or `undefined` when there is none (or its document was refused). */
export function getFlow(flowId: string): BuiltForm | undefined {
  return Object.hasOwn(FLOWS, flowId) ? FLOWS[flowId] : undefined;
}
