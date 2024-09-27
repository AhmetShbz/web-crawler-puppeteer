const browserService = require('./browserService');
const storageService = require('./storageService');
const logger = require('../utils/logger');
const config = require('../config/default');

// Helper function for delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

exports.crawlWebsite = async (startUrl, options) => {
    const { maxDepth, maxPages, socketIo, login, browserProfilePath, proxy, waitTime, twoCaptchaKey } = options;
    
    const { browser, page } = await browserService.launchBrowser(browserProfilePath, proxy, twoCaptchaKey);

    await browserService.setupPage(page);

    const visitedUrls = new Set();
    const urlsToVisit = [{ url: startUrl, depth: 0 }];
    let pagesCrawled = 0;
    let successfulPages = 0;
    let failedPages = 0;
    let skippedPages = 0;
    let shouldStop = false;

    try {
        if (login) {
            await browserService.performLogin(page, login);
        }

        while (urlsToVisit.length > 0 && pagesCrawled < maxPages && !shouldStop) {
            const { url, depth } = urlsToVisit.shift();
            if (visitedUrls.has(url) || depth > maxDepth) {
                skippedPages++;
                continue;
            }

            try {
                logger.info(`Navigating to ${url}`);
                await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

                await browserService.handlePopups(page);
                await delay(waitTime || config.crawler.waitTime);

                // Wait for the page to fully load
                const content = await page.content();
                if (!content || content.trim() === '') {
                    throw new Error('Page content is empty');
                }

                const resources = await browserService.getPageResources(page);
                
                await storageService.savePage(url, content, resources);
                visitedUrls.add(url);
                pagesCrawled++;
                successfulPages++;

                const progress = (pagesCrawled / maxPages) * 100;
                socketIo.emit('crawl_progress', { 
                    url, 
                    pagesCrawled, 
                    progress, 
                    successfulPages, 
                    failedPages, 
                    skippedPages 
                });

                const links = await browserService.getPageLinks(page);

                for (const link of links) {
                    if (!visitedUrls.has(link)) {
                        urlsToVisit.push({ url: link, depth: depth + 1 });
                    }
                }

                // Extract and save interactive elements
                await extractAndSaveInteractiveElements(page, url);

                // Simulate and save JSON responses
                await simulateAndSaveJsonResponses(page, url);

            } catch (error) {
                logger.error(`Error processing ${url}: ${error.message}`);
                socketIo.emit('crawl_error', { message: `Error processing ${url}: ${error.message}` });
                failedPages++;

                // Save partial content if available
                try {
                    const partialContent = await page.content();
                    if (partialContent && partialContent.trim() !== '') {
                        await storageService.savePartialPage(url, partialContent);
                    }
                } catch (saveError) {
                    logger.error(`Error saving partial content for ${url}: ${saveError.message}`);
                }
            }
        }
    } finally {
        await browser.close();
    }

    socketIo.emit('crawl_complete', { pagesCrawled, successfulPages, failedPages, skippedPages });

    return {
        stop: () => {
            shouldStop = true;
        }
    };
};

async function extractAndSaveInteractiveElements(page, url) {
    const interactiveElements = await page.evaluate(() => {
        const elements = [];
        // Extract buttons
        document.querySelectorAll('button, input[type="button"], a.btn').forEach(el => {
            elements.push({
                type: 'button',
                text: el.innerText || el.value,
                id: el.id,
                class: el.className,
                href: el.href
            });
        });
        // Extract forms
        document.querySelectorAll('form').forEach(form => {
            const formData = {
                type: 'form',
                id: form.id,
                class: form.className,
                action: form.action,
                method: form.method,
                fields: []
            };
            form.querySelectorAll('input, select, textarea').forEach(field => {
                formData.fields.push({
                    type: field.type || field.tagName.toLowerCase(),
                    name: field.name,
                    id: field.id,
                    class: field.className
                });
            });
            elements.push(formData);
        });
        // Extract modals/popups
        document.querySelectorAll('.modal, .popup, [class*="modal"], [class*="popup"]').forEach(el => {
            elements.push({
                type: 'modal',
                id: el.id,
                class: el.className,
                content: el.innerHTML
            });
        });
        return elements;
    });

    await storageService.saveInteractiveElements(url, interactiveElements);
}

async function simulateAndSaveJsonResponses(page, url) {
    const jsonResponses = await page.evaluate(() => {
        const responses = [];
        // Simulate API calls dynamically by intercepting
        const apiEndpoints = Array.from(new Set(window.performance.getEntriesByType("resource").filter(entry => entry.initiatorType === 'xmlhttprequest').map(entry => entry.name)));
        apiEndpoints.forEach(endpoint => {
            responses.push({
                url: endpoint,
                data: {
                    success: true,
                    data: [
                        { id: 1, name: 'Sample Item 1' },
                        { id: 2, name: 'Sample Item 2' },
                        { id: 3, name: 'Sample Item 3' }
                    ]
                }
            });
        });
        return responses;
    });

    for (const response of jsonResponses) {
        await storageService.saveJsonResponse(url, response.url, response.data);
    }
}
