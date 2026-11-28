// Ticking a step of any checklist (server/kernel/steps.js).

import { saved } from '../../shared/contract/reply.js';
import { tick } from '../kernel/steps.js';

export const STEPS_HANDLERS = {
  'steps.tick': (ctx, input) => saved(input.step, tick(ctx, { ...input, ref: input.ref || '', done: Boolean(input.done) })),
};
