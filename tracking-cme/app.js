/**
 * app.js — Standalone Engine for Tracking CME (Proyek JATIM)
 * Mirror of Tracking FO Enterprise System with Full Client-Side Interactivity & Local Persistence
 */

// Application State
const state = {
  rawDataset: null,
  allProjects: [],
  filteredProjects: [],
  page: 1,
  pageSize: 50,
  totalPages: 1,
  totalRows: 0,
  sortBy: 'sonumb',
  sortDir: 'asc',
  search: '',
  filters: {
    yearPeriod: '2026',
    operator: [],
    kabupaten: [],
    mitra: [],
    tahapan: [],
    statusBadge: [],
    onlyGap: false,
    onlyApprovedToday: false,
    onlyPending: false
  },
  filterOptions: {
    operator: [],
    kabupaten: [],
    mitra: [],
    tahapan: []
  },
  tableItemsMap: {},
  kpiModalItems: [],
  kpiModalFiltered: []
};

const TABLE_COLUMNS = [
  { key: 'sonumb', label: 'SO Number', sortable: true },
  { key: 'siteName', label: 'Site / Site ID', sortable: true },
  { key: 'operatorId', label: 'Operator', sortable: true },
  { key: 'kabupaten', label: 'Kabupaten/Kota', sortable: true },
  { key: 'mitra', label: 'Mitra', sortable: true },
  { key: 'tahapan', label: 'Tahapan Pengajuan', sortable: true },
  { key: 'tanggalPengajuan', label: 'Tgl Pengajuan', sortable: true },
  { key: 'statusApproval', label: 'Status Approval', sortable: true },
  { key: 'approvedBy', label: 'Disetujui Oleh', sortable: true },
  { key: 'remarks', label: 'Remarks', sortable: false }
];

const MULTISELECT_DEFS = [
  { containerId: 'msOperator', filterKey: 'operator', label: 'Operator', optionsSource: 'operator' },
  { containerId: 'msKabupaten', filterKey: 'kabupaten', label: 'Kabupaten/Kota', optionsSource: 'kabupaten' },
  { containerId: 'msMitra', filterKey: 'mitra', label: 'Mitra', optionsSource: 'mitra' },
  { containerId: 'msTahapan', filterKey: 'tahapan', label: 'Tahapan', optionsSource: 'tahapan' },
  { containerId: 'msStatus', filterKey: 'statusBadge', label: 'Status', optionsSource: '__fixed_status__' }
];

const FIXED_STATUS_OPTIONS = [
  { value: 'MATCH', label: 'Match' },
  { value: 'GAP', label: 'Gap' },
  { value: 'PENDING', label: 'Pending Approval' }
];

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  startLiveClock();
  initFormDates();
  loadData();
  bindSearch();
  initEventDelegation();
});

// -------------------------------------------------------------------------
// LIVE WIB CLOCK
// -------------------------------------------------------------------------
function startLiveClock() {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  function tick() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const wib = new Date(utc + (3600000 * 7));

    const dayName = days[wib.getDay()];
    const d = wib.getDate();
    const m = months[wib.getMonth()];
    const y = wib.getFullYear();
    const hh = String(wib.getHours()).padStart(2, '0');
    const mm = String(wib.getMinutes()).padStart(2, '0');
    const ss = String(wib.getSeconds()).padStart(2, '0');

    const text = `${dayName}, ${d} ${m} ${y} · ${hh}.${mm}.${ss} WIB`;
    const el = document.getElementById('headerDateDisplay');
    if (el) el.innerText = text;
  }

  tick();
  setInterval(tick, 1000);
}

function initFormDates() {
  const today = new Date().toISOString().split('T')[0];
  const tglInput = document.getElementById('singleTanggalPengajuan');
  if (tglInput) tglInput.value = today;
}

