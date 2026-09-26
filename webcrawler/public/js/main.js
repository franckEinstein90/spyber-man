/* jshint esversion: 11 */
(function () {
  'use strict';

  const socket = io();
  const logList = document.getElementById('log-list');
  const crawlForm = document.getElementById('crawl-form');
  const crawlUrl = document.getElementById('crawl-url');

  function appendLog(message, cssClass) {
    const li = document.createElement('li');
    li.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    if (cssClass) li.classList.add(cssClass);
    logList.prepend(li);
  }

  // ── Socket events ──────────────────────────────────────────────────────────
  socket.on('connect', () => appendLog('Connected to server'));
  socket.on('disconnect', () => appendLog('Disconnected from server', 'event-error'));

  socket.on('crawl:start', (data) => {
    appendLog(`Crawl started → ${data.url}`, 'event-start');
  });

  socket.on('crawl:done', (data) => {
    appendLog(`Crawl done  → ${data.url} — "${data.title}"`, 'event-done');
  });

  socket.on('crawl:error', (data) => {
    appendLog(`Crawl error → ${data.url}: ${data.error}`, 'event-error');
  });

  // ── Form submission ────────────────────────────────────────────────────────
  crawlForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = crawlUrl.value.trim();
    if (!url) return;
    socket.emit('crawl:request', { url });
    crawlUrl.value = '';
  });
})();
