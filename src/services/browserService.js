const { connect } = require("puppeteer-real-browser");
const config = require('../config/default');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

// Delay function to wait for a certain time
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

exports.launchBrowser = async (browserProfilePath, proxy, twoCaptchaKey) => {
    const browserOptions = {
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=1920,1080',
        ],
        customConfig: {},
        connectOption: {
            defaultViewport: null,
        },
        disableXvfb: false,
        ignoreAllFlags: false
    };

    if (proxy && proxy.host && proxy.port) {
        logger.info(`Tarayıcı proxy ile başlatılıyor: ${JSON.stringify(proxy)}`);
        browserOptions.args.push(`--proxy-server=${proxy.host}:${proxy.port}`);

        if (proxy.username && proxy.password) {
            browserOptions.connectOption.username = proxy.username;
            browserOptions.connectOption.password = proxy.password;
            logger.info(`Proxy kimlik bilgileri kullanılıyor.`);
        }
    } else {
        logger.warn('Proxy bilgileri eksik veya kullanılmıyor.');
    }

    if (browserProfilePath) {
        browserOptions.userDataDir = browserProfilePath;
    }

    const { browser, page } = await connect(browserOptions);

    if (twoCaptchaKey) {
        // Implement 2captcha solution here if needed
    }

    return { browser, page };
};

exports.setupPage = async (page) => {
    await page.setUserAgent(config.crawler.userAgent);
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setJavaScriptEnabled(true);
};

exports.performLogin = async (page, login) => {
    const { username, password, loginUrl } = login;
    
    try {
        await page.goto(loginUrl, { waitUntil: 'networkidle2' });
        
        // Wait for login form to be visible
        await page.waitForSelector('input[name="username"]');
        await page.waitForSelector('input[name="password"]');
        
        // Type credentials with random delays
        await page.type('input[name="username"]', username, { delay: 50 + Math.random() * 100 });
        await page.type('input[name="password"]', password, { delay: 50 + Math.random() * 100 });
        
        // Click submit button
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2' }),
            page.click('button[type="submit"]'),
        ]);
        
        logger.info('Login successful');
    } catch (error) {
        logger.error(`Login failed: ${error.message}`);
        throw error;
    }
};

exports.handlePopups = async (page) => {
    try {
        await delay(5000); // Wait for 5 seconds for popups to appear

        // Handle cookie consent popups
        const cookieButtons = await page.$$('button[class*="cookie"], button[id*="cookie"]');
        for (const button of cookieButtons) {
            await button.click().catch(() => {}); // Ignore errors if button is not clickable
        }

        // Handle newsletter signup popups
        const closeButtons = await page.$$('button[class*="close"], button[aria-label="Close"]');
        for (const button of closeButtons) {
            await button.click().catch(() => {}); // Ignore errors if button is not clickable
        }

        // Handle "Accept all" buttons for GDPR notices using text filtering
        const acceptButtons = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('button')).filter(button => 
                button.textContent.includes('Accept all') || button.textContent.includes('Accept All')
            );
        });
        for (const button of acceptButtons) {
            await page.evaluate(btn => btn.click(), button).catch(() => {}); // Ignore errors if button is not clickable
        }

        // Solve reCAPTCHA if present
        await page.solveRecaptchas().catch(() => {});

    } catch (error) {
        logger.warn(`Error handling popups: ${error.message}`);
    }
};

exports.getPageResources = async (page) => {
    const resources = new Set();
    const client = await page.target().createCDPSession();
    await client.send('Network.enable');
    
    client.on('Network.responseReceived', event => {
        const { url, type } = event.response;
        if (['stylesheet', 'script', 'font', 'image'].includes(type)) {
            resources.add({ url, type });
        }
    });

    return Array.from(resources);
};

exports.getPageLinks = async (page) => {
    return await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'))
            .map(a => a.href)
            .filter(href => href.startsWith(window.location.origin));
        
        // Remove duplicate links
        return [...new Set(links)];
    });
};

exports.validateBrowserProfile = async (profilePath) => {
    try {
        await fs.access(path.join(profilePath, 'Default', 'Preferences'));
        await fs.access(path.join(profilePath, 'Default', 'History'));
        return true;
    } catch (error) {
        logger.error(`Invalid browser profile: ${error.message}`);
        return false;
    }
};
