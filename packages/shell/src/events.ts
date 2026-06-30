import type { SimTime } from '@novaos/shared';
import type { EventInput } from '@novaos/events';

export const ShellEventType = {
  CommandStarted: 'shell.command.started',
  CommandFinished: 'shell.command.finished',
  CommandFailed: 'shell.command.failed',
  CwdChanged: 'shell.cwd.changed',
} as const;

const shellEvent = (type: string, tick: SimTime, payload: unknown): EventInput => ({
  type,
  tick,
  source: 'shell',
  payload,
});

export const commandStartedEvent = (tick: SimTime, command: string, input: string): EventInput =>
  shellEvent(ShellEventType.CommandStarted, tick, { command, input });

export const commandFinishedEvent = (
  tick: SimTime,
  command: string,
  exitCode: number,
): EventInput => shellEvent(ShellEventType.CommandFinished, tick, { command, exitCode });

export const commandFailedEvent = (tick: SimTime, command: string, message: string): EventInput =>
  shellEvent(ShellEventType.CommandFailed, tick, { command, message });

export const cwdChangedEvent = (tick: SimTime, from: string, to: string): EventInput =>
  shellEvent(ShellEventType.CwdChanged, tick, { from, to });
