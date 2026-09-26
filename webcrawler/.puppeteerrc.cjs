const { join } = require('path');

/**
 * Pin Puppeteer's browser cache to a project-local directory so every runtime
 * (VS Code debug launch, nodemon, plain `node`, CI) resolves the same Chrome
 * install. Without this, the cache location can vary by environment/shell and
 * `puppeteer.launch()` fails with "Could not find Chrome".
 *
 * After changing this, (re)install the browser with:
 *   npx puppeteer browsers install chrome
 */
module.exports = {
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
