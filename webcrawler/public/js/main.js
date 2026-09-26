/* jshint esversion: 11 */
(function () {
  'use strict';

  const MAX_LOG_ENTRIES = 200;

  const socket = io();
  const logList = document.getElementById('log-list');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const statusProgress = document.getElementById('status-progress');
  const statusCurrent = document.getElementById('status-current');

  let progress = { done: 0, total: 0 };

  function appendLog(message, cssClass) {
    const li = document.createElement('li');
    li.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    if (cssClass) li.classList.add(cssClass);
    logList.prepend(li);
    while (logList.childElementCount > MAX_LOG_ENTRIES) {
      logList.removeChild(logList.lastChild);
    }
  }

  // state: 'idle' | 'busy' | 'error' | 'offline'
  function setStatus(state, text) {
    statusDot.className = `dot ${state}`;
    statusText.textContent = text;
  }

  function renderCurrent(urls) {
    statusCurrent.innerHTML = '';
    if (!urls || urls.length === 0) {
      const span = document.createElement('span');
      span.className = 'muted';
      span.textContent = 'nothing';
      statusCurrent.appendChild(span);
      return;
    }
    urls.forEach((url) => {
      const chip = document.createElement('span');
      chip.className = 'url-chip';
      chip.textContent = url;
      statusCurrent.appendChild(chip);
    });
  }

  // ── Connection state ─────────────────────────────────────────────────────
  socket.on('connect', () => appendLog('Connected to server'));
  socket.on('disconnect', () => {
    setStatus('offline', 'Disconnected');
    renderCurrent([]);
    statusProgress.textContent = '\u2014';
    appendLog('Disconnected from server', 'event-error');
  });

  // ── Status snapshot (sent on connect and on every change) ──────────────────
  socket.on('crawl:status', (status) => {
    if (status.running) {
      setStatus('busy', 'Crawling');
    } else {
      setStatus('idle', 'Idle');
    }
    renderCurrent(status.currentUrls);
  });

  // ── Live activity feed ─────────────────────────────────────────────────────
  socket.on('crawl:activity', (event) => {
    switch (event.type) {
      case 'batch:start':
        progress = { done: 0, total: event.total };
        statusProgress.textContent = `0 / ${event.total}`;
        appendLog(`Batch started \u2014 ${event.total} URL(s)`, 'event-start');
        break;

      case 'url:start':
        appendLog(
          `Crawling \u2192 ${event.url} (${event.index + 1}/${event.total})`,
          'event-start',
        );
        break;

      case 'url:stage':
        appendLog(
          `${event.label} \u2192 ${event.url}`,
          'event-stage',
        );
        setStatus('busy', event.label);
        break;

      case 'url:done':
        progress.done += 1;
        statusProgress.textContent = `${progress.done} / ${progress.total}`;
        if (event.status === 'success') {
          appendLog(
            `Done \u2192 ${event.url} \u2014 "${event.title}" [callback: ${event.callbackStatus}]`,
            'event-done',
          );
        } else {
          appendLog(`Error \u2192 ${event.url}: ${event.error}`, 'event-error');
        }
        break;

      case 'batch:done':
        appendLog(
          `Batch complete \u2014 ${event.succeeded} ok, ${event.failed} failed`,
          'event-done',
        );
        break;

      default:
        break;
    }
  });
})();
