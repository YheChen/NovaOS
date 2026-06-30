import type { SimTime } from '@novaos/shared';
import type { EventInput } from '@novaos/events';

export const TerminalEventType = {
  InputChanged: 'terminal.input.changed',
  CommandSubmitted: 'terminal.command.submitted',
  OutputAppended: 'terminal.output.appended',
  Cleared: 'terminal.cleared',
  Interrupted: 'terminal.interrupted',
  AutocompleteRequested: 'terminal.autocomplete.requested',
} as const;

const terminalEvent = (type: string, tick: SimTime, payload: unknown): EventInput => ({
  type,
  tick,
  source: 'terminal',
  payload,
});

export const commandSubmittedEvent = (
  tick: SimTime,
  terminalId: string,
  input: string,
): EventInput => terminalEvent(TerminalEventType.CommandSubmitted, tick, { terminalId, input });

export const outputAppendedEvent = (
  tick: SimTime,
  terminalId: string,
  chunks: number,
): EventInput => terminalEvent(TerminalEventType.OutputAppended, tick, { terminalId, chunks });

export const clearedEvent = (tick: SimTime, terminalId: string): EventInput =>
  terminalEvent(TerminalEventType.Cleared, tick, { terminalId });

export const interruptedEvent = (tick: SimTime, terminalId: string): EventInput =>
  terminalEvent(TerminalEventType.Interrupted, tick, { terminalId });

export const autocompleteRequestedEvent = (
  tick: SimTime,
  terminalId: string,
  input: string,
): EventInput =>
  terminalEvent(TerminalEventType.AutocompleteRequested, tick, { terminalId, input });
