/**
 * Stack-slot allocation for IR temporaries.
 *
 * Code generation originally gave every temporary its own slot for the whole
 * function, so frame size grew with the number of expressions a function
 * contained rather than with how many values it needed at once. A six-line
 * function could ask for more than forty slots and fail to compile against the
 * 32-slot frame.
 *
 * This module computes real liveness over the control-flow graph, builds an
 * interference graph from it, and colours that graph greedily. Two temporaries
 * share a slot whenever their live ranges do not overlap, which is the same
 * problem a register allocator solves - only the resource being handed out is
 * a stack slot rather than a machine register.
 *
 * The allocation is safe because of a property every instruction form in this
 * IR shares: all operands are loaded into registers before the result is
 * stored. A result may therefore reuse the slot of an operand that dies at the
 * same instruction.
 */
import type { IRFunction, IRInstruction, IRTerminator, IRValueId } from './ir';

export interface SlotAllocation {
  /** Slot index per temp id, or -1 for a temp the function never references. */
  readonly slotOf: readonly number[];
  /** Distinct slots the temporaries occupy. */
  readonly slotCount: number;
}

/** Temporaries an instruction reads. */
function readsOf(ins: IRInstruction): IRValueId[] {
  switch (ins.kind) {
    case 'const':
      return [];
    case 'load':
      return [];
    case 'store':
      return [ins.value];
    case 'binary':
      return [ins.left, ins.right];
    case 'unary':
      return [ins.operand];
    case 'call':
      return [...ins.args];
    case 'loadElem':
      return [ins.index];
    case 'storeElem':
      return [ins.index, ins.value];
    case 'print':
      return [ins.value];
  }
}

/** The temporary an instruction defines, if any. */
function defOf(ins: IRInstruction): IRValueId | null {
  switch (ins.kind) {
    case 'const':
    case 'load':
    case 'binary':
    case 'unary':
    case 'loadElem':
      return ins.target;
    case 'call':
      return ins.target;
    case 'store':
    case 'storeElem':
    case 'print':
      return null;
  }
}

function terminatorReads(term: IRTerminator): IRValueId[] {
  switch (term.kind) {
    case 'return':
      return term.value === null ? [] : [term.value];
    case 'branch':
      return [term.condition];
    case 'jump':
      return [];
  }
}

function successors(term: IRTerminator): number[] {
  switch (term.kind) {
    case 'return':
      return [];
    case 'jump':
      return [term.target];
    case 'branch':
      return [term.thenBlock, term.elseBlock];
  }
}

function sameSet(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

/**
 * Assign each temporary of `fn` a stack slot, reusing slots whose previous
 * occupant is no longer live.
 */
export function allocateTempSlots(fn: IRFunction): SlotAllocation {
  const blocks = fn.blocks;
  const indexOfBlock = new Map<number, number>();
  blocks.forEach((block, index) => indexOfBlock.set(block.id, index));

  const referenced = new Set<IRValueId>();
  const noteRef = (ids: readonly IRValueId[]): void => {
    for (const id of ids) referenced.add(id);
  };

  // Per-block upward-exposed uses and definitions.
  const useSets: Array<Set<IRValueId>> = [];
  const defSets: Array<Set<IRValueId>> = [];

  for (const block of blocks) {
    const use = new Set<IRValueId>();
    const def = new Set<IRValueId>();
    const definedSoFar = new Set<IRValueId>();

    for (const ins of block.instructions) {
      const reads = readsOf(ins);
      noteRef(reads);
      for (const read of reads) if (!definedSoFar.has(read)) use.add(read);
      const defined = defOf(ins);
      if (defined !== null) {
        referenced.add(defined);
        definedSoFar.add(defined);
        def.add(defined);
      }
    }

    const termReads = terminatorReads(block.terminator);
    noteRef(termReads);
    for (const read of termReads) if (!definedSoFar.has(read)) use.add(read);

    useSets.push(use);
    defSets.push(def);
  }

  // Backward dataflow to a fixpoint:
  //   live_out[b] = union of live_in[s] for every successor s
  //   live_in[b]  = use[b] + (live_out[b] - def[b])
  const liveIn: Array<Set<IRValueId>> = blocks.map(() => new Set());
  const liveOut: Array<Set<IRValueId>> = blocks.map(() => new Set());

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      const block = blocks[i];
      if (!block) continue;

      const out = new Set<IRValueId>();
      for (const successorId of successors(block.terminator)) {
        const successorIndex = indexOfBlock.get(successorId);
        if (successorIndex === undefined) continue;
        for (const value of liveIn[successorIndex] ?? []) out.add(value);
      }

      const next = new Set(out);
      for (const defined of defSets[i] ?? []) next.delete(defined);
      for (const used of useSets[i] ?? []) next.add(used);

      if (!sameSet(next, liveIn[i] ?? new Set()) || !sameSet(out, liveOut[i] ?? new Set())) {
        changed = true;
        liveIn[i] = next;
        liveOut[i] = out;
      }
    }
  }

  // Interference: walk each block backwards, carrying the live set.
  const interference = new Map<IRValueId, Set<IRValueId>>();
  const edge = (a: IRValueId, b: IRValueId): void => {
    if (a === b) return;
    let neighbours = interference.get(a);
    if (!neighbours) {
      neighbours = new Set();
      interference.set(a, neighbours);
    }
    neighbours.add(b);
  };

  for (const value of referenced) if (!interference.has(value)) interference.set(value, new Set());

  blocks.forEach((block, index) => {
    const live = new Set<IRValueId>(liveOut[index] ?? []);

    for (const read of terminatorReads(block.terminator)) live.add(read);

    for (let i = block.instructions.length - 1; i >= 0; i -= 1) {
      const ins = block.instructions[i];
      if (!ins) continue;
      const defined = defOf(ins);
      if (defined !== null) {
        // The result conflicts with everything still live past this point.
        for (const other of live) {
          edge(defined, other);
          edge(other, defined);
        }
        live.delete(defined);
      }
      for (const read of readsOf(ins)) live.add(read);
    }
  });

  // Greedy colouring, most-constrained temporaries first.
  const order = [...referenced].sort((a, b) => {
    const degreeA = interference.get(a)?.size ?? 0;
    const degreeB = interference.get(b)?.size ?? 0;
    return degreeB - degreeA || a - b;
  });

  const slotOf: number[] = new Array<number>(Math.max(fn.tempCount, 0)).fill(-1);
  let slotCount = 0;

  for (const value of order) {
    const taken = new Set<number>();
    for (const neighbour of interference.get(value) ?? []) {
      const assigned = slotOf[neighbour];
      if (assigned !== undefined && assigned >= 0) taken.add(assigned);
    }
    let slot = 0;
    while (taken.has(slot)) slot += 1;
    while (slotOf.length <= value) slotOf.push(-1);
    slotOf[value] = slot;
    slotCount = Math.max(slotCount, slot + 1);
  }

  return { slotOf, slotCount };
}
