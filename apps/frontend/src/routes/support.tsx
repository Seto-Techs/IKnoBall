import { createFileRoute } from '@tanstack/react-router';
import { SupportPage } from '../components/support/SupportPage';

export const Route = createFileRoute('/support')({
  component: SupportPage,
});
