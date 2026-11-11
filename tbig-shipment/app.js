/**
 * app.js — TBIG Logistics & Expedition Shipment Monitoring Engine
 * Features:
 * 1. KPI Dashboard & Real-Time Maritime Shipment Status
 * 2. Interactive Leaflet.js Vessel Route Map (Surabaya - Bali - NTB - NTT - Kalimantan)
 * 3. Interactive Milestone Journey Flow Stepper (Origin -> Port -> Vessel -> Dest Port -> Mover -> Site)
 * 4. AIS MarineTraffic Live Vessel Radar Link
 * 5. New Shipment Input Form
 */

const state = {
  shipments: [],
  filtered: [],
  selectedShipment: null,
  map: null,
  mapLayerGroup: null,
  activeFilter: 'ALL',
  searchQuery: ''
};

document.addEventListener('DOMContentLoaded', () => {
  startLiveClock();
  initMap();
  loadData();
  bindEvents();
});

// -------------------------------------------------------------------------
// 1. LIVE WIB CLOCK
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

// -------------------------------------------------------------------------
// 2. DATA MANAGEMENT (JSON + LOCALSTORAGE)
// -------------------------------------------------------------------------
async function loadData() {
  try {
    const saved = localStorage.getItem('tbig_shipments_data');
    if (saved) {
      const parsed = JSON.parse(saved);
      state.shipments = parsed.shipments || [];
    } else {
      const res = await fetch('data/shipments.json');
      const data = await res.json();
      state.shipments = data.shipments || [];
      localStorage.setItem('tbig_shipments_data', JSON.stringify(data));
    }

    applyFilterAndRender();
  } catch (err) {
    console.error('Gagal memuat dataset pengiriman:', err);
  }
}

function saveShipmentsToLocal() {
  localStorage.setItem('tbig_shipments_data', JSON.stringify({ shipments: state.shipments }));
}

function applyFilterAndRender() {
  let list = [...state.shipments];

  // Search Filter
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    list = list.filter(s => 
      s.sonumb.toLowerCase().includes(q) ||
      s.siteId.toLowerCase().includes(q) ||
      s.siteName.toLowerCase().includes(q) ||
      s.containerNo.toLowerCase().includes(q) ||
      s.vesselName.toLowerCase().includes(q) ||
      s.shippingLine.toLowerCase().includes(q) ||
      s.residence.toLowerCase().includes(q)
    );
  }

  // Status Filter
  if (state.activeFilter !== 'ALL') {
    list = list.filter(s => s.status === state.activeFilter);
  }

  state.filtered = list;
  renderKPI();
  renderTable();
  updateMapMarkers();
}

// -------------------------------------------------------------------------
// 3. KPI CARDS
// -------------------------------------------------------------------------
function renderKPI() {
  const total = state.shipments.length;
  const inTransit = state.shipments.filter(s => s.status === 'IN_TRANSIT').length;
  const portArrived = state.shipments.filter(s => s.status === 'PORT_ARRIVED').length;
  const completed = state.shipments.filter(s => s.status === 'COMPLETED').length;
  const riskDelay = state.shipments.filter(s => s.status === 'RISK_DELAY').length;

  const kpis = [
    { key: 'ALL', label: 'Total Pengiriman', val: total, icon: 'inventory_2', iconColor: '#1D3D8F', bg: '#f0f7fc', border: '#d0e7f7', sub: 'Monitoring Logistik Tower' },
    { key: 'IN_TRANSIT', label: 'Sedang Berlayar', val: inTransit, icon: 'directions_boat', iconColor: '#2798D5', bg: '#f0f9ff', border: '#bae6fd', sub: 'Dalam Jalur Pelayaran' },
    { key: 'PORT_ARRIVED', label: 'Tiba di Pelabuhan', val: portArrived, icon: 'anchor', iconColor: '#6d28d9', bg: '#f5f3ff', border: '#ddd6fe', sub: 'Antrean Bongkar Muat' },
    { key: 'COMPLETED', label: 'Tiba Lengkap di Site', val: completed, icon: 'task_alt', iconColor: '#15803d', bg: '#f0fdf4', border: '#bbf7d0', sub: 'Serah Terima Waspang' },
    { key: 'RISK_DELAY', label: 'Risiko Terlambat', val: riskDelay, icon: 'warning', iconColor: '#be123c', bg: '#fff1f2', border: '#fecdd3', sub: 'Perlu Eskalasi Segera' }
  ];

  const grid = document.getElementById('kpiGrid');
  if (!grid) return;

  grid.innerHTML = kpis.map(k => `
    <div class="kpi-card cursor-pointer group ${state.activeFilter === k.key ? 'border-[#1D3D8F] shadow-sm' : ''}" 
         onclick="setFilter('${k.key}')" title="Filter ${k.label}">
      <div class="flex items-center justify-between">
        <div class="kpi-icon" style="background:${k.bg}; color:${k.iconColor}; border-color:${k.border};">
          <span class="material-symbols-rounded">${k.icon}</span>
        </div>
        <span class="material-symbols-rounded text-slate-300 group-hover:text-[#2798D5] text-[15px] transition-colors">arrow_outward</span>
      </div>
      <div class="kpi-value mt-1.5">${k.val}</div>
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-sub">${k.sub}</div>
    </div>
  `).join('');
}