// -------------------------------------------------------------------------
// DATA FETCHING & LOCAL PERSISTENCE
// -------------------------------------------------------------------------
async function loadData() {
  setRefreshing(true);
  try {
    const res = await fetch('data.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}: Gagal memuat data.json`);
    const dataset = await res.json();
    state.rawDataset = dataset;

    // Load any user-submitted items from localStorage
    const savedLocal = JSON.parse(localStorage.getItem('tracking_cme_submissions') || '[]');
    
    // Combine dataset items with locally stored submissions (local first)
    state.allProjects = [...savedLocal, ...(dataset.items || [])];

    // Compute or update Filter Options
    state.filterOptions = {
      operator: dataset.filterOptions?.operator || getUniqueValues(state.allProjects, 'operatorId'),
      kabupaten: dataset.filterOptions?.kabupaten || getUniqueValues(state.allProjects, 'kabupaten'),
      mitra: dataset.filterOptions?.mitra || getUniqueValues(state.allProjects, 'mitra'),
      tahapan: dataset.filterOptions?.tahapan || getUniqueValues(state.allProjects, 'tahapan')
    };

    // Build UI Components
    renderKPI(dataset.summary, savedLocal.length);
    renderCharts(dataset.charts);
    buildMultiSelects();
    renderTableHead();
    applyFilters();
  } catch (err) {
    console.error('Error loading data:', err);
    const tbody = document.getElementById('tableBody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="${TABLE_COLUMNS.length}" class="p-8 text-center text-red-500 font-semibold">Gagal memuat basis data: ${escapeHtml(err.message)}</td></tr>`;
    }
  } finally {
    setRefreshing(false);
  }
}

function refreshAll() {
  loadData();
}

function setRefreshing(isLoading) {
  const icon = document.getElementById('refreshIcon');
  const btn = document.getElementById('btnRefresh');
  if (!icon || !btn) return;
  if (isLoading) {
    icon.classList.add('spin');
    btn.disabled = true;
    btn.classList.add('opacity-60');
  } else {
    icon.classList.remove('spin');
    btn.disabled = false;
    btn.classList.remove('opacity-60');
  }
}

function getUniqueValues(items, key) {
  const s = new Set();
  items.forEach(it => {
    if (it && it[key] && it[key] !== '-') s.add(it[key]);
  });
  return Array.from(s).sort();
}

// -------------------------------------------------------------------------
// KPI CARDS
// -------------------------------------------------------------------------
function renderKPI(summary, extraPending = 0) {
  if (!summary) return;
  const currentPending = (summary.pending || 0) + extraPending;
  const currentTotal = (summary.total || 0) + extraPending;

  const defs = [
    { key: 'totalMaster', label: 'Total Portofolio', value: summary.totalMaster, icon: 'inventory_2', color: '#1e293b', bg: '#f1f5f9', sub: 'Seluruh Data Master' },
    { key: 'total', label: 'Total Proyek Aktif', value: currentTotal, icon: 'folder_open', color: '#2563eb', bg: '#eff6ff', sub: 'Proyek CIP (2025–2026)' },
    { key: 'rfs', label: 'Sudah RFS', value: summary.rfs, icon: 'check_circle', color: '#059669', bg: '#ecfdf5', sub: `${summary.persenRfs}% (Proyek CIP)` },
    { key: 'onProgress', label: 'On-Progress', value: summary.onProgress, icon: 'autorenew', color: '#d97706', bg: '#fffbeb', sub: 'Proyek CIP' },
    { key: 'gap', label: 'Gap Sistem vs Aktual', value: summary.gap, icon: 'compare_arrows', color: '#b91c1c', bg: '#fef2f2', sub: 'Perlu Update Master PI' },
    { key: 'pending', label: 'Menunggu Approval', value: currentPending, icon: 'pending_actions', color: '#ca8a04', bg: '#fef9c3', sub: 'Pending Review PM' },
    { key: 'approvedToday', label: 'Approved Hari Ini', value: summary.approvedToday, icon: 'task_alt', color: '#0284c7', bg: '#f0f9ff', sub: 'Persetujuan Hari Ini' }
  ];

  const grid = document.getElementById('kpiGrid');
  if (!grid) return;

  grid.innerHTML = defs.map(d => {
    const valStr = typeof d.value === 'number' ? d.value.toLocaleString('id-ID') : (d.value || '0');
    return `
      <div class="kpi-card cursor-pointer" onclick="handleCardClick('${d.key}')" title="Klik untuk filter atau lihat daftar proyek ${d.label}">
        <div class="kpi-icon" style="background:${d.bg}; color:${d.color}">
          <span class="material-symbols-rounded">${d.icon}</span>
        </div>
        <div class="kpi-value" style="color:${d.color}">${valStr}</div>
        <div class="kpi-label flex items-center justify-between">
          <span>${d.label}</span>
          <span class="material-symbols-rounded text-slate-300 text-[14px]">open_in_new</span>
        </div>
        ${d.sub ? `<div class="kpi-sub">${d.sub}</div>` : ''}
      </div>
    `;
  }).join('');
}

function handleCardClick(key) {
  if (key === 'gap') {
    state.filters.onlyGap = !state.filters.onlyGap;
    updateChipUI('onlyGap', state.filters.onlyGap);
    applyFilters();
  } else if (key === 'pending') {
    state.filters.onlyPending = !state.filters.onlyPending;
    updateChipUI('onlyPending', state.filters.onlyPending);
    applyFilters();
  } else if (key === 'approvedToday') {
    state.filters.onlyApprovedToday = !state.filters.onlyApprovedToday;
    updateChipUI('onlyApprovedToday', state.filters.onlyApprovedToday);
    applyFilters();
  } else if (key === 'rfs') {
    state.filters.statusBadge = ['MATCH'];
    buildMultiSelects();
    applyFilters();
  } else if (key === 'onProgress') {
    state.filters.statusBadge = [];
    state.filters.onlyGap = false;
    state.filters.onlyPending = false;
    state.filters.onlyApprovedToday = false;
    resetChipUIs();
    applyFilters();
  } else {
    // Reset filters and scroll to table
    resetFilters();
  }

  // Smooth scroll down to table section
  const section = document.getElementById('tableSection');
  if (section) section.scrollIntoView({ behavior: 'smooth' });
}

// -------------------------------------------------------------------------
// CHARTS (FUNNEL & COMPARISON)
// -------------------------------------------------------------------------
let comparisonChartInstance = null;

function renderCharts(chartsData) {
  if (!chartsData) return;

  // 1. Google Charts Funnel
  if (chartsData.funnel && window.google && window.google.charts) {
    google.charts.load('current', { packages: ['corechart'] });
    google.charts.setOnLoadCallback(() => {
      const rows = chartsData.funnel.map(d => [d.stage, d.count]);
      const dataTable = google.visualization.arrayToDataTable([['Tahap', 'Jumlah Proyek'], ...rows]);
      const options = {
        legend: { position: 'none' },
        chartArea: { left: 160, top: 15, right: 30, bottom: 25 },
        colors: ['#2563eb'],
        hAxis: { minValue: 0, textStyle: { fontSize: 11, fontName: 'Plus Jakarta Sans', color: '#64748b' } },
        vAxis: { textStyle: { fontSize: 11, fontName: 'Plus Jakarta Sans', color: '#1e293b' } },
        bar: { groupWidth: '65%' },
        fontName: 'Plus Jakarta Sans',
        backgroundColor: 'transparent'
      };
      const el = document.getElementById('chartFunnel');
      if (el) {
        const chart = new google.visualization.BarChart(el);
        chart.draw(dataTable, options);
      }
    });
  }

  // 2. Chart.js Status Comparison
  if (chartsData.statusComparison && window.Chart) {
    const ctx = document.getElementById('chartComparison');
    if (!ctx) return;
    if (comparisonChartInstance) {
      comparisonChartInstance.destroy();
      comparisonChartInstance = null;
    }
    comparisonChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: chartsData.statusComparison.categories,
        datasets: [
          { label: 'Aktual (Tracking Lapangan)', data: chartsData.statusComparison.aktual, backgroundColor: '#2563eb', borderRadius: 4 },
          { label: 'Sistem (Master PI)', data: chartsData.statusComparison.sistem, backgroundColor: '#94a3b8', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { family: 'Plus Jakarta Sans', size: 11, weight: '600' } } }
        },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0, font: { family: 'Plus Jakarta Sans', size: 11 } }, grid: { color: '#f1f5f9' } },
          x: { ticks: { font: { family: 'Plus Jakarta Sans', size: 11, weight: '600' } }, grid: { display: false } }
        }
      }
    });
  }
}

