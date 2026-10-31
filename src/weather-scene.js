let sceneId = 0;

/** A small, original landscape. Its SVG stays mounted while telemetry changes. */
export function weatherSceneMarkup() {
  const id = `station-landscape-${++sceneId}`;
  const rain = Array.from({ length: 19 }, (_, index) => {
    const x = 285 + (index * 47) % 300;
    const y = 139 + (index * 23) % 55;
    return `<path class="ws-raindrop" style="--drop-delay:${-(index * 0.17).toFixed(2)}s;--drop-duration:${(0.82 + index % 4 * 0.13).toFixed(2)}s" d="M${x} ${y}l-7 15"/>`;
  }).join('');

  return `<svg class="ws-landscape" viewBox="0 0 640 260" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Clear skies over a quiet desktop landscape" preserveAspectRatio="xMidYMax slice">
    <defs>
      <linearGradient id="${id}-sky" x1="320" y1="0" x2="320" y2="260" gradientUnits="userSpaceOnUse">
        <stop class="ws-sky-top"/>
        <stop offset="1" class="ws-sky-bottom"/>
      </linearGradient>
      <radialGradient id="${id}-halo">
        <stop stop-color="#F8D395" stop-opacity=".46"/>
        <stop offset="1" stop-color="#F8D395" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="${id}-sun" x1="420" y1="55" x2="480" y2="125" gradientUnits="userSpaceOnUse">
        <stop stop-color="#FFDC8E"/>
        <stop offset="1" stop-color="#F4B66F"/>
      </linearGradient>
      <linearGradient id="${id}-cloud" x1="380" y1="70" x2="380" y2="170" gradientUnits="userSpaceOnUse">
        <stop class="ws-cloud-top"/>
        <stop offset="1" class="ws-cloud-bottom"/>
      </linearGradient>
      <linearGradient id="${id}-hill" x1="320" y1="203" x2="320" y2="260" gradientUnits="userSpaceOnUse">
        <stop class="ws-hill-top"/>
        <stop offset="1" class="ws-hill-bottom"/>
      </linearGradient>
      <clipPath id="${id}-clip"><rect width="640" height="260"/></clipPath>
    </defs>
    <g clip-path="url(#${id}-clip)">
      <path fill="url(#${id}-sky)" d="M0 0h640v260H0z"/>
      <g class="ws-rainbow" fill="none" stroke-width="5" stroke-linecap="round" aria-hidden="true">
        <path d="M206 207a152 152 0 0 1 304 0" stroke="#e99b9d"/>
        <path d="M212 207a146 146 0 0 1 292 0" stroke="#efbe88"/>
        <path d="M218 207a140 140 0 0 1 280 0" stroke="#ecd38c"/>
        <path d="M224 207a134 134 0 0 1 268 0" stroke="#a9cba9"/>
        <path d="M230 207a128 128 0 0 1 256 0" stroke="#9bbfd5"/>
        <path d="M236 207a122 122 0 0 1 244 0" stroke="#b0a6d2"/>
      </g>
      <g class="ws-sun">
        <circle cx="452" cy="91" r="99" fill="url(#${id}-halo)"/>
        <circle cx="452" cy="91" r="58" stroke="#EBC48A" stroke-opacity=".18"/>
        <circle cx="452" cy="91" r="48" stroke="#EBC48A" stroke-opacity=".22"/>
        <circle cx="452" cy="91" r="37" fill="url(#${id}-sun)"/>
        <path d="M432 78a24 24 0 0 1 27-10" stroke="#FFF1CF" stroke-width="2" stroke-linecap="round" opacity=".65"/>
      </g>
      <g class="ws-high-cloud" opacity=".65" fill="#fff">
        <path d="M538 63c0-8 6-13 14-13 4 0 7 1 10 4 3-9 11-14 20-14 12 0 22 10 22 22v1h4c6 0 11 5 11 11s-5 11-11 11h-67c-7 0-12-5-12-11 0-5 4-10 9-11Z"/>
      </g>
      <g class="ws-cloud-back" fill="url(#${id}-cloud)">
        <path d="M384 123c-1-11 7-20 18-20 7 0 13 3 16 9 4-17 16-28 33-28 18 0 33 15 33 33v2c4-3 9-4 14-4 13 0 24 11 24 24s-11 24-24 24H385c-11 0-20-9-20-20 0-10 8-19 19-20Z"/>
      </g>
      <g class="ws-cloud-front" fill="url(#${id}-cloud)">
        <path d="M334 135c0-13 10-23 23-23 7 0 13 3 17 8 4-17 18-29 35-29 20 0 36 16 36 36v1c4-2 8-3 12-3 15 0 28 12 28 28 0 15-13 27-28 27H338c-14 0-25-10-25-23 0-12 9-22 21-22Z"/>
        <path d="M339 176h114" stroke="#9DADD1" stroke-opacity=".07" stroke-width="2" stroke-linecap="round"/>
      </g>
      <g class="ws-storm-cloud" fill="url(#${id}-cloud)">
        <path d="M475 109c2-14 14-24 28-24 9 0 17 4 22 10 6-13 18-21 33-21 20 0 36 16 36 36v2c13 1 23 12 23 25s-11 25-25 25H485c-15 0-27-12-27-27 0-12 7-22 17-26Z"/>
      </g>
      <g class="ws-rain" stroke="#879ECA" stroke-width="1.6" stroke-linecap="round">${rain}</g>
      <g class="ws-lightning">
        <path d="m421 160-16 27h13l-6 23 27-34h-15l7-16h-10Z" fill="#F4CE7F"/>
        <path d="m421 160-16 27h13l-6 23 27-34h-15l7-16h-10Z" stroke="#FFF4D0" stroke-width=".7"/>
      </g>
      <g class="ws-breeze" stroke="#9FAFC5" stroke-width="1.2" stroke-linecap="round" opacity=".4">
        <path class="ws-breeze-line ws-breeze-one" d="M222 167h47c11 0 11-13 3-13-4 0-7 3-7 6"/>
        <path class="ws-breeze-line ws-breeze-two" d="M255 180h56c7 0 8 10 1 10-3 0-5-2-5-4"/>
        <path class="ws-breeze-line ws-breeze-three" d="M578 177h27c7 0 7-9 2-9"/>
      </g>
      <path class="ws-hill-far" d="M0 225c87-27 147-20 213-11 82 12 132-13 207-18 85-7 149 3 220 32v32H0v-35Z"/>
      <path class="ws-hill-mid" d="M0 240c67-9 121-5 184-14 83-13 113-2 178 9 76 12 112-30 183-30 38 0 67 9 95 18v37H0v-20Z"/>
      <path fill="url(#${id}-hill)" d="M0 244c111-21 159 1 242 2 83 2 119-22 191-15 80 8 133 7 207-11v40H0v-16Z"/>
      <g class="ws-station">
        <ellipse cx="480" cy="237" rx="33" ry="4" fill="#738A8B" opacity=".08"/>
        <path d="m459 210 22-9 19 9v25h-41v-25Z" fill="#FDFCF8"/>
        <path d="m454 211 27-13 24 13" stroke="#8D9EAA" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M481 202v33h19v-24l-19-9Z" fill="#E8EDE9"/>
        <rect x="465" y="215" width="10" height="10" rx="1.5" fill="#C0CED3"/>
        <path d="M470 215v10m-5-5h10" stroke="#FDFCF8" stroke-width="1.1"/>
        <path d="M486 235v-15a3 3 0 0 1 6 0v15" fill="#B9C6CA"/>
        <path d="M466 203v-8" stroke="#9AA6AF" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M461 195h10" stroke="#9AA6AF" stroke-width="1.5" stroke-linecap="round"/>
      </g>
      <g class="ws-turbine">
        <ellipse cx="549" cy="232" rx="17" ry="3" fill="#738A8B" opacity=".09"/>
        <path d="m548 181-3 50h7l-3-50" fill="#F8FAF8"/>
        <path d="m550 183 2 48h-2l-2-48" fill="#B8C6CA"/>
        <g class="ws-fan-rotor">
          <path d="M549 181c-3-6-5-12-5-22 0-4 2-11 4-13 2 5 3 23 3 33l-2 2Z" fill="#FAFCFA"/>
          <path d="M549 181c6 0 13 2 21 7 4 2 9 7 10 10-6-1-22-9-30-15l-1-2Z" fill="#FAFCFA"/>
          <path d="M549 181c-4 6-8 11-17 16-4 2-11 4-14 4 4-4 18-15 28-20h3Z" fill="#FAFCFA"/>
          <path d="M548 148v32m30 16-28-14m-30 18 27-18" stroke="#CCD6D8" stroke-width=".8" stroke-linecap="round"/>
        </g>
        <circle cx="549" cy="181" r="3.2" fill="#97AAB5"/>
        <circle cx="549" cy="181" r="1.4" fill="#F9FBFA"/>
      </g>
      <g stroke="#A5BEB0" stroke-width="1.2" stroke-linecap="round" opacity=".65">
        <path d="m418 240-1-6m1 4 3-3m150-2 1-7m-1 4-3-3M363 247v-5m1 3 2-3"/>
      </g>
      <g class="ws-birds" stroke="#9CA6B3" stroke-width="1.15" stroke-linecap="round" opacity=".5">
        <path d="M322 79c3-2 5-2 8 1 3-3 5-3 8-1m-34 9c2-1 4-1 6 1 2-2 4-2 6-1"/>
      </g>
    </g>
  </svg>`;
}