function setFilter(statusKey) {
  state.activeFilter = statusKey;
  applyFilterAndRender();
}

// -------------------------------------------------------------------------
// 4. INTERACTIVE LEAFLET.JS MARITIME MAP
// -------------------------------------------------------------------------
function initMap() {
  const mapContainer = document.getElementById('shipmentMap');
  if (!mapContainer || !window.L) return;

  // Center on Indonesia (Java Sea / Flores / Bali)
  state.map = L.map('shipmentMap', {
    zoomControl: true,
    scrollWheelZoom: false
  }).setView([-8.0, 116.0], 6);

  // Clean CartoDB Positron TileLayer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 18
  }).addTo(state.map);

  state.mapLayerGroup = L.layerGroup().addTo(state.map);
}

function updateMapMarkers() {
  if (!state.map || !state.mapLayerGroup) return;
  state.mapLayerGroup.clearLayers();

  state.filtered.forEach(item => {
    if (!item.originCoords || !item.destCoords) return;

    // Route Colors based on status
    let routeColor = '#1D3D8F'; // Default Navy
    if (item.status === 'IN_TRANSIT') routeColor = '#2798D5';
    if (item.status === 'RISK_DELAY') routeColor = '#e11d48';
    if (item.status === 'COMPLETED') routeColor = '#10b981';

    // 1. Sea Route Polyline
    const seaPath = L.polyline([item.originCoords, item.destCoords], {
      color: routeColor,
      weight: 3.5,
      opacity: 0.85,
      dashArray: item.status === 'IN_TRANSIT' ? '6, 8' : null
    }).addTo(state.mapLayerGroup);

    seaPath.bindTooltip(`<b>${item.vesselName}</b> (${item.shippingLine})<br>${item.originPort} &rarr; ${item.destPort}`);

    // 2. Land Route to Site Polyline (if site coords present)
    if (item.siteCoords) {
      L.polyline([item.destCoords, item.siteCoords], {
        color: '#64748b',
        weight: 2.5,
        opacity: 0.7,
        dashArray: '3, 6'
      }).addTo(state.mapLayerGroup);
    }

    // 3. Origin Port Marker
    L.circleMarker(item.originCoords, {
      radius: 6,
      fillColor: '#1D3D8F',
      color: '#ffffff',
      weight: 2,
      fillOpacity: 1
    }).addTo(state.mapLayerGroup).bindTooltip(`<b>Pelabuhan Asal</b><br>${item.originPort}`);

    // 4. Destination Port Marker
    L.circleMarker(item.destCoords, {
      radius: 6,
      fillColor: '#2798D5',
      color: '#ffffff',
      weight: 2,
      fillOpacity: 1
    }).addTo(state.mapLayerGroup).bindTooltip(`<b>Pelabuhan Tujuan</b><br>${item.destPort}`);

    // 5. Site Destination Marker
    if (item.siteCoords) {
      const siteMarker = L.circleMarker(item.siteCoords, {
        radius: 7,
        fillColor: item.status === 'COMPLETED' ? '#10b981' : '#e11d48',
        color: '#ffffff',
        weight: 2.5,
        fillOpacity: 1
      }).addTo(state.mapLayerGroup);

      siteMarker.bindPopup(`
        <div class="font-sans">
          <div class="font-bold text-xs text-[#1D3D8F] mb-1">Site ${item.siteName} (${item.siteId})</div>
          <div class="text-[11px] text-slate-600 mb-1">SO: <b>${item.sonumb}</b> · ${item.towerHeight}</div>
          <div class="text-[11px] text-slate-600 mb-1">Kapal: <b>${item.vesselName}</b> (${item.shippingLine})</div>
          <div class="text-[11px] font-semibold ${item.status === 'RISK_DELAY' ? 'text-rose-600' : 'text-slate-800'}">Status: ${item.statusLabel}</div>
          <button onclick="openDetailModal('${item.id}')" class="mt-2 w-full py-1 bg-[#1D3D8F] text-white rounded text-[10.5px] font-semibold">Buka Flow Perjalanan</button>
        </div>
      `);
    }
  });
}