// -------------------------------------------------------------------------
// MULTI-SELECT DROPDOWNS & FILTER LOGIC
// -------------------------------------------------------------------------
function buildMultiSelects() {
  MULTISELECT_DEFS.forEach(def => {
    renderMultiSelect(def.containerId, def.label, def.filterKey, getOptionsFor_(def));
  });
}

function getOptionsFor_(def) {
  if (def.optionsSource === '__fixed_status__') return FIXED_STATUS_OPTIONS;
  return (state.filterOptions[def.optionsSource] || []).map(v => ({ value: v, label: v }));
}

function renderMultiSelect(containerId, label, filterKey, options) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const selected = state.filters[filterKey] || [];
  const btnLabel = selected.length ? `${label} (${selected.length})` : label;
  const panelId = `${containerId}_panel`;

  container.className = 'ms-wrap';
  container.innerHTML = `
    <button type="button" class="ms-btn ${selected.length ? 'has-value' : ''}" data-ms-toggle-panel="${panelId}">
      <span class="material-symbols-rounded text-[15px]">tune</span>${escapeHtml(btnLabel)}
      <span class="material-symbols-rounded text-[15px]">expand_more</span>
    </button>
    <div id="${panelId}" class="ms-panel hidden" data-filter-key="${filterKey}" data-container-id="${containerId}">
      ${options.length ? options.map(opt => {
        const checked = selected.indexOf(opt.value) !== -1 ? 'checked' : '';
        return `
          <label class="ms-option">
            <input type="checkbox" ${checked} data-ms-value="${escapeHtml(opt.value)}">
            <span>${escapeHtml(opt.label)}</span>
          </label>
        `;
      }).join('') : '<div class="text-xs text-slate-400 p-2">Tidak ada opsi</div>'}
    </div>
  `;
}

