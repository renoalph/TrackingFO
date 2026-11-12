/**
 * app.js — TBIG Logistics & Delivery Tracking Engine (Master-Detail Dribbble UI)
 */

const state = {
  shipments: [],
  filtered: [],
  activeId: null,
  activeFilter: 'ALL',
  searchQuery: '',
  activeTab: 'vehicle',
  map: null,
  mapRouteLayer: null
};

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  loadData();
  bindEvents();
});

// -------------------------------------------------------------------------
// 1. DATA LOADING
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

    if (state.shipments.length > 0 && !state.activeId) {
      state.activeId = state.shipments[0].id;
    }

    applyFilter();
  } catch (err) {
    console.error('Gagal memuat dataset pengiriman:', err);
  }
}

function saveShipmentsToLocal() {
  localStorage.setItem('tbig_shipments_data', JSON.stringify({ shipments: state.shipments }));
}

// -------------------------------------------------------------------------
// 2. FILTER & SEARCH
// -------------------------------------------------------------------------
function applyFilter() {
  let list = [...state.shipments];

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    list = list.filter(s =>
      s.sonumb.toLowerCase().includes(q) ||
      s.siteId.toLowerCase().includes(q) ||
      s.siteName.toLowerCase().includes(q) ||
      s.containerNo.toLowerCase().includes(q) ||
      s.vesselName.toLowerCase().includes(q) ||
      s.residence.toLowerCase().includes(q)
    );
  }

  if (state.activeFilter !== 'ALL') {
    list = list.filter(s => s.status === state.activeFilter);
  }

  state.filtered = list;

  // Update counts
  const totalCountEl = document.getElementById('count_ALL');
  if (totalCountEl) totalCountEl.innerText = state.shipments.length;

  // Pastikan activeId valid
  if (!state.filtered.find(s => s.id === state.activeId) && state.filtered.length > 0) {
    state.activeId = state.filtered[0].id;
  }

  renderShipmentCards();
  renderInspector();
}

function filterByStatus(statusKey) {
  state.activeFilter = statusKey;

  // Update button active styles
  ['ALL', 'IN_TRANSIT', 'PORT_ARRIVED', 'COMPLETED'].forEach(key => {
    const btn = document.getElementById(`filterBtn_${key}`);
    if (!btn) return;
    if (key === statusKey) {
      btn.className = 'px-3.5 py-1.5 rounded-full font-bold bg-[#1D3D8F] text-white whitespace-nowrap shadow-xs transition';
    } else {
      btn.className = 'px-3.5 py-1.5 rounded-full font-semibold bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 whitespace-nowrap transition';
    }
  });

  applyFilter();
}

