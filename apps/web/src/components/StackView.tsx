import type { DebuggerSnapshot } from '@novaos/debugger';

/**
 * A live memory view of the process stack: one row per 32-bit word from the top
 * of the stack down to the current SP, annotated with SP/BP and each frame's
 * saved-BP and return-address slots. Watch it grow and shrink as calls happen.
 */
export function StackView({
  snapshot,
  readWord,
}: {
  snapshot: DebuggerSnapshot;
  readWord: (address: number) => number | null;
}) {
  const sp = snapshot.registers.sp;
  const bp = snapshot.registers.bp;
  const frames = snapshot.callStack;
  const topBp = frames.reduce((max, f) => Math.max(max, f.basePointer), bp);
  const top = topBp + 8; // include the outermost frame's saved BP + return address
  const bottom = Math.min(sp, bp);

  const rows: { addr: number; value: number | null }[] = [];
  for (let a = top; a >= bottom && rows.length < 64; a -= 4) {
    rows.push({ addr: a, value: readWord(a) });
  }

  const annotate = (addr: number): string => {
    const tags: string[] = [];
    if (addr === sp) tags.push('<- SP');
    if (addr === bp) tags.push('<- BP');
    for (const f of frames) {
      if (addr === f.basePointer) tags.push(`saved BP (${f.functionName})`);
      else if (addr === f.basePointer + 4) tags.push('return addr');
    }
    return tags.join(' ');
  };

  return (
    <>
      <h4 className="muted">Stack (memory)</h4>
      {rows.length === 0 ? (
        <p className="empty">(empty)</p>
      ) : (
        <table>
          <tbody>
            {rows.map((r) => {
              const hl = r.addr === sp || r.addr === bp;
              return (
                <tr key={r.addr} className={hl ? 'hl' : undefined}>
                  <td className="muted">0x{r.addr.toString(16).padStart(4, '0')}</td>
                  <td>
                    {r.value === null
                      ? 'n/a'
                      : `0x${(r.value >>> 0).toString(16).padStart(8, '0')}`}
                  </td>
                  <td className="muted">{annotate(r.addr)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
