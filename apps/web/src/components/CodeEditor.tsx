import MonacoEditor, { type OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useRef, useEffect } from 'react';
import type { Diagnostic } from '@novaos/shared';
import { registerToyC } from '../monaco-setup';

registerToyC();

/**
 * Monaco-backed Toy C editor: syntax highlighting, inline diagnostics (markers),
 * a current-execution-line highlight, and a clickable breakpoint gutter.
 */
export function CodeEditor({
  value,
  onChange,
  diagnostics,
  currentLine,
  breakpointLines,
  onToggleBreakpoint,
}: {
  value: string;
  onChange: (value: string) => void;
  diagnostics: readonly Diagnostic[];
  currentLine: number | null;
  breakpointLines: readonly number[];
  onToggleBreakpoint: (line: number) => void;
}) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<string[]>([]);

  const handleMount: OnMount = (editor, m) => {
    editorRef.current = editor;
    editor.onMouseDown((e) => {
      if (e.target.type === m.editor.MouseTargetType.GUTTER_GLYPH_MARGIN && e.target.position) {
        onToggleBreakpoint(e.target.position.lineNumber);
      }
    });
  };

  // Inline diagnostics as Monaco markers.
  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(
      model,
      'toyc',
      diagnostics
        .filter((d) => d.source)
        .map((d) => {
          const col = d.source?.column ?? 1;
          return {
            startLineNumber: d.source?.line ?? 1,
            startColumn: col,
            endLineNumber: d.source?.line ?? 1,
            endColumn: col + 1,
            message: `${d.code}: ${d.message}${d.hint ? `\nhint: ${d.hint}` : ''}`,
            severity:
              d.severity === 'error'
                ? monaco.MarkerSeverity.Error
                : d.severity === 'warning'
                  ? monaco.MarkerSeverity.Warning
                  : monaco.MarkerSeverity.Info,
          };
        }),
    );
  }, [diagnostics]);

  // Breakpoint glyphs + current execution line highlight.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const decos: monaco.editor.IModelDeltaDecoration[] = breakpointLines.map((line) => ({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        glyphMarginClassName: 'bp-glyph',
        glyphMarginHoverMessage: { value: 'Breakpoint' },
      },
    }));
    if (currentLine) {
      decos.push({
        range: new monaco.Range(currentLine, 1, currentLine, 1),
        options: { isWholeLine: true, className: 'current-exec-line' },
      });
      editor.revealLineInCenterIfOutsideViewport(currentLine);
    }
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, decos);
  }, [currentLine, breakpointLines]);

  return (
    <MonacoEditor
      defaultLanguage="toyc"
      theme="vs-dark"
      value={value}
      onChange={(v) => onChange(v ?? '')}
      onMount={handleMount}
      height="100%"
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        glyphMargin: true,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
      }}
    />
  );
}
