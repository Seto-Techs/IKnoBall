import { render } from '@react-email/render';
import React from 'react';

export function renderEmail(component: React.ReactElement) {
  return render(component, { pretty: true });
}
