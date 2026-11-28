// Theme (light, dark or follow the system) and accent colour. One set of
// design tokens serves both themes; only the accent is set from here.

import { device } from './state.js';

export function applyLook(settings) {
  const doc = document.documentElement;
  if (settings.theme === 'system') delete doc.dataset.theme;
  else doc.dataset.theme = settings.theme;
  doc.style.setProperty('--accent', settings.accent);
  device.set('look', { theme: settings.theme, accent: settings.accent });
}
