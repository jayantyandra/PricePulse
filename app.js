/**
 * PricePulse — Universal Dynamic Dataset Analysis & Visualization Engine
 * Pure client-side statistical engine with automatic column detection, profiling,
 * intelligent chart selection, searching, sorting, pagination, and reporting.
 */

// Global State
const State = {
  rawFilename: 'dataset.csv',
  fileSizeBytes: 0,
  rawRows: [],          // array of objects
  columns: [],          // column names
  columnProfiles: {},   // metadata per column: type, nullCount, uniqueCount, stats, etc.
  filteredRows: [],     // currently displayed/filtered subset
  sortColumn: null,
  sortDirection: 'asc', // 'asc' | 'desc'
  currentPage: 1,
  pageSize: 15,
  chartInstance: null
};

// Built-in Demo Dataset (Real-world e-commerce pricing & inventory data with currencies and percentages)
const SAMPLE_CSV = `Product_ID,Product_Name,Category,Cost_Price,Sale_Price,Units_Sold,Discount_Percent,Rating,Product_URL,In_Stock
PRD-101,Ultra Wireless Earbuds,Audio,$24.50,₹1,099,1420,10%,4.6,https://store.example.com/prd-101,Yes
PRD-102,Noise Cancelling Headphones,Audio,$65.00,₹3,299,850,15%,4.8,https://store.example.com/prd-102,Yes
PRD-103,Mechanical Gaming Keyboard,Accessories,$38.00,₹1,850,620,5%,4.5,https://store.example.com/prd-103,Yes
PRD-104,Ergonomic Vertical Mouse,Accessories,$18.20,₹950,940,0%,4.2,https://store.example.com/prd-104,Yes
PRD-105,4K IPS 27-inch Monitor,Displays,$180.00,₹14,999,410,12%,4.7,https://store.example.com/prd-105,No
PRD-106,Smart Fitness Tracker,Wearables,$22.00,₹1,249,1950,20%,4.3,https://store.example.com/prd-106,Yes
PRD-107,USB-C Multiport Hub,Accessories,$12.50,₹699,1340,5%,4.4,https://store.example.com/prd-107,Yes
PRD-108,Pro Studio Microphone,Audio,$55.00,₹2,699,390,8%,4.9,https://store.example.com/prd-108,Yes
PRD-109,High-Speed Wireless Router,Networking,$45.00,₹2,299,780,10%,4.1,https://store.example.com/prd-109,No
PRD-110,Smart LED Desk Lamp,Home Office,$15.00,₹799,1100,0%,4.5,https://store.example.com/prd-110,Yes
PRD-111,Portable SSD 1TB,Storage,$52.00,₹3,899,1220,15%,4.8,https://store.example.com/prd-111,Yes
PRD-112,Aluminum Laptop Stand,Accessories,$14.00,₹850,880,5%,4.3,https://store.example.com/prd-112,Yes
PRD-113,Bluetooth Conference Speaker,Audio,$40.00,₹1,999,310,10%,4.0,https://store.example.com/prd-113,No
PRD-114,Webcam 1080p HDR,Accessories,$28.00,₹1,599,990,18%,4.4,https://store.example.com/prd-114,Yes
PRD-115,Mesh Wi-Fi 6 System,Networking,$110.00,₹6,499,450,10%,4.7,https://store.example.com/prd-115,Yes`;

/**
 * Robust numeric parser: strips currency signs (₹, $, €, £, ¥, etc.), commas, percentage signs, and whitespace.
 * Returns parsed float or NaN if not valid numeric.
 */
function parseNumericValue(val) {
  if (val === null || val === undefined) return NaN;
  if (typeof val === 'number') return isFinite(val) ? val : NaN;
  const str = String(val).trim();
  if (str === '') return NaN;
  // Clean currency symbols, commas, percent symbols, spaces
  const cleaned = str.replace(/[₹$€£¥₩\s,%]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '+' || cleaned === '.') return NaN;
  // Check if standard float or scientific notation
  const num = Number(cleaned);
  return (!isNaN(num) && isFinite(num)) ? num : NaN;
}

/**
 * Detect if a column is an ID, URL, or high-cardinality unique key unsuitable for default charts.
 */
function isIdentifierColumn(colName, profile, totalRows) {
  const lower = colName.toLowerCase().trim();
  
  // Specific naming checks (product_id, user_id, id, uuid, guid, url, link, website, image, etc.)
  const idPattern = /(^|[_-\s])(id|uuid|guid|key|pk|hash|url|uri|link|href|avatar|image|img|icon)([_-\s]|$)/i;
  if (idPattern.test(lower)) return true;
  if (lower.endsWith('_id') || lower.endsWith('id') || lower.startsWith('id_')) return true;
  if (lower.includes('url') || lower.includes('link') || lower.includes('website')) return true;

  // Sample values check for URL/HTTP
  if (profile && profile.sampleValues && profile.sampleValues.length > 0) {
    const isUrlSample = profile.sampleValues.some(v => /^https?:\/\//i.test(String(v).trim()));
    if (isUrlSample) return true;
  }

  // High cardinality uniqueness check (almost every row is unique string)
  if (profile && profile.detectedType === 'string' && totalRows > 5) {
    const uniqueRatio = profile.uniqueValuesCount / totalRows;
    if (uniqueRatio > 0.9) return true;
  }

  return false;
}

// Initialize UI listeners
document.addEventListener('DOMContentLoaded', () => {
  setupUploadListeners();
  setupFilterAndSortListeners();
  setupChartListeners();
  setupModalListeners();
  setupExportListeners();
});

/* ==========================================================================
   Upload & Parse Handler
   ========================================================================== */
function setupUploadListeners() {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const btnLoadSample = document.getElementById('btnLoadSample');
  const btnReset = document.getElementById('btnReset');

  // Trigger input click
  dropZone.addEventListener('click', () => fileInput.click());

  // Drag and drop visual cues
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drag-over');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelected(files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  });

  btnLoadSample.addEventListener('click', () => {
    loadSampleData();
  });

  btnReset.addEventListener('click', () => {
    resetDashboard();
  });
}

function handleFileSelected(file) {
  if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
    showUploadFeedback('Please select a valid CSV file (.csv)', 'error');
    return;
  }

  showUploadFeedback(`Processing "${file.name}" (${formatFileSize(file.size)})...`, 'info');

  State.rawFilename = file.name;
  State.fileSizeBytes = file.size;

  Papa.parse(file, {
    header: true,
    dynamicTyping: false, // We profile types strictly ourselves to prevent false coercions
    skipEmptyLines: 'greedy',
    complete: function (results) {
      if (results.errors.length > 0 && results.data.length === 0) {
        showUploadFeedback('Failed to parse CSV: ' + results.errors[0].message, 'error');
        return;
      }
      processRawDataset(results.data, file.name, file.size);
    },
    error: function (err) {
      showUploadFeedback('Error reading file: ' + err.message, 'error');
    }
  });
}

