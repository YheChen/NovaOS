/**
 * The CPU register file: eight general-purpose registers (R0-R7), the special
 * registers PC/SP/BP/IR, and the FLAGS register. Values are stored as unsigned
 * 32-bit integers. The snapshot is a plain, serializable object.
 */
export const GPR_NAMES = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'] as const;
export type GprName = (typeof GPR_NAMES)[number];
export type SpecialRegisterName = 'pc' | 'sp' | 'bp' | 'ir';
export type RegisterName = GprName | SpecialRegisterName;

export interface FlagsRegister {
  readonly zero: boolean;
  readonly negative: boolean;
  readonly carry: boolean;
  readonly overflow: boolean;
  readonly interruptEnabled: boolean;
  readonly exception: boolean;
}

export const INITIAL_FLAGS: FlagsRegister = {
  zero: false,
  negative: false,
  carry: false,
  overflow: false,
  interruptEnabled: false,
  exception: false,
};

export interface RegisterFileSnapshot {
  r0: number;
  r1: number;
  r2: number;
  r3: number;
  r4: number;
  r5: number;
  r6: number;
  r7: number;
  pc: number;
  sp: number;
  bp: number;
  ir: number;
  flags: FlagsRegister;
}

const NUMERIC_KEYS = [
  'r0',
  'r1',
  'r2',
  'r3',
  'r4',
  'r5',
  'r6',
  'r7',
  'pc',
  'sp',
  'bp',
  'ir',
] as const;

const mask32 = (value: number): number => value >>> 0;

export function gprNameFromIndex(index: number): GprName | undefined {
  return GPR_NAMES[index];
}

export interface RegisterFile {
  reset(initial?: Partial<RegisterFileSnapshot>): void;
  get(name: RegisterName): number;
  set(name: RegisterName, value: number): void;
  getFlags(): FlagsRegister;
  setFlags(flags: FlagsRegister): void;
  snapshot(): RegisterFileSnapshot;
  restore(snapshot: RegisterFileSnapshot): void;
}

function defaultState(): RegisterFileSnapshot {
  return {
    r0: 0,
    r1: 0,
    r2: 0,
    r3: 0,
    r4: 0,
    r5: 0,
    r6: 0,
    r7: 0,
    pc: 0,
    sp: 0,
    bp: 0,
    ir: 0,
    flags: { ...INITIAL_FLAGS },
  };
}

export function createRegisterFile(): RegisterFile {
  let state = defaultState();

  function reset(initial?: Partial<RegisterFileSnapshot>): void {
    state = defaultState();
    if (initial) {
      for (const key of NUMERIC_KEYS) {
        const value = initial[key];
        if (value !== undefined) state[key] = mask32(value);
      }
      if (initial.flags) state.flags = { ...initial.flags };
    }
  }

  return {
    reset,
    get: (name) => state[name],
    set: (name, value) => {
      state[name] = mask32(value);
    },
    getFlags: () => ({ ...state.flags }),
    setFlags: (flags) => {
      state.flags = { ...flags };
    },
    snapshot: () => ({ ...state, flags: { ...state.flags } }),
    restore: (snapshot) => {
      state = { ...snapshot, flags: { ...snapshot.flags } };
    },
  };
}
