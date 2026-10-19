import { createFileRoute } from '@tanstack/react-router';
import { LegalPage } from '../components/legal/LegalPage';
import termsMarkdown from '../content/legal/terms-of-service.md?raw';

export const Route = createFileRoute('/terms')({
  component: TermsPage,
});

function TermsPage() {
  return <LegalPage markdown={termsMarkdown} />;
}
