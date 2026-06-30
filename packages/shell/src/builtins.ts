import { fsContext, joinPath, type AbsolutePath, type FsContext } from '@novaos/filesystem';
import {
  stdout,
  systemLine,
  diagnosticLine,
  type CommandOutput,
  type OutputLine,
  type RunnerDiagnostic,
  type ShellContext,
} from './context';
import type { CommandRegistry, ShellCommand } from './registry';

const okOut = (lines: OutputLine[] = []): CommandOutput => ({ exitCode: 0, lines });
const errOut = (lines: OutputLine[], code = 1): CommandOutput => ({ exitCode: code, lines });
const fsCtx = (ctx: ShellContext): FsContext => fsContext(ctx.cwd, ctx.user);

function renderDiagnostic(path: string, d: RunnerDiagnostic): OutputLine {
  const location = d.line !== null ? `${path}:${d.line}` : path;
  const text = `${location}: ${d.severity}: ${d.message}${d.hint ? ` (${d.hint})` : ''}`;
  return d.severity === 'error' ? diagnosticLine(text) : systemLine(text);
}

function renderTree(
  ctx: ShellContext,
  path: AbsolutePath,
  prefix: string,
  lines: OutputLine[],
  depth: number,
  maxDepth: number,
): void {
  const listing = ctx.filesystem.list(path, fsCtx(ctx));
  if (!listing.ok) return;
  const entries = listing.value;
  entries.forEach((entry, index) => {
    const isLast = index === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const suffix = entry.kind === 'directory' ? '/' : '';
    lines.push(stdout(`${prefix}${connector}${entry.name}${suffix}`));
    if (entry.kind === 'directory' && depth < maxDepth) {
      renderTree(
        ctx,
        joinPath(path, entry.name),
        `${prefix}${isLast ? '    ' : '│   '}`,
        lines,
        depth + 1,
        maxDepth,
      );
    }
  });
}

function requireSystem(ctx: ShellContext, command: string): CommandOutput | null {
  if (!ctx.system) {
    return errOut([diagnosticLine(`${command}: no kernel is attached to this shell.`)]);
  }
  return null;
}