function initEventDelegation() {
  // Close panels on click outside
  document.addEventListener('click', (e) => {
    const toggleBtn = e.target.closest('[data-ms-toggle-panel]');
    if (toggleBtn) {
      const panelId = toggleBtn.getAttribute('data-ms-toggle-panel');
      document.querySelectorAll('.ms-panel').forEach(p => {
        if (p.id !== panelId) p.classList.add('hidden');
      });
      const panel = document.getElementById(panelId);
      if (panel) panel.classList.toggle('hidden');
      return;
    }
    if (!e.target.closest('.ms-wrap')) {
      document.querySelectorAll('.ms-panel').forEach(p => p.classList.add('hidden'));
    }
  });

  // Checkbox change inside multi-select panels
  document.addEventListener('change', (e) => {
    if (e.target.matches('.ms-panel input[type=checkbox]')) {
      const panel = e.target.closest('.ms-panel');
      const filterKey = panel.getAttribute('data-filter-key');
      const containerId = panel.getAttribute('data-container-id');
      const value = e.target.getAttribute('data-ms-value');

      const arr = state.filters[filterKey] || (state.filters[filterKey] = []);
      const idx = arr.indexOf(value);
      if (idx === -1) arr.push(value);
      else arr.splice(idx, 1);

      const def = MULTISELECT_DEFS.find(d => d.containerId === containerId);
      renderMultiSelect(containerId, def.label, filterKey, getOptionsFor_(def));
      const activePanel = document.getElementById(`${containerId}_panel`);
      if (activePanel) activePanel.classList.remove('hidden');

      applyFilters();
    }
  });

  // Table row click -> open detail modal
  document.addEventListener('click', (e) => {
    const row = e.target.closest('tr.row-clickable');
    if (row) {
      const key = row.getAttribute('data-key');
      if (key) openDetail(key);
    }
  });
}

function toggleChip(el) {
  const key = el.getAttribute('data-toggle');
  state.filters[key] = !state.filters[key];
  el.classList.toggle('active', state.filters[key]);
  applyFilters();
}

function updateChipUI(key, isActive) {
  const el = document.querySelector(`[data-toggle="${key}"]`);
  if (el) el.classList.toggle('active', isActive);
}

function resetChipUIs() {
  document.querySelectorAll('.chip-toggle').forEach(el => el.classList.remove('active'));
}

function onYearPeriodChange(val) {
  state.filters.yearPeriod = val;
  applyFilters();
}

function resetFilters() {
  state.filters = {
    yearPeriod: '2026',
    operator: [],
    kabupaten: [],
    mitra: [],
    tahapan: [],
    statusBadge: [],
    onlyGap: false,
    onlyApprovedToday: false,
    onlyPending: false
  };
  state.search = '';
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = '';

  const selYear = document.getElementById('selectYearPeriod');
  if (selYear) selYear.value = '2026';

  resetChipUIs();
  buildMultiSelects();
  applyFilters();
}

function bindSearch() {
  const searchInput = document.getElementById('searchInput');
  if (!searchInput) return;
  let timer = null;
  searchInput.addEventListener('input', function () {
    clearTimeout(timer);
    const val = this.value.trim().toLowerCase();
    timer = setTimeout(() => {
      state.search = val;
      applyFilters();
    }, 250);
  });
}

