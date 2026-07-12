import { useMemo, useState } from 'react';
import {
  compareSchedulers,
  PRESET_WORKLOADS,
  presetById,
  type AlgorithmRun,
  type ComparisonResult,
} from '@novaos/scheduler';

const COLORS = ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#bc8cff', '#39c5cf'];
const colorFor = (pid: number): string => COLORS[pid % COLORS.length] as string;

/** Best value per column drives the "best" highlight; lower is better except throughput. */
function bests(runs: readonly AlgorithmRun[]) {
  const min = (pick: (r: AlgorithmRun) => number) => Math.min(...runs.map(pick));
  const max = (pick: (r: AlgorithmRun) => number) => Math.max(...runs.map(pick));
  return {
    turnaround: min((r) => r.metrics.avgTurnaround),
    waiting: min((r) => r.metrics.avgWaiting),
    response: min((r) => r.metrics.avgResponse),
    throughput: max((r) => r.metrics.throughput),
    switches: min((r) => r.metrics.contextSwitches),
  };
}

const cls = (isBest: boolean): string | undefined => (isBest ? 'best' : undefined);

function MetricsTable({ result }: { result: ComparisonResult }) {
  const b = bests(result.runs);
  return (
    <table data-testid="metrics-table">
      <thead>
        <tr>
          <th>Algorithm</th>
          <th>Avg turnaround</th>
          <th>Avg waiting</th>
          <th>Avg response</th>
          <th>Throughput</th>
          <th>Ctx switches</th>
        </tr>
      </thead>
      <tbody>
        {result.runs.map(({ metrics: m }) => (
          <tr key={m.algorithm} data-testid={`metrics-row-${m.algorithm}`}>
            <td>{m.displayName}</td>
            <td className={cls(m.avgTurnaround === b.turnaround)}>{m.avgTurnaround.toFixed(2)}</td>
            <td className={cls(m.avgWaiting === b.waiting)}>{m.avgWaiting.toFixed(2)}</td>
            <td className={cls(m.avgResponse === b.response)}>{m.avgResponse.toFixed(2)}</td>
            <td className={cls(m.throughput === b.throughput)}>{m.throughput.toFixed(3)}</td>
            <td className={cls(m.contextSwitches === b.switches)}>{m.contextSwitches}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GanttStrip({ run, totalTicks }: { run: AlgorithmRun; totalTicks: number }) {
  const width = Math.max(1, totalTicks);
  return (
    <div className="gantt-strip">
      <span className="gantt-name muted">{run.metrics.displayName}</span>
      <div className="gantt-track">
        <svg
          viewBox={`0 0 ${width} 24`}
          width="100%"
          height="24"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${run.metrics.displayName} timeline`}
          data-testid={`gantt-${run.metrics.algorithm}`}
        >
          {run.timeline.map((seg, i) => (
            <rect
              key={i}
              x={seg.start}
              y="2"
              width={seg.end - seg.start}
              height="20"
              fill={seg.pid === null ? 'var(--panel-2)' : colorFor(Number(seg.pid))}
              stroke="var(--border)"
              strokeWidth="0.1"
            >
              <title>{`${seg.label}: ${seg.start}–${seg.end}`}</title>
            </rect>
          ))}
        </svg>
      </div>
    </div>
  );
}

export function SchedulerComparison() {
  const [workloadName, setWorkloadName] = useState(PRESET_WORKLOADS[0]?.name ?? '');
  const [quantum, setQuantum] = useState(4);

  const workload = useMemo(() => presetById(workloadName) ?? PRESET_WORKLOADS[0], [workloadName]);
  const result = useMemo(
    () => (workload ? compareSchedulers(workload, { quantumTicks: quantum }) : null),
    [workload, quantum],
  );

  if (!workload || !result) {
    return <div className="empty">No workloads available.</div>;
  }

  return (
    <div className="conc-lab" data-testid="scheduler-lab">
      <div className="panel-title">Scheduler lab · one workload, seven algorithms</div>
      <div className="panel-body">
        <p className="muted" style={{ marginTop: 0 }}>
          The same jobs run through FIFO, Round-Robin, Priority, Lottery, SJF, SRTF, and MLFQ on a
          single deterministic CPU. Lottery draws from a seeded PRNG, so every comparison is exactly
          reproducible.
        </p>

        <div className="conc-controls">
          <label>
            workload
            <select
              className="gallery"
              value={workloadName}
              data-testid="workload-select"
              aria-label="Select a workload"
              onChange={(e) => setWorkloadName(e.target.value)}
            >
              {PRESET_WORKLOADS.map((w) => (
                <option key={w.name} value={w.name}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            quantum
            <input
              type="range"
              min={1}
              max={8}
              value={quantum}
              className="scrubber"
              data-testid="quantum-input"
              aria-label="Round-robin / lottery / MLFQ base quantum"
              onChange={(e) => setQuantum(Number(e.target.value))}
            />
            <span className="mono">{quantum}</span>
          </label>
        </div>

        <h4 className="muted">Jobs (shared input)</h4>
        <table>
          <thead>
            <tr>
              <th>Job</th>
              <th>Arrival</th>
              <th>Burst</th>
              <th>Priority</th>
            </tr>
          </thead>
          <tbody>
            {workload.jobs.map((j) => (
              <tr key={Number(j.pid)}>
                <td>
                  <span className="thread-dot" style={{ background: colorFor(Number(j.pid)) }} />
                  {j.label}
                </td>
                <td>{j.arrival}</td>
                <td>{j.burst}</td>
                <td>{j.priority}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h4 className="muted">Metrics (green = best; lower is better except throughput)</h4>
        <MetricsTable result={result} />

        <h4 className="muted">Gantt timeline (shared {result.totalTicks}-tick x-axis)</h4>
        <div data-testid="gantt">
          {result.runs.map((run) => (
            <GanttStrip key={run.metrics.algorithm} run={run} totalTicks={result.totalTicks} />
          ))}
        </div>
        <div className="gantt-legend">
          {workload.jobs.map((j) => (
            <span key={Number(j.pid)}>
              <span className="legend-dot" style={{ background: colorFor(Number(j.pid)) }} />
              {j.label}
            </span>
          ))}
          <span>
            <span className="legend-dot" style={{ background: 'var(--panel-2)' }} />
            idle
          </span>
        </div>
      </div>
    </div>
  );
}
