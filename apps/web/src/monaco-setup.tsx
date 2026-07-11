import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

// Bundle the editor worker with Vite (no CDN, works offline / under strict CSP).
(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};
loader.config({ monaco });

let registered = false;

/** Register a minimal Toy C language (syntax highlighting) once. */
export function registerToyC(): void {
  if (registered) return;
  registered = true;
  monaco.languages.register({ id: 'toyc' });
  monaco.languages.setMonarchTokensProvider('toyc', {
    keywords: ['int', 'bool', 'void', 'if', 'else', 'while', 'return', 'true', 'false', 'print'],
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [/\d+/, 'number'],
        [/[a-zA-Z_]\w*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
        [/[{}()[\];,]/, 'delimiter'],
        [/[+\-*/%=<>!&|]+/, 'operator'],
      ],
      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[/*]/, 'comment'],
      ],
    },
  });
}
