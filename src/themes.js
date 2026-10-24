import themes from '../shared/themes.json';

export const THEMES = themes;
export const DEFAULT_THEME = 'midnight';

export function resolveTheme(id) {
  return THEMES.find(theme => theme.id === id) || THEMES[0];
}

export function applyTheme(id, root = document.documentElement) {
  const theme = resolveTheme(id);
  root.dataset.theme = theme.id;
  root.dataset.colorScheme = theme.dark ? 'dark' : 'light';
  root.style.colorScheme = root.dataset.colorScheme;
  for (const [token, color] of Object.entries(theme.colors)) root.style.setProperty(`--theme-${token}`, color);
  return theme;
}
