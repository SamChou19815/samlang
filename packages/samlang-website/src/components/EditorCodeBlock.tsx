'use client';

import Editor from '@monaco-editor/react';
import { initializeMonacoEditor, monacoEditorOptions, onMonacoModelMount } from './samlang-config';

type Props = {
  readonly path?: string;
  readonly language?: string;
  readonly children: string;
};

export default function EditorCodeBlock({
  language = 'samlang',
  path,
  children,
}: Props): React.JSX.Element {
  const height = (children.trim().split('\n').length + 1) * 20;
  return (
    <Editor
      defaultLanguage={language}
      theme="sam-theme"
      className="mb-4"
      height={height}
      defaultValue={children}
      loading={<pre>{children}</pre>}
      path={path}
      options={{
        ...monacoEditorOptions,
        readOnly: path == null,
        renderFinalNewline: 'off',
        scrollbar: { vertical: 'hidden', verticalScrollbarSize: 0, handleMouseWheel: false },
        dimension: { width: 0, height },
      }}
      onMount={(editor, monaco) => {
        if (path != null) onMonacoModelMount(editor, monaco);
      }}
      onChange={(newSource) => {
        if (newSource) {
        }
      }}
      beforeMount={(monaco) => {
        initializeMonacoEditor(monaco, path != null);
      }}
    />
  );
}
