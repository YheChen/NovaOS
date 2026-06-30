# NovaOS — Product Requirements Document

**Document:** 01-product-requirements.md  
**Version:** 2.0  
**Status:** Execution-ready draft  
**Owner:** NovaOS Product + Systems Architecture  
**Primary consumer:** Claude Code / UltraCode multi-agent implementation team  
**Project type:** Browser-based interactive operating systems laboratory  

---

## 1. Executive Summary

NovaOS is an interactive operating systems laboratory that runs entirely in the browser. It is not merely an emulator, not merely a toy shell, and not merely a visualization. It is a complete educational platform where users can write small programs, compile them, execute them inside a simulated machine, inspect CPU registers, observe memory mutations, visualize process scheduling, browse a virtual filesystem, debug crashes, and replay execution history.

The central product insight is simple: operating systems are difficult to learn because most of the important behavior is invisible. NovaOS makes those invisible systems visible.

A user should be able to watch a process move from `READY` to `RUNNING`, see the scheduler choose the next process, observe registers change instruction by instruction, inspect the stack after a function call, see a heap allocation appear in memory, trace a syscall through the kernel, and rewind the timeline to understand why a crash happened.

NovaOS should feel like a professional developer tool: a blend of VS Code, Chrome DevTools, Linear, Raycast, and an operating systems textbook. The engineering quality should be high enough to impress experienced engineers. The educational quality should be high enough for a professor to use in lectures. The interaction design should be polished enough for a recruiter to explore it without explanation.

---

## 2. Product Vision

The long-term vision is to build the best browser-native operating systems education platform in the world.

NovaOS should allow a student to learn the following topics interactively:

- CPU registers and instruction execution
- Assembly language
- Compilation and bytecode
- Stack and heap memory
- Process lifecycle
- Scheduling algorithms
- Context switching
- System calls
- Interrupts and exceptions
- Filesystems
- Debuggers
- Program crashes
- Deterministic replay
- Virtual networking, in later versions
- Paging and virtual memory, in later versions
- Multicore scheduling, in later versions

The product should be equally useful as:

1. A self-guided learning tool.
2. A classroom demonstration tool.
3. A portfolio project demonstrating deep technical ability.
4. An open-source platform that can be extended by contributors.

The final product should make users feel that they are inside a living computer.

---

## 3. Mission Statement

NovaOS exists to make operating systems understandable through interaction, visualization, and production-grade software engineering.

The system should not hide complexity. It should reveal complexity gradually, with enough structure that a beginner is not overwhelmed and enough depth that advanced users can inspect every layer.

---

## 4. Positioning

NovaOS sits between several categories:

| Category | What NovaOS borrows | What NovaOS avoids |
|---|---|---|
| Operating systems textbook | Concepts, structure, rigor | Passive reading |
| Emulator | CPU, memory, instruction execution | Full hardware realism |
| IDE | Editor, diagnostics, debugging | Generic app development focus |
| DevTools | Inspection, timelines, state views | Browser-specific constraints |
| Game-like simulator | Interactivity, visual feedback | Toy-like aesthetics |
| Teaching platform | Tutorials, examples, guided exploration | Oversimplification |

NovaOS is an educational simulation, not a production operating system and not a hypervisor. It should preserve the conceptual truth of operating systems while simplifying hardware-specific details.

---

## 5. Target Users

### 5.1 Primary Users

#### Computer Science students

Students taking courses in operating systems, systems programming, compilers, or computer architecture.

They need intuition. They often struggle because textbooks describe dynamic behavior using static diagrams. NovaOS should let them run experiments and see the results immediately.

#### University instructors

Professors, lecturers, and teaching assistants who need live demonstrations.

They should be able to use NovaOS in a lecture to show scheduling algorithms, stack growth, heap allocation, system calls, and crashes.

#### Self-taught systems learners

Developers who know web development or scripting but want to understand lower-level systems.

NovaOS should make the journey less intimidating by providing a modern interface and immediate feedback.

#### Technical recruiters and interviewers

NovaOS is also intended to be a flagship portfolio project.

A recruiter should be able to open the deployed app, run a sample program, and immediately understand that the project involves compilers, systems design, frontend engineering, state management, testing, and architecture.

### 5.2 Secondary Users

