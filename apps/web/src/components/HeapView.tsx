import type { HeapView as HeapViewData } from '@novaos/debugger';

/** Visualizes the process heap as allocated/free blocks (from malloc/free). */
export function HeapView({ view }: { view: HeapViewData }) {
  if (view.blocks.length === 0) return null;
  const total = view.blocks.reduce((sum, b) => sum + b.size, 0) || 1;
  return (
    <>
      <h4 className="muted">Heap</h4>
      <div className="heap-bar">
        {view.blocks.map((b, i) => (
          <div
            key={i}
            className={`heap-block ${b.free ? 'free' : 'used'}`}
            style={{ flexGrow: b.size / total }}
            title={`0x${b.start.toString(16)} · ${b.size}B · ${b.free ? 'free' : 'allocated'}`}
          />
        ))}
      </div>
      <table>
        <tbody>
          {view.blocks.map((b, i) => (
            <tr key={i}>
              <td className="muted">0x{b.start.toString(16).padStart(4, '0')}</td>
              <td>{b.size}B</td>
              <td className="muted">{b.free ? 'free' : 'allocated'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
