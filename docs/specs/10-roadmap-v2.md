# NovaOS
# 10 - Roadmap, Milestones & Implementation Plan

Version: 2.0

Status: Execution Roadmap

Depends On:
- 01-product-requirements.md
- 02-system-architecture.md
- 03-virtual-machine.md
- 04-kernel-memory-processes-v2.md
- 05-filesystem-shell-v2.md
- 06-compiler-debugger-v2.md
- 07-ui-design-system-v2.md
- 08-agent-orchestration-v2.md
- 09-testing-devops-v2.md

Primary Consumer:
- Claude Code
- NovaOS technical lead
- 50-agent orchestration team

---

# 1. Purpose

This document converts the NovaOS specification set into a concrete implementation roadmap.

It defines:

- MVP scope
- milestone sequence
- dependency order
- acceptance criteria
- demo scripts
- implementation tasks
- cut lines
- release phases
- future roadmap
- public launch readiness

The roadmap is designed for Claude Code coordinating a large multi-agent build.

The project should not be built as a random collection of features.

It should be built as a sequence of increasingly impressive, always-demoable milestones.

The guiding principle:

> Every milestone should produce a working system that demonstrates a complete concept.

---

# 2. Product North Star

NovaOS is an interactive operating systems laboratory for the browser.

The final v1 experience should allow a user to:

1. Open the app.
2. Boot a virtual OS.
3. Explore a virtual filesystem.
4. Write a small program.
5. Compile or assemble it.
6. Run it as a process.
7. Watch CPU registers and memory change.
8. Inspect scheduler and kernel events.
9. Debug the program with breakpoints and stepping.
10. Rewind the execution timeline.
11. Learn what happened through visual explanations.

This is the flagship demo.

Everything in the roadmap exists to make that experience reliable and polished.

---

# 3. Roadmap Strategy

The roadmap follows six principles.

## 3.1 Build vertical slices

Do not build every subsystem in isolation for months.

Build thin vertical flows early:

```text
source code → bytecode → process → VM execution → output → events → UI
```

Then deepen each layer.

## 3.2 Keep milestones demoable

Each milestone should have a clear demo script.

If a milestone cannot be demoed, it is too abstract.

## 3.3 Stabilize contracts before parallel UI

UI agents can work with typed mocks, but only after contracts are defined.

The UI must eventually connect to real runtime events.

## 3.4 Cut scope aggressively for v1

NovaOS v1 should be excellent, not maximal.

Defer advanced features:

- paging
- multicore
- networking
- plugin SDK
- advanced C features
- shell scripting
- cloud sync

## 3.5 Prioritize educational clarity

When choosing between realism and clarity, v1 should usually choose clarity.

## 3.6 Release quality matters

A polished smaller release is better than a giant unstable system.

---

# 4. Version Plan

Suggested version sequence:

| Version | Theme | Primary Demo |
|---|---|---|
| 0.1 | Minimal VM | Run arithmetic bytecode |
| 0.2 | Kernel Boot | Boot OS and spawn process |
| 0.3 | Filesystem + Shell | Use terminal and files |
| 0.4 | Assembler | Write assembly and run it |
| 0.5 | Toy C Compiler | Compile Toy C to bytecode |
| 0.6 | Debugger + Timeline | Step and rewind execution |
| 0.7 | Full Workspace UI | Polished IDE-like experience |
| 0.8 | Tutorials + Examples | Guided educational flows |
| 0.9 | Release Candidate | QA, performance, accessibility |
| 1.0 | Public Launch | Portfolio-ready flagship release |

---

# 5. MVP Scope

NovaOS v1 includes:

## Runtime

- deterministic simulation clock
- event bus
- CPU register file
- FLAGS register
- instruction decoder
- instruction execution
- byte-addressable memory
- memory segments
- first-fit allocator
- stack and heap helpers
- VM pipeline
- runtime exceptions

## Kernel

- boot lifecycle
- process table
- PCB model
- PID allocator
- process creation and termination
- context switching
- Round Robin scheduler
- FIFO scheduler
- syscall dispatcher
- timer interrupt
- process faults

## Filesystem and Shell

- virtual filesystem
- path resolver
- file metadata
- create/read/write/delete/move/copy
- browser persistence
- shell lexer/parser
- core built-ins
- terminal runtime

## Toolchain

- NovaASM
- assembler
- bytecode object
- source maps
- Toy C subset
- lexer/parser
- semantic analysis
- IR
- basic optimization
- assembly generation

## Debugger

- run/pause/continue/stop/restart
- step instruction
- step source line
- line breakpoints
- instruction breakpoints
- watch registers/memory
- call stack basics
- timeline
- snapshots
- deterministic replay

## UI

- app shell
- resizable workspace
- command palette
- file explorer
- Monaco editor
- terminal
- register viewer
- memory grid
- process table
- scheduler visualization
- debugger panels
- compiler inspector
- timeline
- tutorial overlay
- example gallery