// -------------------------------------------------------------------------
// 3. RENDER SHIPMENT CARDS (LEFT MASTER COLUMN)
// -------------------------------------------------------------------------
function renderShipmentCards() {
  const container = document.getElementById('shipmentCardsContainer');
  if (!container) return;

  if (!state.filtered.length) {
    container.innerHTML = `
      <div class="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">
        <span class="material-symbols-rounded text-3xl text-slate-300 mb-1">inbox</span>
        <p>Tidak ada pengiriman yang cocok.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.filtered.map(item => {
    const isActive = item.id === state.activeId;
    const progressPercent = calculateProgressPercent(item.currentStageIndex);
    const isSea = !item.shippingLine.includes('TRUCKING');
    const thumbImg = isSea ? 'asset/image/ship-color.png' : 'asset/image/cargo.png';

    // Mini 3-point timeline (Checking -> In Transit -> Delivered)
    const isStageChecking = item.currentStageIndex >= 1;
    const isStageTransit = item.currentStageIndex >= 2;
    const isStageDelivered = item.currentStageIndex >= 5;

    let badgeClass = 'badge-in-transit';
    if (item.status === 'COMPLETED') badgeClass = 'badge-delivered';
    if (item.status === 'PORT_ARRIVED') badgeClass = 'badge-checking';
    if (item.status === 'RISK_DELAY') badgeClass = 'badge-risk';

    return `
      <div class="shipment-card ${isActive ? 'active' : ''}" onclick="selectShipment('${item.id}')">
        <!-- Card Header -->
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-lg ${isActive ? 'bg-white/20' : 'bg-slate-100'} p-0.5 flex items-center justify-center shrink-0">
              <img src="${thumbImg}" alt="Vehicle" class="max-h-5 max-w-full object-contain">
            </div>
            <span class="font-mono font-bold text-xs ${isActive ? 'text-white' : 'text-slate-900'}">#${item.sonumb}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="badge-status ${isActive ? 'bg-white/20 text-white border border-white/30 backdrop-blur-xs' : badgeClass}">
              ${item.statusLabel}
            </span>
            <button class="text-slate-400 hover:text-slate-600 ${isActive ? 'text-white/70 hover:text-white' : ''}" onclick="event.stopPropagation();">
              <span class="material-symbols-rounded text-[18px]">more_vert</span>
            </button>
          </div>
        </div>

        <!-- Progress Bar -->
        <div class="w-full h-1.5 bg-slate-100 ${isActive ? 'bg-white/20' : ''} rounded-full overflow-hidden mb-3">
          <div class="h-full rounded-full transition-all duration-300 ${isActive ? 'bg-white' : 'bg-[#1D3D8F]'}" style="width: ${progressPercent}%;"></div>
        </div>

        <!-- Site & Vessel Info -->
        <div class="flex items-center justify-between text-[11px] mb-2.5 pb-2.5 border-b ${isActive ? 'border-white/15' : 'border-slate-100'}">
          <span class="font-semibold ${isActive ? 'text-white' : 'text-slate-800'} truncate max-w-[190px]">${item.siteName}</span>
          <span class="card-muted-text text-slate-500 font-medium">${item.vesselName}</span>
        </div>

        <!-- Mini Stepper Timeline (Sesuai gambar referensi) -->
        <div class="mini-stepper-wrap text-[11px]">
          <div class="mini-stepper-line ${isActive ? 'stepper-line' : ''}"></div>

          <!-- Step 1: Checking / Closing -->
          <div class="mini-stepper-item flex items-center justify-between">
            <div class="mini-stepper-dot ${isActive ? 'stepper-dot' : ''} ${isStageChecking ? 'done' : ''}"></div>
            <span class="${isStageChecking ? (isActive ? 'text-white font-semibold' : 'text-slate-800 font-semibold') : (isActive ? 'text-white/60' : 'text-slate-400')}">
              Depo Jamrud Closing
            </span>
            <span class="${isActive ? 'card-muted-text text-white/70' : 'text-slate-400'} text-[10px]">
              ${item.closingCargoDate ? item.closingCargoDate.split(' ')[0] : '25 Okt'}
            </span>
          </div>

          <!-- Step 2: In-Transit / Berlayar -->
          <div class="mini-stepper-item flex items-center justify-between">
            <div class="mini-stepper-dot ${isActive ? 'stepper-dot active-pulse' : ''} ${isStageTransit ? 'current' : ''}"></div>
            <span class="${isStageTransit ? (isActive ? 'text-white font-semibold' : 'text-slate-800 font-semibold') : (isActive ? 'text-white/60' : 'text-slate-400')}">
              Pelayaran Laut (Vessel)
            </span>
            <span class="${isActive ? 'card-muted-text text-white/70' : 'text-slate-400'} text-[10px]">
              ${item.atd ? item.atd.split(' ')[0] : '27 Okt'}
            </span>
          </div>

          <!-- Step 3: Delivered Site -->
          <div class="mini-stepper-item flex items-center justify-between">
            <div class="mini-stepper-dot ${isActive ? 'stepper-dot' : ''} ${isStageDelivered ? 'done' : ''}"></div>
            <span class="${isStageDelivered ? (isActive ? 'text-white font-semibold' : 'text-slate-800 font-semibold') : (isActive ? 'text-white/60' : 'text-slate-400')}">
              Tiba di Lokasi Site
            </span>
            <span class="${isActive ? 'card-muted-text text-white/70' : 'text-slate-400'} text-[10px]">
              ${item.etaSite ? item.etaSite.split(' ')[0] : '31 Okt'}
            </span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function calculateProgressPercent(stageIndex) {
  // 6 tahapan: 0 s/d 5
  const idx = Math.min(5, Math.max(0, stageIndex || 0));
  return Math.round(((idx + 1) / 6) * 100);
}

function selectShipment(id) {
  state.activeId = id;
  renderShipmentCards();
  renderInspector();
}

// -------------------------------------------------------------------------
// 4. RENDER INSPECTOR & MAP (RIGHT COLUMN)
// -------------------------------------------------------------------------
function renderInspector() {
  const item = state.shipments.find(s => s.id === state.activeId);
  if (!item) return;

  // Top Headers
  const orderHeader = document.getElementById('inspectorOrderHeader');
  const siteSub = document.getElementById('inspectorSiteSub');
  const statusBadge = document.getElementById('inspectorStatusBadge');
  const radarLink = document.getElementById('btnLiveRadar');

  if (orderHeader) orderHeader.innerText = `#${item.sonumb}`;
  if (siteSub) siteSub.innerText = `Site ${item.siteName} (${item.siteId}) · ${item.residence}, ${item.province}`;
  
  if (statusBadge) {
    statusBadge.innerText = item.statusLabel;
    statusBadge.className = `badge-status ${
      item.status === 'COMPLETED' ? 'badge-delivered' :
      item.status === 'PORT_ARRIVED' ? 'badge-checking' :
      item.status === 'RISK_DELAY' ? 'badge-risk' : 'badge-in-transit'
    }`;
  }

  if (radarLink) {
    radarLink.href = item.marineRadarUrl || 'https://www.marinetraffic.com/';
  }

  // Floating Metrics
  const metricLocation = document.getElementById('metricLocation');
  const metricSpeed = document.getElementById('metricSpeed');
  const metricEta = document.getElementById('metricEta');
  const metricLastUpdate = document.getElementById('metricLastUpdate');

  if (metricLocation) metricLocation.innerText = item.province.includes('Timur') ? 'Laut Sawu, NTT' : (item.province.includes('Bali') ? 'Selat Bali' : 'Laut Jawa');
  if (metricSpeed) metricSpeed.innerText = item.status === 'COMPLETED' ? '0.0 knots · Sandar' : '11.8 knots · Berlayar';
  if (metricEta) metricEta.innerText = `${item.etaSite ? item.etaSite.split(' ')[0] : '31 Okt'} (${item.status === 'COMPLETED' ? 'Done' : '1.5 Hari'})`;
  if (metricLastUpdate) metricLastUpdate.innerText = item.status === 'COMPLETED' ? 'Complete Verified' : '2 Jam lalu (AIS)';

  // Vehicle Tab Specs
  const specVesselName = document.getElementById('specVesselName');
  const specShippingLine = document.getElementById('specShippingLine');
  const specVoyage = document.getElementById('specVoyage');
  const specImo = document.getElementById('specImo');
  const specTowerHeight = document.getElementById('specTowerHeight');
  const specRoute = document.getElementById('specRoute');
  const containerTag = document.getElementById('vehicleContainerTag');
  const vehicleImg = document.getElementById('vehicleImageTag');
  const loadBadge = document.getElementById('vehicleLoadBadge');

  const isSea = !item.shippingLine.includes('TRUCKING');
  if (vehicleImg) {
    vehicleImg.src = isSea ? 'asset/image/ship-color.png' : 'asset/image/cargo.png';
    vehicleImg.alt = item.vesselName;
  }
  if (loadBadge) {
    loadBadge.innerText = item.towerHeight.includes('72') ? '92% TOWER LOAD' : '85% TOWER LOAD';
  }

  if (specVesselName) specVesselName.innerText = item.vesselName;
  if (specShippingLine) specShippingLine.innerText = `${item.shippingLine} · ${isSea ? 'General Cargo Vessel' : 'Armada Truk Ekspedisi'}`;
  if (specVoyage) specVoyage.innerText = item.voyage;
  if (specImo) specImo.innerText = item.imoNumber || '9301140';
  if (specTowerHeight) specTowerHeight.innerText = item.towerHeight;
  if (specRoute) specRoute.innerText = `${item.originPort.split('(')[0]} → ${item.destPort.split('(')[0]}`;
  if (containerTag) containerTag.innerText = item.containerNo;

  // Order Details Tab
  const detailSonumb = document.getElementById('detailSonumb');
  const detailSiteFullName = document.getElementById('detailSiteFullName');
  const detailAddress = document.getElementById('detailAddress');
  const detailMaterial = document.getElementById('detailMaterial');
  const detailOriginPort = document.getElementById('detailOriginPort');
  const detailDestPort = document.getElementById('detailDestPort');

  if (detailSonumb) detailSonumb.innerText = item.sonumb;
  if (detailSiteFullName) detailSiteFullName.innerText = `${item.siteName} (${item.siteId})`;
  if (detailAddress) detailAddress.innerText = item.address;
  if (detailMaterial) detailMaterial.innerText = item.materialType;
  if (detailOriginPort) detailOriginPort.innerText = item.originPort;
  if (detailDestPort) detailDestPort.innerText = item.destPort;

  // Driver & Vendor Tab
  const driverVendorName = document.getElementById('driverVendorName');
  if (driverVendorName) driverVendorName.innerText = item.moverVendor || 'PT. PGN Logistik Nusantara';

  // Journey Flow Tab (6 Tahap)
  renderFlowStages(item);

  // Update Map Route Focus
  updateMapRoute(item);
}

function renderFlowStages(item) {
  const container = document.getElementById('inspectorFlowStages');
  if (!container || !item.flowStages) return;

  const isSea = !item.shippingLine.includes('TRUCKING');
  const stageImages = [
    'asset/image/warehouse.png',
    'asset/image/craine.png',
    isSea ? 'asset/image/ship-color.png' : 'asset/image/cargo.png',
    'asset/image/craine.png',
    'asset/image/cargo.png',
    'asset/image/warehouse.png'
  ];

  container.innerHTML = item.flowStages.map((stage, idx) => {
    const isDone = stage.status === 'DONE';
    const isActive = stage.status === 'ACTIVE';
    const itemClass = isDone ? 'is-done' : (isActive ? 'is-active' : '');
    const illustration = stageImages[idx] || 'asset/image/cargo.png';

    return `
      <div class="journey-step-item ${itemClass}">
        <div class="journey-step-dot">
          ${isDone ? '<span class="material-symbols-rounded text-[16px]">check</span>' : stage.step}
        </div>
        <div class="journey-step-card flex items-start gap-3">
          <div class="w-11 h-11 rounded-xl bg-slate-50 border border-slate-200/90 p-1 flex items-center justify-center shrink-0 shadow-2xs">
            <img src="${illustration}" alt="Step Icon" class="max-h-8 max-w-full object-contain">
          </div>
          <div class="flex-1">
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
      </div>
    `;
  }).join('');
}

// -------------------------------------------------------------------------
// 5. INTERACTIVE MAP (LEAFLET + ESRI NO-API-KEY TILES)
// -------------------------------------------------------------------------
function initMap() {
  const mapContainer = document.getElementById('mainInspectorMap');
  if (!mapContainer || !window.L) return;

  state.map = L.map('mainInspectorMap', {
    zoomControl: true,
    scrollWheelZoom: false
  }).setView([-8.0, 116.0], 6);

  // Esri World Street Map (100% Free, No API Key Required)
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Maritime Track',
    maxZoom: 18
  }).addTo(state.map);

  state.mapRouteLayer = L.layerGroup().addTo(state.map);

  window.addEventListener('resize', () => {
    if (state.map) state.map.invalidateSize();
  });
}

