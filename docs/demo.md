# NovaOS — 30-second demo

The flagship loop: **source → compile → run → debug → time-travel**. Follow this
live at <https://yhechen.github.io/NovaOS/> (or `pnpm --filter @novaos/web dev`).

## Walkthrough

1. The editor opens on the default `main.c` (adds 5 + 10 and prints the result).
2. Click **Compile**. In the inspector, click through the tabs to watch the
   program lowered stage by stage: **Tokens → IR → Optimized IR → CFG →
   Assembly → Bytecode**.
3. Click **Run**. The output panel prints `15`.
4. Click **Debug**, then **Step into**. Execution pauses inside `main`; the
   editor highlights the current line and the debugger shows registers (changed
   values flash), the call stack, and the live stack memory.
5. Step a few more times, then **drag the timeline scrubber backwards** — the
   registers, stack, and current line rewind deterministically.
6. Open the **Examples** dropdown and load **Recursion (Fibonacci)**; run it to
   see `fib(10) = 55`, then debug it to watch the call stack grow and shrink.

## Recording a screencast (GIF)

The repo intentionally ships no binary media. To add one:

```bash
pnpm --filter @novaos/web dev          # serve at http://localhost:3000
# Record the walkthrough above with any screen recorder, e.g. Kap or
# Gifski / ffmpeg, keeping it ~20–40s and under a few MB:
#   ffmpeg -i demo.mov -vf "fps=12,scale=1000:-1:flags=lanczos" docs/media/demo.gif
```

Then create `docs/media/`, drop the file in as `demo.gif`, and uncomment the
`![NovaOS demo](docs/media/demo.gif)` line at the top of the root `README.md`.
