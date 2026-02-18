/**
 * CompareChart — Canvas-based temperature comparison chart
 * Renders daily high/low or hourly temperature lines from multiple sources.
 */
var CompareChart = (function () {
  'use strict';

  var SOURCE_COLORS = {
    'open-meteo': { solid: '#0284c7', light: 'rgba(2,132,199,0.15)' },
    'met-norway': { solid: '#dc2626', light: 'rgba(220,38,38,0.15)' },
    'nws':        { solid: '#16a34a', light: 'rgba(22,163,74,0.15)' },
    'smhi':       { solid: '#d97706', light: 'rgba(217,119,6,0.15)' }
  };

  var PAD = { top: 28, right: 20, bottom: 52, left: 48 };
  var DOT_R = 4;
  var HIT_R = 20; // click hit radius per day column

  // ===== Helpers =====
  function getStyles() {
    var cs = getComputedStyle(document.documentElement);
    return {
      bg: cs.getPropertyValue('--color-surface').trim() || '#ffffff',
      text: cs.getPropertyValue('--color-text').trim() || '#0f172a',
      muted: cs.getPropertyValue('--color-text-muted').trim() || '#64748b',
      grid: cs.getPropertyValue('--color-border').trim() || '#cbd5e1'
    };
  }

  function initCanvas(canvas, container) {
    var dpr = window.devicePixelRatio || 1;
    var w = container.clientWidth;
    var h = Math.min(380, Math.max(260, w * 0.45));
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return { ctx: ctx, w: w, h: h };
  }

  function niceRange(min, max) {
    var lo = Math.floor(min / 5) * 5 - 5;
    var hi = Math.ceil(max / 5) * 5 + 5;
    if (hi - lo < 10) { lo -= 5; hi += 5; }
    return { lo: lo, hi: hi };
  }

  function drawGrid(ctx, w, h, range, labels, styles) {
    var plotW = w - PAD.left - PAD.right;
    var plotH = h - PAD.top - PAD.bottom;
    var step = 5;
    ctx.save();

    // Horizontal grid + Y labels
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = '11px -apple-system, sans-serif';
    for (var t = range.lo; t <= range.hi; t += step) {
      var y = PAD.top + plotH - ((t - range.lo) / (range.hi - range.lo)) * plotH;
      ctx.strokeStyle = styles.grid;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(w - PAD.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = styles.muted;
      ctx.fillText(t + '\u00B0', PAD.left - 6, y);
    }

    // X labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = styles.muted;
    ctx.font = '11px -apple-system, sans-serif';
    for (var i = 0; i < labels.length; i++) {
      var x = PAD.left + (i + 0.5) * (plotW / labels.length);
      ctx.fillText(labels[i].top, x, h - PAD.bottom + 8);
      if (labels[i].bottom) {
        ctx.font = '10px -apple-system, sans-serif';
        ctx.fillText(labels[i].bottom, x, h - PAD.bottom + 22);
        ctx.font = '11px -apple-system, sans-serif';
      }
    }
    ctx.restore();
  }

  function drawLine(ctx, points, color, dashed, w, h, range, count) {
    if (points.length < 2) return;
    var plotW = w - PAD.left - PAD.right;
    var plotH = h - PAD.top - PAD.bottom;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = dashed ? 1.5 : 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (dashed) ctx.setLineDash([6, 4]);

    ctx.beginPath();
    var started = false;
    points.forEach(function (p) {
      if (p.val == null) return;
      var x = PAD.left + (p.idx + 0.5) * (plotW / count);
      var y = PAD.top + plotH - ((p.val - range.lo) / (range.hi - range.lo)) * plotH;
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // Dots
    ctx.fillStyle = color;
    points.forEach(function (p) {
      if (p.val == null) return;
      var x = PAD.left + (p.idx + 0.5) * (plotW / count);
      var y = PAD.top + plotH - ((p.val - range.lo) / (range.hi - range.lo)) * plotH;
      ctx.beginPath();
      ctx.arc(x, y, DOT_R, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  // ===== Tooltip =====
  function setupTooltip(canvas, container, tooltipEl, hitZones) {
    var handler = function (e) {
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;
      var found = null;
      for (var i = 0; i < hitZones.length; i++) {
        var z = hitZones[i];
        var dx = mx - z.x;
        var dy = my - z.y;
        if (dx * dx + dy * dy < HIT_R * HIT_R) {
          found = z;
          break;
        }
      }
      if (found) {
        tooltipEl.style.display = 'block';
        tooltipEl.innerHTML = '<strong>' + found.source + '</strong> ' + found.label + ': ' + found.val + '\u00B0C';
        // Position tooltip
        var tx = found.x + 12;
        var ty = found.y - 28;
        if (tx + 160 > canvas.clientWidth) tx = found.x - 160;
        if (ty < 0) ty = found.y + 12;
        tooltipEl.style.left = tx + 'px';
        tooltipEl.style.top = ty + 'px';
      } else {
        tooltipEl.style.display = 'none';
      }
    };
    canvas.addEventListener('mousemove', handler);
    canvas.addEventListener('mouseleave', function () {
      tooltipEl.style.display = 'none';
    });
    return handler;
  }

  // ===== Public: Render Daily =====
  function renderDaily(container, compareData, onDayClick) {
    container.innerHTML = '';
    var styles = getStyles();

    // Legend
    var legend = document.createElement('div');
    legend.className = 'compare-legend';
    compareData.forEach(function (s) {
      var c = SOURCE_COLORS[s.key] || { solid: '#888' };
      var item = document.createElement('span');
      item.className = 'compare-legend__item';
      item.innerHTML = '<span class="compare-legend__swatch" style="background:' + c.solid + '"></span>' +
        '<span class="compare-legend__solid"></span> High ' +
        '<span class="compare-legend__dashed"></span> Low &mdash; ' + s.name;
      legend.appendChild(item);
    });
    container.appendChild(legend);

    // Hint
    var hint = document.createElement('div');
    hint.className = 'compare-hint';
    hint.textContent = 'Click a day to see hourly breakdown';
    container.appendChild(hint);

    // Canvas wrapper
    var wrap = document.createElement('div');
    wrap.className = 'compare-canvas-wrap';
    var canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    var tooltip = document.createElement('div');
    tooltip.className = 'compare-tooltip';
    wrap.appendChild(tooltip);
    container.appendChild(wrap);

    var dim = initCanvas(canvas, wrap);
    var ctx = dim.ctx, w = dim.w, h = dim.h;

    // Collect all dates (union across sources)
    var dateSet = {};
    var dateOrder = [];
    compareData.forEach(function (s) {
      (s.daily || []).forEach(function (d) {
        if (!dateSet[d.date]) {
          dateSet[d.date] = true;
          dateOrder.push(d.date);
        }
      });
    });
    dateOrder.sort();
    // Limit to first 7 days for readability
    if (dateOrder.length > 7) dateOrder = dateOrder.slice(0, 7);

    // Build labels
    var labels = dateOrder.map(function (d) {
      var fd = formatDateShort(d);
      return { top: fd.day, bottom: fd.date };
    });

    // Find temp range
    var allTemps = [];
    compareData.forEach(function (s) {
      (s.daily || []).forEach(function (d) {
        if (d.high != null) allTemps.push(d.high);
        if (d.low != null) allTemps.push(d.low);
      });
    });
    if (allTemps.length === 0) {
      ctx.fillStyle = styles.muted;
      ctx.font = '14px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No data available to compare', w / 2, h / 2);
      return;
    }

    var range = niceRange(Math.min.apply(null, allTemps), Math.max.apply(null, allTemps));

    // Background
    ctx.fillStyle = styles.bg;
    ctx.fillRect(0, 0, w, h);

    drawGrid(ctx, w, h, range, labels, styles);

    // Draw clickable day columns (subtle highlight on hover via hitZones)
    var plotW = w - PAD.left - PAD.right;
    var plotH = h - PAD.top - PAD.bottom;
    var colW = plotW / dateOrder.length;

    // Collect hit zones for tooltip
    var hitZones = [];

    // Draw lines per source
    compareData.forEach(function (s) {
      var c = SOURCE_COLORS[s.key] || { solid: '#888' };
      var dailyMap = {};
      (s.daily || []).forEach(function (d) { dailyMap[d.date] = d; });

      var highPts = [];
      var lowPts = [];
      dateOrder.forEach(function (date, idx) {
        var d = dailyMap[date];
        if (d) {
          highPts.push({ idx: idx, val: d.high });
          lowPts.push({ idx: idx, val: d.low });
          // Hit zones
          if (d.high != null) {
            var hx = PAD.left + (idx + 0.5) * colW;
            var hy = PAD.top + plotH - ((d.high - range.lo) / (range.hi - range.lo)) * plotH;
            hitZones.push({ x: hx, y: hy, source: s.name, label: 'High', val: d.high });
          }
          if (d.low != null) {
            var lx = PAD.left + (idx + 0.5) * colW;
            var ly = PAD.top + plotH - ((d.low - range.lo) / (range.hi - range.lo)) * plotH;
            hitZones.push({ x: lx, y: ly, source: s.name, label: 'Low', val: d.low });
          }
        } else {
          highPts.push({ idx: idx, val: null });
          lowPts.push({ idx: idx, val: null });
        }
      });

      drawLine(ctx, lowPts, c.solid, true, w, h, range, dateOrder.length);
      drawLine(ctx, highPts, c.solid, false, w, h, range, dateOrder.length);
    });

    setupTooltip(canvas, wrap, tooltip, hitZones);

    // Click to drill into hourly
    canvas.style.cursor = 'pointer';
    canvas.addEventListener('click', function (e) {
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var clickIdx = Math.floor((mx - PAD.left) / colW);
      if (clickIdx >= 0 && clickIdx < dateOrder.length) {
        onDayClick(dateOrder[clickIdx]);
      }
    });
  }

  // ===== Public: Render Hourly =====
  function renderHourly(container, compareData, dateStr, onBack) {
    container.innerHTML = '';
    var styles = getStyles();
    var fd = formatDateShort(dateStr);

    // Header with back button
    var header = document.createElement('div');
    header.className = 'compare-header';
    header.innerHTML = '<button class="btn btn--icon compare-back" title="Back to daily">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>' +
      '</button>' +
      '<span class="compare-header__title">' + fd.day + ', ' + fd.date + ' \u2014 Hourly</span>';
    container.appendChild(header);
    header.querySelector('.compare-back').addEventListener('click', onBack);

    // Legend
    var legend = document.createElement('div');
    legend.className = 'compare-legend';
    compareData.forEach(function (s) {
      var hasData = false;
      (s.hourly || []).forEach(function (h) {
        if (h.time.slice(0, 10) === dateStr) hasData = true;
      });
      if (!hasData) return;
      var c = SOURCE_COLORS[s.key] || { solid: '#888' };
      var item = document.createElement('span');
      item.className = 'compare-legend__item';
      item.innerHTML = '<span class="compare-legend__swatch" style="background:' + c.solid + '"></span>' + s.name;
      legend.appendChild(item);
    });
    container.appendChild(legend);

    // Canvas
    var wrap = document.createElement('div');
    wrap.className = 'compare-canvas-wrap';
    var canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    var tooltip = document.createElement('div');
    tooltip.className = 'compare-tooltip';
    wrap.appendChild(tooltip);
    container.appendChild(wrap);

    var dim = initCanvas(canvas, wrap);
    var ctx = dim.ctx, w = dim.w, h = dim.h;

    // Collect hourly data for this date
    var hourSet = {};
    var hourOrder = [];
    var allTemps = [];

    compareData.forEach(function (s) {
      (s.hourly || []).forEach(function (entry) {
        if (entry.time.slice(0, 10) !== dateStr) return;
        var hKey = entry.time.slice(11, 16); // "HH:MM"
        if (!hourSet[hKey]) {
          hourSet[hKey] = true;
          hourOrder.push(hKey);
        }
        if (entry.temp != null) allTemps.push(entry.temp);
      });
    });
    hourOrder.sort();

    if (allTemps.length === 0) {
      ctx.fillStyle = styles.bg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = styles.muted;
      ctx.font = '14px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No hourly data available for this day', w / 2, h / 2);
      return;
    }

    var range = niceRange(Math.min.apply(null, allTemps), Math.max.apply(null, allTemps));

    // Build labels - show every 3rd hour to avoid clutter
    var labels = hourOrder.map(function (hKey, i) {
      return { top: (i % 3 === 0 || hourOrder.length <= 12) ? hKey : '', bottom: '' };
    });

    ctx.fillStyle = styles.bg;
    ctx.fillRect(0, 0, w, h);
    drawGrid(ctx, w, h, range, labels, styles);

    var plotW = w - PAD.left - PAD.right;
    var plotH = h - PAD.top - PAD.bottom;
    var hitZones = [];

    compareData.forEach(function (s) {
      var c = SOURCE_COLORS[s.key] || { solid: '#888' };
      // Build map of hour -> temp for this source
      var hourMap = {};
      (s.hourly || []).forEach(function (entry) {
        if (entry.time.slice(0, 10) !== dateStr) return;
        var hKey = entry.time.slice(11, 16);
        hourMap[hKey] = entry.temp;
      });

      var pts = [];
      hourOrder.forEach(function (hKey, idx) {
        var val = hourMap[hKey] != null ? hourMap[hKey] : null;
        pts.push({ idx: idx, val: val });
        if (val != null) {
          var x = PAD.left + (idx + 0.5) * (plotW / hourOrder.length);
          var y = PAD.top + plotH - ((val - range.lo) / (range.hi - range.lo)) * plotH;
          hitZones.push({ x: x, y: y, source: s.name, label: hKey, val: val });
        }
      });

      drawLine(ctx, pts, c.solid, false, w, h, range, hourOrder.length);
    });

    setupTooltip(canvas, wrap, tooltip, hitZones);
  }

  // ===== Date formatting (local) =====
  function formatDateShort(dateStr) {
    var d = new Date(dateStr + 'T12:00:00');
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return { day: days[d.getDay()], date: months[d.getMonth()] + ' ' + d.getDate() };
  }

  return {
    renderDaily: renderDaily,
    renderHourly: renderHourly
  };
})();