// -------------------------------------------------------------------------
// FILTERING & PAGINATION ENGINE
// -------------------------------------------------------------------------
function applyFilters() {
  let list = [...state.allProjects];

  // 1. Text Search
  if (state.search) {
    const s = state.search.toLowerCase();
    list = list.filter(it => {
      return (it.sonumb && it.sonumb.toLowerCase().includes(s)) ||
             (it.siteName && it.siteName.toLowerCase().includes(s)) ||
             (it.mitra && it.mitra.toLowerCase().includes(s)) ||
             (it.operatorId && it.operatorId.toLowerCase().includes(s)) ||
             (it.kabupaten && it.kabupaten.toLowerCase().includes(s));
    });
  }

  // 2. Year Period
  if (state.filters.yearPeriod === '2026') {
    list = list.filter(it => it.projectYear === '2025-2026' || !it.projectYear);
  }

  // 3. Multi-Selects
  if (state.filters.operator.length) {
    list = list.filter(it => state.filters.operator.includes(it.operatorId));
  }
  if (state.filters.kabupaten.length) {
    list = list.filter(it => state.filters.kabupaten.includes(it.kabupaten));
  }
  if (state.filters.mitra.length) {
    list = list.filter(it => state.filters.mitra.includes(it.mitra));
  }
  if (state.filters.tahapan.length) {
    list = list.filter(it => state.filters.tahapan.includes(it.tahapan));
  }
  if (state.filters.statusBadge.length) {
    list = list.filter(it => state.filters.statusBadge.includes(it.statusBadge));
  }

  // 4. Toggle Chips
  if (state.filters.onlyGap) {
    list = list.filter(it => it.statusBadge === 'GAP');
  }
  if (state.filters.onlyApprovedToday) {
    list = list.filter(it => it.approvedToday === true);
  }
  if (state.filters.onlyPending) {
    list = list.filter(it => (it.statusApproval || '').toLowerCase() === 'pending');
  }

  // 5. Sorting
  const sortKey = state.sortBy;
  const sortDir = state.sortDir === 'desc' ? -1 : 1;
  list.sort((a, b) => {
    const valA = (a[sortKey] || '').toString().toLowerCase();
    const valB = (b[sortKey] || '').toString().toLowerCase();
    if (valA < valB) return -1 * sortDir;
    if (valA > valB) return 1 * sortDir;
    return 0;
  });

  state.filteredProjects = list;
  state.totalRows = list.length;
  state.totalPages = Math.max(1, Math.ceil(list.length / state.pageSize));
  state.page = 1;

  renderCurrentTablePage();
}

function renderTableHead() {
  const row = document.getElementById('tableHeadRow');
  if (!row) return;
  row.innerHTML = TABLE_COLUMNS.map(col => {
    let icon = '';
    if (state.sortBy === col.key) {
      icon = state.sortDir === 'asc'
        ? '<span class="material-symbols-rounded text-[13px]">arrow_upward</span>'
        : '<span class="material-symbols-rounded text-[13px]">arrow_downward</span>';
    }
    const cls = col.sortable ? 'sortable' : '';
    const clickAttr = col.sortable ? `onclick="onSort('${col.key}')"` : '';
    return `<th class="p-3 border-b border-slate-200 ${cls}" ${clickAttr}>${col.label} ${icon}</th>`;
  }).join('');
}

function onSort(key) {
  if (state.sortBy === key) {
    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    state.sortBy = key;
    state.sortDir = 'asc';
  }
  renderTableHead();
  applyFilters();
}

function renderCurrentTablePage() {
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;

  const start = (state.page - 1) * state.pageSize;
  const pagedItems = state.filteredProjects.slice(start, start + state.pageSize);

  state.tableItemsMap = {};

  if (!pagedItems.length) {
    tbody.innerHTML = `<tr><td colspan="${TABLE_COLUMNS.length}" class="p-8 text-center text-slate-400">Tidak ada proyek yang sesuai dengan kriteria filter atau pencarian.</td></tr>`;
    updatePaginationUI();
    return;
  }

  tbody.innerHTML = pagedItems.map(item => {
    state.tableItemsMap[item.sonumb] = item;
    if (item.key) state.tableItemsMap[item.key] = item;

    const tglAjuan = formatDisplayDate(item.tanggalPengajuan);
    const statusAppr = item.statusApproval ? item.statusApproval.trim() : 'Belum Ada';
    const isDone = statusAppr.toLowerCase() === 'done';
    const isPending = statusAppr.toLowerCase() === 'pending';
    const badgeCls = isDone ? 'badge-match' : (isPending ? 'badge-pending' : 'bg-slate-100 text-slate-500');
    const isRowGap = item.statusBadge === 'GAP';

    return `
      <tr class="row-clickable ${isRowGap ? 'row-gap' : ''}" data-key="${escapeHtml(item.sonumb)}">
        <td class="p-3 font-semibold text-slate-900 font-mono text-[11px]">${escapeHtml(item.sonumb)}</td>
        <td class="p-3 font-medium text-slate-800">${escapeHtml(item.siteName || '-')}</td>
        <td class="p-3 font-bold text-slate-700">${escapeHtml(item.operatorId || '-')}</td>
        <td class="p-3 text-slate-600">${escapeHtml(item.kabupaten || '-')}</td>
        <td class="p-3 text-slate-700 font-medium">${escapeHtml(item.mitra || '-')}</td>
        <td class="p-3 font-bold text-blue-700">${escapeHtml(item.tahapan || item.tahapanMaster || '-')}</td>
        <td class="p-3 text-slate-600">${escapeHtml(tglAjuan)}</td>
        <td class="p-3"><span class="badge ${badgeCls}">${escapeHtml(statusAppr)}</span></td>
        <td class="p-3 text-slate-700 font-medium">${escapeHtml(item.approvedBy || '-')}</td>
        <td class="p-3 text-slate-500 max-w-[180px] truncate" title="${escapeHtml(item.remarks || '-')}">${escapeHtml(item.remarks || '-')}</td>
      </tr>
    `;
  }).join('');

  updatePaginationUI();
}

