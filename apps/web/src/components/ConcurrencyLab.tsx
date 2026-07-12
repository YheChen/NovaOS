import { useMemo, useState } from 'react';
import {
  runRace,
  firstRacingSeed,
  runSemaphoreDemo,
  type RaceResult,
  type MicroAction,
} from '@novaos/concurrency';

const THREAD_COLORS = ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#bc8cff', '#39c5cf'];
const threadColor = (t: number): string => THREAD_COLORS[t % THREAD_COLORS.length] as string;

function ResultCard({ result, tone }: { result: RaceResult; tone: 'bad' | 'good' }) {
  const correct = !result.raced;
  return (
    <div className="race-card" data-testid={tone === 'bad' ? 'race-unlocked' : 'race-locked'}>
      <div className="race-card-head">
        <span>{tone === 'bad' ? 'No lock · data race' : 'Mutex · critical section'}</span>
        <span className={correct ? 'statebadge loaded' : 'statebadge running'}>
          {correct ? 'correct' : 'RACE'}
        </span>
      </div>
      <div className="race-stats">
        <div className="stat">
          <div className="stat-value">{result.expected}</div>
          <div className="muted">expected</div>
        </div>
        <div className="stat">
          <div className="stat-value" style={{ color: correct ? 'var(--green)' : 'var(--red)' }}>
            {result.finalCounter}
          </div>
          <div className="muted">final counter</div>
        </div>
        <div className="stat">
          <div
            className="stat-value"
            style={{ color: result.lostUpdates ? 'var(--red)' : 'var(--muted)' }}
          >
            {result.lostUpdates}
          </div>
          <div className="muted">lost updates</div>
        </div>
      </div>
    </div>
  );
}

/** A compact, replayable interleaving trace for one run. */
function Trace({ result }: { result: RaceResult }) {
  // Flag "stale writes": a write that did not advance the counter past what it
  // was when this thread last read — the visible signature of a lost update.
  const staleWrite = (index: number): boolean => {
    const step = result.steps[index];
    if (!step || step.action !== 'write') return false;
    const prev = index > 0 ? result.steps[index - 1] : undefined;
    return prev !== undefined && step.counter <= prev.counter;
  };
  const glyph: Record<MicroAction, string> = {
    lock: '🔒',
    read: 'read',
    add: 'add',
    write: 'write',
    unlock: '🔓',
  };
  return (
    <div className="race-trace">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>thread</th>
            <th>action</th>
            <th>counter</th>
            <th>reg</th>
          </tr>
        </thead>
        <tbody>
          {result.steps.map((s, i) => (
            <tr key={s.index} className={staleWrite(i) ? 'stale-write' : undefined}>
              <td className="muted">{s.index}</td>
              <td>
                <span className="thread-dot" style={{ background: threadColor(s.thread) }} />T
                {s.thread}
              </td>
              <td>{glyph[s.action]}</td>
              <td>{s.counter}</td>
              <td className="muted">{s.register}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ConcurrencyLab() {
  const [threads, setThreads] = useState(3);
  const [increments, setIncrements] = useState(8);

  const { unlocked, locked, seed, sem } = useMemo(() => {
    const base = { threads, incrementsPerThread: increments };
    const racingSeed = firstRacingSeed(base) ?? 0;
    return {
      seed: racingSeed,
      unlocked: runRace({ ...base, useLock: false, seed: racingSeed }),
      locked: runRace({ ...base, useLock: true, seed: racingSeed }),
      sem: runSemaphoreDemo({ workers: threads + 2, permits: 2, rounds: 3, seed: racingSeed }),
    };
  }, [threads, increments]);

  return (
    <div className="conc-lab" data-testid="concurrency-lab">
      <div className="panel-title">Concurrency lab · shared-counter race</div>
      <div className="panel-body">
        <p className="muted" style={{ marginTop: 0 }}>
          {threads} threads each increment a shared counter {increments}× ({' '}
          <code>read → add → write</code>). The interleaving is chosen by a seeded PRNG (seed {seed}
          ), so every race here is exactly reproducible.
        </p>

        <div className="conc-controls">
          <label>
            threads
            <input
              type="range"
              min={2}
              max={6}
              value={threads}
              className="scrubber"
              data-testid="conc-threads"
              onChange={(e) => setThreads(Number(e.target.value))}
            />
            <span className="mono">{threads}</span>
          </label>
          <label>
            increments / thread
            <input
              type="range"
              min={2}
              max={20}
              value={increments}
              className="scrubber"
              data-testid="conc-increments"
              onChange={(e) => setIncrements(Number(e.target.value))}
            />
            <span className="mono">{increments}</span>
          </label>
        </div>

        <div className="race-grid">
          <ResultCard result={unlocked} tone="bad" />
          <ResultCard result={locked} tone="good" />
        </div>

        <h4 className="muted">
          Interleaving trace (unsynchronized) — {unlocked.steps.length} steps, highlighted rows are
          stale writes that dropped an increment
        </h4>
        <Trace result={unlocked} />

        <h4 className="muted">Counting semaphore · bounded resource</h4>
        <p className="muted">
          {sem.config.workers} workers, {sem.permits} permits → peak concurrent holders{' '}
          <strong style={{ color: 'var(--accent)' }}>{sem.maxConcurrent}</strong> (never exceeds{' '}
          {sem.permits}
          {sem.contended ? ', and workers had to wait' : ''}).
        </p>
      </div>
    </div>
  );
}
