# @novaos/kernel

## Purpose

The operating-system core. Owns boot lifecycle, the process table and PCB
lifecycle, PID allocation, context-switch orchestration, syscall and interrupt
dispatch, and the process fault model. The kernel owns OS truth; the runtime
drives the clock and stepping, and the UI observes kernel events and snapshots.

## Public API

- **`createKernel(deps)` → `Kernel`** — `boot`, `createProcess`, `dispatch`,
  `handleSyscall`, `handleTimerInterrupt`, `recordInstruction`, `shouldPreempt`,
  `terminateCurrent`, `faultCurrent`, `hasRunnable`, and snapshot getters.
- **Process model:** `ProcessControlBlock`, `ProcessState` + `canTransition`,
  `ProcessMemoryMap`, `ExitReason`, `ProcessFault`, `createPidAllocator`, `KERNEL_PID`.
- **Syscalls:** `Syscall` (print=0, exit=4), `SYSCALL_HANDLERS`, `syscallName`.
- **Interrupts:** `Interrupt`, `InterruptKind`, `timerInterrupt`.
- **Ports:** `RegisterPort` (kernel saves/restores CPU registers without holding the CPU).
- **Snapshots:** `KernelSnapshot`, `KernelStatus`, `ProcessTableSnapshot`, `ProcessSummary`.
- **Faults:** `KernelFault`, `kernelFault`.

## Events

`kernel.boot.started|stage.completed|completed`, `kernel.process.created|state.changed|
terminated|output`, `kernel.context.switch`, `kernel.syscall.invoked|completed|failed`,
`kernel.interrupt.raised|handled`, `kernel.fault`, and (source `scheduler`)
`scheduler.initialized|process.enqueued|process.removed|picked`.

## Snapshots

`KernelSnapshot` composes the process table, scheduler snapshot, and memory map.
`ProcessTableSnapshot` is the render-friendly process view.

## Testing

Unit tests cover boot lifecycle, PID allocation, process-state transitions, syscall
dispatch (print/exit), and context switching; an integration test (in `@novaos/simulator`)
boots, runs a user process to exit, and asserts the deterministic event sequence.

## Dependency Rules

Depends on `@novaos/scheduler`, `@novaos/memory`, `@novaos/events`, `@novaos/shared`, and
`@novaos/cpu` (for `RegisterFileSnapshot` and the syscall-trap types — see ADR-0003). No UI,
deterministic. Schedulers return decisions; the kernel applies all transitions.
