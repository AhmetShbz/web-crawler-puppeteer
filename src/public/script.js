const {
  AppBar, Toolbar, Typography, Container, Paper, TextField, Button,
  FormControlLabel, List, ListItem, ListItemText, Snackbar,
  LinearProgress, Tabs, Tab, Box, IconButton,
  Tooltip, Menu, MenuItem, ThemeProvider, createTheme, CssBaseline, Switch
} = MaterialUI;

const socket = io();

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#90caf9',
    },
    secondary: {
      main: '#121838',
    },
  },
});

function TabPanel(props) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box p={3}>
          <Typography component="div">{children}</Typography>
        </Box>
      )}
    </div>
  );
}

function App() {
  const [tabValue, setTabValue] = React.useState(0);
  const [crawling, setCrawling] = React.useState(false);
  const [useLogin, setUseLogin] = React.useState(false);
  const [useProxy, setUseProxy] = React.useState(false);
  const [logs, setLogs] = React.useState([]);
  const [progress, setProgress] = React.useState(0);
  const [pagesCrawled, setPagesCrawled] = React.useState(0);
  const [currentUrl, setCurrentUrl] = React.useState('');
  const [preview, setPreview] = React.useState('');
  const [ipInfo, setIpInfo] = React.useState(null);
  const [currentTime, setCurrentTime] = React.useState(new Date().toLocaleString());
  const [maxDepth, setMaxDepth] = React.useState(4);
  const [maxPages, setMaxPages] = React.useState(100);
  const [browserProfileFile, setBrowserProfileFile] = React.useState(null);
  const [snackbar, setSnackbar] = React.useState({ open: false, message: '' });
  const [anchorEl, setAnchorEl] = React.useState(null);
  const [proxyHost, setProxyHost] = React.useState('');
  const [proxyPort, setProxyPort] = React.useState('');
  const [proxyUsername, setProxyUsername] = React.useState('');
  const [proxyPassword, setProxyPassword] = React.useState('');
  const [twoCaptchaKey, setTwoCaptchaKey] = React.useState('');
  const [crawlStats, setCrawlStats] = React.useState({
    totalPages: 0,
    successfulPages: 0,
    failedPages: 0,
    skippedPages: 0,
    popupsHandled: 0,
    jsContentProcessed: 0
  });
  const [robotsTxtInfo, setRobotsTxtInfo] = React.useState([]);
  const [sitemapInfo, setSitemapInfo] = React.useState([]);

  const [chart, setChart] = React.useState(null);
  const [statsChart, setStatsChart] = React.useState(null);

  // Switch states for each section in the analysis tab
  const [showRobots, setShowRobots] = React.useState(false);
  const [showSitemap, setShowSitemap] = React.useState(false);
  const [showLogs, setShowLogs] = React.useState(false);
  const [showPreview, setShowPreview] = React.useState(false);
  const [showProgress, setShowProgress] = React.useState(false);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleString());
    }, 1000);

    fetchIpInfo();

    const initCharts = () => {
      const ctx = document.getElementById('crawlChart');
      if (ctx) {
        const newChart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: [],
            datasets: [{
              label: 'Tarana Sayfa Sayısı',
              data: [],
              borderColor: '#90caf9',
              tension: 0.1
            }]
          },
          options: {
            responsive: true,
            scales: {
              y: {
                beginAtZero: true
              }
            }
          }
        });
        setChart(newChart);
      }

      const statsCtx = document.getElementById('statsChart');
      if (statsCtx) {
        const newStatsChart = new Chart(statsCtx, {
          type: 'doughnut',
          data: {
            labels: ['Başarılı', 'Başarısız', 'Atlanan', 'Pop-up\'lar', 'JS İçerik'],
            datasets: [{
              data: [0, 0, 0, 0, 0],
              backgroundColor: ['#4caf50', '#f44336', '#ff9800', '#2196f3', '#9c27b0']
            }]
          },
          options: {
            responsive: true
          }
        });
        setStatsChart(newStatsChart);
      }
    };

    setTimeout(initCharts, 0);

    return () => {
      clearInterval(timer);
      if (chart) chart.destroy();
      if (statsChart) statsChart.destroy();
    };
  }, []);

  React.useEffect(() => {
    const handleCrawlProgress = (data) => {
      setPagesCrawled(data.pagesCrawled);
      setCurrentUrl(data.url);
      setProgress((data.pagesCrawled / maxPages) * 100);
      setLogs(prevLogs => [...prevLogs, `Tarandı: ${data.url}`]);
      setPreview(`<iframe src="${data.url}" width="100%" height="100%"></iframe>`);

      if (chart) {
        chart.data.labels.push(data.pagesCrawled);
        chart.data.datasets[0].data.push(data.pagesCrawled);
        chart.update();
      }

      setCrawlStats(prevStats => ({
        ...prevStats,
        totalPages: data.pagesCrawled,
        successfulPages: data.successfulPages,
        failedPages: data.failedPages,
        skippedPages: data.skippedPages,
        popupsHandled: data.popupsHandled,
        jsContentProcessed: data.jsContentProcessed
      }));

      if (statsChart) {
        statsChart.data.datasets[0].data = [
          data.successfulPages,
          data.failedPages,
          data.skippedPages,
          data.popupsHandled,
          data.jsContentProcessed
        ];
        statsChart.update();
      }
    };

    const handleCrawlStatus = (data) => {
      setLogs(prevLogs => [...prevLogs, `${data.status}: ${data.url}`]);
    };

    const handleCrawlComplete = (data) => {
      setCrawling(false);
      setLogs(prevLogs => [...prevLogs, `Tarama tamamlandı. Toplam taranan sayfa: ${data.pagesCrawled}`]);
      setSnackbar({ open: true, message: 'Tarama başarıyla tamamlandı!' });
    };

    const handleCrawlError = (data) => {
      setCrawling(false);
      setLogs(prevLogs => [...prevLogs, `Hata: ${data.message}`]);
      setSnackbar({ open: true, message: `Hata: ${data.message}` });
    };

    const handleProfileValidation = (data) => {
      if (data.success) {
        setLogs(prevLogs => [...prevLogs, "Tarayıcı profili başarıyla doğrulandı. Tarama başlıyor..."]);
      } else {
        setCrawling(false);
        setLogs(prevLogs => [...prevLogs, `Tarayıcı profili doğrulanırken hata oluştu: ${data.message}`]);
        setSnackbar({ open: true, message: `Tarayıcı profili doğrulanırken hata oluştu: ${data.message}` });
      }
    };

    const handleRobotsTxtInfo = (data) => {
      setRobotsTxtInfo(data.disallowedPaths);
      setLogs(prevLogs => [...prevLogs, `robots.txt analiz edildi. ${data.disallowedPaths.length} disallowed path bulundu.`]);
    };

    const handleSitemapInfo = (data) => {
      setSitemapInfo(data.urls);
      setLogs(prevLogs => [...prevLogs, `sitemap.xml analiz edildi. ${data.urls.length} URL bulundu.`]);
    };

    socket.on('crawl_progress', handleCrawlProgress);
    socket.on('crawl_status', handleCrawlStatus);
    socket.on('crawl_complete', handleCrawlComplete);
    socket.on('crawl_error', handleCrawlError);
    socket.on('profile_validation', handleProfileValidation);
    socket.on('robots_txt_info', handleRobotsTxtInfo);
    socket.on('sitemap_info', handleSitemapInfo);

    return () => {
      socket.off('crawl_progress', handleCrawlProgress);
      socket.off('crawl_status', handleCrawlStatus);
      socket.off('crawl_complete', handleCrawlComplete);
      socket.off('crawl_error', handleCrawlError);
      socket.off('profile_validation', handleProfileValidation);
      socket.off('robots_txt_info', handleRobotsTxtInfo);
      socket.off('sitemap_info', handleSitemapInfo);
    };
  }, [chart, statsChart, maxPages]);

  React.useEffect(() => {
    setProgress((pagesCrawled / maxPages) * 100);
  }, [pagesCrawled, maxPages]);

  const fetchIpInfo = () => {
    fetch('https://ipapi.co/json/')
      .then(response => response.json())
      .then(data => setIpInfo(data))
      .catch(error => console.error('IP bilgisi alınırken hata oluştu:', error));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);

    const urlValue = formData.get('url');
    if (!isValidUrl(urlValue)) {
      setSnackbar({ open: true, message: 'Lütfen geçerli bir URL giriniz.' });
      return;
    }

    formData.append('maxDepth', maxDepth);
    formData.append('maxPages', maxPages);
    formData.append('twoCaptchaKey', twoCaptchaKey);

    if (browserProfileFile) {
      formData.append('browserProfile', browserProfileFile);
    }

    // Proxy kullanımı kontrolü
    if (useProxy) {
      console.log('Proxy bilgileri kullanılıyor: ', proxyHost, proxyPort);
      formData.append('proxyHost', proxyHost);
      formData.append('proxyPort', proxyPort);
      formData.append('proxyUsername', proxyUsername);
      formData.append('proxyPassword', proxyPassword);
    }

    fetch('/crawl', {
      method: 'POST',
      body: formData,
    })
      .then(response => response.json())
      .then(data => {
        if (data.message === 'Crawling started') {
          setCrawling(true);
          setLogs([]);
          setProgress(0);
          setPagesCrawled(0);
          setCrawlStats({
            totalPages: 0,
            successfulPages: 0,
            failedPages: 0,
            skippedPages: 0,
            popupsHandled: 0,
            jsContentProcessed: 0
          });
          setSnackbar({ open: true, message: 'Tarama başarıyla başlatıldı!' });
        } else {
          setLogs(prevLogs => [...prevLogs, `Hata: ${data.error}`]);
          setSnackbar({ open: true, message: `Hata: ${data.error}` });
        }
      })
      .catch(error => {
        setLogs(prevLogs => [...prevLogs, `Hata: ${error.message}`]);
        setSnackbar({ open: true, message: `Hata: ${error.message}` });
      });
  };

  const handleStop = () => {
    fetch('/stop', { method: 'POST' })
      .then(response => response.json())
      .then(data => {
        setCrawling(false);
        setSnackbar({ open: true, message: 'Tarama başarıyla durduruldu!' });
      })
      .catch(error => {
        setSnackbar({ open: true, message: `Tarama durdurulurken hata oluştu: ${error.message}` });
      });
  };

  const handleDownload = () => {
    window.location.href = '/download';
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const handleBrowserProfileUpload = (event) => {
    const file = event.target.files[0];
    if (file && file.name.endsWith('.tar.gz')) {
      setBrowserProfileFile(file);
      setLogs(prevLogs => [...prevLogs, "Tarayıcı profili başarıyla yüklendi."]);
      setSnackbar({ open: true, message: 'Tarayıcı profili başarıyla yüklendi!' });
    } else {
      setSnackbar({ open: true, message: 'Lütfen geçerli bir .tar.gz dosyası yükleyiniz.' });
    }
  };

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  function isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" style={{ flexGrow: 1 }}>Gelişmiş Web Tarayıcı</Typography>
          <Tooltip title="Ayarlar">
            <IconButton color="inherit" onClick={handleMenuOpen}>
              <span className="material-icons">settings</span>
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={anchorEl}
            keepMounted
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
          >
            <MenuItem onClick={() => { setTabValue(1); handleMenuClose(); }}>Tarayıcı Ayarları</MenuItem>
            <MenuItem onClick={handleMenuClose}>Hakkında</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" style={{ marginTop: '2rem' }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="crawler tabs">
          <Tab label="Tarama" />
          <Tab label="Ayarlar" />
          <Tab label="Analiz" />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          <div className="grid-container">
            <Paper className="paper full-width">
              <form onSubmit={handleSubmit}>
                <TextField
                  fullWidth
                  margin="normal"
                  label="Web Sitesi URL'si"
                  name="url"
                  required
                  variant="outlined"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={useLogin}
                      onChange={(e) => setUseLogin(e.target.checked)}
                      name="useLogin"
                      color="primary"
                    />
                  }
                  label="Giriş Bilgileri Kullan"
                />
                {useLogin && (
                  <React.Fragment>
                    <TextField
                      fullWidth
                      margin="normal"
                      label="Kullanıcı Adı"
                      name="username"
                      variant="outlined"
                      required
                    />
                    <TextField
                      fullWidth
                      margin="normal"
                      label="Şifre"
                      name="password"
                      type="password"
                      variant="outlined"
                      required
                    />
                    <TextField
                      fullWidth
                      margin="normal"
                      label="Giriş URL'si"
                      name="loginUrl"
                      variant="outlined"
                      required
                    />
                  </React.Fragment>
                )}
                <FormControlLabel
                  control={
                    <Switch
                      checked={useProxy}
                      onChange={(e) => setUseProxy(e.target.checked)}
                      name="useProxy"
                      color="primary"
                    />
                  }
                  label="Proxy Kullan"
                />
                {useProxy && (
                  <React.Fragment>
                    <TextField
                      fullWidth
                      margin="normal"
                      label="Proxy Host"
                      name="proxyHost"
                      variant="outlined"
                      value={proxyHost}
                      onChange={(e) => setProxyHost(e.target.value)}
                      required
                    />
                    <TextField
                      fullWidth
                      margin="normal"
                      label="Proxy Port"
                      name="proxyPort"
                      variant="outlined"
                      value={proxyPort}
                      onChange={(e) => setProxyPort(e.target.value)}
                      required
                    />
                    <TextField
                      fullWidth
                      margin="normal"
                      label="Proxy Kullanıcı Adı"
                      name="proxyUsername"
                      variant="outlined"
                      value={proxyUsername}
                      onChange={(e) => setProxyUsername(e.target.value)}
                    />
                    <TextField
                      fullWidth
                      margin="normal"
                      label="Proxy Şifresi"
                      name="proxyPassword"
                      type="password"
                      variant="outlined"
                      value={proxyPassword}
                      onChange={(e) => setProxyPassword(e.target.value)}
                    />
                  </React.Fragment>
                )}
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  fullWidth
                  style={{ marginTop: '1rem' }}
                  disabled={crawling}
                >
                  {crawling ? 'Tarama Devam Ediyor...' : 'Tarama Başlat'}
                </Button>
              </form>
              {crawling && (
                <Button
                  variant="contained"
                  color="secondary"
                  fullWidth
                  style={{ marginTop: '1rem' }}
                  onClick={handleStop}
                >
                  Tarama Durdur
                </Button>
              )}
              <Button
                variant="contained"
                color="primary"
                fullWidth
                style={{ marginTop: '1rem' }}
                onClick={handleDownload}
                disabled={!crawlStats.totalPages}
              >
                Tarama Sonucunu İndir
              </Button>
            </Paper>
          </div>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <div className="grid-container">
            <Paper className="paper">
              <Typography variant="h6">Tarayıcı Ayarları</Typography>
              <TextField
                fullWidth
                margin="normal"
                label="Maksimum Derinlik"
                type="number"
                value={maxDepth}
                onChange={(e) => setMaxDepth(parseInt(e.target.value))}
                variant="outlined"
              />
              <TextField
                fullWidth
                margin="normal"
                label="Maksimum Sayfa Sayısı"
                type="number"
                value={maxPages}
                onChange={(e) => setMaxPages(parseInt(e.target.value))}
                variant="outlined"
              />
              <TextField
                fullWidth
                margin="normal"
                label="2captcha API Anahtarı"
                value={twoCaptchaKey}
                onChange={(e) => setTwoCaptchaKey(e.target.value)}
                variant="outlined"
              />
              <input
                accept=".tar.gz"
                style={{ display: 'none' }}
                id="browser-profile-upload"
                type="file"
                onChange={handleBrowserProfileUpload}
              />
              <label htmlFor="browser-profile-upload">
                <Button
                  variant="contained"
                  component="span"
                  fullWidth
                  style={{ marginTop: '1rem' }}
                >
                  Tarayıcı Profili Yükle (.tar.gz)
                </Button>
              </label>
              {browserProfileFile && (
                <Typography style={{ marginTop: '0.5rem' }}>
                  Yüklenen Profil: {browserProfileFile.name}
                </Typography>
              )}
            </Paper>
          </div>
        </TabPanel>

        {/* Analysis Tab */}
        <TabPanel value={tabValue} index={2}>
          <div className="grid-container">
            {/* Switch for Robots.txt */}
            <Paper className="paper">
              <FormControlLabel
                control={
                  <Switch
                    checked={showRobots}
                    onChange={() => setShowRobots(!showRobots)}
                    name="showRobots"
                    color="primary"
                  />
                }
                label="Robots.txt Analizi"
              />
              {showRobots && (
                <div className="logs-container">
                  <Typography variant="h6">Robots.txt Analizi</Typography>
                  <List>
                    {robotsTxtInfo.map((path, index) => (
                      <ListItem key={index}>
                        <ListItemText primary={path} />
                      </ListItem>
                    ))}
                  </List>
                </div>
              )}
            </Paper>

            {/* Switch for Sitemap.xml */}
            <Paper className="paper">
              <FormControlLabel
                control={
                  <Switch
                    checked={showSitemap}
                    onChange={() => setShowSitemap(!showSitemap)}
                    name="showSitemap"
                    color="primary"
                  />
                }
                label="Sitemap.xml Analizi"
              />
              {showSitemap && (
                <div className="logs-container">
                  <Typography variant="h6">Sitemap.xml Analizi</Typography>
                  <List>
                    {sitemapInfo.map((url, index) => (
                      <ListItem key={index}>
                        <ListItemText primary={url} />
                      </ListItem>
                    ))}
                  </List>
                </div>
              )}
            </Paper>

            {/* Switch for Tarama İlerlemesi */}
            <Paper className="paper">
              <FormControlLabel
                control={
                  <Switch
                    checked={showProgress}
                    onChange={() => setShowProgress(!showProgress)}
                    name="showProgress"
                    color="primary"
                  />
                }
                label="Tarama İlerlemesi"
              />
              {showProgress && (
                <div className="logs-container">
                  <Typography variant="h6">Tarama İlerlemesi</Typography>
                  <LinearProgress
                    variant="determinate"
                    value={progress}
                    style={{ marginTop: '1rem', height: '20px' }}
                  />
                  <Typography align="center" style={{ marginTop: '0.5rem' }}>
                    {progress.toFixed(2)}%
                  </Typography>
                  <Typography>Taranan Sayfa: {pagesCrawled}</Typography>
                  <Typography>Şu Anki URL: {currentUrl}</Typography>
                  <div className="chart-container">
                    <canvas id="crawlChart"></canvas>
                  </div>
                  <div className="chart-container" style={{ marginTop: '1rem' }}>
                    <canvas id="statsChart"></canvas>
                  </div>
                  <Typography>
                    Başarılı: {crawlStats.successfulPages} |
                    Başarısız: {crawlStats.failedPages} |
                    Atlanan: {crawlStats.skippedPages} |
                    Pop-up'lar: {crawlStats.popupsHandled} |
                    JS İçerik: {crawlStats.jsContentProcessed}
                  </Typography>
                </div>
              )}
            </Paper>

            {/* Switch for Tarama Logları */}
            <Paper className="paper">
              <FormControlLabel
                control={
                  <Switch
                    checked={showLogs}
                    onChange={() => setShowLogs(!showLogs)}
                    name="showLogs"
                    color="primary"
                  />
                }
                label="Tarama Logları"
              />
              {showLogs && (
                <div className="logs-container">
                  <Typography variant="h6">Tarama Logları</Typography>
                  <List>
                    {logs.map((log, index) => (
                      <ListItem key={index}>
                        <ListItemText
                          primary={log}
                          style={{
                            color: log.includes('Hata') ? '#f44336' :
                              log.includes('Tarandı') ? '#4caf50' :
                                '#ffffff'
                          }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </div>
              )}
            </Paper>

            {/* Switch for Sayfa Önizlemesi */}
            <Paper className="paper">
              <FormControlLabel
                control={
                  <Switch
                    checked={showPreview}
                    onChange={() => setShowPreview(!showPreview)}
                    name="showPreview"
                    color="primary"
                  />
                }
                label="Sayfa Önizlemesi"
              />
              {showPreview && (
                <div className="preview-container">
                  <Typography variant="h6">Sayfa Önizlemesi</Typography>
                  <div className="browser-toolbar">
                    <input type="text" value={currentUrl} readOnly />
                  </div>
                  <div dangerouslySetInnerHTML={{ __html: preview }}></div>
                </div>
              )}
            </Paper>
          </div>
        </TabPanel>
      </Container>
      <Snackbar
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        message={snackbar.message}
        action={
          <React.Fragment>
            <Button color="secondary" size="small" onClick={() => setSnackbar({ ...snackbar, open: false })}>
              KAPAT
            </Button>
          </React.Fragment>
        }
      />
    </ThemeProvider>
  );
}

const rootElement = document.getElementById('root');
ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  rootElement
);

console.log('React uygulaması yüklendi');
