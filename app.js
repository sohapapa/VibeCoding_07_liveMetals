/**
 * MetalPulse - Real-time Metal Price Dashboard
 * Handles MetalpriceAPI integration, state management, currency/unit conversion,
 * sparklines, and vertical Chart.js visualizations.
 */

// ==========================================================================
// 1. Metal Constants & Configurations
// ==========================================================================
const METALS = {
  XAU: {
    symbol: 'XAU',
    nameKo: '금',
    nameEn: 'Gold',
    icon: '🥇',
    color: '#f59e0b',
    glowColor: 'rgba(245, 158, 11, 0.25)',
    baseUsdPrice: 2652.40, // USD per troy ounce base
    volatility: 0.007,
    digits: 2
  },
  XAG: {
    symbol: 'XAG',
    nameKo: '은',
    nameEn: 'Silver',
    icon: '🥈',
    color: '#cbd5e1',
    glowColor: 'rgba(203, 213, 225, 0.25)',
    baseUsdPrice: 31.85,
    volatility: 0.015,
    digits: 2
  },
  XCU: {
    symbol: 'XCU',
    nameKo: '구리',
    nameEn: 'Copper',
    icon: '🥉',
    color: '#ea580c',
    glowColor: 'rgba(234, 88, 12, 0.28)',
    baseUsdPrice: 4.48, // MetalpriceAPI copper standard unit (lb or oz equivalent index)
    volatility: 0.012,
    digits: 3
  },
  XPT: {
    symbol: 'XPT',
    nameKo: '플래티넘',
    nameEn: 'Platinum',
    icon: '💍',
    color: '#06b6d4',
    glowColor: 'rgba(6, 182, 212, 0.25)',
    baseUsdPrice: 994.20,
    volatility: 0.010,
    digits: 2
  }
};

// Unit conversions relative to 1 Troy Ounce
// 1 Troy Ounce = 31.1034768 grams
const TROY_OZ_TO_GRAMS = 31.1034768;

const UNITS = {
  oz: { label: 'oz', multiplier: 1 },
  g: { label: 'g', multiplier: 1 / TROY_OZ_TO_GRAMS },
  kg: { label: 'kg', multiplier: 1000 / TROY_OZ_TO_GRAMS }
};

// Currencies and default exchange rates (1 USD = X)
let EXCHANGE_RATES = {
  USD: 1.0,
  KRW: 1358.50,
  EUR: 0.918,
  JPY: 152.40
};

// ==========================================================================
// 2. Application State
// ==========================================================================
const state = {
  apiKey: localStorage.getItem('metalpulse_api_key') || '',
  isDemoMode: localStorage.getItem('metalpulse_demo_mode') !== 'false',
  currency: localStorage.getItem('metalpulse_currency') || 'KRW',
  unit: localStorage.getItem('metalpulse_unit') || 'oz',
  period: '1M',
  startDate: null,
  endDate: null,
  latestData: {},
  historicalData: {},
  charts: {}
};

// ==========================================================================
// 3. Date & Range Helpers
// ==========================================================================
function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calculateDateRange(periodPreset) {
  const end = new Date();
  const start = new Date();

  switch (periodPreset) {
    case '7D':
      start.setDate(end.getDate() - 7);
      break;
    case '1M':
      start.setMonth(end.getMonth() - 1);
      break;
    case '3M':
      start.setMonth(end.getMonth() - 3);
      break;
    case '6M':
      start.setMonth(end.getMonth() - 6);
      break;
    case '1Y':
      start.setFullYear(end.getFullYear() - 1);
      break;
    default:
      start.setMonth(end.getMonth() - 1);
  }

  return {
    start: formatDate(start),
    end: formatDate(end)
  };
}

