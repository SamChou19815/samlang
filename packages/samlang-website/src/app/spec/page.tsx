import * as shiki from 'shiki';
import devSamTheme from 'dev-sam-theme/themes/dev-sam-theme.json';
import samlangGrammar from '../../../../samlang-vscode/syntaxes/samlang.json';
import { MDXRemote } from 'next-mdx-remote/rsc';
import fs from 'fs';
import path from 'path';
import Link from 'next/link';

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

// Global singleton highlighter
let highlighterInstance: shiki.Highlighter | null = null;

async function getHighlighter(): Promise<shiki.Highlighter> {
  if (!highlighterInstance) {
    highlighterInstance = await shiki.createHighlighter({
      themes: [theme],
      langs: [lang],
    });
  }
  return highlighterInstance;
}

export default async function SpecPage(): Promise<React.JSX.Element> {
  const specPath = path.join(process.cwd(), 'spec.md');
  const specContent = fs.readFileSync(specPath, 'utf-8');
  const highlighter = await getHighlighter();

  return (
    <div className="w-full overflow-hidden bg-white min-h-screen">
      <main className="max-w-4xl mx-auto p-8 prose prose-slate">
        <Link href="/" className="inline-block mb-6 text-blue-600 hover:underline no-underline">
          ← Back to Home
        </Link>
        <MDXRemote
          source={specContent}
          components={{
            code: async ({ className, children, ...props }) => {
              const match = /language-(\w+)/.exec(className || '');
              const language = match ? match[1] : '';

              if (language === 'samlang' || language === '') {
                const html = highlighter.codeToHtml(String(children).replace(/\n$/, ''), {
                  theme: 'dev-sam-theme',
                  lang: 'samlang',
                });
                return <div dangerouslySetInnerHTML={{ __html: html }} />;
              }

              return (
                <pre className="bg-gray-100 p-4 rounded overflow-x-auto">
                  <code className={className} {...props}>
                    {children}
                  </code>
                </pre>
              );
            },
            pre: ({ children }: any) => {
              return <>{children}</>;
            },
          }}
          options={{
            mdxOptions: {
              format: 'md',
              development: false,
              useDynamicImport: false,
            },
          }}
        />
      </main>
    </div>
  );
}