function updatePaginationUI() {
  const pageNumDisplay = document.getElementById('pageNumDisplay');
  const pageInfo = document.getElementById('pageInfo');
  const tableCount = document.getElementById('tableCount');

  if (pageNumDisplay) pageNumDisplay.innerText = `${state.page} / ${state.totalPages}`;
  if (pageInfo) pageInfo.innerText = `Halaman ${state.page} dari ${state.totalPages} (${state.totalRows.toLocaleString('id-ID')} total proyek)`;
  if (tableCount) tableCount.innerText = `(${state.totalRows.toLocaleString('id-ID')} proyek)`;
}

function gotoPage(p) {
  if (p < 1 || p > state.totalPages || p === state.page) return;
  state.page = p;
  renderCurrentTablePage();
  const tableSec = document.getElementById('tableSection');
  if (tableSec) tableSec.scrollIntoView({ behavior: 'smooth' });
}

function onPageSizeChange() {
  const sel = document.getElementById('pageSizeSelect');
  if (sel) {
    state.pageSize = Number(sel.value);
    state.page = 1;
    state.totalPages = Math.max(1, Math.ceil(state.filteredProjects.length / state.pageSize));
    renderCurrentTablePage();
  }
}

// -------------------------------------------------------------------------
// MODAL DETAIL PROYEK
// -------------------------------------------------------------------------
function openDetail(key) {
  const item = state.tableItemsMap[key] || state.allProjects.find(p => p.sonumb === key || p.key === key);
  if (!item) return;

  const modal = document.getElementById('detailModal');
  const content = document.getElementById('detailContent');
  const subtitle = document.getElementById('detailSubtitle');

  if (subtitle) subtitle.innerText = `SO: ${item.sonumb} · ${item.siteName}`;

  const rows = [
    ['SO Number', item.sonumb],
    ['STIP Number', item.stipNumber || '-'],
    ['Nama Site', item.siteName || '-'],
    ['Operator', item.operatorId || '-'],
    ['Kabupaten / Kota', item.kabupaten || '-'],
    ['Mitra Pelaksana', item.mitra || '-'],
    ['Jenis Pekerjaan', item.jenis || 'FO Intersite CME'],
    ['Project Manager (PM)', item.pm || '-'],
    ['Pengawas Lapangan (Waspang)', item.waspang || '-'],
    ['Tahapan Master (Sistem)', item.tahapanMaster || '-'],
    ['Status Master (Sistem)', item.statusMaster || '-'],
    ['Tahapan Lapangan (Aktual)', item.tahapan || '-'],
    ['Status Approval', item.statusApproval || 'Pending'],
    ['Disetujui Oleh', item.approvedBy || '-'],
    ['Tgl Pengajuan', formatDisplayDate(item.tanggalPengajuan)],
    ['Tgl Approval', formatDisplayDate(item.tanggalApproval)],
    ['Tgl RFS Master', formatDisplayDate(item.masterRfsDate)]
  ];

  let html = `
    <div class="flex flex-wrap items-center gap-2 pb-2">
      <span class="badge ${badgeClass(item.statusBadge)}">${escapeHtml(labelBadge(item.statusBadge))}</span>
      ${item.approvedToday ? '<span class="badge badge-match">Approved Hari Ini</span>' : ''}
    </div>

    <div class="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
      ${rows.map(r => `
        <div>
          <div class="text-slate-400 font-medium text-[10px] uppercase">${escapeHtml(r[0])}</div>
          <div class="font-bold text-slate-800 text-xs mt-0.5 break-words">${escapeHtml(String(r[1]))}</div>
        </div>
      `).join('')}
    </div>
  `;

  if (item.remarks) {
    html += `
      <div class="text-xs bg-blue-50/60 border border-blue-100 rounded-xl p-3 text-slate-700">
        <span class="font-bold text-blue-900 block mb-0.5">Catatan / Remarks:</span>
        ${escapeHtml(item.remarks)}
      </div>
    `;
  }

  // Milestone Stepper Preview
  html += `
    <div class="pt-2">
      <h4 class="font-bold text-xs text-slate-800 mb-3 flex items-center gap-1.5">
        <span class="material-symbols-rounded text-blue-600 text-[18px]">timeline</span>
        Tracking Garis Progres Lapangan
      </h4>
      <div class="space-y-3 pl-2 border-l-2 border-blue-200 ml-2">
        <div class="relative pl-4">
          <div class="absolute -left-[13px] top-0 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow-xs"></div>
          <div class="font-bold text-xs text-slate-900">1. STIP &amp; Assignment</div>
          <div class="text-[11px] text-slate-400">Penugasan vendor dan administrasi master</div>
        </div>
        <div class="relative pl-4">
          <div class="absolute -left-[13px] top-0 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow-xs"></div>
          <div class="font-bold text-xs text-slate-900">2. APD &amp; Material Onsite</div>
          <div class="text-[11px] text-slate-400">Pengiriman material kabel, tiang, &amp; closure</div>
        </div>
        <div class="relative pl-4">
          <div class="absolute -left-[13px] top-0 w-4 h-4 rounded-full ${item.statusBadge === 'MATCH' ? 'bg-emerald-500' : 'bg-blue-600 animate-pulse'} border-2 border-white shadow-xs"></div>
          <div class="font-bold text-xs ${item.statusBadge === 'MATCH' ? 'text-slate-900' : 'text-blue-700'}">3. FO &amp; Civil Works (Instalasi Fisik)</div>
          <div class="text-[11px] text-slate-400">Penarikan kabel FO, galian trenching, penyambungan splicing</div>
        </div>
        <div class="relative pl-4">
          <div class="absolute -left-[13px] top-0 w-4 h-4 rounded-full ${item.statusBadge === 'MATCH' ? 'bg-emerald-500' : 'bg-slate-300'} border-2 border-white shadow-xs"></div>
          <div class="font-bold text-xs ${item.statusBadge === 'MATCH' ? 'text-emerald-700' : 'text-slate-400'}">4. OTDR Testing &amp; RFS</div>
          <div class="text-[11px] text-slate-400">Pengukuran redaman loss &amp; serah terima Ready For Service</div>
        </div>
      </div>
    </div>
  `;

  if (content) content.innerHTML = html;
  if (modal) modal.classList.remove('hidden');
}