export function registerBuiltins(registry: CommandRegistry): void {
  const commands: ShellCommand[] = [];
  const define = (command: ShellCommand) => commands.push(command);

  // ---- Navigation ----------------------------------------------------------
  define({
    name: 'pwd',
    summary: 'Print the current working directory.',
    usage: 'pwd',
    aliases: [],
    options: [],
    run: (_args, ctx) => okOut([stdout(ctx.cwd)]),
  });

  define({
    name: 'cd',
    summary: 'Change the current working directory.',
    usage: 'cd [path]',
    aliases: [],
    options: [],
    run: (args, ctx) => {
      const target = args.positional[0] ?? ctx.home;
      const stat = ctx.filesystem.stat(target, fsCtx(ctx));
      if (!stat.ok) return errOut([diagnosticLine(`cd: ${stat.error.message}`)]);
      if (stat.value.kind !== 'directory') {
        return errOut([diagnosticLine(`cd: not a directory: ${target}`)]);
      }
      return { exitCode: 0, lines: [], cwd: stat.value.path };
    },
  });

  define({
    name: 'ls',
    summary: 'List directory contents.',
    usage: 'ls [-l] [-a] [path]',
    aliases: [],
    options: [
      { flag: 'l', description: 'long format' },
      { flag: 'a', description: 'show hidden files' },
    ],
    run: (args, ctx) => {
      const target = args.positional[0] ?? '.';
      const stat = ctx.filesystem.stat(target, fsCtx(ctx));
      if (!stat.ok) return errOut([diagnosticLine(`ls: ${stat.error.message}`)]);
      if (stat.value.kind !== 'directory') return okOut([stdout(stat.value.name)]);
      const listing = ctx.filesystem.list(target, fsCtx(ctx));
      if (!listing.ok) return errOut([diagnosticLine(`ls: ${listing.error.message}`)]);
      if (args.flags.has('l')) {
        return okOut(
          listing.value.map((e) =>
            stdout(
              `${e.permissions} ${String(e.sizeBytes).padStart(6)} ${e.name}${e.kind === 'directory' ? '/' : ''}`,
            ),
          ),
        );
      }
      const names = listing.value.map((e) => `${e.name}${e.kind === 'directory' ? '/' : ''}`);
      return okOut(names.length > 0 ? [stdout(names.join('  '))] : []);
    },
  });

  define({
    name: 'tree',
    summary: 'Display a directory tree.',
    usage: 'tree [path]',
    aliases: [],
    options: [],
    run: (args, ctx) => {
      const target = args.positional[0] ?? '.';
      const stat = ctx.filesystem.stat(target, fsCtx(ctx));
      if (!stat.ok) return errOut([diagnosticLine(`tree: ${stat.error.message}`)]);
      const lines: OutputLine[] = [stdout(stat.value.path)];
      renderTree(ctx, stat.value.path, '', lines, 0, 8);
      return okOut(lines);
    },
  });

  // ---- Filesystem ----------------------------------------------------------
  define({
    name: 'mkdir',
    summary: 'Create directories.',
    usage: 'mkdir [-p] <path...>',
    aliases: [],
    options: [{ flag: 'p', description: 'create parent directories' }],
    run: (args, ctx) => {
      if (args.positional.length === 0) return errOut([diagnosticLine('mkdir: missing operand')]);
      const recursive = args.flags.has('p');
      for (const path of args.positional) {
        const result = ctx.filesystem.createDirectory(path, { recursive }, fsCtx(ctx));
        if (!result.ok) return errOut([diagnosticLine(`mkdir: ${result.error.message}`)]);
      }
      return okOut();
    },
  });

  define({
    name: 'touch',
    summary: 'Create an empty file or update its timestamp.',
    usage: 'touch <path...>',
    aliases: [],
    options: [],
    run: (args, ctx) => {
      if (args.positional.length === 0) return errOut([diagnosticLine('touch: missing operand')]);
      for (const path of args.positional) {
        if (ctx.filesystem.stat(path, fsCtx(ctx)).ok) continue;
        const created = ctx.filesystem.createFile(path, {}, fsCtx(ctx));
        if (!created.ok) return errOut([diagnosticLine(`touch: ${created.error.message}`)]);
      }
      return okOut();
    },
  });

  define({
    name: 'cat',
    summary: 'Print file contents.',
    usage: 'cat <path...>',
    aliases: [],
    options: [],
    run: (args, ctx) => {
      if (args.positional.length === 0) return errOut([diagnosticLine('cat: missing operand')]);
      const lines: OutputLine[] = [];
      for (const path of args.positional) {
        const text = ctx.filesystem.readText(path, fsCtx(ctx));
        if (!text.ok) return errOut([diagnosticLine(`cat: ${text.error.message}`)]);
        const content = text.value.endsWith('\n') ? text.value.slice(0, -1) : text.value;
        for (const l of content.split('\n')) lines.push(stdout(l));
      }
      return okOut(lines);
    },
  });

  define({
    name: 'rm',
    summary: 'Remove files or directories.',
    usage: 'rm [-r] [-f] <path...>',
    aliases: [],
    options: [
      { flag: 'r', description: 'remove directories recursively' },
      { flag: 'f', description: 'ignore missing files' },
    ],
    run: (args, ctx) => {
      if (args.positional.length === 0) return errOut([diagnosticLine('rm: missing operand')]);
      const recursive = args.flags.has('r');
      const force = args.flags.has('f');
      for (const path of args.positional) {
        const result = ctx.filesystem.remove(path, { recursive, force }, fsCtx(ctx));
        if (!result.ok) return errOut([diagnosticLine(`rm: ${result.error.message}`)]);
      }
      return okOut();
    },
  });

  define({
    name: 'cp',
    summary: 'Copy a file.',
    usage: 'cp <from> <to>',
    aliases: [],
    options: [],
    run: (args, ctx) => {
      const from = args.positional[0];
      const to = args.positional[1];
      if (from === undefined || to === undefined) {
        return errOut([diagnosticLine('cp: usage: cp <from> <to>')]);
      }
      const result = ctx.filesystem.copy(from, to, fsCtx(ctx));
      if (!result.ok) return errOut([diagnosticLine(`cp: ${result.error.message}`)]);
      return okOut();
    },
  });

  define({
    name: 'mv',
    summary: 'Move or rename a file.',
    usage: 'mv <from> <to>',
    aliases: [],
    options: [],
    run: (args, ctx) => {
      const from = args.positional[0];
      const to = args.positional[1];
      if (from === undefined || to === undefined) {
        return errOut([diagnosticLine('mv: usage: mv <from> <to>')]);
      }
      const result = ctx.filesystem.move(from, to, fsCtx(ctx));
      if (!result.ok) return errOut([diagnosticLine(`mv: ${result.error.message}`)]);
      return okOut();
    },
  });

  // ---- Utility -------------------------------------------------------------
  define({
    name: 'echo',
    summary: 'Print text.',
    usage: 'echo <text...>',
    aliases: [],
    options: [],
    run: (args) => okOut([stdout(args.positional.join(' '))]),
  });

  define({
    name: 'clear',
    summary: 'Clear the terminal.',
    usage: 'clear',
    aliases: [],
    options: [],
    run: () => ({ exitCode: 0, lines: [], clear: true }),
  });

  define({
    name: 'history',
    summary: 'Show command history.',
    usage: 'history',
    aliases: [],
    options: [],
    run: (_args, ctx) => {
      const history = ctx.history ?? [];
      return okOut(history.map((cmd, index) => stdout(`${String(index + 1).padStart(4)}  ${cmd}`)));
    },
  });

  define({
    name: 'help',
    summary: 'List commands or show help for one.',
    usage: 'help [command]',
    aliases: [],
    options: [],
    run: (args) => {
      const name = args.positional[0];
      if (name !== undefined) {
        const command = registry.get(name);
        if (!command) return errOut([diagnosticLine(`help: no such command: ${name}`)]);
        return okOut([
          systemLine(`${command.name} — ${command.summary}`),
          stdout(`usage: ${command.usage}`),
        ]);
      }
      const lines: OutputLine[] = [systemLine('Available commands:')];
      for (const command of registry.list()) {
        lines.push(stdout(`  ${command.name.padEnd(10)} ${command.summary}`));
      }
      return okOut(lines);
    },
  });

  // ---- Development (compile / run) -----------------------------------------
  define({
    name: 'compile',
    summary: 'Assemble a NovaASM (.asm) file into bytecode.',
    usage: 'compile <file>',
    aliases: [],
    options: [],
    run: (args, ctx) => {
      if (!ctx.runner) return errOut([diagnosticLine('compile: no toolchain is attached.')]);
      const path = args.positional[0];
      if (path === undefined) return errOut([diagnosticLine('compile: missing file operand')]);
      const source = ctx.filesystem.readText(path, fsCtx(ctx));
      if (!source.ok) return errOut([diagnosticLine(`compile: ${source.error.message}`)]);
      const report = ctx.runner.compile(path, source.value);
      const lines: OutputLine[] = report.diagnostics.map((d) => renderDiagnostic(path, d));
      if (report.ok) {
        lines.push(
          systemLine(
            `Compiled ${path}: ${report.instructionCount} instruction(s), entry 0x${report.entryPoint.toString(16)}.`,
          ),
        );
      }
      return { exitCode: report.ok ? 0 : 1, lines };
    },
  });

  define({
    name: 'run',
    summary: 'Compile and run a program file as a process.',
    usage: 'run <file>',
    aliases: [],
    options: [],
    run: (args, ctx) => {
      if (!ctx.runner) return errOut([diagnosticLine('run: no toolchain is attached.')]);
      const path = args.positional[0];
      if (path === undefined) return errOut([diagnosticLine('run: missing file operand')]);
      const source = ctx.filesystem.readText(path, fsCtx(ctx));
      if (!source.ok) return errOut([diagnosticLine(`run: ${source.error.message}`)]);
      const report = ctx.runner.run(path, source.value);
      const lines: OutputLine[] = report.diagnostics.map((d) => renderDiagnostic(path, d));
      if (!report.ok) return { exitCode: 1, lines };
      const out = report.output.endsWith('\n') ? report.output.slice(0, -1) : report.output;
      if (out.length > 0) for (const l of out.split('\n')) lines.push(stdout(l));
      return { exitCode: report.exitCode ?? 0, lines };
    },
  });

  // ---- System inspection (reads kernel snapshots via the inspector) --------
  define({
    name: 'ps',
    summary: 'List processes.',
    usage: 'ps',
    aliases: [],
    options: [],
    run: (_args, ctx) => {
      const unavailable = requireSystem(ctx, 'ps');
      if (unavailable) return unavailable;
      const rows = ctx.system!.processes();
      const lines: OutputLine[] = [systemLine('  PID  NAME        STATE        CPU  MEM   INSTR')];
      for (const p of rows) {
        lines.push(
          stdout(
            `${String(p.pid).padStart(5)}  ${p.name.padEnd(10)}  ${p.state.padEnd(10)} ${String(p.cpuTicks).padStart(4)} ${String(p.memoryBytes).padStart(5)} ${String(p.instructions).padStart(6)}`,
          ),
        );
      }
      if (rows.length === 0) lines.push(stdout('  (no processes)'));
      return okOut(lines);
    },
  });

  define({
    name: 'kill',
    summary: 'Terminate a process.',
    usage: 'kill <pid>',
    aliases: [],
    options: [],
    run: (args, ctx) => {
      const unavailable = requireSystem(ctx, 'kill');
      if (unavailable) return unavailable;
      const raw = args.positional[0];
      const pid = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
      if (!Number.isInteger(pid)) return errOut([diagnosticLine('kill: usage: kill <pid>')]);
      const result = ctx.system!.kill(pid);
      return result.ok
        ? okOut([systemLine(result.message)])
        : errOut([diagnosticLine(result.message)]);
    },
  });

  define({
    name: 'mem',
    summary: 'Show a memory summary.',
    usage: 'mem',
    aliases: [],
    options: [],
    run: (_args, ctx) => {
      const unavailable = requireSystem(ctx, 'mem');
      if (unavailable) return unavailable;
      const m = ctx.system!.memory();
      const lines: OutputLine[] = [
        systemLine(`Memory: ${m.usedBytes}/${m.totalBytes} bytes used, ${m.freeBytes} free`),
      ];
      for (const seg of m.segments) {
        lines.push(
          stdout(
            `  ${seg.kind.padEnd(7)} base=0x${seg.base.toString(16)} size=${seg.size}${seg.ownerPid !== null ? ` pid=${seg.ownerPid}` : ''}`,
          ),
        );
      }
      return okOut(lines);
    },
  });

  define({
    name: 'cpu',
    summary: 'Show a CPU/register summary.',
    usage: 'cpu',
    aliases: [],
    options: [],
    run: (_args, ctx) => {
      const unavailable = requireSystem(ctx, 'cpu');
      if (unavailable) return unavailable;
      const c = ctx.system!.cpu();
      if (!c) return okOut([systemLine('CPU is idle (no running process).')]);
      const regs = c.registers.map((r) => `${r.name}=${r.value}`).join('  ');
      return okOut([systemLine(`flags: ${c.flags}`), stdout(regs)]);
    },
  });

  define({
    name: 'sysinfo',
    summary: 'Show NovaOS system information.',
    usage: 'sysinfo',
    aliases: [],
    options: [],
    run: (_args, ctx) => {
      const unavailable = requireSystem(ctx, 'sysinfo');
      if (unavailable) return unavailable;
      const s = ctx.system!.sysinfo();
      return okOut([
        systemLine(`NovaOS ${s.version}`),
        stdout(`uptime:    ${s.uptimeTicks} ticks`),
        stdout(`scheduler: ${s.schedulerName}`),
        stdout(`processes: ${s.processCount}`),
        stdout(`memory:    ${s.usedMemoryBytes}/${s.totalMemoryBytes} bytes`),
      ]);
    },
  });

  for (const command of commands) registry.register(command);
}