## Quality

- unit tests
- integration tests
- E2E smoke
- golden tests
- replay tests
- accessibility smoke
- performance budgets
- CI
- public README
- deployment

---

# 6. Explicit Non-MVP Scope

Defer these until after v1:

- paging and virtual memory
- TLB visualization
- multicore scheduling
- virtual networking
- browser-based multiplayer/collaboration
- plugin SDK
- package manager
- Git integration
- shell scripting
- pipes and redirects if they slow MVP
- full C language
- pointers
- structs
- arrays
- standard library beyond minimal built-ins
- dynamic linker
- ELF compatibility
- GPU simulation
- cloud accounts
- classroom management backend

These features are valuable, but v1 must first deliver the core learning loop.

---

# 7. Milestone 0 - Repository Foundation

## Objective

Create a clean, scalable monorepo foundation.

## Primary Agents

- Agent 01 Program Manager
- Agent 02 Staff Architect
- Agent 03 API Contract Architect
- Agent 04 Monorepo Infrastructure
- Agent 06 Shared Types
- Agent 07 Event Bus
- Agent 08 Determinism
- Agent 09 Error and Diagnostic
- Agent 48 Testing and QA

## Deliverables

Repository structure:

```text
apps/
  web/

packages/
  shared/
  simulator/
  cpu/
  memory/
  kernel/
  scheduler/
  filesystem/
  shell/
  terminal/
  compiler/
  assembler/
  debugger/
  ui/

docs/
tests/
scripts/
.github/
```

Tooling:

- pnpm workspace
- TypeScript strict mode
- package references
- ESLint
- Prettier
- Vitest
- Playwright skeleton
- GitHub Actions skeleton
- architecture check skeleton
- root validation command

Shared foundation:

- branded IDs
- addresses
- source spans
- result type
- diagnostics
- deterministic clock
- seeded PRNG
- typed event bus

## Acceptance Criteria

- `pnpm install` works
- `pnpm build` works
- `pnpm typecheck` works
- `pnpm lint` works
- `pnpm test` works
- all packages export from `src/index.ts`
- CI runs on pull request
- no package imports another package internals
- shared types documented

## Demo

Run:

```bash
pnpm validate
```

Expected:

```text
Build passed.
Typecheck passed.
Lint passed.
Tests passed.
```

## Cut Line

Do not implement product features beyond tiny examples.

Milestone 0 is about foundation.

---

# 8. Milestone 1 - Minimal Virtual Machine

## Objective

Execute a tiny deterministic instruction stream and emit inspectable events.

## Primary Agents

- Agent 11 CPU Register
- Agent 12 Instruction Decoder
- Agent 13 Instruction Execution
- Agent 14 VM Pipeline
- Agent 15 VM Exception
- Agent 16 Memory Core
- Agent 48 Testing and QA

## Required Instructions

- `MOV`
- `ADD`
- `PRINT`
- `HALT`
- `NOP`

Optional if easy:

- `SUB`
- `CMP`
- `JMP`
- `JE`
- `JNE`

## Deliverables

- register file
- FLAGS register
- byte-addressable memory
- instruction format
- decoder
- opcode dispatch
- execution loop
- step execution
- pause/halt state
- instruction events
- register change events
- memory change events
- VM exception model

## Acceptance Criteria

- VM executes deterministic program
- registers update correctly
- events emit in stable order
- invalid opcode produces exception
- divide-by-zero test exists if DIV is implemented
- same program produces same final snapshot
- unit tests cover implemented instructions

## Demo Program

```asm
MOV R0, 5
MOV R1, 10
ADD R2, R0, R1
PRINT R2
HALT
```

Expected output:

```text
15
```

Expected event sequence:

```text
InstructionFetched
InstructionDecoded
InstructionExecuted
RegisterChanged
InstructionFetched
InstructionDecoded
InstructionExecuted
RegisterChanged
InstructionFetched
InstructionDecoded
InstructionExecuted
RegisterChanged
OutputEmitted
ProgramHalted
```

## Cut Line

No kernel required yet.

No UI beyond a minimal console/debug harness required.

---

# 9. Milestone 2 - Kernel Boot and Process Runtime

## Objective

Turn the VM into a small operating system runtime with boot, processes, scheduler, syscalls, and context switches.

## Primary Agents

- Agent 17 Allocator
- Agent 18 Stack and Heap
- Agent 19 Kernel Core
- Agent 20 Process Manager
- Agent 21 Scheduler
- Agent 22 Syscall
- Agent 23 Interrupt
- Agent 48 Testing and QA

## Deliverables

- kernel boot state machine
- PID allocator
- PCB model
- process table
- process creation
- process termination
- Round Robin scheduler
- FIFO scheduler
- timer interrupt
- context switch
- syscall dispatcher
- `print`
- `exit`
- memory segments
- first-fit allocator
- stack overflow detection
- process fault handling

