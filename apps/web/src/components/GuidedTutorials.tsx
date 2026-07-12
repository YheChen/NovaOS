import { useMemo, useRef, useState } from 'react';
import { createProgramRunner, type ProgramRunner } from '@novaos/simulator';
import {
  TUTORIALS,
  tutorialById,
  verifyCheckpoint,
  type CheckpointResult,
  type TutorialStep,
} from '@novaos/tutorials';

export interface GuidedTutorialsProps {
  /** Seed the workspace editor with a step's starter program and switch to it. */
  onLoadStep: (source: string, language: 'toy-c' | 'assembly') => void;
}

export function GuidedTutorials({ onLoadStep }: GuidedTutorialsProps) {
  const runnerRef = useRef<ProgramRunner>(createProgramRunner());
  const [tutorialId, setTutorialId] = useState(TUTORIALS[0]?.id ?? '');
  const [stepIndex, setStepIndex] = useState(0);
  const [results, setResults] = useState<Record<string, CheckpointResult>>({});
  const [doneSteps, setDoneSteps] = useState<Set<string>>(new Set());
  const [showHints, setShowHints] = useState(false);

  const tutorial = useMemo(() => tutorialById(tutorialId), [tutorialId]);
  const step: TutorialStep | undefined = tutorial?.steps[stepIndex];

  if (!tutorial || !step) return <div className="empty">No tutorials available.</div>;

  const selectTutorial = (id: string) => {
    setTutorialId(id);
    setStepIndex(0);
    setResults({});
    setDoneSteps(new Set());
    setShowHints(false);
  };

  const goTo = (index: number) => {
    setStepIndex(index);
    setResults({});
    setShowHints(false);
  };

  const check = () => {
    const next: Record<string, CheckpointResult> = {};
    for (const cp of step.checkpoints) {
      next[cp.id] = verifyCheckpoint(cp, {
        runner: runnerRef.current,
        fileName: step.starterProgram.fileName,
        source: step.starterProgram.source,
      });
    }
    setResults(next);
    const allPassed = step.checkpoints.every((cp) => next[cp.id]?.passed);
    if (allPassed) setDoneSteps((prev) => new Set(prev).add(step.id));
  };

  const doneCount = tutorial.steps.filter((s) => doneSteps.has(s.id)).length;

  return (
    <div className="conc-lab" data-testid="tutorials-view">
      <div className="panel-title">Guided tutorials · a walkthrough of the whole lab</div>
      <div className="panel-body tutorial-grid">
        <aside className="tutorial-sidebar">
          <select
            className="gallery"
            value={tutorialId}
            data-testid="tutorial-picker"
            aria-label="Select a tutorial"
            onChange={(e) => selectTutorial(e.target.value)}
          >
            {TUTORIALS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <p className="muted">{tutorial.summary}</p>
          <p className="muted" data-testid="tutorial-progress">
            {doneCount} / {tutorial.steps.length} steps · ~{tutorial.estimatedMinutes} min
          </p>
          <ol className="tutorial-steps">
            {tutorial.steps.map((s, i) => {
              const state = doneSteps.has(s.id) ? 'done' : i === stepIndex ? 'active' : 'todo';
              return (
                <li key={s.id}>
                  <button
                    className={`tutorial-step-link ${state}`}
                    aria-current={i === stepIndex}
                    onClick={() => goTo(i)}
                  >
                    <span className={`statebadge ${state === 'done' ? 'loaded' : ''}`}>
                      {state === 'done' ? '✓' : i + 1}
                    </span>
                    {s.title}
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <section className="tutorial-viewer">
          <h3>{step.title}</h3>
          <p>{step.explanation}</p>

          <div className="tutorial-actions">
            <button
              className="primary"
              data-testid="tutorial-load-step"
              onClick={() => onLoadStep(step.starterProgram.source, step.starterProgram.language)}
            >
              Load into editor
            </button>
            <button
              data-testid="tutorial-prev"
              disabled={stepIndex === 0}
              onClick={() => goTo(stepIndex - 1)}
            >
              ← Prev
            </button>
            <button
              data-testid="tutorial-next"
              disabled={stepIndex >= tutorial.steps.length - 1}
              onClick={() => goTo(stepIndex + 1)}
            >
              Next →
            </button>
            <button data-testid="tutorial-check" onClick={check}>
              Check
            </button>
          </div>

          <pre className="tutorial-source">{step.starterProgram.source}</pre>

          <h4 className="muted">Checkpoints</h4>
          {step.checkpoints.length === 0 ? (
            <p className="muted">Informational step — no checkpoint to verify.</p>
          ) : (
            <ul className="tutorial-checkpoints">
              {step.checkpoints.map((cp) => {
                const r = results[cp.id];
                const cls = r
                  ? r.passed
                    ? 'statebadge loaded'
                    : 'statebadge running'
                  : 'statebadge';
                return (
                  <li key={cp.id} data-testid={`checkpoint-${cp.id}`}>
                    <span className={cls}>{r ? (r.passed ? 'pass' : 'fail') : '—'}</span>{' '}
                    {cp.description}
                    {r && <span className="muted"> · {r.detail}</span>}
                  </li>
                );
              })}
            </ul>
          )}

          {step.hints && step.hints.length > 0 && (
            <p>
              <button onClick={() => setShowHints((h) => !h)}>
                {showHints ? 'Hide hints' : 'Show hints'}
              </button>
            </p>
          )}
          {showHints &&
            step.hints?.map((h, i) => (
              <p key={i} className="muted">
                💡 {h}
              </p>
            ))}
        </section>
      </div>
    </div>
  );
}