function updateMapRoute(item) {
  if (!state.map || !state.mapRouteLayer || !item.originCoords || !item.destCoords) return;

  state.map.invalidateSize();
  state.mapRouteLayer.clearLayers();

  let routeColor = '#1D3D8F';
  if (item.status === 'IN_TRANSIT') routeColor = '#2798D5';
  if (item.status === 'COMPLETED') routeColor = '#10b981';
  if (item.status === 'RISK_DELAY') routeColor = '#e11d48';

  // 1. Maritime Route (Curved / Sea Polyline)
  const seaRoute = L.polyline([item.originCoords, item.destCoords], {
    color: routeColor,
    weight: 4,
    opacity: 0.9,
    dashArray: item.status === 'IN_TRANSIT' ? '6, 8' : null
  }).addTo(state.mapRouteLayer);

  // 2. Land Route to Site
  if (item.siteCoords) {
    L.polyline([item.destCoords, item.siteCoords], {
      color: '#64748b',
      weight: 2.5,
      opacity: 0.75,
      dashArray: '3, 6'
    }).addTo(state.mapRouteLayer);
  }

  // 3. Origin Port Marker
  L.circleMarker(item.originCoords, {
    radius: 7,
    fillColor: '#1D3D8F',
    color: '#ffffff',
    weight: 2.5,
    fillOpacity: 1
  }).addTo(state.mapRouteLayer).bindTooltip(`<b>Pelabuhan Muat</b><br>${item.originPort}`);

  // 4. Dest Port Marker
  L.circleMarker(item.destCoords, {
    radius: 7,
    fillColor: '#2798D5',
    color: '#ffffff',
    weight: 2.5,
    fillOpacity: 1
  }).addTo(state.mapRouteLayer).bindTooltip(`<b>Pelabuhan Tujuan</b><br>${item.destPort}`);

  // 5. Site Destination Marker
  if (item.siteCoords) {
    const siteMarker = L.circleMarker(item.siteCoords, {
      radius: 8,
      fillColor: item.status === 'COMPLETED' ? '#10b981' : '#e11d48',
      color: '#ffffff',
      weight: 3,
      fillOpacity: 1
    }).addTo(state.mapRouteLayer);

    siteMarker.bindPopup(`
      <div class="font-sans text-xs">
        <div class="font-bold text-[#1D3D8F]">Site ${item.siteName} (${item.siteId})</div>
        <div class="text-[11px] text-slate-600">SO: <b>${item.sonumb}</b> · ${item.towerHeight}</div>
        <div class="text-[11px] text-slate-600">Kapal: <b>${item.vesselName}</b></div>
        <div class="text-[11px] font-semibold text-emerald-700 mt-1">ETA Site: ${item.etaSite}</div>
      </div>
    `);
  }

  // Smooth Bounds Fit
  const bounds = L.latLngBounds([item.originCoords, item.destCoords]);
  if (item.siteCoords) bounds.extend(item.siteCoords);
  state.map.fitBounds(bounds, { padding: [40, 40] });
}