## Acceptance Criteria

- kernel boots deterministically
- `init` process can be created
- shell process placeholder can be created
- user process can run and exit
- timer interrupt can trigger context switch
- `print` syscall produces output
- memory access violation faults one process
- process lifecycle events emit
- scheduler tests pass

## Demo

Expected terminal-like output:

```text
NovaOS boot started.
CPU initialized.
Memory initialized.
Scheduler initialized.
Syscalls registered.
Init process created.
Shell process created.
NovaOS ready.
Running hello...
15
Process 2 exited with code 0.
```

Expected visualization contracts:

- process table snapshot
- scheduler snapshot
- memory map snapshot
- kernel boot events

## Cut Line

No full filesystem or shell yet.

A temporary program runner API is acceptable.

---

# 10. Milestone 3 - Filesystem, Shell and Terminal Runtime

## Objective

Give users a familiar OS interface through a virtual filesystem and shell.

## Primary Agents

- Agent 24 Filesystem Core
- Agent 25 File Operations
- Agent 26 Filesystem Persistence
- Agent 27 Shell Parser
- Agent 28 Shell Builtins
- Agent 29 Terminal Runtime
- Agent 48 Testing and QA

## Deliverables

Filesystem:

- inode model
- content store
- path resolver
- permissions representation
- file operations
- directory operations
- snapshot/restore
- browser persistence

Shell:

- lexer
- parser
- command AST
- command registry
- diagnostics
- built-in commands

Terminal runtime:

- session model
- input buffer
- history
- output chunks
- autocomplete API
- interrupt event

Required commands:

```text
pwd
cd
ls
tree
mkdir
touch
cat
rm
cp
mv
echo
clear
help
history
ps
kill
mem
cpu
sysinfo
```

Development commands may be stubs if toolchain is not ready:

```text
compile
run
debug
trace
```

## Acceptance Criteria

- filesystem operations deterministic
- path resolver handles `/`, `.`, `..`, `~`
- shell commands modify real VFS
- terminal output is structured
- file changes emit events
- filesystem survives refresh
- shell errors are helpful
- integration tests cover terminal + filesystem

## Demo

```bash
pwd
ls
mkdir demos
cd demos
touch hello.asm
echo "created hello.asm"
cd ..
tree
sysinfo
```

Expected:

- terminal output correct
- filesystem event timeline updated
- file explorer contract can consume snapshots
- persistence snapshot works

## Cut Line

Pipes, redirects, shell scripts, and job control are optional/future.

---

# 11. Milestone 4 - Assembler and Program Runner

## Objective

Let users write NovaASM files, assemble them into bytecode, and run them as processes.

## Primary Agents

- Agent 35 Assembler
- Agent 36 Source Map
- Agent 22 Syscall
- Agent 28 Shell Builtins
- Agent 48 Testing and QA

## Deliverables

- NovaASM lexer/parser
- labels
- comments
- `.global`
- optional `.text`
- operand validation
- label resolution
- bytecode encoder
- bytecode object format
- symbol table
- assembly diagnostics
- source map skeleton
- `compile <file.asm>`
- `run <file.asm>`
- `debug <file.asm>` stub or instruction-level mode

## Acceptance Criteria

- valid assembly produces bytecode
- invalid assembly produces diagnostics
- labels resolve deterministically
- bytecode is golden-tested
- assembled program can be loaded into kernel
- shell can run assembly program
- source line maps to bytecode address

## Demo Assembly

```asm
.global main

main:
  MOV R0, 5
  MOV R1, 10
  ADD R2, R0, R1
  SYSCALL 0
  HALT
```

Demo commands:

```bash
compile hello.asm
run hello.asm
```

Expected output:

```text
15
```

## Cut Line

No Toy C required yet.

No advanced assembler directives required.

---

# 12. Milestone 5 - Toy C Compiler

## Objective

Compile a small C-like language into NovaASM and bytecode.

## Primary Agents

- Agent 30 Toy C Lexer Parser
- Agent 31 Semantic Analysis
- Agent 32 IR
- Agent 33 Optimization
- Agent 34 Assembly Generation
- Agent 36 Source Map
- Agent 48 Testing and QA

## Deliverables

- Toy C lexer
- Toy C parser
- immutable AST
- semantic analyzer
- symbol table
- type checker
- IR model
- IR generation
- constant folding
- dead code elimination
- copy propagation
- assembly generation
- source maps
- compiler diagnostics
- compiler inspector snapshots
- `compile <file.c>`
- `run <file.c>`

Supported language:

- `int`
- `bool`
- `void`
- variables
- arithmetic
- comparison
- `if`
- `else`
- `while`
- functions
- return
- function calls
- `print`

## Acceptance Criteria

