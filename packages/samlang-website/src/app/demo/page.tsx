import type { Metadata } from 'next';
import LanguageDemo from '../../components/Demo';

export const metadata: Metadata = {
  title: 'Demo | samlang',
  description: 'IDE demo of samlang',
};

export default function DemoPage(): JSX.Element {
  return (
    <div>
      <LanguageDemo />
    </div>
  );
}