// -------------------------------------------------------------------------
// 6. MAIN INFO TAB SWITCHING
// -------------------------------------------------------------------------
function switchTab(tabKey) {
  state.activeTab = tabKey;

  ['vehicle', 'flow', 'details', 'driver'].forEach(key => {
    const btn = document.getElementById(`tabBtn_${key}`);
    const pane = document.getElementById(`tabContent_${key}`);
    if (btn) btn.classList.toggle('active', key === tabKey);
    if (pane) pane.classList.toggle('hidden', key !== tabKey);
  });
}

// -------------------------------------------------------------------------
// 7. MODAL SUBMISSIONS & DOCUMENTATION
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
  const shippingLine = document.getElementById('newShippingLine').value;
  const vesselName = document.getElementById('newVesselName').value.trim() || 'KM. Prakasa Pacific';
  const originPort = document.getElementById('newOriginPort').value;
  const destPort = document.getElementById('newDestPort').value;
  const etd = document.getElementById('newEtd').value || '2026-11-15 10:00';
  const etaPort = document.getElementById('newEtaPort').value || '2026-11-18 14:00';
  const etaSite = document.getElementById('newEtaSite').value || '2026-11-20 16:00';

  let originCoords = [-7.1983, 112.7335];
  if (originPort.includes('Jakarta')) originCoords = [-6.1038, 106.8833];

  let destCoords = [-9.6481, 120.2608];
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
    address: 'Lokasi Proyek Site ' + siteName,
    materialType: 'Tower Section & Accessories',
    containerNo: containerNo,
    originPort: originPort,
    destPort: destPort,
    originCoords: originCoords,
    destCoords: destCoords,
    siteCoords: [destCoords[0] + (Math.random() - 0.5) * 0.1, destCoords[1] + (Math.random() - 0.5) * 0.1],
    shippingLine: shippingLine,
    vesselName: vesselName,
    voyage: 'Voy. 101/N',
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
    statusLabel: 'In Transit',
    flowStages: [
      { step: 1, title: 'Pick-up Pabrik & Closing Depo', location: originPort, date: etd, status: 'DONE', desc: 'Material lolos proses gate-in depo dermaga.' },
      { step: 2, title: 'Cast Off Keberangkatan Kapal', location: originPort, date: etd, status: 'DONE', desc: `${vesselName} bertolak menuju pelabuhan tujuan.` },
      { step: 3, title: 'Pelayaran Laut Jalur Tol Laut', location: 'Perairan Indonesia', date: etd + ' - ' + etaPort, status: 'ACTIVE', desc: 'Kapal sedang berlayar menuju pelabuhan tujuan.' },
      { step: 4, title: 'Tiba di Pelabuhan Tujuan', location: destPort, date: etaPort, status: 'PENDING', desc: 'Antrean proses bongkar muat kontainer.' },
      { step: 5, title: 'Trucking Mover Darat ke Site', location: residence, date: etaPort, status: 'PENDING', desc: 'Pengiriman darat menuju titik koordinat site.' },
      { step: 6, title: 'Tiba Lengkap di Lokasi Site', location: siteName, date: etaSite, status: 'PENDING', desc: 'Serah terima material dengan waspang/PM TBIG.' }
    ],
    marineRadarUrl: `https://www.marinetraffic.com/en/ais/details/ships/vessel:${vesselName.replace(/\s+/g, '_').toUpperCase()}`,
    evidenceNote: 'Input baru dari TBIG Logistics Delivery Portal.'
  };

  state.shipments.unshift(newEntry);
  state.activeId = newEntry.id;
  saveShipmentsToLocal();
  closeNewShipmentModal();
  applyFilter();
  alert(`✅ Pengiriman baru untuk Site ${siteName} (${so}) berhasil ditambahkan!`);
}