- Toy C examples compile and run
- syntax errors produce clear diagnostics
- semantic errors produce clear diagnostics
- source maps connect C source to bytecode
- golden tests exist for AST, IR, assembly, diagnostics
- compiler output is deterministic

## Demo Program

```c
int main() {
  int a = 5;
  int b = 10;
  int c = a + b;
  print(c);
  return 0;
}
```

Demo commands:

```bash
compile hello.c
run hello.c
```

Expected output:

```text
15
```

## Cut Line

Defer arrays, pointers, structs, full strings, preprocessor, includes, and advanced standard library.

---

# 13. Milestone 6 - Debugger, Timeline and Replay

## Objective

Make execution inspectable, controllable, and rewindable.

## Primary Agents

- Agent 37 Debugger Core
- Agent 38 Breakpoints and Watches
- Agent 39 Timeline and Replay
- Agent 36 Source Map
- Agent 48 Testing and QA

## Deliverables

Debugger:

- debugger session model
- run
- pause
- continue
- stop
- restart
- step instruction
- step source line
- step into
- step over
- step out basics
- line breakpoints
- instruction breakpoints
- register watches
- memory watches
- call stack basics

Timeline:

- event timeline
- event grouping
- snapshot interval
- replay engine
- rewind
- forward
- jump to event
- export trace

## Acceptance Criteria

- debugger can pause at entry
- instruction stepping works
- line breakpoint resolves through source map
- watch values update
- timeline records runtime events
- replay from snapshot is deterministic
- stepping tests pass
- breakpoint tests pass
- replay tests pass

## Demo

1. Open `hello.c`.
2. Set breakpoint on `print(c);`.
3. Start debug.
4. Continue to breakpoint.
5. Inspect registers.
6. Step instruction.
7. Inspect memory.
8. Rewind timeline to before `ADD`.
9. Continue to program exit.

Expected:

- editor highlights current line
- register viewer updates
- memory viewer updates
- timeline shows events
- terminal prints `15`

## Cut Line

Advanced reverse debugging, conditional watch language, and complex local variable reconstruction can be improved after v1.

---

# 14. Milestone 7 - Full Workspace UI

## Objective

Deliver the polished NovaOS browser experience.

## Primary Agents

- Agent 40 Design System
- Agent 41 Workspace Layout
- Agent 42 Editor
- Agent 43 Terminal UI
- Agent 44 Memory Visualization
- Agent 45 CPU and Process UI
- Agent 46 Debugger UI
- Agent 49 Performance and Accessibility
- Agent 48 Testing and QA

## Deliverables

- design tokens
- UI primitives
- app shell
- resizable panels
- persistent layout
- command palette
- file explorer
- Monaco editor
- terminal UI
- register viewer
- flags viewer
- process table
- scheduler visualization
- kernel dashboard
- memory grid
- stack viewer
- heap viewer
- debugger toolbar
- breakpoint panel
- watch panel
- call stack panel
- timeline UI
- compiler inspector
- settings panel
- theme support

## Acceptance Criteria

- full edit-compile-run-debug flow works in UI
- panels update from real runtime events
- no domain truth exists only in React state
- keyboard shortcuts work
- command palette works
- dark/light/high contrast themes work
- memory grid virtualized
- timeline usable with 10,000 events
- E2E smoke test passes
- accessibility smoke test passes

## Demo Flow

1. Open NovaOS.
2. Boot system.
3. Open `/home/student/hello.c`.
4. Compile.
5. Run.
6. View terminal output.
7. Debug.
8. Step.
9. Inspect register.
10. Inspect memory.
11. Open timeline.
12. Rewind one event.

This demo is the main v1 product experience.

## Cut Line

Do not block on every visual flourish.

Prioritize a polished core flow over many unfinished panels.

---

# 15. Milestone 8 - Tutorials, Examples and Public Documentation

## Objective

Turn NovaOS from a tool into an educational platform.

## Primary Agents

- Agent 05 Documentation Lead
- Agent 47 Tutorials and Examples
- Agent 50 Release and Demo
- Agent 49 Performance and Accessibility
- Agent 48 Testing and QA

## Deliverables

Tutorials:

- Your First Program
- How Registers Work
- Stack vs Heap
- Scheduling Algorithms
- System Calls
- Debugging a Crash
- Understanding Compilation
- Time-Travel Debugging

Examples:

- hello world assembly
- hello world Toy C
- arithmetic
- if/else
- while loop
- function call
- memory allocation
- stack overflow
- segmentation fault
- Round Robin scheduling
- priority scheduling
- filesystem read/write

Documentation:

- README
- quickstart
- user guide
- architecture guide
- contributing guide
- testing guide
- glossary
- release notes
- demo script

## Acceptance Criteria

