# ADR-0003: Kernel/runtime responsibilities and the kernel→cpu dependency

## Status

Accepted (Milestone 2)

## Context

Milestone 2 introduces the kernel, scheduler, syscalls, interrupts, and context
switching. Two structural questions had to be settled before implementation:

1. **Who owns the execution loop?** The CPU steps one instruction; the kernel owns
   process/scheduling policy; something must drive the clock and decide when to step,
   trap syscalls, and fire the timer.
2. **How does the kernel save/restore CPU registers** for a context switch without the
   architecture's dependency rules being violated, given the PCB stores register state?

Additionally, the scheduler must not create a dependency cycle with the kernel
(kernel→scheduler is the allowed edge), even though scheduling concerns processes.

## Decision

1. **Split of responsibilities.** The **kernel owns policy**: boot, process table, PCB
   lifecycle, scheduling coordination, syscall/interrupt dispatch, and context-switch
   orchestration. The **simulator owns the run loop**: it ticks the clock, calls
   `cpu.step`, records accounting, and asks the kernel to dispatch / preempt / terminate.
   The CPU executes one instruction per step for whatever process is currently loaded.

2. **`SYSCALL` opcode + trap.** A new `SYSCALL` opcode traps to a `SyscallTrap` (defined in
   `@novaos/cpu`, implemented by the kernel). `print` (0) and `exit` (4) are real syscalls.
   The M1 `PRINT` opcode is retained as a bare-VM convenience but is no longer the canonical
   output path.

3. **`RegisterPort` for context switches.** The kernel saves/restores registers through an
   injected `RegisterPort` (`capture` / `load`) wired by the simulator to the live CPU, so
   the kernel orchestrates context switches without holding the CPU instance.

4. **`@novaos/kernel` depends on `@novaos/cpu`** for the `RegisterFileSnapshot` type (stored
   in the PCB) and the syscall-trap types. This is an acyclic edge (cpu → events, shared;
   cpu never imports kernel) and is the most honest home for register-shaped state.

5. **Scheduler stays kernel-independent.** The scheduler operates on a minimal
   `SchedulableProcess` view and depends only on `@novaos/shared`, avoiding a
   kernel↔scheduler cycle. The kernel emits `scheduler.*` events as it coordinates.

6. **`init` / `shell` are parked placeholders.** They are created in the process table in the
   `new` state (no executable, not admitted to the scheduler). They gain real programs and are
   admitted in later milestones; in M2 only user processes with code are scheduled.

## Consequences

- The flagship demo runs a single user process cleanly; multi-process context switching is
  exercised by a dedicated Round Robin integration test.
- `PRINT` and `cpu.output` coexist with the syscall path; a future milestone may retire the
  `PRINT` opcode once examples migrate.
- Memory permission enforcement and memory events remain deferred; segments + ownership are
  tracked and snapshot-able.

## Alternatives Considered

- **Kernel owns the run loop / holds the CPU:** would couple the kernel to CPU stepping and
  the clock, muddying the policy/mechanism split.
- **`RegisterFileSnapshot` in `@novaos/shared`:** pushes CPU-specific state (flags) into the
  primitives package; rejected.
- **Scheduler operating on the full PCB:** creates a kernel↔scheduler dependency cycle; rejected
  in favor of the `SchedulableProcess` view.