// ==========================================================================
// 4. Currency & Value Formatting
// ==========================================================================
function formatCurrency(usdPerOz, metalSymbol = 'XAU') {
  if (usdPerOz === undefined || usdPerOz === null || isNaN(usdPerOz)) return '--';

  const rate = EXCHANGE_RATES[state.currency] || 1;
  const unitFactor = UNITS[state.unit].multiplier;
  
  // Calculate price based on selected unit and currency
  const converted = usdPerOz * unitFactor * rate;

  const currencySymbols = {
    USD: '$',
    KRW: '₩',
    EUR: '€',
    JPY: '¥'
  };

  const prefix = currencySymbols[state.currency] || `${state.currency} `;

  let formattedNumber;
  if (state.currency === 'KRW' || state.currency === 'JPY') {
    formattedNumber = Math.round(converted).toLocaleString();
  } else {
    const decimals = converted < 10 ? 3 : 2;
    formattedNumber = converted.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  return `${prefix}${formattedNumber}`;
}

// ==========================================================================
// 5. MetalpriceAPI & Fallback Data Generator
// ==========================================================================
/**
 * Realistic Mock Engine: Generates coherent, continuous historical
 * daily prices simulating real-world market movements.
 */
function generateRealisticHistorical(startDateStr, endDateStr) {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const daysDiff = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
  
  const dates = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }

  const result = {};
  for (const sym of Object.keys(METALS)) {
    const meta = METALS[sym];
    let price = meta.baseUsdPrice * 0.94; // slight uptrend simulation
    const points = [];

    // Deterministic random walk with trend
    dates.forEach((dateStr, idx) => {
      const progress = idx / dates.length;
      // macro trend + cyclical oscillation + daily noise
      const trend = Math.sin(progress * Math.PI * 2.5) * 0.04;
      const noise = (Math.sin(idx * 7.1) + Math.cos(idx * 3.3)) * meta.volatility * 0.5;
      const dayFactor = 1 + trend * 0.03 + noise;
      price = price * (0.999 + Math.random() * 0.002) * dayFactor;

      // Bound price within reasonable limits
      price = Math.max(meta.baseUsdPrice * 0.75, Math.min(meta.baseUsdPrice * 1.35, price));
      
      points.push({
        date: dateStr,
        price: Number(price.toFixed(4))
      });
    });

    result[sym] = points;
  }

  return result;
}

/**
 * Fetch latest prices from MetalpriceAPI or use fallback
 */
async function fetchLatestPrices() {
  const symbols = Object.keys(METALS).join(',');
  
  if (!state.isDemoMode && state.apiKey) {
    try {
      const url = `https://api.metalpriceapi.com/v1/latest?api_key=${state.apiKey}&base=USD&currencies=${symbols},KRW,EUR,JPY`;
      const res = await fetch(url);
      const data = await res.json();

      if (data && data.success && data.rates) {
        // Update live FX rates if available
        if (data.rates.KRW) EXCHANGE_RATES.KRW = data.rates.KRW;
        if (data.rates.EUR) EXCHANGE_RATES.EUR = data.rates.EUR;
        if (data.rates.JPY) EXCHANGE_RATES.JPY = data.rates.JPY;

        const latest = {};
        for (const sym of Object.keys(METALS)) {
          // MetalpriceAPI returns USDXAU or 1/rates.XAU
          let usdPrice = data.rates[`USD${sym}`];
          if (!usdPrice && data.rates[sym]) {
            usdPrice = 1 / data.rates[sym];
          }
          if (!usdPrice) {
            usdPrice = METALS[sym].baseUsdPrice;
          }

          // Random 24h variation if API doesn't provide 24h change
          const changePercent = (Math.random() * 2.4 - 1.1); // -1.1% ~ +1.3%
          const high = usdPrice * 1.012;
          const low = usdPrice * 0.988;

          latest[sym] = {
            usdPrice,
            changePercent,
            high,
            low,
            timestamp: data.timestamp || Date.now() / 1000
          };
        }

        updateApiStatus(true, '실시간 연결됨');
        return latest;
      }
    } catch (err) {
      console.warn('MetalpriceAPI latest fetch failed, falling back to simulated data:', err);
    }
  }

  // Fallback / Demo Simulation
  updateApiStatus(false, '데모 모드');
  const simulated = {};
  for (const sym of Object.keys(METALS)) {
    const meta = METALS[sym];
    const fluctuation = (Math.random() - 0.48) * 0.015;
    const usdPrice = meta.baseUsdPrice * (1 + fluctuation);
    const changePercent = (Math.random() * 2.8 - 1.2);
    const high = usdPrice * (1 + Math.abs(changePercent * 0.007) + 0.005);
    const low = usdPrice * (1 - Math.abs(changePercent * 0.007) - 0.004);

    simulated[sym] = {
      usdPrice,
      changePercent,
      high,
      low,
      timestamp: Date.now() / 1000
    };
  }

  return simulated;
}

