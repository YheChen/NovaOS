/** VM fault taxonomy. Milestone 1 raises a subset; the rest arrive with later instructions. */
export type VmFaultCode =
  | 'invalid-opcode'
  | 'invalid-operand'
  | 'segmentation-fault'
  | 'divide-by-zero'
  | 'stack-overflow'
  | 'stack-underflow';

export interface VmFault {
  readonly code: VmFaultCode;
  readonly pc: number;
  readonly message: string;
}

export function vmFault(code: VmFaultCode, pc: number, message: string): VmFault {
  return { code, pc, message };
}