const labels = {
  sunny: 'Clear skies over a quiet desktop landscape',
  cloudy: 'Clouds passing over the desktop weather station',
  rainy: 'Heavy rain falling on the desktop weather station',
  storm: 'Thunderstorm and lightning caused by memory pressure',
  unknown: 'Awaiting readings from the desktop weather station',
};

export function updateWeatherScene(container, weatherId, fanRpm, { reducedMotion = false, rainbow = false } = {}) {
  if (!container) return;
  const weather = Object.hasOwn(labels, weatherId) ? weatherId : 'unknown';
  container.dataset.weather = weather;
  container.dataset.rainbow = String(weather === 'sunny' && Boolean(rainbow));
  container.dataset.reducedMotion = String(Boolean(reducedMotion));
  const hasFan = typeof fanRpm === 'number' && Number.isFinite(fanRpm) && fanRpm >= 0;
  container.dataset.wind = hasFan && fanRpm > 0 ? 'moving' : 'still';
  // A readable visual representation of fan speed, rather than literal blade RPM.
  const seconds = hasFan && fanRpm > 0 ? Math.min(12, Math.max(0.8, 3000 / fanRpm)) : 12;
  container.style.setProperty('--fan-duration', `${seconds.toFixed(2)}s`);
  container.querySelector('.ws-landscape')?.setAttribute('aria-label', weather === 'sunny' && rainbow ? 'A rainbow after the rain over the desktop weather station' : labels[weather]);
}