- Open-source contributors
- Systems engineers prototyping educational algorithms
- Bootcamp instructors
- High school advanced CS students
- Interview candidates preparing for systems questions
- Developers interested in compilers or debuggers

---

## 6. User Personas

### 6.1 Alice — CS Student

Alice is a second-year CS student taking her first operating systems course. She has written Java and Python but has never worked with assembly or memory addresses.

Alice wants to understand:

- Why a stack overflow happens
- What a process actually is
- How a scheduler decides what runs next
- Why memory protection matters
- How source code becomes instructions

Success for Alice means she can use NovaOS to form mental models that stick.

### 6.2 Bob — Professor

Bob teaches undergraduate operating systems. He currently uses slides, xv6, and whiteboard diagrams. Students often memorize definitions but struggle to reason about dynamic behavior.

Bob wants to:

- Open a scheduling demo in class
- Switch from FIFO to Round Robin live
- Slow down execution
- Show processes moving between queues
- Export traces for assignments

Success for Bob means NovaOS becomes a lecture companion.

### 6.3 Charlie — Recruiter / Interviewer

Charlie is scanning GitHub projects. Most projects look like CRUD apps. NovaOS should immediately stand out.

Charlie looks for:

- Clean architecture
- Strong TypeScript
- Tests
- Documentation
- Complex domain modeling
- Thoughtful UI
- Real engineering tradeoffs

Success for Charlie means the project earns a second look and leads to interview discussion.

### 6.4 Dana — Systems Enthusiast

Dana enjoys compilers, emulators, kernels, and language tools. Dana wants to inspect internals deeply and possibly contribute plugins.

Dana wants:

- Clear package boundaries
- Extensible instruction sets
- Pluggable schedulers
- Deterministic replay
- Good documentation

Success for Dana means NovaOS feels architecturally serious.

---

## 7. Product Principles

### 7.1 Everything important is visible

When anything significant happens in the simulated system, NovaOS should expose it. A process should not silently terminate. A memory write should not disappear into an opaque array. A scheduler decision should not be hidden behind a function call.

Every significant domain event should be visible through at least one of:

- A panel update
- A timeline event
- An animation
- A log entry
- An inspector detail view

### 7.2 Interaction beats explanation

Documentation matters, but the product should teach through interaction first. Users should be able to modify code, run it, break it, step through it, and inspect consequences.

### 7.3 Progressive disclosure

NovaOS must support both beginners and advanced users. Beginner views should explain concepts plainly. Advanced views should show raw bytecode, memory addresses, flags, and internal state.

### 7.4 Determinism is a feature

The same program with the same initial state should produce the same execution trace. This makes debugging, teaching, and testing far easier.

Scheduling randomness must use seeded pseudo-randomness. Timers must be simulated. Replay must be reliable.

### 7.5 Modularity enables teaching

Users should eventually be able to swap scheduler algorithms, memory allocators, filesystem implementations, and even CPU instruction sets.

This requires clean architecture from the beginning.

### 7.6 Beautiful tools teach better

A polished interface increases trust. NovaOS should avoid the visual language of throwaway classroom demos. It should look like a premium developer tool.

### 7.7 Production-grade engineering

This is an educational product, but the codebase should be professional. Strict TypeScript, tests, documentation, linting, CI, deterministic behavior, and clear interfaces are non-negotiable.

---

## 8. Goals

### 8.1 Educational goals

NovaOS should help users understand:

- CPU state
- Instruction execution
- Memory mutation
- Stack frames
- Heap allocation
- Process lifecycle
- Scheduling decisions
- System calls
- Exceptions
- Filesystem operations
- Debugging workflows

### 8.2 Engineering goals

The implementation should demonstrate:

- Clean architecture
- Domain-driven modularity
- Deterministic simulation
- Compiler pipeline design
- Debugger design
- Complex UI state management
- High-performance rendering
- Testable TypeScript systems
- CI/CD and release discipline

### 8.3 Product goals

The product should:

- Run fully in the browser
- Require no backend for MVP
- Be deployable on Vercel
- Load quickly
- Include compelling examples
- Be usable without reading a long manual
- Support shareable demos in later versions

---

## 9. Non-Goals

NovaOS will not attempt to be:

- A real operating system
- A Linux-compatible environment
- A POSIX-complete shell
- A QEMU replacement
- A hypervisor
- A production VM sandbox
- A security isolation mechanism
- A browser-based Docker replacement
- A perfect model of x86, ARM, or RISC-V

NovaOS is allowed to simplify or abstract details when doing so improves education, maintainability, and visualization.

---

## 10. Core Product Surface

NovaOS consists of the following primary surfaces:

1. Workspace shell
2. File explorer
3. Code editor
4. Terminal
5. CPU register viewer
6. Memory viewer
7. Stack viewer
8. Heap viewer
9. Process table
10. Scheduler visualization
11. Kernel event log
12. Debugger controls
13. Execution timeline
14. Compiler pipeline inspector
15. Tutorial and examples gallery

Each surface must be useful independently and more powerful when combined.

---

## 11. MVP Scope

The MVP should be ambitious but controlled. It must include enough of the system to tell the complete story of writing, compiling, running, debugging, and inspecting a program.

### 11.1 MVP must include

- Browser app shell
- Virtual CPU
- Register file
- Fixed-size RAM
- Basic process model
- Simple scheduler
- Kernel syscall dispatcher
- Virtual filesystem
- Terminal shell
- Monaco-based editor
- Assembly language
- Assembler
- Bytecode execution
- Debug controls
- Breakpoints
- Memory grid
- Register viewer
- Process table
- Event timeline
- Example programs
- Documentation
- Automated tests
- CI pipeline

### 11.2 MVP may exclude

- Toy C compiler, if necessary for timeline
- Paging
- Multicore
- Networking
- Plugin SDK
- Cloud sync
- User accounts
- Collaboration
- Mobile full workspace

### 11.3 MVP demo narrative

The MVP must support this exact demo:

1. User opens NovaOS.
2. The system boots.
3. The boot sequence initializes CPU, memory, filesystem, scheduler, and shell.
4. User opens an example assembly program.
5. User compiles it.
6. User runs it.
7. The process appears in the process table.
8. Registers update as instructions execute.
9. Memory cells animate when changed.
10. User sets a breakpoint.
11. Execution pauses at the breakpoint.
12. User steps instruction by instruction.
13. User inspects stack and registers.
14. User opens the timeline and sees the complete event history.
15. User triggers an intentional crash example and receives an educational error explanation.

If the product can do this smoothly, the MVP is strong.

---

## 12. Feature Requirements

### 12.1 Boot sequence

The boot sequence should introduce the system as a living machine.

Required stages:

1. Initialize simulator runtime
2. Initialize CPU registers
3. Allocate kernel memory
4. Mount virtual filesystem
5. Load standard shell commands
6. Start scheduler
7. Spawn init process
8. Spawn terminal process
9. Mark system ready

Each stage should emit a typed event and display status in the UI.

Acceptance criteria:

- Boot can be replayed in the timeline.
- Boot can be skipped after first run.
- Boot failure produces a useful diagnostic.
- Boot completes quickly enough for a polished demo.

### 12.2 Virtual CPU

The CPU must support:

- General-purpose registers
- Special registers
- Flags
- Instruction fetch/decode/execute cycle
- Arithmetic instructions
- Memory instructions
- Control flow
- System call trap
- Halt instruction
- Exception generation

Acceptance criteria:

- Every instruction has tests.
- CPU state is serializable.
- CPU events are emitted after each instruction.
- The debugger can pause between instructions.

### 12.3 Memory system

The memory system must support:

- Fixed-size RAM for MVP
- Byte-addressable memory
- Segment ownership metadata
- Stack region
- Heap region
- Program region
- Kernel region
- Memory read/write events
- Invalid access detection

Acceptance criteria:

- Memory writes are visible in the UI.
- Invalid access pauses execution with a meaningful error.
- Memory can be inspected by address.
- Memory snapshots support replay.

### 12.4 Process system

A process must include:

- PID
- name
- state
- priority
- register snapshot
- memory map
- open file descriptors
- parent process
- CPU time
- creation time

Acceptance criteria:

- Processes move through explicit lifecycle states.
- Transitions are logged.
- Process table reflects current truth.
- Terminated processes preserve exit reason.

### 12.5 Scheduler

MVP must include at least:

- FIFO
- Round Robin

Preferred MVP also includes:

- Priority scheduling

Acceptance criteria:

- Scheduler algorithm can be switched before execution.
- Scheduler decisions emit events.
- Context switches are visible.
- Shared scheduler tests validate algorithm behavior.

### 12.6 Filesystem

The filesystem must support:

- Directory tree
- Files
- Paths
- Basic metadata
- Create/read/write/delete
- File explorer synchronization
- Browser persistence

Acceptance criteria:

- Shell and file explorer share the same filesystem state.
- Refreshing the browser preserves files, unless reset.
- Invalid paths produce clear errors.

### 12.7 Shell and terminal

The terminal must support:

- Command input
- Output
- History
- Autocomplete basics
- Built-in commands
- Program execution
- Error display

MVP commands:

- `help`
- `clear`
- `pwd`
- `ls`
- `cd`
- `cat`
- `touch`
- `mkdir`
- `rm`
- `ps`
- `kill`
- `run`
- `compile`
- `debug`
- `mem`
- `cpu`

Acceptance criteria:

- Commands are parsed, not split by naive whitespace only.
- Errors are recoverable.
- Command execution emits events.

### 12.8 Editor

The editor must support:

- Assembly syntax highlighting
- File tabs
- Unsaved indicators
- Diagnostics
- Breakpoint gutter
- Current instruction highlight

Acceptance criteria:

- Current source line highlights during debugging.
- Compiler errors map to editor locations.
- Breakpoints persist per file.

### 12.9 Assembler

The assembler must support:

- Labels
- Registers
- Immediates
- Comments
- Basic diagnostics
- Bytecode output
- Source maps

Acceptance criteria:

- Invalid syntax produces line-specific diagnostics.
- Labels resolve deterministically.
- Source maps correctly connect bytecode to source lines.

### 12.10 Debugger

The debugger must support:

- Run
- Pause
- Stop
- Restart
- Step instruction
- Breakpoints
- Register inspection
- Memory inspection
- Timeline events

Acceptance criteria:

- Breakpoints pause before executing the target instruction.
- Stepping updates all visible panels.
- Stopping resets process execution without corrupting filesystem state.

### 12.11 Timeline

The timeline must record:

- Boot events
- CPU events
- Memory events
- Process events
- Scheduler events
- Filesystem events
- Shell commands
- Debugger events
- Errors

Acceptance criteria:

- Timeline can be filtered by category.
- Selecting an event shows details.
- Events are deterministic and serializable.

### 12.12 Tutorial and examples

MVP should include example programs:

- Hello world
- Arithmetic
- Loop
- Function call simulation
- Stack push/pop
- Intentional segmentation fault
- Scheduling demo with multiple processes

Each example should include:

- Source code
- Explanation
- Suggested panels to inspect
- Expected output

---

## 13. User Journeys

### 13.1 First-time user journey

1. User lands on NovaOS.
2. A short welcome screen explains the product in one sentence.
3. User clicks “Boot NovaOS.”
4. Boot sequence runs with visible stages.
5. User is prompted to run the Hello World example.
6. The example opens in the editor.
7. User clicks Run.
8. Terminal prints output.
9. Register and memory changes are visible.
10. User is invited to step through the program.

### 13.2 Debugging journey

1. User opens a program.
2. User sets a breakpoint.
3. User starts debug mode.
4. Execution pauses at breakpoint.
5. User inspects registers.
6. User steps into the next instruction.
7. Memory viewer highlights changed cells.
8. Timeline records every event.
9. User rewinds to a previous event.

### 13.3 Scheduling journey

1. User opens scheduling demo.
2. Multiple processes are created.
3. User selects Round Robin.
4. User sets time quantum.
5. User runs simulation.
6. Queue visualization shows process rotation.
7. User switches to Priority scheduling.
8. Differences become visually obvious.

### 13.4 Crash investigation journey

1. User runs program with invalid memory access.
2. Execution halts on segmentation fault.
3. Error panel explains the invalid address.
4. Memory viewer highlights attempted access.
5. Process inspector shows allowed memory range.
6. User opens source line responsible.
7. User fixes program and reruns.

---

## 14. Educational Requirements

NovaOS must teach through layered explanation.

For every major concept, provide:

- A visual representation
- A short plain-English explanation
- A technical explanation
- An example program
- A debugging scenario

Concepts requiring educational treatment:

