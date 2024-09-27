module.exports = {
    server: {
        port: 3000
    },
    crawler: {
        maxDepth: 3,
        maxPages: 100,
        waitTime: 5000,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    },
    proxy: {
        host: ''**********',',
        port: ''**********',',
        username: '**********',
        password: ''**********','
    },
    recaptcha: {
        provider: '2captcha',
        apiKey: '' // 2captcha API key will be provided by the user through the UI
    }
  };