function closeDetail() {
  const modal = document.getElementById('detailModal');
  if (modal) modal.classList.add('hidden');
}

// -------------------------------------------------------------------------
// FORM PENGAJUAN PROGRES LAPANGAN (LOCALSTORAGE + LIVE UPDATE)
// -------------------------------------------------------------------------
let currentFormTab = 'single';

function openGeneratorModal() {
  const modal = document.getElementById('generatorModal');
  if (modal) modal.classList.remove('hidden');
}

function closeGeneratorModal() {
  const modal = document.getElementById('generatorModal');
  if (modal) modal.classList.add('hidden');
}

function switchFormTab(tab) {
  currentFormTab = tab;
  const btnSingle = document.getElementById('btnTabSingle');
  const btnBulk = document.getElementById('btnTabBulk');
  const paneSingle = document.getElementById('paneSingle');
  const paneBulk = document.getElementById('paneBulk');

  if (tab === 'single') {
    btnSingle.className = 'px-3 py-1.5 font-bold rounded-lg bg-blue-50 text-blue-700 border border-blue-200';
    btnBulk.className = 'px-3 py-1.5 font-semibold rounded-lg text-slate-600 hover:bg-slate-100';
    paneSingle.classList.remove('hidden');
    paneBulk.classList.add('hidden');
  } else {
    btnBulk.className = 'px-3 py-1.5 font-bold rounded-lg bg-blue-50 text-blue-700 border border-blue-200';
    btnSingle.className = 'px-3 py-1.5 font-semibold rounded-lg text-slate-600 hover:bg-slate-100';
    paneBulk.classList.remove('hidden');
    paneSingle.classList.add('hidden');
  }
}

function submitFormPengajuan() {
  if (currentFormTab === 'single') {
    submitSingleForm();
  } else {
    submitBulkForm();
  }
}