function loadSampleData() {
  State.rawFilename = 'ecommerce_pricing_sample.csv';
  State.fileSizeBytes = new Blob([SAMPLE_CSV]).size;

  Papa.parse(SAMPLE_CSV, {
    header: true,
    dynamicTyping: false,
    skipEmptyLines: 'greedy',
    complete: function (results) {
      processRawDataset(results.data, State.rawFilename, State.fileSizeBytes);
    }
  });
}

function showUploadFeedback(msg, type = 'info') {
  const el = document.getElementById('uploadFeedback');
  el.textContent = msg;
  el.className = `upload-feedback ${type}`;
  el.style.display = 'block';
}

function resetDashboard() {
  State.rawRows = [];
  State.filteredRows = [];
  State.columns = [];
  State.columnProfiles = {};
  if (State.chartInstance) {
    State.chartInstance.destroy();
    State.chartInstance = null;
  }
  hideChartMessage();
  document.getElementById('fileInput').value = '';
  document.getElementById('dashboardContent').style.display = 'none';
  document.getElementById('uploadSection').style.display = 'flex';
  document.getElementById('btnReset').style.display = 'none';
  document.getElementById('uploadFeedback').style.display = 'none';
}

/* ==========================================================================
   Dataset Profiling & Statistical Engine
   ========================================================================== */
function processRawDataset(rows, fileName, fileSize) {
  if (!rows || rows.length === 0) {
    showUploadFeedback('The uploaded CSV contains no valid data rows.', 'error');
    return;
  }

  // Sanitize headers and rows (trim keys and whitespace)
  const rawHeaders = Object.keys(rows[0] || {});
  const cleanHeaders = rawHeaders.map(h => (h ? h.trim() : 'Unnamed_Column'));

  const sanitizedRows = rows.map(r => {
    const cleanRow = {};
    rawHeaders.forEach((origKey, idx) => {
      const val = r[origKey];
      cleanRow[cleanHeaders[idx]] = (val !== null && val !== undefined) ? String(val).trim() : '';
    });
    return cleanRow;
  });

  State.rawRows = sanitizedRows;
  State.filteredRows = [...sanitizedRows];
  State.columns = cleanHeaders;
  State.rawFilename = fileName;
  State.fileSizeBytes = fileSize;
  State.currentPage = 1;
  State.sortColumn = null;
  State.sortDirection = 'asc';

  // Reset chart selection to auto
  const chartTypeSelect = document.getElementById('chartTypeSelect');
  if (chartTypeSelect) chartTypeSelect.value = 'auto';

  // Deep Statistical Profiling
  profileDataset();

  // Render Everything
  renderDashboard();

  // Transition UI
  document.getElementById('uploadSection').style.display = 'none';
  document.getElementById('dashboardContent').style.display = 'block';
  document.getElementById('btnReset').style.display = 'inline-flex';
}

function profileDataset() {
  const rows = State.rawRows;
  const totalRows = rows.length;
  const profiles = {};

  State.columns.forEach(col => {
    let emptyCount = 0;
    const values = [];
    const nonNullValues = [];
    let numericCount = 0;
    let dateCount = 0;

    for (let i = 0; i < totalRows; i++) {
      const val = rows[i][col];
      values.push(val);

      if (val === '' || val === null || val === undefined || val.toLowerCase() === 'null' || val.toLowerCase() === 'nan' || val.toLowerCase() === 'n/a') {
        emptyCount++;
      } else {
        nonNullValues.push(val);
        // Test numeric with currency, comma, percentage support
        const numVal = parseNumericValue(val);
        if (!isNaN(numVal)) {
          numericCount++;
        }
        // Test date if string looks like date
        else if (isValidDate(val)) {
          dateCount++;
        }
      }
    }

    const validCount = nonNullValues.length;
    let detectedType = 'string';

    if (validCount > 0 && numericCount / validCount >= 0.8) {
      detectedType = 'number';
    } else if (validCount > 0 && dateCount / validCount >= 0.8) {
      detectedType = 'date';
    } else {
      // Check boolean
      const boolSet = new Set(['true', 'false', '0', '1', 'yes', 'no']);
      const isBool = validCount > 0 && nonNullValues.every(v => boolSet.has(v.toLowerCase()));
      if (isBool && nonNullValues.length > 0) {
        detectedType = 'boolean';
      }
    }

    // Unique values and frequency distribution (original string values)
    const freqMap = {};
    nonNullValues.forEach(v => {
      freqMap[v] = (freqMap[v] || 0) + 1;
    });
    const uniqueValuesCount = Object.keys(freqMap).length;

    // Numerical stats if applicable (using parsed numeric values)
    let stats = null;
    if (detectedType === 'number') {
      const nums = nonNullValues.map(v => parseNumericValue(v)).filter(n => !isNaN(n)).sort((a, b) => a - b);
      if (nums.length > 0) {
        const sum = nums.reduce((acc, n) => acc + n, 0);
        const mean = sum / nums.length;
        const min = nums[0];
        const max = nums[nums.length - 1];
        
        // Median
        const mid = Math.floor(nums.length / 2);
        const median = nums.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;

        // Variance & Standard Deviation
        const variance = nums.reduce((acc, n) => acc + Math.pow(n - mean, 2), 0) / nums.length;
        const stdDev = Math.sqrt(variance);

        stats = { min, max, mean, median, sum, stdDev };
      }
    }

    const initialProfile = {
      detectedType,
      totalCount: totalRows,
      emptyCount,
      validCount,
      uniqueValuesCount,
      freqMap,
      stats,
      sampleValues: nonNullValues.slice(0, 3)
    };
    initialProfile.isIdentifier = isIdentifierColumn(col, initialProfile, totalRows);

    profiles[col] = initialProfile;
  });

  State.columnProfiles = profiles;
}

