import { createFileRoute } from '@tanstack/react-router';
import { LegalPage } from '../components/legal/LegalPage';
import privacyMarkdown from '../content/legal/privacy-policy.md?raw';

export const Route = createFileRoute('/privacy')({
  component: PrivacyPage,
});

function PrivacyPage() {
  return <LegalPage markdown={privacyMarkdown} />;
}
