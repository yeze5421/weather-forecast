// Small native bitmap artwork: no font dependency and no external asset fetches.
function makeTrayIcon(nativeImage, weather = 'sunny') {
  const size = 32;
  const pixels = Buffer.alloc(size * size * 4);
  function paint(x, y, color, alpha = 1) {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    pixels[i] = color[2];
    pixels[i + 1] = color[1];
    pixels[i + 2] = color[0];
    pixels[i + 3] = Math.round(255 * alpha);
  }
  function circle(cx, cy, radius, color) {
    for (let y = Math.floor(cy - radius - 1); y <= cy + radius + 1; y++) {
      for (let x = Math.floor(cx - radius - 1); x <= cx + radius + 1; x++) {
        const coverage = Math.max(0, Math.min(1, radius + 0.5 - Math.hypot(x - cx, y - cy)));
        if (coverage) paint(x, y, color, coverage);
      }
    }
  }
  function line(ax, ay, bx, by, color, width = 2) {
    const distance = Math.hypot(bx - ax, by - ay);
    for (let i = 0; i <= distance * 2; i++) {
      const t = distance ? i / (distance * 2) : 0;
      circle(ax + (bx - ax) * t, ay + (by - ay) * t, width / 2, color);
    }
  }
  const gold = [255, 188, 69];
  if (weather === 'sunny') {
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      line(16 + Math.cos(a) * 11, 16 + Math.sin(a) * 11, 16 + Math.cos(a) * 14, 16 + Math.sin(a) * 14, gold);
    }
    circle(16, 16, 8, gold);
    circle(13, 13, 3, [255, 214, 117]);
  } else {
    if (weather === 'cloudy') circle(21, 10, 7, gold);
    const cloud = weather === 'storm' ? [175, 161, 230] : [194, 211, 236];
    circle(11, 16, 6, cloud);
    circle(17, 12, 7, cloud);
    circle(24, 17, 6, cloud);
    line(10, 19, 25, 19, cloud, 8);
    if (weather === 'rain') {
      line(11, 26, 9, 29, [99, 174, 244]);
      line(19, 26, 17, 29, [99, 174, 244]);
      line(27, 26, 25, 29, [99, 174, 244]);
    }
    if (weather === 'storm') {
      line(17, 21, 13, 26, gold, 3);
      line(13, 26, 19, 25, gold, 3);
      line(19, 25, 15, 30, gold, 3);
    }
  }
  return nativeImage.createFromBitmap(pixels, { width: size, height: size, scaleFactor: 1 });
}

module.exports = { makeTrayIcon };