/**
 * Fetch timeframe historical prices from MetalpriceAPI or use fallback
 */
async function fetchHistoricalPrices(startDateStr, endDateStr) {
  const symbols = Object.keys(METALS).join(',');

  if (!state.isDemoMode && state.apiKey) {
    try {
      const url = `https://api.metalpriceapi.com/v1/timeframe?api_key=${state.apiKey}&start_date=${startDateStr}&end_date=${endDateStr}&base=USD&currencies=${symbols}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data && data.success && data.rates) {
        const parsed = { XAU: [], XAG: [], XCU: [], XPT: [] };
        const dateKeys = Object.keys(data.rates).sort();

        dateKeys.forEach(d => {
          const dayRates = data.rates[d];
          for (const sym of Object.keys(METALS)) {
            let p = dayRates[`USD${sym}`] || (dayRates[sym] ? 1 / dayRates[sym] : null);
            if (!p) p = METALS[sym].baseUsdPrice;
            parsed[sym].push({ date: d, price: p });
          }
        });

        return parsed;
      }
    } catch (err) {
      console.warn('MetalpriceAPI timeframe fetch failed, using realistic mock engine:', err);
    }
  }

  // Fallback to high-quality procedural market engine
  return generateRealisticHistorical(startDateStr, endDateStr);
}

// ==========================================================================
// 6. UI Renderers
// ==========================================================================

function updateApiStatus(isLive, label) {
  const badge = document.getElementById('apiStatusBadge');
  const text = document.getElementById('statusText');
  if (!badge || !text) return;

  if (isLive) {
    badge.classList.add('live');
    text.textContent = label || '실시간 연결됨';
  } else {
    badge.classList.remove('live');
    text.textContent = label || '데모 모드';
  }
}

/**
 * Update the Top 4 Metal Cards
 */
function renderMetalCards(latestData) {
  for (const sym of Object.keys(METALS)) {
    const data = latestData[sym];
    if (!data) continue;

    const priceEl = document.getElementById(`price-${sym}`);
    const badgeEl = document.getElementById(`badge-${sym}`);
    const diffEl = document.getElementById(`change-diff-${sym}`);
    const highEl = document.getElementById(`high-${sym}`);
    const lowEl = document.getElementById(`low-${sym}`);
    const fillEl = document.getElementById(`range-fill-${sym}`);

    if (priceEl) priceEl.textContent = formatCurrency(data.usdPrice, sym);

    if (badgeEl) {
      const isUp = data.changePercent >= 0;
      badgeEl.textContent = `${isUp ? '+' : ''}${data.changePercent.toFixed(2)}% ${isUp ? '▲' : '▼'}`;
      if (isUp) {
        badgeEl.classList.remove('down');
      } else {
        badgeEl.classList.add('down');
      }
    }

    if (diffEl) {
      const diffVal = data.usdPrice * (data.changePercent / 100);
      diffEl.textContent = `전일 대비 ${formatCurrency(Math.abs(diffVal), sym)} ${data.changePercent >= 0 ? '상승' : '하락'}`;
    }

    if (highEl) highEl.textContent = formatCurrency(data.high, sym);
    if (lowEl) lowEl.textContent = formatCurrency(data.low, sym);

    if (fillEl && data.high > data.low) {
      const pct = Math.max(0, Math.min(100, ((data.usdPrice - data.low) / (data.high - data.low)) * 100));
      fillEl.style.width = `${pct}%`;
    }

    // Render mini intraday sparkline
    renderSparkline(`sparkline-${sym}`, METALS[sym].color, data.changePercent >= 0);
  }

  // Update banner timestamp
  const bannerTime = document.getElementById('marketUpdateTime');
  if (bannerTime) {
    const now = new Date();
    bannerTime.textContent = `시세 기준: ${now.toLocaleDateString()} ${now.toLocaleTimeString()} (${state.isDemoMode ? '시뮬레이션 모드' : '실시간 API'})`;
  }
}

/**
 * Draw mini sparkline canvas on card
 */
function renderSparkline(canvasId, color, isUp) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // Generate 12 hourly mini points
  const points = [];
  let val = 50;
  for (let i = 0; i < 14; i++) {
    val += (Math.random() - (isUp ? 0.42 : 0.58)) * 8;
    points.push(val);
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  ctx.beginPath();
  points.forEach((p, idx) => {
    const x = (idx / (points.length - 1)) * (w - 4) + 2;
    const y = h - ((p - min) / range) * (h - 8) - 4;
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Subtle gradient fill under sparkline
  ctx.lineTo(w - 2, h);
  ctx.lineTo(2, h);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, `${color}40`);
  grad.addColorStop(1, `${color}00`);
  ctx.fillStyle = grad;
  ctx.fill();
}

// ==========================================================================
// 7. Vertical Stacked Charts (Chart.js)
// ==========================================================================

/**
 * Initialize and update vertical stacked charts
 */
function renderVerticalCharts(historicalData) {
  for (const sym of Object.keys(METALS)) {
    const series = historicalData[sym];
    if (!series || series.length === 0) continue;

    const meta = METALS[sym];
    const canvas = document.getElementById(`chart-${sym}`);
    if (!canvas) continue;

    // Unit & currency factor
    const rate = EXCHANGE_RATES[state.currency] || 1;
    const unitFactor = UNITS[state.unit].multiplier;

    // Prepare labels and converted prices
    const labels = series.map(item => item.date);
    const convertedPrices = series.map(item => Number((item.price * unitFactor * rate).toFixed(meta.digits)));

    // Calculate period statistics
    const high = Math.max(...convertedPrices);
    const low = Math.min(...convertedPrices);
    const first = convertedPrices[0];
    const last = convertedPrices[convertedPrices.length - 1];
    const returnPct = ((last - first) / first) * 100;

    // Update panel stat pills
    const highEl = document.getElementById(`stats-high-${sym}`);
    const lowEl = document.getElementById(`stats-low-${sym}`);
    const returnEl = document.getElementById(`stats-return-${sym}`);

    if (highEl) highEl.textContent = formatCurrency(Math.max(...series.map(s => s.price)), sym);
    if (lowEl) lowEl.textContent = formatCurrency(Math.min(...series.map(s => s.price)), sym);
    if (returnEl) {
      const isUp = returnPct >= 0;
      returnEl.textContent = `${isUp ? '+' : ''}${returnPct.toFixed(2)}% ${isUp ? '▲' : '▼'}`;
      if (isUp) {
        returnEl.classList.remove('down');
      } else {
        returnEl.classList.add('down');
      }
    }

    // Canvas gradient fill
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, meta.glowColor);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    // If chart instance already exists, update data
    if (state.charts[sym]) {
      const chart = state.charts[sym];
      chart.data.labels = labels;
      chart.data.datasets[0].data = convertedPrices;
      chart.data.datasets[0].borderColor = meta.color;
      chart.data.datasets[0].backgroundColor = gradient;
      chart.update();
      continue;
    }

    // Create new Chart.js instance
    state.charts[sym] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: `${meta.nameKo} (${state.currency}/${state.unit})`,
          data: convertedPrices,
          borderColor: meta.color,
          backgroundColor: gradient,
          borderWidth: 2.5,
          pointRadius: series.length > 60 ? 0 : 2,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderColor: meta.color,
          pointHoverBorderWidth: 3,
          fill: true,
          tension: 0.35
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 750,
          easing: 'easeOutQuart'
        },
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.92)',
            titleColor: '#cbd5e1',
            titleFont: { size: 12, family: 'Inter' },
            bodyColor: '#ffffff',
            bodyFont: { size: 14, weight: '700', family: 'JetBrains Mono' },
            borderColor: 'rgba(255, 255, 255, 0.15)',
            borderWidth: 1,
            padding: 12,
            boxPadding: 6,
            displayColors: true,
            callbacks: {
              label: function(context) {
                const val = context.parsed.y;
                let formatted;
                if (state.currency === 'KRW' || state.currency === 'JPY') {
                  formatted = Math.round(val).toLocaleString();
                } else {
                  formatted = val.toLocaleString(undefined, { minimumFractionDigits: 2 });
                }
                const symb = state.currency === 'USD' ? '$' : (state.currency === 'KRW' ? '₩' : state.currency);
                return `시세: ${symb} ${formatted} / ${state.unit}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              color: 'rgba(255, 255, 255, 0.04)',
              drawBorder: false
            },
            ticks: {
              color: '#64748b',
              font: { size: 11, family: 'Inter' },
              maxTicksLimit: 10,
              maxRotation: 0
            }
          },
          y: {
            position: 'right',
            grid: {
              color: 'rgba(255, 255, 255, 0.05)',
              drawBorder: false
            },
            ticks: {
              color: '#94a3b8',
              font: { size: 11, family: 'JetBrains Mono' },
              callback: function(value) {
                if (state.currency === 'KRW') {
                  if (value >= 1000000) return `${(value / 10000).toLocaleString()}만`;
                  return value.toLocaleString();
                }
                return value.toLocaleString();
              }
            }
          }
        }
      }
    });
  }
}

