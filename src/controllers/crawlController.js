const path = require('path');
const fs = require('fs').promises;
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const crawlerService = require('../services/crawlerService');
const browserService = require('../services/browserService');
const logger = require('../utils/logger');

exports.startCrawl = async (req, res) => {
  const { url, maxDepth, maxPages, useLogin, username, password, loginUrl, useProxy, proxyHost, proxyPort, proxyUsername, proxyPassword } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  let browserProfilePath = null;

  if (req.file) {
    const { path: tempPath, originalname } = req.file;
    const targetPath = path.join(__dirname, '..', '..', 'uploads', originalname);

    try {
      await fs.rename(tempPath, targetPath);
      browserProfilePath = targetPath;

      const extractPath = path.join(__dirname, '..', '..', 'browser_profile');
      await exec(`mkdir -p ${extractPath} && tar -xzf ${browserProfilePath} -C ${extractPath}`);

      const isValid = await browserService.validateBrowserProfile(extractPath);
      if (!isValid) {
        throw new Error('Invalid browser profile');
      }

      req.app.io.emit('profile_validation', { success: true });
    } catch (error) {
      req.app.io.emit('profile_validation', { success: false, message: error.message });
      return res.status(400).json({ error: 'Failed to process browser profile' });
    }
  } else {
    browserProfilePath = path.join(__dirname, '..', '..', 'default_browser_profile');
  }

  res.json({ message: 'Crawling started' });

  const options = {
    maxDepth: parseInt(maxDepth),
    maxPages: parseInt(maxPages),
    socketIo: req.app.io,
    browserProfilePath: browserProfilePath
  };

  if (useLogin === 'on' && username && password && loginUrl) {
    options.login = { username, password, loginUrl };
  }

  if (useProxy === 'on') {
    options.proxy = { host: proxyHost, port: proxyPort, username: proxyUsername, password: proxyPassword };
  }

  try {
    await crawlerService.crawlWebsite(url, options);
  } catch (error) {
    logger.error('Crawling error:', error);
    req.app.io.emit('crawl_error', { message: 'An error occurred during crawling' });
  } finally {
    if (req.file) {
      await exec(`rm -rf ${path.join(__dirname, '..', '..', 'browser_profile')}`);
      await fs.unlink(browserProfilePath);
    }
  }
};