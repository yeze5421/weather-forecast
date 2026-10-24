import { THEMES } from './themes.js';

export function themePickerMarkup(icon) {
  return `<section class="appearance-card" aria-labelledby="appearance-heading">
    <div class="appearance-heading"><div><h3 id="appearance-heading">Appearance</h3><p>A different mood for your little sky.</p></div><span id="current-theme" class="current-theme">Midnight</span></div>
    <div class="theme-options" role="group" aria-label="Color theme">
      ${THEMES.map(theme => `<button class="theme-option" data-theme-option="${theme.id}" aria-pressed="false" style="--swatch-bg:${theme.colors.bg};--swatch-surface:${theme.colors.surface};--swatch-accent:${theme.colors.accent};--swatch-sky:${theme.colors.sceneBottom}">
        <span class="theme-swatch" aria-hidden="true"><span class="swatch-toolbar"><i></i><i></i><i></i></span><span class="swatch-sky"><i></i></span><span class="swatch-panels"><i></i><i></i><i></i></span></span>
        <span class="theme-option-label"><b>${theme.name}</b>${icon('check')}</span><small>${theme.description}</small>
      </button>`).join('')}
    </div>
  </section>`;
}