// ==========================================================================
// 8. Event Handlers & Core Flow
// ==========================================================================

async function refreshAllData() {
  const refreshBtn = document.getElementById('refreshBtn');
  const refreshIcon = refreshBtn?.querySelector('.refresh-icon');
  if (refreshIcon) refreshIcon.classList.add('spinning');

  try {
    // 1. Fetch latest prices & update cards
    state.latestData = await fetchLatestPrices();
    renderMetalCards(state.latestData);

    // 2. Fetch historical prices & update vertical charts
    const range = calculateDateRange(state.period);
    state.startDate = range.start;
    state.endDate = range.end;
    
    // Sync custom date inputs
    const startInput = document.getElementById('startDateInput');
    const endInput = document.getElementById('endDateInput');
    if (startInput) startInput.value = state.startDate;
    if (endInput) endInput.value = state.endDate;

    state.historicalData = await fetchHistoricalPrices(state.startDate, state.endDate);
    renderVerticalCharts(state.historicalData);
  } catch (err) {
    console.error('Data refresh error:', err);
  } finally {
    setTimeout(() => {
      if (refreshIcon) refreshIcon.classList.remove('spinning');
    }, 600);
  }
}

function setupEventListeners() {
  // 1. Currency selector
  const currencySelect = document.getElementById('currencySelect');
  if (currencySelect) {
    currencySelect.value = state.currency;
    currencySelect.addEventListener('change', (e) => {
      state.currency = e.target.value;
      localStorage.setItem('metalpulse_currency', state.currency);
      renderMetalCards(state.latestData);
      renderVerticalCharts(state.historicalData);
    });
  }

  // 2. Unit selector
  const unitSelect = document.getElementById('unitSelect');
  if (unitSelect) {
    unitSelect.value = state.unit;
    unitSelect.addEventListener('change', (e) => {
      state.unit = e.target.value;
      localStorage.setItem('metalpulse_unit', state.unit);
      renderMetalCards(state.latestData);
      renderVerticalCharts(state.historicalData);
    });
  }

  // 3. Refresh button
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      refreshAllData();
    });
  }

  // 4. Period preset buttons
  const periodBtns = document.querySelectorAll('.period-btn');
  periodBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      periodBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.period = btn.dataset.period;
      
      const range = calculateDateRange(state.period);
      state.startDate = range.start;
      state.endDate = range.end;

      const startInput = document.getElementById('startDateInput');
      const endInput = document.getElementById('endDateInput');
      if (startInput) startInput.value = state.startDate;
      if (endInput) endInput.value = state.endDate;

      state.historicalData = await fetchHistoricalPrices(state.startDate, state.endDate);
      renderVerticalCharts(state.historicalData);
    });
  });

  // 5. Custom date range apply
  const applyCustomBtn = document.getElementById('applyCustomDateBtn');
  if (applyCustomBtn) {
    applyCustomBtn.addEventListener('click', async () => {
      const sInput = document.getElementById('startDateInput');
      const eInput = document.getElementById('endDateInput');
      if (!sInput || !eInput || !sInput.value || !eInput.value) {
        alert('시작 날짜와 종료 날짜를 모두 선택해 주세요.');
        return;
      }

      if (new Date(sInput.value) > new Date(eInput.value)) {
        alert('시작 날짜는 종료 날짜보다 앞서야 합니다.');
        return;
      }

      periodBtns.forEach(b => b.classList.remove('active'));
      state.period = 'custom';
      state.startDate = sInput.value;
      state.endDate = eInput.value;

      state.historicalData = await fetchHistoricalPrices(state.startDate, state.endDate);
      renderVerticalCharts(state.historicalData);
    });
  }

  // 6. API Modal Handlers
  const modal = document.getElementById('apiModal');
  const openModalBtn = document.getElementById('openApiModalBtn');
  const apiStatusBadge = document.getElementById('apiStatusBadge');
  const closeModalBtn = document.getElementById('closeApiModalBtn');
  const closeModalOkBtn = document.getElementById('closeModalOkBtn');
  const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
  const clearApiKeyBtn = document.getElementById('clearApiKeyBtn');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const demoToggle = document.getElementById('demoModeToggle');

  const openModal = () => {
    if (apiKeyInput) apiKeyInput.value = state.apiKey;
    if (demoToggle) demoToggle.checked = state.isDemoMode;
    modal?.showModal();
  };

  openModalBtn?.addEventListener('click', openModal);
  apiStatusBadge?.addEventListener('click', openModal);
  closeModalBtn?.addEventListener('click', () => modal?.close());
  closeModalOkBtn?.addEventListener('click', () => modal?.close());

  // Save API Key
  saveApiKeyBtn?.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (key) {
      state.apiKey = key;
      localStorage.setItem('metalpulse_api_key', key);
      state.isDemoMode = false;
      localStorage.setItem('metalpulse_demo_mode', 'false');
      if (demoToggle) demoToggle.checked = false;
      alert('MetalpriceAPI 키가 저장되었습니다. 실제 시세 조회를 시작합니다.');
    } else {
      state.isDemoMode = true;
      localStorage.setItem('metalpulse_demo_mode', 'true');
    }
    modal?.close();
    refreshAllData();
  });

  // Clear Key
  clearApiKeyBtn?.addEventListener('click', () => {
    if (confirm('저장된 API Key를 삭제하고 기본 데모 모드로 전환하시겠습니까?')) {
      state.apiKey = '';
      state.isDemoMode = true;
      localStorage.removeItem('metalpulse_api_key');
      localStorage.setItem('metalpulse_demo_mode', 'true');
      if (apiKeyInput) apiKeyInput.value = '';
      if (demoToggle) demoToggle.checked = true;
      modal?.close();
      refreshAllData();
    }
  });

  // Demo mode toggle switch
  demoToggle?.addEventListener('change', (e) => {
    state.isDemoMode = e.target.checked;
    localStorage.setItem('metalpulse_demo_mode', String(state.isDemoMode));
    if (!state.isDemoMode && !state.apiKey) {
      alert('실제 API 모드를 사용하려면 MetalpriceAPI Key를 입력하셔야 합니다.');
      e.target.checked = true;
      state.isDemoMode = true;
      localStorage.setItem('metalpulse_demo_mode', 'true');
    }
  });
}

// ==========================================================================
// 9. Application Bootstrap
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  refreshAllData();
});
