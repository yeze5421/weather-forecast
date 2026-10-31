const HOUR_MS = 60 * 60 * 1000;
const CLEAR_WINDOW_MS = 10 * 60 * 1000;
const RAINBOW_DURATION_MS = 5 * 60 * 1000;
const MAX_SAMPLE_GAP_MS = 35000;

class RainbowController {
  constructor() { this.reset(); }
  reset() { this.key = null; this.previousTime = null; this.rainSince = null; this.lastRain = null; this.pendingUntil = null; this.rainbowUntil = null; }
  update(weather, now, key) {
    if (!Number.isFinite(now)) { this.reset(); return false; }
    if (key !== this.key || (this.previousTime !== null && (now < this.previousTime || now - this.previousTime > MAX_SAMPLE_GAP_MS))) { this.reset(); this.key = key; }
    this.previousTime = now;
    if (weather === 'unknown') { this.reset(); return false; }
    if (weather === 'rainy' || weather === 'storm') {
      if (this.rainSince === null) this.rainSince = now;
      this.lastRain = now;
      this.pendingUntil = this.rainbowUntil = null;
    } else {
      if (this.rainSince !== null) {
        this.pendingUntil = this.lastRain - this.rainSince > HOUR_MS ? now + CLEAR_WINDOW_MS : null;
        this.rainSince = this.lastRain = null;
      }
      if (weather !== 'sunny') this.rainbowUntil = null;
      if (this.pendingUntil !== null && now > this.pendingUntil) this.pendingUntil = null;
      if (weather === 'sunny' && this.pendingUntil !== null) {
        this.rainbowUntil = now + RAINBOW_DURATION_MS;
        this.pendingUntil = null;
      }
    }
    return this.active(weather, now, key);
  }
  active(weather, now, key) {
    return this.key === key && weather === 'sunny' && this.rainbowUntil !== null && now < this.rainbowUntil;
  }
}
module.exports = { RainbowController, HOUR_MS, CLEAR_WINDOW_MS, RAINBOW_DURATION_MS };
