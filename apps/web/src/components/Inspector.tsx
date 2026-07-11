import { useState } from 'react';
import { MNEMONICS, isOpcode } from '@novaos/cpu';
import { formatIR, toInspectorSnapshot, type CompilationResult } from '@novaos/compiler';
import { CfgView } from './CfgView';

const STAGES = [
  'Diagnostics',
  'Tokens',
  'IR',
  'Optimized IR',
  'CFG',
  'Assembly',
  'Bytecode',
  'Symbols',
] as const;
type Stage = (typeof STAGES)[number];

export function Inspector({ compilation }: { compilation: CompilationResult | null }) {
  const [stage, setStage] = useState<Stage>('Diagnostics');

  if (!compilation) {
    return (
      <div className="panel" style={{ flex: 1 }}>
        <div className="panel-title">Compiler Inspector</div>
        <div className="panel-body empty">Compile a program to inspect each stage.</div>
      </div>
    );
  }

  const snap = toInspectorSnapshot(compilation);

  return (
    <div className="panel" style={{ flex: 1, minHeight: 0 }}>
      <div className="tabs">
        {STAGES.map((s) => (
          <span
            key={s}
            className={`tab ${s === stage ? 'active' : ''}`}
            onClick={() => setStage(s)}
          >
            {s}
          </span>
        ))}
      </div>
      <div className="panel-body" style={{ flex: 1 }}>
        {stage === 'Diagnostics' && <Diagnostics compilation={compilation} />}
        {stage === 'Tokens' && (
          <pre>{snap.tokens.map((t) => `${t.kind.padEnd(11)} ${t.lexeme}`).join('\n')}</pre>
        )}
        {stage === 'IR' && <pre>{snap.ir ? formatIR(snap.ir) : '(no IR; fix errors first)'}</pre>}
        {stage === 'Optimized IR' && (
          <pre>{snap.optimizedIr ? formatIR(snap.optimizedIr) : '(none)'}</pre>
        )}
        {stage === 'CFG' && <CfgView module={snap.optimizedIr ?? snap.ir} />}
        {stage === 'Assembly' && <pre>{snap.assembly ?? '(none)'}</pre>}
        {stage === 'Bytecode' && <Bytecode compilation={compilation} />}
        {stage === 'Symbols' && <Symbols compilation={compilation} />}
      </div>
    </div>
  );
}

function Diagnostics({ compilation }: { compilation: CompilationResult }) {
  if (compilation.diagnostics.length === 0) {
    return (
      <p className="muted">
        No diagnostics. {compilation.success ? 'Compiled successfully ✓' : ''}
      </p>
    );
  }
  return (
    <div>
      {compilation.diagnostics.map((d, i) => (
        <div key={i} className={`diag ${d.severity}`}>
          <strong>{d.severity}</strong> {d.code}
          {d.source ? ` (line ${d.source.line})` : ''}: {d.message}
          {d.hint ? <div className="muted">hint: {d.hint}</div> : null}
        </div>
      ))}
    </div>
  );
}

function Bytecode({ compilation }: { compilation: CompilationResult }) {
  const bc = compilation.bytecode;
  if (!bc) return <p className="muted">(no bytecode)</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>addr</th>
          <th>opcode</th>
          <th>a</th>
          <th>b</th>
          <th>c</th>
        </tr>
      </thead>
      <tbody>
        {bc.instructions.map((ins, i) => (
          <tr key={i}>
            <td>0x{ins.address.toString(16).padStart(4, '0')}</td>
            <td>{isOpcode(ins.opcode) ? MNEMONICS[ins.opcode] : ins.opcode}</td>
            <td>{ins.operandA}</td>
            <td>{ins.operandB}</td>
            <td>{ins.operandC}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Symbols({ compilation }: { compilation: CompilationResult }) {
  const syms = compilation.bytecode?.symbols.symbols ?? [];
  if (syms.length === 0) return <p className="muted">(no symbols)</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>name</th>
          <th>address</th>
          <th>global</th>
        </tr>
      </thead>
      <tbody>
        {syms.map((s) => (
          <tr key={s.name}>
            <td>{s.name}</td>
            <td>0x{s.address.toString(16)}</td>
            <td>{s.global ? '✓' : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