- first-run tutorial works
- examples compile/run/debug
- docs explain project clearly
- README is portfolio-ready
- screenshots are current
- public demo script works
- examples are tested
- tutorial E2E smoke test passes

## Demo

A first-time user completes "Your First Program" without reading external docs.

Expected outcome:

- creates or opens program
- compiles it
- runs it
- sees output
- steps through one instruction
- understands at least one register change

---

# 16. Milestone 9 - Release Candidate

## Objective

Stabilize for public launch.

## Primary Agents

- Agent 01 Program Manager
- Agent 48 Testing and QA
- Agent 49 Performance and Accessibility
- Agent 50 Release and Demo
- all relevant feature agents for bug fixes

## Deliverables

- bug triage
- performance pass
- accessibility pass
- docs pass
- README pass
- examples pass
- deployment pass
- release notes
- final demo recording/script
- GitHub polish
- known limitations list

## Acceptance Criteria

- no critical bugs
- no high-severity release blockers
- CI green
- E2E green
- accessibility smoke green
- performance smoke acceptable
- deployment verified
- reset/import/export verified
- full demo works from clean browser profile
- docs match implementation
- known limitations documented

## Cut Line

If a feature is unstable, hide it behind a feature flag or move it to future roadmap.

Do not ship broken advanced features.

---

# 17. Milestone 10 - Public v1.0 Launch

## Objective

Publish NovaOS as a flagship portfolio and open-source project.

## Deliverables

- production deployment
- GitHub release
- polished README
- screenshots/GIFs
- architecture diagrams
- demo script
- first issue labels
- contribution guidelines
- roadmap section
- license
- release notes
- known limitations
- future work

## Launch Demo Script

1. Open deployed NovaOS.
2. Boot OS.
3. Show process table.
4. Open example Toy C file.
5. Compile.
6. Show compiler pipeline.
7. Run.
8. Show terminal output.
9. Debug.
10. Step through source.
11. Show registers and memory changing.
12. Trigger or show scheduler visualization.
13. Rewind timeline.
14. Explain architecture in README.

This should take 3-5 minutes and impress both systems and full-stack reviewers.

---

# 18. Task Breakdown by Epic

## Epic A: Foundation

Tasks:

- create monorepo
- configure TypeScript
- configure lint/format
- configure tests
- configure CI
- create shared types
- create event bus
- create diagnostics
- create deterministic utilities
- create architecture checks

## Epic B: VM

Tasks:

- register file
- FLAGS helpers
- instruction representation
- decoder
- operand validation
- opcode handlers
- execution loop
- output device abstraction
- VM exceptions
- execution snapshots

## Epic C: Memory

Tasks:

- RAM storage
- address types
- segment table
- permissions
- first-fit allocator
- free list merge
- stack helpers
- heap helpers
- memory faults
- memory snapshots

## Epic D: Kernel

Tasks:

- boot lifecycle
- kernel state
- PID allocator
- PCB model
- process creation
- process termination
- context switch
- syscall table
- interrupt table
- kernel snapshots

## Epic E: Scheduling

Tasks:

- scheduler interface
- FIFO
- Round Robin
- Priority
- SJF
- Lottery
- deterministic tests
- scheduler snapshots

## Epic F: Filesystem

Tasks:

- inode model
- content store
- path resolver
- permissions
- file operations
- directory operations
- file descriptors
- snapshot/restore
- persistence provider

## Epic G: Shell and Terminal

Tasks:

- shell lexer
- shell parser
- command registry
- built-ins
- diagnostics
- terminal session model
- history
- autocomplete
- terminal output chunks

## Epic H: Assembler

Tasks:

- NovaASM parser
- labels
- directives
- operand validation
- bytecode encoder
- symbol table
- diagnostics
- golden tests

## Epic I: Compiler

Tasks:

- Toy C lexer
- parser
- AST
- semantic analysis
- symbol table
- IR
- optimizations
- assembly generation
- source maps
- compiler inspector artifacts

## Epic J: Debugger

Tasks:

- session state machine
- run controls
- stepping
- breakpoints
- watches
- call stack
- timeline
- snapshots
- replay
- time travel

## Epic K: UI

Tasks:

- design tokens
- UI primitives
- app shell
- layout
- command palette
- file explorer
- editor
- terminal
- memory grid
- registers
- process table
- scheduler view
- debugger UI
- compiler inspector
- timeline

## Epic L: Education

Tasks:

- tutorial engine
- example gallery
- sample programs
- glossary
- concept explanations
- first-run flow
- docs

## Epic M: Quality and Release

Tasks:

- unit tests
- integration tests
- golden tests
- E2E tests
- accessibility pass
- performance pass
- release workflow
- deployment
- README
- screenshots

---

# 19. Dependency Matrix

