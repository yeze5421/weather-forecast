const finite = value => typeof value === 'number' && Number.isFinite(value);
class WeatherController {
  constructor() { this.reset(); }
  reset() { this.id = null; this.pending = null; this.samples = []; this.key = null; this.previousTime = null; }
  update(snapshot, source = 'cpu', threshold = 90, smooth = true) {
    const now = snapshot.timestamp;
    const key = `${source}:${threshold}:${smooth}`;
    if (key !== this.key || (this.previousTime !== null && (now < this.previousTime || now - this.previousTime > 35000))) { this.reset(); this.key = key; }
    this.previousTime = now;
    const load = snapshot[source]?.usage;
    if (!finite(load)) this.samples = [];
    if (finite(load)) this.samples.push({ time: now, value: load });
    this.samples = this.samples.filter(sample => now - sample.time <= 6000).slice(-8);
    const average = this.samples.length ? this.samples.reduce((sum, sample) => sum + sample.value, 0) / this.samples.length : null;
    const visualLoad = smooth ? average : load;
    const memory = snapshot.memory?.usage;
    const inStorm = finite(memory) && memory >= (smooth && this.id === 'storm' ? threshold - 3 : threshold);
    let target = inStorm ? 'storm' : !finite(load) ? 'unknown' : visualLoad >= 80 ? 'rainy' : visualLoad >= 40 ? 'cloudy' : 'sunny';
    if (smooth && !inStorm && finite(load)) {
      if (this.id === 'rainy' && visualLoad >= 77) target = 'rainy';
      if (this.id === 'cloudy' && visualLoad >= 37 && visualLoad < 80) target = 'cloudy';
    }
    if (!smooth || this.id === null || this.id === 'unknown' || target === 'unknown') { this.id = target; this.pending = null; }
    else if (target === this.id) this.pending = null;
    else {
      if (this.pending?.id !== target) this.pending = { id: target, since: now };
      if (now - this.pending.since >= (target === 'storm' ? 3000 : 4000)) { this.id = target; this.pending = null; }
    }
    return { id: this.id, source, reason: this.id === 'storm' ? 'memory' : this.id === 'unknown' ? 'unavailable' : 'load', smoothedLoad: finite(visualLoad) ? visualLoad : null };
  }
}
module.exports = { WeatherController };