function openEvidenceModal() {
  const item = state.shipments.find(s => s.id === state.activeId);
  if (!item) return;

  const modal = document.getElementById('evidenceModal');
  const content = document.getElementById('evidenceContent');
  if (!modal || !content) return;

  content.innerHTML = `
    <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
      <div class="font-bold text-slate-800 mb-1">Catatan Evidence Lapangan:</div>
      <p class="text-slate-600">${item.evidenceNote || 'Belum ada catatan evidence khusus.'}</p>
    </div>
    <div class="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900">
      <div class="font-bold mb-0.5">Surat Jalan &amp; Seal Kontainer:</div>
      <div>No. Kontainer: <b>${item.containerNo}</b> (${item.shippingLine})</div>
      <div>Kapal: <b>${item.vesselName}</b> (${item.voyage})</div>
    </div>
  `;

  modal.classList.remove('hidden');
}

function closeEvidenceModal() {
  const modal = document.getElementById('evidenceModal');
  if (modal) modal.classList.add('hidden');
}

// -------------------------------------------------------------------------
// 8. BIND EVENTS
// -------------------------------------------------------------------------
function bindEvents() {
  const searchInput = document.getElementById('shipmentSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      state.searchQuery = this.value.trim();
      applyFilter();
    });
  }

  const form = document.getElementById('newShipmentForm');
  if (form) {
    form.addEventListener('submit', submitNewShipment);
  }
}
