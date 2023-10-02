import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'samlang',
  description: "Sam's Programming Language",
  icons: ['/img/favicon.png', { rel: 'shortcut icon', url: '/img/favicon.png' }],
};

const GA_ID = 'G-K50MLQ68K6';
const GA_INLINE_SCRIPT = `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {process.env.NODE_ENV === 'production' && (
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} />
      )}
      {process.env.NODE_ENV === 'production' && (
        <Script id="google-analytics">{GA_INLINE_SCRIPT}</Script>
      )}
      <body className={inter.className}>{children}</body>
    </html>
  );
}
