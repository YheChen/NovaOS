import type { ProcessView } from '@novaos/debugger';

/** The kernel process table + scheduler ready queue during a debug run. */
export function ProcessTable({ view }: { view: ProcessView }) {
  return (
    <>
      <h4 className="muted">
        Processes · {view.algorithm}
        {view.quantumTicks !== null ? ` · quantum ${view.quantumTicks}` : ''}
      </h4>
      <table>
        <tbody>
          {view.processes.map((p) => (
            <tr key={p.pid} className={p.pid === view.runningPid ? 'hl' : undefined}>
              <td>#{p.pid}</td>
              <td>{p.name}</td>
              <td className="muted">
                {p.state}
                {p.pid === view.runningPid ? ' (running)' : ''}
              </td>
              <td className="muted">{p.instructionsExecuted} ins</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        ready queue:{' '}
        {view.readyQueue.length ? view.readyQueue.map((p) => `#${p}`).join(', ') : '(empty)'}
      </p>
    </>
  );
}
