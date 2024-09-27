const winston = require('winston');
const fs = require('fs').promises;
const path = require('path');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} [${level}]: ${message}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'crawler.log' })
    ]
});

async function appendToLogFile(message) {
    const logPath = path.join(__dirname, '..', '..', 'log.txt');
    await fs.appendFile(logPath, message + '\n');
}

module.exports = {
    info: (message) => {
        logger.info(message);
        appendToLogFile(`[INFO] ${message}`);
    },
    error: (message) => {
        logger.error(message);
        appendToLogFile(`[ERROR] ${message}`);
    },
    warn: (message) => {
        logger.warn(message);
        appendToLogFile(`[WARN] ${message}`);
    }
};