```text
Shared types → everything
Event bus → runtime + UI
Diagnostics → compiler + shell + runtime
Determinism → simulator + scheduler + replay
Memory → VM + kernel
CPU → VM + debugger
VM → kernel + debugger
Kernel → shell system commands + process UI
Filesystem → shell + file explorer + editor
Assembler → program runner + debugger
Compiler → assembler + compiler inspector
Source maps → debugger
Debugger → debugger UI + timeline
UI contracts → web app
Testing harness → all packages
```

Do not violate this dependency order unless there is an explicit ADR.

---

# 20. Critical Path

The critical path to the flagship demo is:

```text
Foundation
  ↓
VM
  ↓
Memory
  ↓
Kernel process runtime
  ↓
Assembler
  ↓
Program runner
  ↓
Debugger stepping
  ↓
Editor + terminal + register/memory UI
  ↓
Toy C compiler
  ↓
Compiler inspector
  ↓
Timeline replay
  ↓
Tutorial/demo polish
```

The UI can begin earlier with typed mocks, but final demo depends on real runtime integration.

---

# 21. Parallelization Plan

Safe parallel work after foundation:

```text
CPU registers          || Memory core
Instruction decoder    || Allocator
Diagnostics            || Event bus
Design tokens          || Monorepo infra
```

Safe parallel work after VM contracts:

```text
Kernel process model   || Scheduler algorithms
Filesystem core        || Shell parser
Assembler parser       || UI workspace shell
```

Safe parallel work after toolchain contracts:

```text
Toy C parser           || Assembler
Debugger core          || Timeline
Editor UI              || Terminal UI
```

Safe parallel work near release:

```text
Tutorials              || Examples
README                 || Screenshots
Performance            || Accessibility
Bug fixes              || E2E tests
```

Unsafe parallel work:

- two agents changing same public event contract
- UI agent inventing runtime snapshots while runtime agent changes them
- compiler and debugger changing source map shape independently
- kernel and scheduler both mutating PCB state model
- memory and VM bypassing shared memory access context

---

# 22. Feature Flags and Cut Lines

Feature flags allow partial work without destabilizing release.

Potential flags:

- `toyCCompiler`
- `timeTravelDebugger`
- `advancedSchedulerViews`
- `heapVisualization`
- `tutorialOverlay`
- `workerSimulation`
- `highContrastTheme`
- `sourceMapInspector`

Cut if unstable before v1:

- conditional breakpoints
- memory breakpoints
- optimization explorer
- advanced call stack locals
- Lottery scheduler visualization
- SJF burst prediction
- shell redirects
- file drag-and-drop
- import/export trace UI
- custom themes

Do not cut:

- boot
- run assembly
- basic Toy C compile
- terminal
- file explorer
- register viewer
- memory viewer
- process table
- basic debugger
- timeline events
- examples
- README

---

# 23. Risk-Based Priorities

Highest-risk technical areas:

1. deterministic replay
2. source maps
3. debugger stepping
4. memory visualization performance
5. compiler correctness
6. UI/runtime integration
7. kernel process lifecycle
8. browser persistence
9. accessibility for visualizations
10. timeline scalability

Prioritize prototypes for these early.

Do not leave all risky integration until the end.

---

# 24. Prototype Spikes

Before full implementation, consider small spikes.

## Spike A: MemoryGrid performance

Goal:

Render and scroll 64 KiB memory without jank.

Success:

- virtualized grid works
- changed-cell animation feasible
- inspector selection works

## Spike B: Source map stepping

Goal:

Map Toy C line to bytecode and step source line.

Success:

- line breakpoint resolves
- current line highlight updates
- fallback to instruction stepping works

## Spike C: Replay

Goal:

Run program, snapshot, replay event sequence.

Success:

- final state identical
- event sequence identical

## Spike D: Terminal + filesystem sync

Goal:

Create file from shell and see file explorer update.

Success:

- one source of filesystem truth
- event-driven UI update

Spikes should be time-boxed in implementation planning, but not shipped as messy prototypes.

---

# 25. Public Demo Narrative

The final project should be presented as:

> NovaOS is a browser-based operating systems laboratory that lets users write programs, compile them, run them inside a simulated kernel, inspect CPU and memory state, visualize scheduling and syscalls, and time-travel through execution.

Resume bullet examples:

```text
Built NovaOS, a browser-based operating systems laboratory with a custom VM, kernel, scheduler, memory manager, filesystem, shell, compiler, assembler, debugger, and time-travel execution timeline.
```

```text
Implemented deterministic CPU and kernel simulation in TypeScript with source-level debugging, bytecode generation, memory visualization, and replayable event traces.
```

```text
Designed a VS Code-style educational systems platform featuring Monaco editor integration, virtual filesystem, process scheduler visualizations, and compiler pipeline inspection.
```

Interview talking points:

- deterministic simulation
- event-sourced architecture
- memory safety checks
- scheduler abstraction
- compiler pipeline
- source maps
- debugger state machine
- UI virtualization
- accessibility for complex visualizations
- multi-agent orchestration

