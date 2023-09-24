import * as path from 'path';
import * as shiki from 'shiki';
import devSamTheme from 'dev-sam-theme/themes/dev-sam-theme.json';

type Props = {
  readonly language?: string;
  readonly children: string;
};

export default async function StaticSamlangCodeBlock({ children }: Props): Promise<JSX.Element> {
  const highlighter = await shiki.getHighlighter({
    theme: { ...devSamTheme, settings: [], fg: '#38484F', bg: '#F7F7F7', type: 'light' },
    langs: [
      {
        id: 'samlang',
        scopeName: 'text.samlang',
        path: path.join(__dirname, '../../../../samlang-vscode/syntaxes/samlang.json'),
      },
    ],
  });

  return (
    <div
      dangerouslySetInnerHTML={{ __html: highlighter.codeToHtml(children, { lang: 'samlang' }) }}
    />
  );
}
