import type { IRModule, IRBasicBlock, IRFunction } from '@novaos/compiler';

/** A lightweight control-flow graph: basic blocks and their successor edges. */
export function CfgView({ module }: { module: IRModule | null }) {
  if (!module || module.functions.length === 0) {
    return <p className="empty">(compile a program to see its control-flow graph)</p>;
  }
  return (
    <div>
      {module.functions.map((fn) => (
        <FunctionCfg key={fn.name} fn={fn} />
      ))}
    </div>
  );
}

function FunctionCfg({ fn }: { fn: IRFunction }) {
  const labelOf = (id: number): string => fn.blocks.find((b) => b.id === id)?.label ?? `bb${id}`;
  return (
    <div style={{ marginBottom: 12 }}>
      <h4 className="muted">
        func {fn.name}(
        {fn.locals
          .filter((l) => l.isParam)
          .map((l) => l.name)
          .join(', ')}
        )
      </h4>
      {fn.blocks.map((block) => (
        <div key={block.id} className="cfg-block">
          <div className="cfg-block-label">{block.label}</div>
          <div className="muted">{block.instructions.length} instruction(s)</div>
          <div className="cfg-edges">{edges(block, labelOf)}</div>
        </div>
      ))}
    </div>
  );
}

function edges(block: IRBasicBlock, labelOf: (id: number) => string): string {
  const t = block.terminator;
  switch (t.kind) {
    case 'return':
      return t.value === null ? 'return (exit)' : 'return value (exit)';
    case 'jump':
      return `-> ${labelOf(t.target)}`;
    case 'branch':
      return `branch ? ${labelOf(t.thenBlock)} : ${labelOf(t.elseBlock)}`;
  }
}