function isValidDate(str) {
  if (typeof str !== 'string' || str.length < 4 || !isNaN(Number(str))) return false;
  // standard date pattern check (yyyy-mm-dd or mm/dd/yyyy)
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(str) || /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(str)) {
    const timestamp = Date.parse(str);
    return !isNaN(timestamp);
  }
  return false;
}

function detectDuplicates() {
  const seen = new Set();
  let duplicateCount = 0;
  State.rawRows.forEach(row => {
    const key = JSON.stringify(row);
    if (seen.has(key)) {
      duplicateCount++;
    } else {
      seen.add(key);
    }
  });
  return duplicateCount;
}

/* ==========================================================================
   Render Dashboard & KPIs
   ========================================================================== */
function renderDashboard() {
  // Metadata Banner
  document.getElementById('datasetFileName').textContent = State.rawFilename;
  document.getElementById('datasetFileSize').textContent = formatFileSize(State.fileSizeBytes);

  // Compute aggregate KPIs
  const totalRows = State.rawRows.length;
  const totalCols = State.columns.length;
  let totalMissingCells = 0;
  let numericColCount = 0;

  State.columns.forEach(col => {
    const prof = State.columnProfiles[col];
    totalMissingCells += prof.emptyCount;
    if (prof.detectedType === 'number') numericColCount++;
  });

  const totalCells = totalRows * totalCols;
  const missingPct = totalCells > 0 ? ((totalMissingCells / totalCells) * 100).toFixed(1) : 0;
  const duplicateCount = detectDuplicates();

  document.getElementById('kpiRowCount').textContent = totalRows.toLocaleString();
  document.getElementById('kpiColCount').textContent = totalCols;
  document.getElementById('kpiMissingCount').textContent = totalMissingCells.toLocaleString();
  document.getElementById('kpiMissingPct').textContent = `${missingPct}% missing`;
  document.getElementById('kpiDuplicateCount').textContent = duplicateCount;
  document.getElementById('kpiNumericCols').textContent = numericColCount;

  // Render Findings and Diagnostics
  renderFindings(totalRows, totalCols, totalMissingCells, missingPct, duplicateCount, numericColCount);

  // Render Schema Table
  renderSchemaTable();

  // Populate Filter Selectors
  populateColumnDropdowns();

  // Render Visualizations
  renderDynamicChart();

  // Render Data Explorer Table
  renderDataTable();
}

function renderFindings(totalRows, totalCols, missingCells, missingPct, duplicateCount, numericColCount) {
  const findingsContainer = document.getElementById('summaryFindings');
  const badge = document.getElementById('dataQualityBadge');
  findingsContainer.innerHTML = '';

  const findings = [];

  // Health Score Calculation
  let qualityScore = 100;
  if (missingPct > 20) qualityScore -= 30;
  else if (missingPct > 5) qualityScore -= 15;
  if (duplicateCount > 0) qualityScore -= Math.min(25, Math.ceil((duplicateCount / totalRows) * 50));

  if (qualityScore >= 85) {
    badge.textContent = `High Quality (${qualityScore}/100)`;
    badge.className = 'pill pill-glow';
  } else if (qualityScore >= 60) {
    badge.textContent = `Moderate Health (${qualityScore}/100)`;
    badge.className = 'pill';
    badge.style.background = 'rgba(245, 158, 11, 0.15)';
    badge.style.color = '#fbbf24';
    badge.style.border = '1px solid rgba(245, 158, 11, 0.3)';
  } else {
    badge.textContent = `Needs Attention (${qualityScore}/100)`;
    badge.className = 'pill';
    badge.style.background = 'rgba(244, 63, 94, 0.15)';
    badge.style.color = '#f87171';
    badge.style.border = '1px solid rgba(244, 63, 94, 0.3)';
  }

  // 1. Completeness finding
  if (missingCells === 0) {
    findings.push({
      icon: '✨',
      title: 'Complete Tabular Integrity',
      desc: `All ${totalRows.toLocaleString()} rows and ${totalCols} columns have 100% data presence with 0 missing cells.`
    });
  } else {
    findings.push({
      icon: '⚠️',
      title: 'Missing Values Detected',
      desc: `${missingCells.toLocaleString()} empty cell(s) (${missingPct}%) identified. Consider using the "Drop Missing" filter before running models.`
    });
  }

  // 2. Duplicates finding
  if (duplicateCount === 0) {
    findings.push({
      icon: '🛡️',
      title: 'Unique Records Verified',
      desc: 'Zero exact duplicate rows detected across all specified attributes.'
    });
  } else {
    findings.push({
      icon: '👥',
      title: 'Redundant Records',
      desc: `Found ${duplicateCount} duplicate row(s) representing ${((duplicateCount / totalRows) * 100).toFixed(1)}% of the dataset.`
    });
  }

  // 3. Statistical Highlights (prefer non-identifier numeric columns)
  const numericCols = State.columns.filter(c => {
    const p = State.columnProfiles[c];
    return p.detectedType === 'number' && !p.isIdentifier;
  });
  const fallbackNumericCols = State.columns.filter(c => State.columnProfiles[c].detectedType === 'number');
  const targetNumericCols = numericCols.length > 0 ? numericCols : fallbackNumericCols;

  if (targetNumericCols.length > 0) {
    const topNumeric = targetNumericCols[0];
    const stats = State.columnProfiles[topNumeric].stats;
    if (stats) {
      findings.push({
        icon: '📈',
        title: `Distribution of "${topNumeric}"`,
        desc: `Ranges from ${formatNumber(stats.min)} to ${formatNumber(stats.max)} with an average of ${formatNumber(stats.mean)} and standard deviation of ${formatNumber(stats.stdDev)}.`
      });
    }
  }

  // 4. Categorical Highlights (prefer non-identifier categories)
  const catCols = State.columns.filter(c => {
    const p = State.columnProfiles[c];
    return p.detectedType === 'string' && !p.isIdentifier;
  });
  const fallbackCatCols = State.columns.filter(c => State.columnProfiles[c].detectedType === 'string');
  const targetCatCols = catCols.length > 0 ? catCols : fallbackCatCols;

  if (targetCatCols.length > 0) {
    const topCat = targetCatCols[0];
    const prof = State.columnProfiles[topCat];
    const topFreq = Object.entries(prof.freqMap).sort((a, b) => b[1] - a[1])[0];
    if (topFreq) {
      findings.push({
        icon: '🏷️',
        title: `Categorical Insight: "${topCat}"`,
        desc: `Contains ${prof.uniqueValuesCount} unique segments. Most frequent value is "${topFreq[0]}" appearing ${topFreq[1]} times.`
      });
    }
  }

  findings.forEach(f => {
    const div = document.createElement('div');
    div.className = 'finding-item';
    div.innerHTML = `
      <div class="finding-icon">${f.icon}</div>
      <div class="finding-text">
        <h4>${escapeHtml(f.title)}</h4>
        <p>${escapeHtml(f.desc)}</p>
      </div>
    `;
    findingsContainer.appendChild(div);
  });
}

