# @novaos/scheduler

## Purpose

Pluggable CPU scheduling behind one interface. The scheduler manages a ready
queue and chooses ordering only — it never mutates process state. The kernel
admits ready processes and applies the transitions the scheduler's decisions imply.

## Public API

- **`Scheduler`** interface: `enqueue`, `remove`, `pickNext`, `requeue`, `has`, `size`,
  `snapshot`, `restore`, plus `id` / `name` / `quantumTicks`.
- **`createFifoScheduler()`** — First-Come-First-Served (non-preemptive, `quantumTicks = null`).
- **`createRoundRobinScheduler({ quantumTicks })`** — Round Robin (preemptive; rotates on
  quantum expiry).
- **Types:** `SchedulableProcess`, `SchedulingContext`, `SchedulerSnapshot`, `SchedulerId`,
  `RoundRobinConfig`.

Priority, Shortest-Job-First, and Lottery schedulers are deferred to a later milestone.

## Events

None — the scheduler is pure. The kernel emits `scheduler.*` events as it coordinates
scheduling decisions.

## Snapshots

`SchedulerSnapshot` (`schedulerId`, `algorithmName`, `quantumTicks`, `readyQueue`, `config`).

## Testing

A shared contract suite runs against every algorithm (empty/single/remove/determinism/
duplicate-guard/snapshot-restore), plus FIFO admission-order and Round Robin rotation tests.

## Dependency Rules

Depends on `@novaos/shared` only. UI-free, deterministic. Does **not** depend on the kernel
(it operates on a minimal `SchedulableProcess` view, avoiding a dependency cycle).
