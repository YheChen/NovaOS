import { useRef, useState } from 'react';
import { compileToyC, type CompilationResult } from '@novaos/compiler';
import { createProgramRunner, type ProgramRunner } from '@novaos/simulator';
import {
  createDebugger,
  type DebugController,
  type DebuggerSnapshot,
  type DebugProgram,
} from '@novaos/debugger';
import { Inspector } from './components/Inspector';
import { DebuggerPanel, type DebugActions } from './components/DebuggerPanel';

const DEFAULT_SOURCE = `int main() {
  int a = 5;
  int b = 10;
  int c = a + b;
  print(c);
  return 0;
}
`;

const FILE = 'main.c';

function buildDebugProgram(compilation: CompilationResult): DebugProgram | null {
  if (!compilation.bytecode || !compilation.sourceMap) return null;
  const lineMap = compilation.sourceMap.entries
    .filter((e) => e.sourceLine !== null)
    .map((e) => ({ address: e.bytecodeAddress, line: e.sourceLine as number }));
  return { bytecode: compilation.bytecode, lineMap };
}

export function App() {
  const [source, setSource] = useState(DEFAULT_SOURCE);
  const [compilation, setCompilation] = useState<CompilationResult | null>(null);
  const [output, setOutput] = useState('');
  const [runStatus, setRunStatus] = useState('');
  const [dbgSnapshot, setDbgSnapshot] = useState<DebuggerSnapshot | null>(null);

  const runnerRef = useRef<ProgramRunner>(createProgramRunner());
  const dbgRef = useRef<DebugController | null>(null);

  const compile = (): CompilationResult => {
    const result = compileToyC(source, { fileName: FILE });
    setCompilation(result);
    return result;
  };

  const run = () => {
    const result = compile();
    const report = runnerRef.current.run(FILE, source);
    setOutput(report.output);
    setRunStatus(
      report.ok
        ? `exit ${report.exitCode ?? 0}`
        : `compile error: ${report.diagnostics.length} diagnostic(s)`,
    );
    void result;
  };

  const startDebug = () => {
    const result = compile();
    const program = buildDebugProgram(result);
    if (!program) {
      dbgRef.current = null;
      setDbgSnapshot(null);
      setRunStatus('Cannot debug: fix compile errors first.');
      return;
    }
    const controller = createDebugger(program);
    dbgRef.current = controller;
    setDbgSnapshot(controller.getSnapshot());
    setRunStatus('Debug session started (paused at entry).');
  };

  const withController = (fn: (c: DebugController) => DebuggerSnapshot) => () => {
    const controller = dbgRef.current;
    if (controller) setDbgSnapshot(fn(controller));
  };

  const actions: DebugActions = {
    stepInstruction: withController((c) => c.stepInstruction()),
    stepLine: withController((c) => c.stepLine()),
    stepInto: withController((c) => c.stepInto()),
    stepOut: withController((c) => c.stepOut()),
    continueExecution: withController((c) => c.continueExecution()),
    stepBack: withController((c) => c.stepBack()),
    restart: withController((c) => c.restart()),
    addWatch: (expression) =>
      withController((c) => {
        c.addWatch(expression);
        return c.getSnapshot();
      })(),
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>NovaOS</h1>
        <span className="tag">deterministic OS laboratory</span>
        <div className="toolbar">
          <button className="primary" onClick={compile} data-testid="compile">
            Compile
          </button>
          <button onClick={run} data-testid="run">
            Run
          </button>
          <button onClick={startDebug} data-testid="debug">
            Debug
          </button>
        </div>
      </header>

      <div className="layout">
        <div className="column">
          <div className="panel" style={{ flex: 1, minHeight: 0 }}>
            <div className="panel-title">Editor: {FILE}</div>
            <textarea
              className="editor"
              value={source}
              spellCheck={false}
              onChange={(e) => setSource(e.target.value)}
              data-testid="editor"
            />
          </div>
          <div className="panel">
            <div className="panel-title">Output {runStatus && `· ${runStatus}`}</div>
            <div className="terminal" data-testid="output">
              {output || '(no output yet. Press Run.)'}
            </div>
          </div>
        </div>

        <div className="column">
          <Inspector compilation={compilation} />
        </div>

        <div className="column">
          <DebuggerPanel snapshot={dbgSnapshot} source={source} actions={actions} />
        </div>
      </div>
    </div>
  );
}
