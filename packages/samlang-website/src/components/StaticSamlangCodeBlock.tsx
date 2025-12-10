import * as shiki from 'shiki';
import devSamTheme from 'dev-sam-theme/themes/dev-sam-theme.json';
import samlangGrammar from '../../../samlang-vscode/syntaxes/samlang.json';

type Props = {
  readonly language?: string;
  readonly children: string;
};

const theme: shiki.ThemeInput = {
  ...devSamTheme,
  name: 'dev-sam-theme',
  fg: '#38484F',
  bg: '#F7F7F7',
  type: 'light',
};

const lang: shiki.LanguageRegistration = {
  ...(samlangGrammar as any),
  name: 'samlang',
  scopeName: 'text.samlang',
};

export default async function StaticSamlangCodeBlock({
  children,
}: Props): Promise<React.JSX.Element> {
  const highlighter = await shiki.createHighlighter({
    themes: ['andromeeda', theme],
    langs: [lang],
  });

  return (
    <div
      dangerouslySetInnerHTML={{
        __html: highlighter.codeToHtml(children, { theme: 'dev-sam-theme', lang: 'samlang' }),
      }}
    />
  );
}