---

# 26. Example Program Roadmap

## Beginner examples

- Hello Assembly
- Hello Toy C
- Add Two Numbers
- While Loop Counter
- If/Else Branch
- Function Call

## Memory examples

- Stack Push/Pop
- Function Stack Frame
- Heap Allocation
- Double Free Error
- Stack Overflow
- Segmentation Fault

## Kernel examples

- Two Processes
- Round Robin Scheduling
- Priority Scheduling
- Sleep and Wake
- Syscall Print
- Process Exit

## Filesystem examples

- Read File
- Write File
- Copy File
- Directory Traversal
- Permission Denied

## Debugging examples

- Breakpoint Demo
- Step Into Function
- Watch Register
- Watch Memory
- Rewind After Crash

Each example should include:

- source code
- expected output
- concepts taught
- suggested inspection steps
- difficulty level
- related tutorial

---

# 27. Tutorial Roadmap

## Tutorial 1: Your First Program

Concepts:

- editor
- compile
- run
- terminal output

## Tutorial 2: Registers

Concepts:

- registers
- MOV
- ADD
- PC
- FLAGS

## Tutorial 3: Memory

Concepts:

- addresses
- stack
- heap
- memory writes

## Tutorial 4: Processes

Concepts:

- PID
- process state
- scheduler queue
- context switch

## Tutorial 5: Syscalls

Concepts:

- user mode
- kernel service
- print syscall
- terminal output

## Tutorial 6: Compiler Pipeline

Concepts:

- tokens
- AST
- IR
- assembly
- bytecode

## Tutorial 7: Debugging

Concepts:

- breakpoints
- stepping
- watches
- call stack

## Tutorial 8: Time Travel

Concepts:

- event timeline
- snapshots
- replay
- rewind

Tutorials should be interactive and validate user actions.

---

# 28. Documentation Roadmap

Required docs before v1:

```text
README.md
docs/getting-started.md
docs/user-guide.md
docs/architecture.md
docs/virtual-machine.md
docs/kernel.md
docs/compiler.md
docs/debugger.md
docs/ui.md
docs/testing.md
docs/contributing.md
docs/glossary.md
docs/known-limitations.md
```

README structure:

```markdown
# NovaOS

## What is NovaOS?

## Demo

## Features

## Screenshots

## Quickstart

## Architecture

## Example Workflow

## Tech Stack

## Project Structure

## Testing

## Roadmap

## Contributing

## License
```

The README should immediately communicate technical depth.

---

# 29. GitHub Polish Checklist

Before public release:

- strong repository description
- topics/tags
- polished README
- architecture diagram
- screenshots
- GIF or demo video link
- clear quickstart
- issue templates
- PR template
- contributing guide
- license
- release notes
- roadmap
- known limitations
- examples directory
- docs directory
- CI badge
- deployment link
- test coverage badge if available

Suggested topics:

```text
operating-systems
virtual-machine
compiler
debugger
typescript
nextjs
education
systems-programming
emulator
visualization
```

---

# 30. Release Candidate Checklist

Functional:

- boot works
- terminal works
- filesystem works
- editor works
- assembly compile/run works
- Toy C compile/run works
- debugger works
- memory view works
- process table works
- timeline works
- tutorials work
- examples work

Quality:

- CI green
- typecheck green
- lint green
- unit tests green
- integration tests green
- E2E smoke green
- golden tests reviewed
- replay tests green
- accessibility smoke green
- performance smoke acceptable

Docs:

- README complete
- quickstart complete
- architecture docs complete
- known limitations complete
- examples documented
- release notes complete

Release:

- production deployment verified
- clean browser profile tested
- reset flow tested
- import/export tested
- no critical/high bugs
- feature flags reviewed
- stale debug code removed
- screenshots current

---

# 31. Post-v1 Roadmap

## v1.1 - Stabilization

- bug fixes
- more examples
- better diagnostics
- performance improvements
- accessibility improvements
- docs improvements

## v1.2 - Advanced Memory

- paging
- virtual addresses
- page tables
- page faults
- TLB visualization
- memory protection modes

## v1.3 - Advanced Scheduler

- multilevel feedback queue
- aging visualization
- starvation demos
- deadline scheduling
- scheduler plugin API

## v1.4 - Networking

- multiple virtual machines
- virtual network switch
- packets
- sockets
- ping
- client/server demos

## v1.5 - Multicore

- multiple CPU cores
- per-core run queues
- work stealing
- race condition demos
- locks and semaphores

## v1.6 - Language Expansion

- arrays
- pointers
- structs
- strings
- recursion
- richer standard library
- linker
- multiple source files

## v1.7 - Classroom Mode

- instructor-authored lessons
- shareable traces
- assignment templates
- challenge mode
- progress export

## v2.0 - Plugin Platform

