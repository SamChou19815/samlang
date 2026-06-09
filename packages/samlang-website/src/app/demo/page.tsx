import type { Metadata } from 'next';
import type React from 'react';
import LanguageDemo from '../../components/Demo';

export const metadata: Metadata = {
  title: 'Demo | samlang',
  description: 'IDE demo of samlang',
};

export default function DemoPage(): React.JSX.Element {
  return (
    <div>
      <LanguageDemo />
    </div>
  );
}
