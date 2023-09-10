import { initializeMonacoEditor } from './samlang-config';

type Props = {
  readonly language?: string;
  readonly children: string;
};

export default async function StaticCodeBlock({
  language = 'samlang',
  children,
}: Props): Promise<JSX.Element> {
  const monaco = await import('monaco-editor/esm/vs/editor/editor.api');
  initializeMonacoEditor(monaco, false);
  const html = await monaco.editor.colorize(children, language, { tabSize: 2 });
  return <pre dangerouslySetInnerHTML={{ __html: html }} />;
}
