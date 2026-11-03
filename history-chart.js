/* Local, accessible SVG charts for stock ranges and PVVX recorded averages. */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const finite = (value) => typeof value === 'number' && Number.isFinite(value);

  function prepareRecords(records, kind) {
    const average = kind === 'pvvx';
    return records.map((record) => {
      const timestamp = average ? record.rawTimestamp : record.timestamp;
      if (!finite(timestamp) || Math.abs(timestamp * 1000) > 8.64e15) return null;
      const range = (low, high, humidity = false) => {
        if (!finite(low) || !finite(high) || (humidity && (Math.min(low, high) < 0 || Math.max(low, high) > 100))) return null;
        return [Math.min(low, high), Math.max(low, high)];
      };
      return {
        timestamp,
        temperature: average ? range(record.temperature, record.temperature) : range(record.minTemperature, record.maxTemperature),
        humidity: average ? range(record.humidity, record.humidity, true) : range(record.minHumidity, record.maxHumidity, true)
      };
    }).filter((point) => point && (point.temperature || point.humidity)).sort((left, right) => left.timestamp - right.timestamp);
  }

  function temperatureExtent(points) {
    const values = points.flatMap((point) => point.temperature || []);
    if (!values.length) return [0, 1];
    const low = Math.min(...values);
    const high = Math.max(...values);
    const padding = Math.max(0.5, (high - low) * 0.12);
    const step = high - low > 10 ? 2 : high - low > 3 ? 1 : 0.5;
    return [Math.floor((low - padding) / step) * step, Math.ceil((high + padding) / step) * step];
  }

  function segments(points, key, gap) {
    const result = [];
    let current = [];
    points.forEach((point) => {
      if (!point[key]) {
        if (current.length) result.push(current);
        current = [];
        return;
      }
      if (current.length && point.timestamp - current.at(-1).timestamp > gap) {
        result.push(current);
        current = [];
      }
      current.push(point);
    });
    if (current.length) result.push(current);
    return result;
  }

  function create({ container, t, localeTag, formatNumber }) {
    let points = [];
    let average = false;
    let activeIndex = null;
    let panels = [];
    let dateLabel;
    let selectionSummary;
    let previousWidth = -1;
    const observer = typeof root.ResizeObserver === 'function' ? new root.ResizeObserver(() => {
      if (container.clientWidth && container.clientWidth !== previousWidth) draw();
    }) : null;
    if (!observer) root.addEventListener('resize', () => { if (points.length && !container.hidden) draw(); });

    function html(tag, className, text) {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    }
    function svg(tag, attributes, text) {
      const element = document.createElementNS(NS, tag);
      Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)));
      if (text !== undefined) element.textContent = text;
      return element;
    }
    function dateOptions(extra) { return average ? { ...extra, timeZone: 'UTC' } : extra; }
    function formatDate(timestamp) {
      return new Intl.DateTimeFormat(localeTag(), dateOptions({ dateStyle: 'medium', timeStyle: 'short' })).format(new Date(timestamp * 1000));
    }
    function valueLabel(range, unit) {
      if (!range) return '—';
      const digits = unit === '°C' ? 2 : average ? 1 : 0;
      const low = formatNumber(range[0], digits);
      const high = formatNumber(range[1], digits);
      return `${range[0] === range[1] ? low : `${low}–${high}`} ${unit}`;
    }
    function select(index, active = true) {
      if (!points.length) return;
      activeIndex = active ? Math.max(0, Math.min(points.length - 1, index)) : null;
      const point = points[activeIndex ?? points.length - 1];
      dateLabel.textContent = formatDate(point.timestamp);
      // PVVX timestamps are device-local values; do not label them as verified UTC.
      if (!average) dateLabel.dateTime = new Date(point.timestamp * 1000).toISOString();
      selectionSummary.textContent = `${dateLabel.textContent}. ${panels.map((panel) => `${t(panel.label)}: ${valueLabel(point[panel.key], panel.unit)}`).join('. ')}`;
      panels.forEach((panel) => {
        const range = point[panel.key];
        const value = valueLabel(range, panel.unit);
        panel.value.textContent = value;
        panel.canvas.setAttribute('aria-label', `${t(panel.label)}: ${value}. ${dateLabel.textContent}`);
        panel.cursor.setAttribute('visibility', activeIndex === null || !range ? 'hidden' : 'visible');
        if (!range) return;
        const x = panel.x(point.timestamp);
        panel.cursorLine.setAttribute('x1', x);
        panel.cursorLine.setAttribute('x2', x);
        panel.dots.forEach((dot, side) => {
          dot.setAttribute('cx', x);
          dot.setAttribute('cy', panel.y(range[side]));
        });
      });
    }
    function pointer(panel, event) {
      const bounds = panel.plot.getBoundingClientRect();
      if (!bounds.width) return;
      const target = (event.clientX - bounds.left) / bounds.width * panel.width;
      const index = points.reduce((best, point, candidate) => Math.abs(panel.x(point.timestamp) - target) < Math.abs(panel.x(points[best].timestamp) - target) ? candidate : best, 0);
      select(index);
    }
    function makePanel(key, label, unit) {
      const article = html('article', `history-plot history-plot--${key}`);
      const heading = html('header', 'history-plot-heading');
      const title = html('h3', '', t(label));
      title.append(html('span', 'history-plot-unit', unit));
      const value = html('strong', 'history-plot-value', '—');
      value.dataset.chartValue = key;
      heading.append(title, value);
      const canvas = html('div', 'history-plot-canvas');
      canvas.tabIndex = 0;
      canvas.setAttribute('role', 'group');
      canvas.setAttribute('aria-describedby', 'historyChartKeyboard');
      const plot = svg('svg', { height: 208, width: '100%', role: 'img', 'aria-label': `${t(label)} (${unit})`, direction: 'ltr' });
      canvas.append(plot);
      article.append(heading, canvas);
      const panel = { article, canvas, plot, value, key, label, unit };
      canvas.addEventListener('pointermove', (event) => pointer(panel, event));
      canvas.addEventListener('pointerdown', (event) => pointer(panel, event));
      canvas.addEventListener('pointerleave', () => { if (document.activeElement !== canvas) select(points.length - 1, false); });
      canvas.addEventListener('focus', () => select(activeIndex ?? points.length - 1));
      canvas.addEventListener('blur', () => select(points.length - 1, false));
      canvas.addEventListener('keydown', (event) => {
        const current = activeIndex ?? points.length - 1;
        const next = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: points.length - 1 }[event.key];
        if (event.key === 'Escape') { select(points.length - 1, false); return; }
        if (next === undefined) return;
        event.preventDefault();
        select(next);
      });
      return panel;
    }
    function draw() {
      if (!points.length) return;
      previousWidth = container.clientWidth;
      const first = points[0].timestamp;
      const last = points.at(-1).timestamp;
      const differences = points.slice(1).map((point, index) => point.timestamp - points[index].timestamp).filter((value) => value > 0).sort((a, b) => a - b);
      const gap = average ? (differences[Math.floor(differences.length / 2)] || 3600) * 1.8 : 5400;
      panels.forEach((panel) => {
        const width = panel.width = Math.max(240, panel.canvas.clientWidth || 440);
        const height = 208;
        const edge = { left: 38, right: width - 12, top: 14, bottom: height - 35 };
        const extent = panel.key === 'temperature' ? temperatureExtent(points) : [0, 100];
        panel.x = (timestamp) => first === last ? (edge.left + edge.right) / 2 : edge.left + (timestamp - first) / (last - first) * (edge.right - edge.left);
        panel.y = (value) => edge.bottom - (value - extent[0]) / (extent[1] - extent[0]) * (edge.bottom - edge.top);
        panel.plot.setAttribute('viewBox', `0 0 ${width} ${height}`);
        panel.plot.replaceChildren();
        for (let index = 0; index <= 3; index++) {
          const value = extent[0] + (extent[1] - extent[0]) * index / 3;
          const y = panel.y(value);
          panel.plot.append(svg('line', { x1: edge.left, x2: edge.right, y1: y, y2: y, class: 'chart-grid-line' }), svg('text', { x: edge.left - 9, y: y + 4, 'text-anchor': 'end', class: 'chart-axis-label' }, formatNumber(value, panel.key === 'temperature' ? 1 : 0)));
        }
        const ticks = Math.min(width < 340 ? 3 : 4, points.length);
        const tickFormatter = new Intl.DateTimeFormat(localeTag(), dateOptions(last - first >= 86400 ? { day: '2-digit', month: '2-digit', hour: '2-digit' } : { hour: '2-digit', minute: '2-digit' }));
        for (let index = 0; index < ticks; index++) {
          const point = points[ticks === 1 ? 0 : Math.round(index * (points.length - 1) / (ticks - 1))];
          panel.plot.append(svg('text', { x: panel.x(point.timestamp), y: height - 9, 'text-anchor': ticks === 1 ? 'middle' : index === 0 ? 'start' : index === ticks - 1 ? 'end' : 'middle', class: 'chart-axis-label' }, tickFormatter.format(new Date(point.timestamp * 1000))));
        }
        const path = (group, side) => group.map((point, index) => `${index ? 'L' : 'M'}${panel.x(point.timestamp).toFixed(2)},${panel.y(point[panel.key][side]).toFixed(2)}`).join(' ');
        segments(points, panel.key, gap).forEach((group) => {
          if (!average) {
            const low = group.slice().reverse().map((point) => `L${panel.x(point.timestamp).toFixed(2)},${panel.y(point[panel.key][0]).toFixed(2)}`).join(' ');
            panel.plot.append(svg('path', { d: `${path(group, 1)} ${low} Z`, class: 'chart-range-band' }));
            panel.plot.append(svg('path', { d: path(group, 0), class: 'chart-series chart-series--minimum' }));
          }
          panel.plot.append(svg('path', { d: path(group, 1), class: 'chart-series' }));
          if (group.length <= 24) group.forEach((point) => {
            panel.plot.append(svg('circle', { cx: panel.x(point.timestamp), cy: panel.y(point[panel.key][1]), r: group.length === 1 ? 4 : 2.5, class: 'chart-point' }));
            if (!average && group.length === 1) panel.plot.append(svg('circle', { cx: panel.x(point.timestamp), cy: panel.y(point[panel.key][0]), r: 4, class: 'chart-point' }));
          });
        });
        panel.cursor = svg('g', { class: 'chart-cursor', visibility: 'hidden' });
        panel.cursorLine = svg('line', { y1: edge.top, y2: edge.bottom, class: 'chart-cursor-line' });
        panel.dots = [0, 1].map(() => svg('circle', { r: 4, class: 'chart-cursor-point' }));
        panel.cursor.append(panel.cursorLine, ...panel.dots);
        panel.plot.append(panel.cursor);
      });
      select(activeIndex ?? points.length - 1, activeIndex !== null);
    }
    function clear() {
      observer?.disconnect();
      points = [];
      panels = [];
      activeIndex = null;
      container.replaceChildren();
      container.hidden = true;
    }
    function render(records, kind) {
      clear();
      average = kind === 'pvvx';
      points = prepareRecords(records, kind);
      if (!points.length) return false;
      container.hidden = false;
      container.dataset.count = String(points.length);
      const toolbar = html('div', 'history-chart-heading');
      toolbar.append(html('span', 'history-chart-mode', t(average ? 'chart.average' : 'chart.range')));
      dateLabel = html('time', 'history-chart-date');
      selectionSummary = html('p', 'sr-only');
      selectionSummary.setAttribute('aria-live', 'polite');
      toolbar.append(dateLabel);
      const grid = html('div', 'history-plot-grid');
      panels = [makePanel('temperature', 'metric.temperature', '°C'), makePanel('humidity', 'metric.humidity', '%')];
      grid.append(...panels.map((panel) => panel.article));
      const keyboard = html('p', 'sr-only', t('chart.keyboard'));
      keyboard.id = 'historyChartKeyboard';
      container.append(toolbar, grid, html('p', 'history-chart-hint', t('chart.hint')), keyboard, selectionSummary);
      draw();
      observer?.observe(container);
      return true;
    }
    return { render, clear };
  }
  root.DASHBOARD_HISTORY_CHART = { create, prepareRecords, temperatureExtent, segments };
  if (typeof module === 'object' && module.exports) module.exports = root.DASHBOARD_HISTORY_CHART;
})(typeof window === 'undefined' ? globalThis : window);
