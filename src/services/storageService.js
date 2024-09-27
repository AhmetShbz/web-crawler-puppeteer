const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');
const { createHash } = require('crypto');
const { shortenFileName } = require('../utils/fileUtils');
const logger = require('../utils/logger');
const fetch = require('node-fetch');

// Helper function: Get resource file name from URL
const getResourceFileName = (resourceUrl) => {
    const resourcePath = new URL(resourceUrl).pathname;
    const resourceHash = createHash('md5').update(resourceUrl).digest('hex').substring(0, 8);
    const resourceFileName = `${resourceHash}_${path.basename(resourcePath)}`;
    return resourceFileName;
};

exports.savePage = async (url, content, resources) => {
    const parsedUrl = new URL(url);
    const domain = parsedUrl.hostname;
    let pathname = parsedUrl.pathname;

    // URL hashleme ve dosya adı kısaltma
    const urlHash = createHash('md5').update(url).digest('hex').substring(0, 8);
    const parts = pathname.split('/');
    parts[parts.length - 1] = shortenFileName(parts[parts.length - 1]);
    pathname = parts.join('/');

    const dirPath = path.join('downloads', domain, path.dirname(pathname));
    await fs.mkdir(dirPath, { recursive: true });

    let fileName = `${urlHash}_${path.basename(pathname) || 'index.html'}`;
    if (!path.extname(fileName)) {
        fileName += '.html';
    }

    const filePath = path.join(dirPath, fileName);
    const $ = cheerio.load(content);

    // Tüm yerel link ve kaynakları mutlak URL'lere dönüştürme
    $('a, link, script, img').each((i, elem) => {
        const attr = $(elem).attr('href') ? 'href' : 'src';
        const oldUrl = $(elem).attr(attr);
        if (oldUrl && !oldUrl.startsWith('http') && !oldUrl.startsWith('//')) {
            const absoluteUrl = new URL(oldUrl, url).href;
            $(elem).attr(attr, absoluteUrl);
        }
    });

    // Sayfanın HTML içeriğini kaydetme
    await fs.writeFile(filePath, $.html());
    logger.info(`Saved page: ${url} to ${filePath}`);

    // Sayfadaki tüm kaynakları (CSS, JS, resim) kaydetme
    for (const resource of resources) {
        try {
            const resourceUrl = new URL(resource.url);
            const resourcePath = resourceUrl.pathname;
            const resourceFileName = getResourceFileName(resource.url);

            // Kaynak türüne göre ayrı klasörlere kaydetme (örneğin CSS dosyaları)
            let resourceDir = 'assets';
            if (resource.type === 'stylesheet') resourceDir = 'css';
            if (resource.type === 'image') resourceDir = 'images';
            if (resource.type === 'script') resourceDir = 'js';

            const resourceDirPath = path.join('downloads', domain, resourceDir);
            const resourceFilePath = path.join(resourceDirPath, resourceFileName);

            // Klasörün var olup olmadığını kontrol etme, yoksa oluşturma
            await fs.mkdir(path.dirname(resourceFilePath), { recursive: true });

            const response = await fetch(resource.url);
            const buffer = await response.arrayBuffer();
            await fs.writeFile(resourceFilePath, Buffer.from(buffer));
            logger.info(`Saved resource: ${resource.url} to ${resourceFilePath}`);
        } catch (error) {
            logger.error(`Error saving resource ${resource.url}: ${error.message}`);
        }
    }
};

// Kısmi sayfa kaydetme (sayfa tamamen alınamıyorsa)
exports.savePartialPage = async (url, content) => {
    const parsedUrl = new URL(url);
    const domain = parsedUrl.hostname;
    const urlHash = createHash('md5').update(url).digest('hex').substring(0, 8);

    const dirPath = path.join('downloads', domain, 'partial_pages');
    await fs.mkdir(dirPath, { recursive: true });

    const fileName = `${urlHash}_partial.html`;
    const filePath = path.join(dirPath, fileName);

    await fs.writeFile(filePath, content);
    logger.info(`Saved partial content for ${url} to ${filePath}`);
};

// Etkileşimli elemanları kaydetme (butonlar, formlar, pop-up'lar)
exports.saveInteractiveElements = async (url, elements) => {
    const parsedUrl = new URL(url);
    const domain = parsedUrl.hostname;
    const urlHash = createHash('md5').update(url).digest('hex').substring(0, 8);

    const dirPath = path.join('downloads', domain, 'interactive_elements');
    await fs.mkdir(dirPath, { recursive: true });

    const filePath = path.join(dirPath, `${urlHash}_interactive_elements.json`);

    await fs.writeFile(filePath, JSON.stringify(elements, null, 2));
    logger.info(`Saved interactive elements for ${url} to ${filePath}`);
};

// Dinamik JSON yanıtlarını kaydetme (API yanıtları)
exports.saveJsonResponse = async (pageUrl, apiUrl, data) => {
    const parsedUrl = new URL(pageUrl);
    const domain = parsedUrl.hostname;
    const urlHash = createHash('md5').update(apiUrl).digest('hex').substring(0, 8);

    const dirPath = path.join('downloads', domain, 'api_responses');
    await fs.mkdir(dirPath, { recursive: true });

    const fileName = `${urlHash}_api_response.json`;
    const filePath = path.join(dirPath, fileName);

    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    logger.info(`Saved API response for ${apiUrl} to ${filePath}`);
};