// -------------------------------------------------------------------------
// 5. SHIPMENT TABLE
// -------------------------------------------------------------------------
function renderTable() {
  const tbody = document.getElementById('shipmentTableBody');
  const countEl = document.getElementById('shipmentCount');
  if (!tbody) return;

  if (countEl) countEl.innerText = `(${state.filtered.length} pengiriman)`;

  if (!state.filtered.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="p-8 text-center text-slate-400">
          <span class="material-symbols-rounded text-3xl mb-1 text-slate-300">directions_boat</span>
          <p>Tidak ada pengiriman yang sesuai filter atau pencarian.</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = state.filtered.map(s => `
    <tr class="row-clickable border-b border-slate-100 hover:bg-slate-50/80 transition" onclick="openDetailModal('${s.id}')">
      <td class="p-3 font-mono font-bold text-xs text-slate-900">${s.sonumb}</td>
      <td class="p-3">
        <div class="font-bold text-xs text-slate-900">${s.siteName}</div>
        <div class="text-[11px] text-slate-400">${s.siteId} · ${s.residence}</div>
      </td>
      <td class="p-3">
        <div class="font-mono font-semibold text-xs text-[#1D3D8F]">${s.containerNo}</div>
        <div class="text-[11px] text-slate-500">${s.materialType}</div>
      </td>
      <td class="p-3">
        <div class="font-bold text-xs text-slate-800">${s.vesselName}</div>
        <div class="text-[11px] text-slate-400">${s.shippingLine} · ${s.voyage}</div>
      </td>
      <td class="p-3 text-xs text-slate-700">
        <div class="font-medium">${s.originPort.split('(')[0]}</div>
        <div class="text-slate-400 text-[11px]">&rarr; ${s.destPort.split('(')[0]}</div>
      </td>
      <td class="p-3 text-xs text-slate-600">
        <div>ETD: <b>${formatSimpleDate(s.etd)}</b></div>
        <div class="text-slate-400 text-[11px]">ETA: ${formatSimpleDate(s.etaPort)}</div>
      </td>
      <td class="p-3 text-xs font-semibold text-slate-900">
        ${formatSimpleDate(s.etaSite)}
      </td>
      <td class="p-3">
        <span class="badge ${s.statusClass}">
          ${s.status === 'IN_TRANSIT' ? '<span class="w-1.5 h-1.5 rounded-full bg-[#1D3D8F] animate-pulse"></span>' : ''}
          ${s.statusLabel}
        </span>
      </td>
      <td class="p-3 text-right" onclick="event.stopPropagation()">
        <div class="flex items-center justify-end gap-1.5">
          <button onclick="openDetailModal('${s.id}')" class="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 transition" title="Lihat Flow Milestone">
            <span class="material-symbols-rounded text-[15px]">timeline</span>
            Detail Flow
          </button>
          ${s.marineRadarUrl ? `
            <a href="${s.marineRadarUrl}" target="_blank" class="px-2 py-1 rounded bg-[#f0f7fc] hover:bg-[#e0f0fa] text-[#1D3D8F] border border-[#bae6fd] text-xs font-semibold flex items-center gap-1 transition" title="Cek Radar AIS Kapal">
              <span class="material-symbols-rounded text-[15px]">radar</span>
              Radar
            </a>
          ` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

// -------------------------------------------------------------------------
// 6. MODAL DETAIL WITH MILESTONE JOURNEY FLOW STEPPER
// -------------------------------------------------------------------------
function openDetailModal(id) {
  const item = state.shipments.find(s => s.id === id);
  if (!item) return;

  state.selectedShipment = item;
  const modal = document.getElementById('detailModal');
  const title = document.getElementById('modalDetailTitle');
  const content = document.getElementById('modalDetailContent');

  if (title) title.innerText = `Flow Perjalanan Material · ${item.siteName} (${item.sonumb})`;

  // Render Header Info & Interactive Stepper
  content.innerHTML = `
    <!-- Top Summary Banner -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
      <div>
        <div class="text-[10px] text-slate-400 uppercase font-semibold">Nomor SO &amp; Site</div>
        <div class="font-bold text-slate-900 mt-0.5">${item.sonumb}</div>
        <div class="text-[11px] text-slate-500">${item.siteName} · ${item.towerHeight}</div>
      </div>
      <div>
        <div class="text-[10px] text-slate-400 uppercase font-semibold">Kontainer &amp; Muatan</div>
        <div class="font-mono font-bold text-[#1D3D8F] mt-0.5">${item.containerNo}</div>
        <div class="text-[11px] text-slate-500">${item.materialType}</div>
      </div>
      <div>
        <div class="text-[10px] text-slate-400 uppercase font-semibold">Kapal &amp; Pelayaran</div>
        <div class="font-bold text-slate-900 mt-0.5">${item.vesselName}</div>
        <div class="text-[11px] text-slate-500">${item.shippingLine} (${item.voyage})</div>
      </div>
      <div>
        <div class="text-[10px] text-slate-400 uppercase font-semibold">Status &amp; Estimasi Tiba Site</div>
        <div class="mt-0.5">
          <span class="badge ${item.statusClass}">${item.statusLabel}</span>
        </div>
        <div class="text-[11px] font-bold text-slate-800 mt-1">ETA: ${formatSimpleDate(item.etaSite)}</div>
      </div>
    </div>

    <!-- AIS Marine Radar Quick Access Bar -->
    <div class="flex items-center justify-between p-3.5 rounded-xl bg-[#f0f7fc] border border-[#bae6fd]">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg bg-[#1D3D8F] text-white flex items-center justify-center">
          <span class="material-symbols-rounded text-[18px]">radar</span>
        </div>
        <div>
          <div class="font-bold text-xs text-[#1D3D8F]">Live Marine Radar Tracker (AIS Satelit)</div>
          <div class="text-[11px] text-slate-500">Pantau koordinat GPS live kapal <b>${item.vesselName}</b> di laut bebas</div>
        </div>
      </div>
      <a href="${item.marineRadarUrl}" target="_blank" 
         class="px-3.5 py-1.5 bg-[#1D3D8F] hover:bg-[#152e6d] text-white text-xs font-semibold rounded-lg shadow-xs flex items-center gap-1.5 transition">
        <span>Buka MarineTraffic</span>
        <span class="material-symbols-rounded text-[15px]">open_in_new</span>
      </a>
    </div>

    <!-- Visual Milestone Journey Stepper -->
    <div class="mt-2">
      <div class="flex items-center justify-between mb-4">
        <h4 class="font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
          <span class="material-symbols-rounded text-[#1D3D8F] text-[18px]">alt_route</span>
          Alur Progres Pengiriman Material (Step-by-Step)
        </h4>
        <span class="text-xs text-slate-400">Total 6 Tahapan Operasional</span>
      </div>

      <div class="journey-stepper">
        ${item.flowStages.map(stage => {
          const isDone = stage.status === 'DONE';
          const isActive = stage.status === 'ACTIVE';
          const itemClass = isDone ? 'is-done' : (isActive ? 'is-active' : '');

          return `
            <div class="journey-step-item ${itemClass}">
              <div class="journey-step-dot">
                ${isDone ? '<span class="material-symbols-rounded text-[16px]">check</span>' : stage.step}
              </div>
              <div class="journey-step-card">
                <div class="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-xs ${isActive ? 'text-[#1D3D8F]' : 'text-slate-900'}">${stage.title}</span>
                    <span class="text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                      isDone ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      isActive ? 'bg-[#f0f7fc] text-[#1D3D8F] border border-[#bae6fd]' :
                      'bg-slate-100 text-slate-500'
                    }">
                      ${isDone ? 'Selesai' : (isActive ? 'Sedang Berjalan' : 'Menunggu')}
                    </span>
                  </div>
                  <div class="text-[11px] font-semibold text-slate-500">${stage.date}</div>
                </div>
                <div class="text-[11px] text-slate-600 mb-1 flex items-center gap-1">
                  <span class="material-symbols-rounded text-slate-400 text-[14px]">location_on</span>
                  ${stage.location}
                </div>
                <p class="text-xs text-slate-500 leading-relaxed">${stage.desc}</p>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- Evidence Note / Catatan Lapangan -->
    ${item.evidenceNote ? `
      <div class="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
        <span class="material-symbols-rounded text-amber-600 text-[18px] shrink-0">fact_check</span>
        <div>
          <b>Catatan Evidence Lapangan:</b> ${item.evidenceNote}
        </div>
      </div>
    ` : ''}
  `;

  if (modal) modal.classList.remove('hidden');
}

function closeDetailModal() {
  const modal = document.getElementById('detailModal');
  if (modal) modal.classList.add('hidden');
}

// -------------------------------------------------------------------------
// 7. NEW SHIPMENT SUBMISSION
// -------------------------------------------------------------------------
function openNewShipmentModal() {
  const modal = document.getElementById('newShipmentModal');
  if (modal) modal.classList.remove('hidden');
}

function closeNewShipmentModal() {
  const modal = document.getElementById('newShipmentModal');
  if (modal) modal.classList.add('hidden');
}

function submitNewShipment(e) {
  e.preventDefault();

  const so = document.getElementById('newSoNumber').value.trim();
  const siteId = document.getElementById('newSiteId').value.trim();
  const siteName = document.getElementById('newSiteName').value.trim();
  const height = document.getElementById('newTowerHeight').value.trim() || 'SST 72 M';
  const province = document.getElementById('newProvince').value.trim() || 'Nusa Tenggara Timur';
  const residence = document.getElementById('newResidence').value.trim() || 'Waingapu';
  const containerNo = document.getElementById('newContainerNo').value.trim() || 'MSPU ' + Math.floor(100000 + Math.random() * 900000) + '-1';
  const material = document.getElementById('newMaterialType').value.trim() || 'Tower Section';
  const shippingLine = document.getElementById('newShippingLine').value;
  const vesselName = document.getElementById('newVesselName').value.trim() || 'KM. Prakasa Pacific';
  const voyage = document.getElementById('newVoyage').value.trim() || 'Voy. 101';
  const originPort = document.getElementById('newOriginPort').value;
  const destPort = document.getElementById('newDestPort').value;
  const etd = document.getElementById('newEtd').value || '2026-11-15 10:00';
  const etaPort = document.getElementById('newEtaPort').value || '2026-11-18 14:00';
  const etaSite = document.getElementById('newEtaSite').value || '2026-11-20 16:00';

  if (!so || !siteName) {
    alert('Mohon isi Nomor SO dan Nama Site!');
    return;
  }

  // Koordinat pelabuhan default
  let originCoords = [-7.1983, 112.7335]; // Surabaya Jamrud
  if (originPort.includes('Jakarta')) originCoords = [-6.1038, 106.8833];

  let destCoords = [-9.6481, 120.2608]; // Waingapu
  if (destPort.includes('Lembar')) destCoords = [-8.7297, 116.0719];
  if (destPort.includes('Tenau')) destCoords = [-10.1889, 123.5414];
  if (destPort.includes('Dwikora')) destCoords = [-0.0263, 109.3425];
  if (destPort.includes('Gilimanuk')) destCoords = [-8.1633, 114.4397];

  const newEntry = {
    id: 'SHP-' + Date.now(),
    sonumb: so,
    siteId: siteId || 'SITE-' + so.slice(-4),
    siteName: siteName,
    towerHeight: height,
    province: province,
    residence: residence,
    address: 'Lokasi Proyek ' + siteName,
    materialType: material,
    containerNo: containerNo,
    originPort: originPort,
    destPort: destPort,
    originCoords: originCoords,
    destCoords: destCoords,
    siteCoords: [destCoords[0] + (Math.random() - 0.5) * 0.1, destCoords[1] + (Math.random() - 0.5) * 0.1],
    shippingLine: shippingLine,
    vesselName: vesselName,
    voyage: voyage,
    imoNumber: '9301140',
    moverVendor: 'PT. PGN Logistik Nusantara',
    closingCargoDate: etd,
    etd: etd,
    atd: etd,
    etaPort: etaPort,
    ataPort: null,
    etaSite: etaSite,
    currentStageIndex: 2,
    status: 'IN_TRANSIT',
    statusLabel: 'Sedang Berlayar',
    statusClass: 'badge-transit',
    flowStages: [
      { step: 1, title: 'Pick-up Pabrik & Closing Depo', location: originPort, date: etd, status: 'DONE', desc: 'Material lolos proses gate-in depo pelabuhan.' },
      { step: 2, title: 'Cast Off Keberangkatan Kapal', location: originPort, date: etd, status: 'DONE', desc: `${vesselName} bertolak menuju ${destPort}.` },
      { step: 3, title: 'Pelayaran Laut Jalur Tol Laut', location: 'Perairan Indonesia', date: etd + ' - ' + etaPort, status: 'ACTIVE', desc: 'Kapal sedang berlayar menuju pelabuhan tujuan.' },
      { step: 4, title: 'Tiba di Pelabuhan Tujuan', location: destPort, date: etaPort, status: 'PENDING', desc: 'Antrean proses bongkar muat kontainer.' },
      { step: 5, title: 'Trucking Mover Darat ke Site', location: residence, date: etaPort, status: 'PENDING', desc: 'Pengiriman darat menuju titik koordinat site.' },
      { step: 6, title: 'Tiba Lengkap di Lokasi Site', location: siteName, date: etaSite, status: 'PENDING', desc: 'Serah terima material dengan waspang/PM TBIG.' }
    ],
    marineRadarUrl: `https://www.marinetraffic.com/en/ais/details/ships/vessel:${vesselName.replace(/\s+/g, '_').toUpperCase()}`,
    evidenceNote: 'Input baru via TBIG Logistics Portal.'
  };

  state.shipments.unshift(newEntry);
  saveShipmentsToLocal();
  closeNewShipmentModal();
  applyFilterAndRender();
  alert(`✅ Pengiriman baru untuk Site ${siteName} (${so}) berhasil disimpan!`);
}

// -------------------------------------------------------------------------
// 8. EVENT BINDINGS & SEARCH
// -------------------------------------------------------------------------
function bindEvents() {
  const searchInput = document.getElementById('shipmentSearch');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      state.searchQuery = this.value.trim();
      applyFilterAndRender();
    });
  }

  const form = document.getElementById('newShipmentForm');
  if (form) {
    form.addEventListener('submit', submitNewShipment);
  }
}

function formatSimpleDate(val) {
  if (!val) return '-';
  const parts = val.split(' ');
  return parts[0];
}
