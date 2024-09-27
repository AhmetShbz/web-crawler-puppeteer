const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const config = require('./config/default');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const fs = require('fs').promises;
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const crawlerService = require('./services/crawlerService');
const browserService = require('./services/browserService');
const logger = require('./utils/logger');
const archiver = require('archiver');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Multer setup for file upload
const upload = multer({ dest: 'uploads/' });

let crawlProcess = null;

app.post('/crawl', upload.single('browserProfile'), async (req, res) => {
  const { url, maxDepth, maxPages, useLogin, username, password, loginUrl, useProxy, proxyHost, proxyPort, proxyUsername, proxyPassword, twoCaptchaKey } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  let browserProfilePath = null;

  if (req.file) {
    const { path: tempPath, originalname } = req.file;
    const targetPath = path.join(__dirname, 'uploads', originalname);

    try {
      await fs.rename(tempPath, targetPath);
      browserProfilePath = targetPath;

      // Extract the tar.gz file
      const extractPath = path.join(__dirname, 'browser_profile');
      await exec(`mkdir -p ${extractPath} && tar -xzf ${browserProfilePath} -C ${extractPath}`);

      // Validate the browser profile
      const isValid = await browserService.validateBrowserProfile(extractPath);
      if (!isValid) {
        throw new Error('Invalid browser profile');
      }

      io.emit('profile_validation', { success: true });
    } catch (error) {
      io.emit('profile_validation', { success: false, message: error.message });
      return res.status(400).json({ error: 'Failed to process browser profile' });
    }
  } else {
    // Use default profile path if no profile is uploaded
    browserProfilePath = path.join(__dirname, 'default_browser_profile');
  }

  res.json({ message: 'Crawling started' });

  const options = {
    maxDepth: parseInt(maxDepth) || config.crawler.maxDepth,
    maxPages: parseInt(maxPages) || config.crawler.maxPages,
    socketIo: io,
    browserProfilePath: browserProfilePath,
    waitTime: config.crawler.waitTime,
    twoCaptchaKey: twoCaptchaKey
  };

  if (useLogin === 'true' && username && password && loginUrl) {
    options.login = { username, password, loginUrl };
  }

  if (useProxy === 'true') {
    options.proxy = {
      host: proxyHost || config.proxy.host,
      port: proxyPort || config.proxy.port,
      username: proxyUsername || config.proxy.username,
      password: proxyPassword || config.proxy.password
    };
  }

  try {
    crawlProcess = crawlerService.crawlWebsite(url, options);
    await crawlProcess;
  } catch (error) {
    logger.error('Crawling error:', error);
    io.emit('crawl_error', { message: 'An error occurred during crawling' });
  } finally {
    // Clean up extracted profile if it was uploaded
    if (req.file) {
      await exec(`rm -rf ${path.join(__dirname, 'browser_profile')}`);
      await fs.unlink(browserProfilePath);
    }
    crawlProcess = null;
  }
});

app.post('/stop', (req, res) => {
  if (crawlProcess) {
    crawlProcess.stop();
    res.json({ message: 'Crawling stopped' });
  } else {
    res.status(400).json({ error: 'No active crawling process' });
  }
});

app.get('/download', (req, res) => {
  const downloadPath = path.join(__dirname, 'downloads');
  const zipPath = path.join(__dirname, 'crawled_website.zip');
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', function() {
    res.download(zipPath, 'crawled_website.zip', (err) => {
      if (err) {
        logger.error('Download error:', err);
      }
      fs.unlink(zipPath, (unlinkErr) => {
        if (unlinkErr) {
          logger.error('Error deleting zip file:', unlinkErr);
        }
      });
    });
  });

  archive.on('error', function(err) {
    res.status(500).send({ error: err.message });
  });

  archive.pipe(output);
  archive.directory(downloadPath, false);
  archive.finalize();
});

const port = config.server.port;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});