- custom instructions
- custom schedulers
- custom shell commands
- custom visualizations
- plugin SDK
- plugin gallery

---

# 32. Long-Term Vision

NovaOS could evolve into a full educational platform.

Future possibilities:

- university adoption
- interactive textbook chapters
- assignment runner
- student trace submissions
- collaborative debugging
- AI-assisted explanations
- custom OS labs
- browser-based xv6-style curriculum
- visual compiler course modules
- systems interview practice
- open-source plugin ecosystem

The architecture should support this, but v1 should not try to build all of it.

---

# 33. Implementation Guidance for Claude Code

When starting implementation, Claude Code should follow this sequence:

1. Read all specifications.
2. Produce architecture summary.
3. Produce dependency graph.
4. Produce task registry.
5. Produce package ownership map.
6. Produce first wave agent briefs.
7. Implement Milestone 0 only.
8. Validate.
9. Implement Milestone 1 only.
10. Validate.
11. Continue milestone by milestone.

Do not jump ahead to UI polish before runtime works.

Do not implement Toy C before assembler works.

Do not implement advanced debugger UI before debugger core works.

Do not implement tutorials before workflows exist.

---

# 34. First Claude Code Prompt

Use this prompt to begin the real build:

```markdown
Read the NovaOS specification files in order.

Do not implement code yet.

Produce:

1. a concise architecture summary
2. a dependency graph
3. package ownership map
4. task registry grouped by milestone
5. quality gates
6. first wave agent briefs for Milestone 0
7. risks and unresolved questions

After that, wait for approval before implementation.
```

Second prompt:

```markdown
Implement Milestone 0: Repository Foundation.

Activate only the foundation agents described in 08-agent-orchestration-v2.md.

Create the monorepo, shared types, event bus, diagnostics, deterministic utilities, testing harness, lint/typecheck/build scripts, and CI skeleton.

Keep changes small and keep the build green.
```

Third prompt:

```markdown
Implement Milestone 1: Minimal Virtual Machine.

Do not start kernel, filesystem, compiler, or UI work yet except for contracts needed by the VM.

Deliver a deterministic VM that can execute MOV, ADD, PRINT, and HALT with tests and event emission.
```

---

# 35. Success Metrics

Technical success:

- deterministic replay works
- compiler produces stable bytecode
- debugger source stepping works
- memory visualization is performant
- UI integrates with real runtime events
- tests cover core logic
- architecture remains modular

Educational success:

- users understand registers
- users understand memory
- users understand scheduling
- users understand syscalls
- users understand compilation
- users understand debugging

Portfolio success:

- README communicates depth quickly
- demo is smooth
- code is clean
- architecture is impressive
- project is easy to run
- interviewer has many technical questions to ask

Open-source success:

- issues are organized
- docs are useful
- contributors can understand package boundaries
- examples are approachable
- roadmap is credible

---

# 36. Common Roadmap Failure Modes

## Failure: Building too much UI too early

Consequence:

Beautiful mock UI that does not connect to real runtime.

Mitigation:

Contracts first. Runtime vertical slice early.

## Failure: Compiler before VM stability

Consequence:

Compiler emits code for unstable target.

Mitigation:

Minimal VM and assembler first.

## Failure: Debugger without source maps

Consequence:

Debugger cannot step source correctly.

Mitigation:

Source map format before debugger UI.

## Failure: Timeline without determinism

Consequence:

Replay is unreliable.

Mitigation:

Determinism utilities and replay tests early.

## Failure: Too many agents at once

Consequence:

Merge conflicts and incoherent architecture.

Mitigation:

Phased activation and file ownership.

## Failure: MVP scope creep

Consequence:

No polished release.

Mitigation:

Use cut lines aggressively.

---

# 37. Final v1 Definition of Done

NovaOS v1 is complete when:

- app boots reliably
- virtual machine executes programs
- kernel manages processes
- scheduler runs at least FIFO and Round Robin
- memory manager enforces permissions
- filesystem and shell work
- assembly programs compile and run
- Toy C programs compile and run
- debugger supports stepping and breakpoints
- timeline records and replays execution
- UI provides editor, terminal, memory, registers, process, debugger, compiler, and timeline panels
- tutorials and examples exist
- tests pass
- CI is green
- accessibility and performance smoke tests pass
- deployment works
- README and docs are polished
- demo script works from a clean browser profile
- known limitations are documented
- project is ready to show recruiters, professors, and engineers

---

# 38. Final Principle

NovaOS should be built like a ladder.

Each milestone is a rung.

Do not skip rungs.

A simple VM that works is better than a giant broken OS.

A small compiler with perfect diagnostics is better than a large unreliable language.

A basic debugger with deterministic stepping is better than a flashy but inconsistent one.

A polished v1 that teaches clearly is better than an unfinished v2 hiding inside it.

Ship the excellent core first.