function submitSingleForm() {
  const so = document.getElementById('singleSoNumber').value.trim();
  const site = document.getElementById('singleSiteName').value.trim();
  const op = document.getElementById('singleOperator').value;
  const kab = document.getElementById('singleKabupaten').value.trim() || 'SURABAYA';
  const mitra = document.getElementById('singleMitra').value.trim() || 'Mitra Jatim';
  const tahapan = document.getElementById('singleTahapan').value;
  const jenis = document.getElementById('singleJenis').value.trim() || 'FO Intersite CME';
  const tglAjuan = document.getElementById('singleTanggalPengajuan').value || new Date().toISOString().split('T')[0];
  const remarks = document.getElementById('singleRemarks').value.trim() || `Pengajuan progres ${tahapan} oleh ${mitra}`;

  if (!so || !site) {
    alert('Mohon lengkapi SO Number dan Nama Site sebelum mengirim!');
    return;
  }

  const newProject = {
    key: so,
    sonumb: so,
    siteName: site,
    operatorId: op,
    kabupaten: kab.toUpperCase(),
    mitra: mitra,
    jenis: jenis,
    tahapanMaster: 'CME',
    statusMaster: 'CME',
    tahapan: tahapan,
    statusApproval: 'Pending',
    approvedBy: '-',
    tanggalPengajuan: tglAjuan,
    tanggalApproval: '-',
    masterRfsDate: '-',
    rfiDate: '-',
    stipNumber: `STIP-${so.slice(-6)}/TBG/2026`,
    pm: 'Angen Cahya Asmara',
    waspang: '-',
    remarks: remarks,
    statusBadge: 'PENDING',
    finalStatus: 'DALAM_PROSES',
    approvedToday: false,
    projectYear: '2025-2026',
    hasTracking: true
  };

  saveSubmissions([newProject]);

  // Reset form fields
  document.getElementById('singleSoNumber').value = '';
  document.getElementById('singleSiteName').value = '';
  document.getElementById('singleRemarks').value = '';

  closeGeneratorModal();
  alert(`Sukses! Pengajuan SO ${so} (${tahapan}) berhasil dicatat dengan status 'Pending Approval'.`);
}

function submitBulkForm() {
  const raw = document.getElementById('genRawInput').value.trim();
  const tahapan = document.getElementById('genTahapan').value;
  const mitra = document.getElementById('genMitra').value.trim() || 'Mitra Jatim';
  const today = new Date().toISOString().split('T')[0];

  if (!raw) {
    alert('Mohon tempelkan baris data SO Number terlebih dahulu!');
    return;
  }

  const lines = raw.split(/\r?\n/);
  const newProjects = [];

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parts = trimmed.split('\t');
    if (parts.length < 2) parts = trimmed.split(/\s{2,}/);
    if (parts.length < 2) {
      const spaceIdx = trimmed.indexOf(' ');
      if (spaceIdx !== -1) parts = [trimmed.slice(0, spaceIdx), trimmed.slice(spaceIdx + 1)];
      else parts = [trimmed, `Site-${idx + 1}`];
    }

    const so = parts[0].trim();
    const site = parts[1] ? parts[1].trim() : `Site-${so.slice(-4)}`;

    newProjects.push({
      key: so,
      sonumb: so,
      siteName: site,
      operatorId: 'ISAT',
      kabupaten: 'SURABAYA',
      mitra: mitra,
      jenis: 'FO Intersite CME',
      tahapanMaster: 'CME',
      statusMaster: 'CME',
      tahapan: tahapan,
      statusApproval: 'Pending',
      approvedBy: '-',
      tanggalPengajuan: today,
      tanggalApproval: '-',
      masterRfsDate: '-',
      rfiDate: '-',
      stipNumber: `STIP-${so.slice(-6)}/TBG/2026`,
      pm: 'Angen Cahya Asmara',
      waspang: '-',
      remarks: `Pengajuan massal ${tahapan} oleh ${mitra}`,
      statusBadge: 'PENDING',
      finalStatus: 'DALAM_PROSES',
      approvedToday: false,
      projectYear: '2025-2026',
      hasTracking: true
    });
  });

  if (!newProjects.length) {
    alert('Tidak ada baris data valid yang terdeteksi.');
    return;
  }

  saveSubmissions(newProjects);
  document.getElementById('genRawInput').value = '';
  closeGeneratorModal();
  alert(`Berhasil! ${newProjects.length} pengajuan SO berhasil dicatat ke sistem tracking.`);
}

function saveSubmissions(newItems) {
  const savedLocal = JSON.parse(localStorage.getItem('tracking_cme_submissions') || '[]');
  const updatedLocal = [...newItems, ...savedLocal];
  localStorage.setItem('tracking_cme_submissions', JSON.stringify(updatedLocal));

  // Reload and refresh
  loadData();
}

// -------------------------------------------------------------------------
// UTILITIES
// -------------------------------------------------------------------------
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function formatDisplayDate(val) {
  if (!val || val === '-') return '-';
  if (val instanceof Date) {
    const d = String(val.getDate()).padStart(2, '0');
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const y = val.getFullYear();
    return `${d}/${m}/${y}`;
  }
  const s = String(val).trim();
  const ym = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ym) {
    return `${String(ym[3]).padStart(2, '0')}/${String(ym[2]).padStart(2, '0')}/${ym[1]}`;
  }
  return s;
}

function labelBadge(code) {
  return { MATCH: 'Match', GAP: 'Gap', PENDING: 'Pending Approval' }[code] || code || 'Pending';
}

function badgeClass(code) {
  return { MATCH: 'badge-match', GAP: 'badge-gap', PENDING: 'badge-pending' }[code] || 'badge-pending';
}
