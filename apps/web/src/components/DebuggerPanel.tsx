import { useState } from 'react';
import type { RegisterFileSnapshot } from '@novaos/cpu';
import type { DebuggerSnapshot, ProcessView } from '@novaos/debugger';
import { StackView } from './StackView';
import { ProcessTable } from './ProcessTable';

export interface DebugActions {
  stepInstruction: () => void;
  stepLine: () => void;
  stepInto: () => void;
  stepOut: () => void;
  continueExecution: () => void;
  stepBack: () => void;
  restart: () => void;
  jumpToStep: (step: number) => void;
  addWatch: (expression: string) => void;
}

const REG_KEYS = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'pc', 'sp', 'bp', 'ir'] as const;

export function DebuggerPanel({
  snapshot,
  previousRegisters,
  totalSteps = 0,
  readWord,
  processView,
  source,
  actions,
}: {
  snapshot: DebuggerSnapshot | null;
  previousRegisters?: RegisterFileSnapshot | null;
  totalSteps?: number;
  readWord?: (address: number) => number | null;
  processView?: ProcessView | null;
  source: string;
  actions: DebugActions;
}) {
  const [watchInput, setWatchInput] = useState('');

  if (!snapshot) {
    return (
      <div className="panel" style={{ flex: 1 }}>
        <div className="panel-title">Debugger</div>
        <div className="panel-body empty">Press “Debug” to start a paused session at entry.</div>
      </div>
    );
  }

  const done = snapshot.state === 'terminated';
  const line = snapshot.currentLocation?.sourceLine ?? null;

  return (
    <div className="panel" style={{ flex: 1, minHeight: 0 }}>
      <div className="panel-title">
        Debugger <span className={`statebadge ${snapshot.state}`}>{snapshot.state}</span>{' '}
        <span className="muted">({snapshot.pauseReason})</span>
      </div>
      <div className="panel-body" style={{ flex: 1 }}>
        <div className="toolbar" style={{ marginBottom: 8 }}>
          <button onClick={actions.stepInstruction} disabled={done}>
            Step instr
          </button>
          <button onClick={actions.stepLine} disabled={done}>
            Step over
          </button>
          <button onClick={actions.stepInto} disabled={done}>
            Step into
          </button>
          <button onClick={actions.stepOut} disabled={done}>
            Step out
          </button>
          <button onClick={actions.continueExecution} disabled={done}>
            Continue
          </button>
          <button onClick={actions.stepBack}>Step back</button>
          <button onClick={actions.restart}>Restart</button>
        </div>

        <SourceView source={source} currentLine={line} />

        <h4 className="muted">Registers</h4>
        <table>
          <tbody>
            {REG_KEYS.map((k) => {
              const changed = previousRegisters
                ? previousRegisters[k] !== snapshot.registers[k]
                : false;
              return (
                <tr key={k} className={changed ? 'reg-changed' : undefined}>
                  <th>{k.toUpperCase()}</th>
                  <td>{snapshot.registers[k]}</td>
                  <td className="muted">0x{snapshot.registers[k].toString(16)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <h4 className="muted">Call stack</h4>
        {snapshot.callStack.length === 0 ? (
          <p className="empty">(empty)</p>
        ) : (
          <table>
            <tbody>
              {snapshot.callStack.map((f) => (
                <tr key={f.index}>
                  <td>#{f.index}</td>
                  <td>{f.functionName}</td>
                  <td className="muted">line {f.sourceLine ?? '?'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {readWord && <StackView snapshot={snapshot} readWord={readWord} />}

        {processView && <ProcessTable view={processView} />}

        <h4 className="muted">Watches</h4>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (watchInput.trim()) {
              actions.addWatch(watchInput.trim());
              setWatchInput('');
            }
          }}
        >
          <input
            value={watchInput}
            onChange={(e) => setWatchInput(e.target.value)}
            placeholder="e.g. R0, mem[SP], BP - SP"
            style={{
              width: '100%',
              background: 'var(--bg)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '4px 6px',
              fontFamily: 'var(--mono)',
            }}
          />
        </form>
        {snapshot.watches.length > 0 && (
          <table>
            <tbody>
              {snapshot.watches.map((w) => (
                <tr key={w.expression}>
                  <td>{w.expression}</td>
                  <td>{w.available ? w.value : '<unavailable>'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h4 className="muted">Timeline</h4>
        <p>
          step <strong>{snapshot.timeline.cursor}</strong>
          {totalSteps > 0 ? ` / ${totalSteps}` : ''} · {snapshot.timeline.eventCount} events
        </p>
        {totalSteps > 0 && (
          <input
            type="range"
            className="scrubber"
            min={0}
            max={totalSteps}
            value={Math.min(snapshot.timeline.cursor, totalSteps)}
            onChange={(e) => actions.jumpToStep(Number(e.target.value))}
            aria-label="Scrub execution timeline"
          />
        )}
        {snapshot.output.trim() && (
          <>
            <h4 className="muted">Output</h4>
            <div className="terminal">{snapshot.output}</div>
          </>
        )}
      </div>
    </div>
  );
}

function SourceView({ source, currentLine }: { source: string; currentLine: number | null }) {
  const lines = source.split('\n');
  return (
    <pre
      style={{ border: '1px solid var(--border)', borderRadius: 4, padding: 8, marginBottom: 8 }}
    >
      {lines.map((text, i) => {
        const n = i + 1;
        return (
          <span key={n} className={`codeline ${n === currentLine ? 'current' : ''}`}>
            {String(n).padStart(2, ' ')} {text || ' '}
            {'\n'}
          </span>
        );
      })}
    </pre>
  );
}