function renderSchemaTable() {
  const tbody = document.getElementById('schemaTableBody');
  tbody.innerHTML = '';

  State.columns.forEach(col => {
    const prof = State.columnProfiles[col];
    const tr = document.createElement('tr');

    const completenessPct = ((prof.validCount / prof.totalCount) * 100).toFixed(1);
    let statsHtml = '';

    if (prof.detectedType === 'number' && prof.stats) {
      statsHtml = `Min: <strong>${formatNumber(prof.stats.min)}</strong> | Avg: <strong>${formatNumber(prof.stats.mean)}</strong> | Max: <strong>${formatNumber(prof.stats.max)}</strong>`;
    } else if (prof.sampleValues.length > 0) {
      statsHtml = `Samples: <span style="color:var(--text-muted)">${escapeHtml(prof.sampleValues.join(', '))}</span>`;
    } else {
      statsHtml = '—';
    }

    tr.innerHTML = `
      <td><strong>${escapeHtml(col)}</strong></td>
      <td><span class="type-pill ${prof.detectedType}">${prof.detectedType}</span></td>
      <td>${completenessPct}% <span style="font-size:0.75rem; color:var(--text-dim);">(${prof.emptyCount} missing)</span></td>
      <td>${prof.uniqueValuesCount}</td>
      <td>${statsHtml}</td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * Show a clear, friendly empty state or error in the chart area when data is absent/invalid.
 */
function showChartMessage(title, desc) {
  if (State.chartInstance) {
    State.chartInstance.destroy();
    State.chartInstance = null;
  }
  const canvas = document.getElementById('mainChart');
  const emptyState = document.getElementById('chartEmptyState');
  const titleEl = document.getElementById('chartEmptyTitle');
  const descEl = document.getElementById('chartEmptyDesc');
  const explanationEl = document.getElementById('chartExplanation');

  if (canvas) canvas.style.display = 'none';
  if (emptyState) {
    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = desc;
    emptyState.style.display = 'flex';
  }
  if (explanationEl) {
    explanationEl.textContent = `${title}: ${desc}`;
  }
}

function hideChartMessage() {
  const canvas = document.getElementById('mainChart');
  const emptyState = document.getElementById('chartEmptyState');
  if (canvas) canvas.style.display = 'block';
  if (emptyState) emptyState.style.display = 'none';
}

function populateColumnDropdowns() {
  const filterColSelect = document.getElementById('filterColumnSelect');
  filterColSelect.innerHTML = '<option value="_all">All Columns</option>';

  State.columns.forEach(col => {
    const optFilter = document.createElement('option');
    optFilter.value = col;
    optFilter.textContent = col;
    filterColSelect.appendChild(optFilter);
  });

  // Sync chart controls to populate specific choices based on active chart type
  updateChartControlsUI();
}

/* ==========================================================================
   Automated Dynamic Visualizations (Chart.js)
   ========================================================================== */
function setupChartListeners() {
  const chartTypeSelect = document.getElementById('chartTypeSelect');
  const primaryColSelect = document.getElementById('primaryColSelect');
  const secondaryColSelect = document.getElementById('secondaryColSelect');

  chartTypeSelect.addEventListener('change', () => {
    updateChartControlsUI();
    renderDynamicChart();
  });

  primaryColSelect.addEventListener('change', () => {
    renderDynamicChart();
  });

  secondaryColSelect.addEventListener('change', () => {
    renderDynamicChart();
  });
}

/**
 * Configure dropdown options based on the selected chart type:
 * - Bar/Auto: lists valid categorical columns (excluding IDs/URLs) plus other non-ID columns.
 * - Histogram: strictly lists ONLY numeric columns.
 * - Scatter: strictly lists ONLY numeric columns for both X and Y.
 */
function updateChartControlsUI() {
  const chartType = document.getElementById('chartTypeSelect').value;
  const col1Control = document.getElementById('col1Control');
  const col2Control = document.getElementById('col2Control');
  const col1Label = document.getElementById('col1Label');
  const col2Label = document.getElementById('col2Label');
  const primarySelect = document.getElementById('primaryColSelect');
  const secondarySelect = document.getElementById('secondaryColSelect');

  const prevPrimary = primarySelect.value;
  const prevSecondary = secondarySelect.value;

  primarySelect.innerHTML = '';
  secondarySelect.innerHTML = '';

  // Get categorized columns
  const allCols = State.columns;
  const nonIdCols = allCols.filter(c => !State.columnProfiles[c].isIdentifier);
  const numericCols = allCols.filter(c => State.columnProfiles[c].detectedType === 'number' && !State.columnProfiles[c].isIdentifier);
  const fallbackNumericCols = allCols.filter(c => State.columnProfiles[c].detectedType === 'number');
  const availableNumerics = numericCols.length > 0 ? numericCols : fallbackNumericCols;

  const catCols = allCols.filter(c => State.columnProfiles[c].detectedType === 'string' && !State.columnProfiles[c].isIdentifier);
  const fallbackCatCols = allCols.filter(c => State.columnProfiles[c].detectedType === 'string');
  const availableCats = catCols.length > 0 ? catCols : fallbackCatCols;

  if (chartType === 'histogram') {
    // Only numeric columns
    col1Control.style.display = 'flex';
    col2Control.style.display = 'none';
    col1Label.textContent = 'Distribution Column (Numeric):';

    if (availableNumerics.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No numeric columns detected';
      primarySelect.appendChild(opt);
    } else {
      availableNumerics.forEach(col => {
        const opt = document.createElement('option');
        opt.value = col;
        opt.textContent = `${col} (${State.columnProfiles[col].detectedType})`;
        primarySelect.appendChild(opt);
      });

      // Default preference for numeric distributions: prioritize exact/word matches
      const amazonHistDefaults = ['discount_percentage', 'discount_percent', 'discounted_price', 'sale_price', 'actual_price', 'cost_price', 'rating', 'units_sold'];
      let chosen = null;
      // Pass 1: exact normalized match
      for (const pattern of amazonHistDefaults) {
        const found = availableNumerics.find(c => {
          const norm = c.toLowerCase().replace(/[\s_-]+/g, '_').trim();
          return norm === pattern;
        });
        if (found) { chosen = found; break; }
      }
      // Pass 2: word boundary match if no exact match
      if (!chosen) {
        for (const pattern of amazonHistDefaults) {
          const found = availableNumerics.find(c => {
            const norm = c.toLowerCase().replace(/[\s_-]+/g, '_').trim();
            return norm.includes(pattern);
          });
          if (found) { chosen = found; break; }
        }
      }
      if (prevPrimary && availableNumerics.includes(prevPrimary)) {
        primarySelect.value = prevPrimary;
      } else {
        primarySelect.value = chosen || availableNumerics[0];
      }
    }
  } else if (chartType === 'scatter') {
    // Scatter plot: both X and Y strictly numeric
    col1Control.style.display = 'flex';
    col2Control.style.display = 'flex';
    col1Label.textContent = 'X Axis (Numeric):';
    col2Label.textContent = 'Y Axis (Numeric):';

    if (availableNumerics.length === 0) {
      const opt1 = document.createElement('option');
      opt1.value = '';
      opt1.textContent = 'No numeric columns detected';
      primarySelect.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = '';
      opt2.textContent = 'No numeric columns detected';
      secondarySelect.appendChild(opt2);
    } else {
      availableNumerics.forEach(col => {
        const optA = document.createElement('option');
        optA.value = col;
        optA.textContent = `${col} (${State.columnProfiles[col].detectedType})`;
        primarySelect.appendChild(optA);

        const optB = document.createElement('option');
        optB.value = col;
        optB.textContent = `${col} (${State.columnProfiles[col].detectedType})`;
        secondarySelect.appendChild(optB);
      });

      // Prefer meaningful pairs such as actual_price vs discounted_price, or cost_price vs sale_price
      let defaultX = null;
      let defaultY = null;

      const findCol = (terms) => availableNumerics.find(c => {
        const l = c.toLowerCase().trim();
        return terms.some(t => l === t || l.includes(t));
      });

      // Pair 1: actual_price vs discounted_price
      const actual = findCol(['actual_price', 'original_price', 'list_price', 'mrp', 'cost_price']);
      const discounted = findCol(['discounted_price', 'sale_price', 'price', 'offer_price']);

      if (actual && discounted && actual !== discounted) {
        defaultX = actual;
        defaultY = discounted;
      } else if (availableNumerics.length >= 2) {
        defaultX = availableNumerics[0];
        defaultY = availableNumerics[1];
      } else {
        defaultX = availableNumerics[0];
        defaultY = availableNumerics[0];
      }

      primarySelect.value = (prevPrimary && availableNumerics.includes(prevPrimary)) ? prevPrimary : defaultX;
      secondarySelect.value = (prevSecondary && availableNumerics.includes(prevSecondary)) ? prevSecondary : defaultY;
    }
  } else if (chartType === 'bar') {
    // Categorical bar chart: prefer meaningful categories (excluding IDs/URLs)
    col1Control.style.display = 'flex';
    col2Control.style.display = 'none';
    col1Label.textContent = 'Category Column:';

    const candidates = availableCats.length > 0 ? availableCats : nonIdCols;
    const finalCandidates = candidates.length > 0 ? candidates : allCols;

    finalCandidates.forEach(col => {
      const prof = State.columnProfiles[col];
      const opt = document.createElement('option');
      opt.value = col;
      opt.textContent = `${col} (${prof.detectedType})`;
      primarySelect.appendChild(opt);
    });

    // Default preference: category, sub_category, brand
    const catDefaults = ['category', 'sub_category', 'main_category', 'brand', 'type', 'genre', 'product_name'];
    let chosen = null;
    for (const pattern of catDefaults) {
      const found = finalCandidates.find(c => c.toLowerCase().trim() === pattern || c.toLowerCase().includes(pattern));
      if (found) { chosen = found; break; }
    }
    primarySelect.value = (prevPrimary && finalCandidates.includes(prevPrimary)) ? prevPrimary : (chosen || finalCandidates[0]);
  } else {
    // Auto Selection
    col1Control.style.display = 'flex';
    col2Control.style.display = 'none';
    col1Label.textContent = 'Auto Profile Column:';

    const candidates = nonIdCols.length > 0 ? nonIdCols : allCols;
    candidates.forEach(col => {
      const prof = State.columnProfiles[col];
      const opt = document.createElement('option');
      opt.value = col;
      opt.textContent = `${col} (${prof.detectedType})`;
      primarySelect.appendChild(opt);
    });

    // Default: prioritize category if available, otherwise first non-ID numeric
    let chosen = null;
    if (availableCats.length > 0) {
      const catMatch = availableCats.find(c => c.toLowerCase().includes('category') || c.toLowerCase().includes('brand'));
      chosen = catMatch || availableCats[0];
    } else if (availableNumerics.length > 0) {
      const numMatch = availableNumerics.find(c => c.toLowerCase().includes('discount') || c.toLowerCase().includes('price'));
      chosen = numMatch || availableNumerics[0];
    }
    primarySelect.value = (prevPrimary && candidates.includes(prevPrimary)) ? prevPrimary : (chosen || candidates[0]);
  }
}

function renderDynamicChart() {
  const canvas = document.getElementById('mainChart');
  const ctx = canvas.getContext('2d');
  const requestedType = document.getElementById('chartTypeSelect').value;
  const primaryCol = document.getElementById('primaryColSelect').value;
  const secondaryCol = document.getElementById('secondaryColSelect').value;
  const explanationEl = document.getElementById('chartExplanation');

  if (!primaryCol || !State.columnProfiles[primaryCol]) {
    showChartMessage('No Column Selected', 'Please select a valid dataset column from the dropdown above to display a chart.');
    return;
  }

  const prof1 = State.columnProfiles[primaryCol];

  // Resolve type if 'auto': never select an ID/URL column; prefer category frequency or numeric histogram
  let activeType = requestedType;
  if (activeType === 'auto') {
    if (prof1.detectedType === 'number') {
      activeType = 'histogram';
    } else {
      activeType = 'bar';
    }
  }

  // 1. HISTOGRAM LOGIC
  if (activeType === 'histogram') {
    if (prof1.detectedType !== 'number') {
      showChartMessage('Numeric Column Required', `"${primaryCol}" is detected as ${prof1.detectedType}. Histograms require numeric distributions.`);
      return;
    }

    // Extract all valid finite numeric values, excluding missing/NaN
    const values = [];
    State.rawRows.forEach(r => {
      const parsed = parseNumericValue(r[primaryCol]);
      if (!isNaN(parsed) && isFinite(parsed)) {
        values.push(parsed);
      }
    });

    const validSampleCount = values.length;
    if (validSampleCount === 0) {
      showChartMessage('Empty Numeric Data', `Column "${primaryCol}" does not contain any valid numeric values to generate a distribution.`);
      return;
    }

    hideChartMessage();
    if (State.chartInstance) State.chartInstance.destroy();

    const min = Math.min(...values);
    const max = Math.max(...values);

    let binCount, binWidth, bins, binLabels;

    if (min === max) {
      binCount = 1;
      bins = [validSampleCount];
      binLabels = [formatNumber(min)];
    } else {
      // Determine sensible bin count based on sample size (between 5 and 15 bins)
      binCount = Math.min(15, Math.max(5, Math.ceil(Math.sqrt(validSampleCount))));
      binWidth = (max - min) / binCount;
      bins = Array(binCount).fill(0);
      binLabels = [];

      for (let i = 0; i < binCount; i++) {
        const bStart = min + i * binWidth;
        const bEnd = i === binCount - 1 ? max : min + (i + 1) * binWidth;
        binLabels.push(`${formatNumber(bStart)} – ${formatNumber(bEnd)}`);
      }

      values.forEach(v => {
        let bIdx = Math.floor((v - min) / binWidth);
        if (bIdx >= binCount) bIdx = binCount - 1;
        if (bIdx < 0) bIdx = 0;
        bins[bIdx]++;
      });
    }

    State.chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: binLabels,
        datasets: [{
          label: `Frequency Distribution of "${primaryCol}"`,
          data: bins,
          backgroundColor: 'rgba(168, 85, 247, 0.75)',
          borderColor: '#a855f7',
          borderWidth: 1.5,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#94a3b8' } },
          tooltip: {
            backgroundColor: '#0f172a',
            titleColor: '#fff',
            bodyColor: '#c084fc',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            callbacks: {
              label: (c) => `Frequency: ${c.parsed.y} records`
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#94a3b8', maxRotation: 45, minRotation: 0 },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          y: {
            ticks: { color: '#94a3b8', precision: 0 },
            grid: { color: 'rgba(255,255,255,0.05)' }
          }
        }
      }
    });

    explanationEl.textContent = `Numerical Distribution: Visualizing ${validSampleCount.toLocaleString()} valid samples across ${binCount} bins for "${primaryCol}". Actual Range: ${formatNumber(min)} to ${formatNumber(max)}.`;
    return;
  }

  // 2. SCATTER PLOT LOGIC
  if (activeType === 'scatter') {
    if (!secondaryCol || !State.columnProfiles[secondaryCol]) {
      showChartMessage('Secondary Column Required', 'Scatter plot requires two valid numeric columns for X and Y axes.');
      return;
    }

    const prof2 = State.columnProfiles[secondaryCol];
    if (prof1.detectedType !== 'number' || prof2.detectedType !== 'number') {
      showChartMessage('Numeric Columns Required', `Scatter plots require numeric columns for both X and Y axes. Current selection: X="${primaryCol}" (${prof1.detectedType}), Y="${secondaryCol}" (${prof2.detectedType}).`);
      return;
    }

    const points = [];
    State.rawRows.forEach(r => {
      const x = parseNumericValue(r[primaryCol]);
      const y = parseNumericValue(r[secondaryCol]);
      if (!isNaN(x) && isFinite(x) && !isNaN(y) && isFinite(y)) {
        points.push({ x, y });
      }
    });

    if (points.length === 0) {
      showChartMessage('No Paired Points Available', `No valid numeric coordinate pairs found between "${primaryCol}" and "${secondaryCol}".`);
      return;
    }

    hideChartMessage();
    if (State.chartInstance) State.chartInstance.destroy();

    State.chartInstance = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [{
          label: `${primaryCol} vs ${secondaryCol}`,
          data: points,
          backgroundColor: 'rgba(56, 189, 248, 0.75)',
          borderColor: '#38bdf8',
          borderWidth: 1,
          pointRadius: 4,
          pointHoverRadius: 7
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#94a3b8' } },
          tooltip: {
            backgroundColor: '#0f172a',
            titleColor: '#fff',
            bodyColor: '#38bdf8',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            callbacks: {
              label: (c) => `(${formatNumber(c.parsed.x)}, ${formatNumber(c.parsed.y)})`
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: primaryCol, color: '#94a3b8' },
            ticks: { color: '#94a3b8' },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          y: {
            title: { display: true, text: secondaryCol, color: '#94a3b8' },
            ticks: { color: '#94a3b8' },
            grid: { color: 'rgba(255,255,255,0.05)' }
          }
        }
      }
    });

    explanationEl.textContent = `Bivariate Correlation: Displaying ${points.length.toLocaleString()} individual paired points comparing X="${primaryCol}" and Y="${secondaryCol}".`;
    return;
  }

  // 3. BAR CHART LOGIC (Categorical frequency)
  const freq = prof1.freqMap || {};
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 15);

  if (sorted.length === 0) {
    showChartMessage('No Categorical Data', `Column "${primaryCol}" does not have any records to display.`);
    return;
  }

  hideChartMessage();
  if (State.chartInstance) State.chartInstance.destroy();

  const labels = sorted.map(i => i[0] || '(Empty)');
  const counts = sorted.map(i => i[1]);

  State.chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: `Count in "${primaryCol}"`,
        data: counts,
        backgroundColor: 'rgba(56, 189, 248, 0.75)',
        borderColor: '#38bdf8',
        borderWidth: 1.5,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94a3b8' } },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#fff',
          bodyColor: '#38bdf8',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1
        }
      },
      scales: {
        x: { ticks: { color: '#94a3b8', maxRotation: 45, minRotation: 0 }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#94a3b8', precision: 0 }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });

  explanationEl.textContent = `Categorical Frequency: Displaying top occurrences for attribute "${primaryCol}".`;
}

/* ==========================================================================
   Data Explorer Table (Search, Filter, Sort, Pagination)
   ========================================================================== */
function setupFilterAndSortListeners() {
  const searchInput = document.getElementById('tableSearchInput');
  const filterColSelect = document.getElementById('filterColumnSelect');
  const btnRemoveMissing = document.getElementById('btnRemoveMissing');
  const btnResetFilters = document.getElementById('btnResetFilters');
  const btnPrevPage = document.getElementById('btnPrevPage');
  const btnNextPage = document.getElementById('btnNextPage');

  searchInput.addEventListener('input', () => {
    applyFilters();
  });

  filterColSelect.addEventListener('change', () => {
    applyFilters();
  });

  btnRemoveMissing.addEventListener('click', () => {
    // Filter out rows that have any empty value
    State.filteredRows = State.filteredRows.filter(r => {
      return State.columns.every(col => {
        const val = r[col];
        return val !== '' && val !== null && val !== undefined && val.toLowerCase() !== 'null' && val.toLowerCase() !== 'nan';
      });
    });
    State.currentPage = 1;
    renderDataTable();
    updateFilterStatus(`Filtered: Dropped missing records (Remaining: ${State.filteredRows.length.toLocaleString()})`);
  });

  btnResetFilters.addEventListener('click', () => {
    searchInput.value = '';
    filterColSelect.value = '_all';
    State.filteredRows = [...State.rawRows];
    State.currentPage = 1;
    State.sortColumn = null;
    State.sortDirection = 'asc';
    renderDataTable();
    updateFilterStatus('Showing all records');
  });

  btnPrevPage.addEventListener('click', () => {
    if (State.currentPage > 1) {
      State.currentPage--;
      renderDataTable();
    }
  });

  btnNextPage.addEventListener('click', () => {
    const maxPage = Math.ceil(State.filteredRows.length / State.pageSize) || 1;
    if (State.currentPage < maxPage) {
      State.currentPage++;
      renderDataTable();
    }
  });
}

function applyFilters() {
  const query = document.getElementById('tableSearchInput').value.toLowerCase().trim();
  const filterCol = document.getElementById('filterColumnSelect').value;

  if (!query) {
    State.filteredRows = [...State.rawRows];
  } else {
    State.filteredRows = State.rawRows.filter(row => {
      if (filterCol === '_all') {
        return State.columns.some(col => String(row[col] || '').toLowerCase().includes(query));
      } else {
        return String(row[filterCol] || '').toLowerCase().includes(query);
      }
    });
  }

  // Re-apply sorting if active
  if (State.sortColumn) {
    sortDataset(State.sortColumn, false);
  }

  State.currentPage = 1;
  renderDataTable();
  updateFilterStatus(`Filtered records: ${State.filteredRows.length.toLocaleString()} matching`);
}

function updateFilterStatus(text) {
  document.getElementById('tableFilterStatus').textContent = text;
}

function sortDataset(colName, toggleDirection = true) {
  if (toggleDirection) {
    if (State.sortColumn === colName) {
      State.sortDirection = State.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      State.sortColumn = colName;
      State.sortDirection = 'asc';
    }
  }

  const isNumeric = State.columnProfiles[colName].detectedType === 'number';
  const dir = State.sortDirection === 'asc' ? 1 : -1;

  State.filteredRows.sort((a, b) => {
    const valA = a[colName];
    const valB = b[colName];

    if (valA === '' || valA === null) return 1;
    if (valB === '' || valB === null) return -1;

    if (isNumeric) {
      const numA = parseNumericValue(valA);
      const numB = parseNumericValue(valB);
      if (isNaN(numA)) return 1;
      if (isNaN(numB)) return -1;
      return (numA - numB) * dir;
    }

    return String(valA).localeCompare(String(valB)) * dir;
  });

  renderDataTable();
}

function renderDataTable() {
  const head = document.getElementById('dataTableHead');
  const body = document.getElementById('dataTableBody');

  // Render Header once or when sorting changes
  head.innerHTML = '';
  const headerTr = document.createElement('tr');
  const indexTh = document.createElement('th');
  indexTh.textContent = '#';
  indexTh.style.width = '50px';
  headerTr.appendChild(indexTh);

  State.columns.forEach(col => {
    const th = document.createElement('th');
    th.className = 'sortable';
    let sortIcon = '⇅';
    if (State.sortColumn === col) {
      sortIcon = State.sortDirection === 'asc' ? '▲' : '▼';
    }
    th.innerHTML = `${escapeHtml(col)} <span class="sort-icon">${sortIcon}</span>`;
    th.addEventListener('click', () => sortDataset(col, true));
    headerTr.appendChild(th);
  });
  head.appendChild(headerTr);

  // Render Page rows
  body.innerHTML = '';
  const total = State.filteredRows.length;
  const startIdx = (State.currentPage - 1) * State.pageSize;
  const endIdx = Math.min(startIdx + State.pageSize, total);
  const pageRows = State.filteredRows.slice(startIdx, endIdx);

  if (pageRows.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="${State.columns.length + 1}" style="text-align:center; padding: 2.5rem; color: var(--text-dim);">No records found matching your filter criteria.</td>`;
    body.appendChild(tr);
  } else {
    pageRows.forEach((row, i) => {
      const tr = document.createElement('tr');
      const rowNumTd = document.createElement('td');
      rowNumTd.textContent = (startIdx + i + 1);
      rowNumTd.style.color = 'var(--text-dim)';
      rowNumTd.style.fontFamily = 'var(--font-mono)';
      tr.appendChild(rowNumTd);

      State.columns.forEach(col => {
        const td = document.createElement('td');
        const val = row[col];
        if (val === '' || val === null || val === undefined) {
          td.innerHTML = '<span class="missing-tag">&lt;empty&gt;</span>';
        } else {
          td.textContent = val;
        }
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  // Update Pagination Bar
  const totalPages = Math.ceil(total / State.pageSize) || 1;
  document.getElementById('paginationInfo').textContent = `Showing ${total > 0 ? (startIdx + 1).toLocaleString() : 0} to ${endIdx.toLocaleString()} of ${total.toLocaleString()} records`;
  document.getElementById('pageNumberDisplay').textContent = `Page ${State.currentPage} / ${totalPages}`;
  document.getElementById('btnPrevPage').disabled = State.currentPage <= 1;
  document.getElementById('btnNextPage').disabled = State.currentPage >= totalPages;
}

/* ==========================================================================
   Export Cleaned CSV & Comprehensive Audit Report
   ========================================================================== */
function setupExportListeners() {
  document.getElementById('btnExportCleaned').addEventListener('click', () => {
    exportCleanedCSV();
  });

  document.getElementById('btnDownloadReport').addEventListener('click', () => {
    openReportModal();
  });
}

function exportCleanedCSV() {
  if (State.filteredRows.length === 0) {
    alert('No data rows to export.');
    return;
  }

  const csv = Papa.unparse({
    fields: State.columns,
    data: State.filteredRows
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `PricePulse_Cleaned_${State.rawFilename}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function setupModalListeners() {
  const modal = document.getElementById('reportModal');
  const btnClose = document.getElementById('btnCloseModal');
  const btnPrint = document.getElementById('btnPrintReport');
  const btnDownloadMd = document.getElementById('btnDownloadReportMd');

  btnClose.addEventListener('click', () => modal.style.display = 'none');
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });

  btnPrint.addEventListener('click', () => window.print());
  btnDownloadMd.addEventListener('click', () => downloadReportMarkdown());
}

function generateReportMarkdown() {
  const timestamp = new Date().toLocaleString();
  const totalRows = State.rawRows.length;
  const totalCols = State.columns.length;
  let missingCells = 0;
  State.columns.forEach(c => missingCells += State.columnProfiles[c].emptyCount);
  const duplicates = detectDuplicates();

  let md = `# PricePulse — Dataset Audit & Statistical Report\n\n`;
  md += `**File Name:** ${State.rawFilename}  \n`;
  md += `**Generated At:** ${timestamp}  \n`;
  md += `**Records Analyzed:** ${totalRows.toLocaleString()} rows × ${totalCols} columns  \n`;
  md += `**Missing Cells:** ${missingCells.toLocaleString()} (${((missingCells / (totalRows * totalCols || 1)) * 100).toFixed(1)}%)  \n`;
  md += `**Exact Duplicate Rows:** ${duplicates}  \n\n`;

  md += `## 1. Column Profiling & Detected Types\n\n`;
  md += `| Column | Detected Type | Valid Rows | Missing | Unique | Min | Mean | Max |\n`;
  md += `|---|---|---|---|---|---|---|---|\n`;

  State.columns.forEach(col => {
    const p = State.columnProfiles[col];
    const s = p.stats;
    const min = s ? s.min : '—';
    const mean = s ? s.mean.toFixed(2) : '—';
    const max = s ? s.max : '—';
    md += `| ${col} | ${p.detectedType} | ${p.validCount} | ${p.emptyCount} | ${p.uniqueValuesCount} | ${min} | ${mean} | ${max} |\n`;
  });

  md += `\n## 2. Statistical Insights & Recommendations\n\n`;
  if (missingCells > 0) {
    md += `- **Data Cleaning Required:** ${missingCells} cells are vacant. Impute or drop rows before training models.\n`;
  } else {
    md += `- **Complete Data:** Zero missing cells observed. Dataset is robust.\n`;
  }
  if (duplicates > 0) {
    md += `- **Redundancy Alert:** ${duplicates} duplicate entries found. Deduplication advised.\n`;
  } else {
    md += `- **Deduplication:** High record uniqueness with 0 duplicates.\n`;
  }

  return md;
}

function openReportModal() {
  const md = generateReportMarkdown();
  const contentEl = document.getElementById('reportContent');

  // Convert basic markdown to formatted HTML for clean presentation
  const html = md
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '<br/><br/>');

  contentEl.innerHTML = `
    <div style="background: rgba(255,255,255,0.02); padding: 1.5rem; border-radius: 8px; border: 1px solid var(--border-subtle);">
      ${html}
    </div>
  `;

  document.getElementById('reportModal').style.display = 'flex';
}

function downloadReportMarkdown() {
  const md = generateReportMarkdown();
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `PricePulse_Audit_${State.rawFilename.replace('.csv', '')}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ==========================================================================
   Utilities
   ========================================================================== */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return '—';
  if (Math.abs(num) >= 1000) {
    return Number(num).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return Number(num).toFixed(2);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