- Register
- Program counter
- Stack pointer
- Flags
- Instruction
- Bytecode
- Process
- Scheduler
- Context switch
- Kernel
- System call
- Interrupt
- Stack
- Heap
- Segmentation fault
- Filesystem path
- File descriptor
- Breakpoint

---

## 15. UX Requirements

NovaOS must feel like a modern professional tool.

Required UX qualities:

- Fast startup
- Clear visual hierarchy
- Keyboard shortcuts
- Command palette
- Resizable panels
- Dark mode and light mode
- Helpful empty states
- Educational error messages
- Smooth animations
- No layout jank

The app should avoid novelty UI that sacrifices usability.

---

## 16. Accessibility Requirements

NovaOS must support:

- Keyboard navigation
- Visible focus indicators
- Screen reader labels
- Reduced motion
- High contrast mode
- Text summaries for visualizations
- Non-color-only state indicators

Complex visualizations such as memory grids and scheduler queues should expose accessible textual summaries.

---

## 17. Performance Requirements

MVP target budgets:

| Area | Target |
|---|---:|
| Initial app load | < 2.5 seconds on modern laptop |
| Boot sequence execution | < 500 ms excluding intentional animation |
| Single instruction step UI update | < 16 ms target |
| Memory grid scroll | 60 FPS target |
| Timeline with 10,000 events | usable without freezing |
| Compile small assembly program | < 100 ms |
| Run 100,000 simple instructions | reasonable interactive performance |

Simulation may run faster than visualization. At high execution speeds, UI updates should be batched while preserving trace correctness.

---

## 18. Quality Requirements

The codebase must use:

- TypeScript strict mode
- No implicit `any`
- ESLint
- Prettier
- Unit tests
- Integration tests
- Playwright smoke tests
- CI on pull requests
- Documentation for public APIs
- Deterministic replay tests

Quality bar:

- Core simulator packages require high test coverage.
- UI components must handle loading, empty, and error states.
- No unresolved TODOs in MVP release path.
- No circular dependencies between packages.

---

## 19. Success Metrics

### 19.1 Product metrics

- User can complete first program flow without documentation.
- User can understand a segmentation fault through UI explanation.
- User can compare two scheduling algorithms visually.
- User can step through a program and correctly explain register changes.

### 19.2 Engineering metrics

- CI green on main.
- Deterministic replay tests pass.
- Public APIs documented.
- Package dependency graph remains acyclic.
- Core VM instruction tests pass.

### 19.3 Portfolio metrics

- The project can be demoed in under five minutes.
- README communicates technical depth immediately.
- Architecture docs are clear.
- Recruiter or interviewer can identify compilers, OS, and frontend depth.

---

## 20. Risks and Mitigations

### Risk: Scope explosion

NovaOS can easily become too large.

Mitigation:

- Treat MVP as assembly-first.
- Defer Toy C if necessary.
- Defer networking, paging, multicore, and plugin SDK.

### Risk: UI overwhelms users

Many panels can create cognitive overload.

Mitigation:

- Use progressive disclosure.
- Provide workspace modes.
- Use tutorials and guided examples.

### Risk: Simulator and UI become tightly coupled

This would make testing and replay difficult.

Mitigation:

- Event-driven architecture.
- Pure simulator core.
- UI consumes events and snapshots.

### Risk: Performance issues in visualizations

Memory grids and timelines can be expensive.

Mitigation:

- Virtualized rendering.
- Event batching.
- Worker-based simulation if needed.

### Risk: Educational simplification becomes misleading

Mitigation:

- Label simplifications clearly.
- Provide “real OS comparison” notes.
- Document where NovaOS differs from Linux/xv6.

---

## 21. Release Criteria

NovaOS MVP may be released publicly when:

- User can boot system.
- User can run at least five example programs.
- User can step through execution.
- Registers and memory update correctly.
- Process table reflects lifecycle state.
- Filesystem persists basic files.
- Timeline records execution.
- Core tests pass.
- README includes demo GIF or video.
- Deployment is stable.

---

## 22. Final Product Directive

NovaOS should be built as if it might become a serious open-source educational platform.

Do not optimize only for a quick demo. Optimize for clarity, extensibility, deterministic behavior, and technical credibility.

Every subsystem should answer a teaching question. Every panel should reveal something real. Every line of architecture should make the system easier to understand, test, and extend.
