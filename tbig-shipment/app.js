/**
 * app.js — Delivery & Vessel Tracking Engine (Master-Detail UI)
 */

const state = {
  shipments: [],
  filtered: [],
  activeId: null,
  activeFilter: 'ALL',
  searchQuery: '',
  activeTab: 'vehicle',
  map: null,
  mapRouteLayer: null,
  tileLayer: null
};

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initMap();
  loadData();
  bindEvents();
});

// -------------------------------------------------------------------------
// 1. DATA LOADING
// -------------------------------------------------------------------------
async function loadData() {
  try {
    const saved = localStorage.getItem('shipments_tracker_data') || localStorage.getItem('tbig_shipments_data');
    if (saved) {
      const parsed = JSON.parse(saved);
      state.shipments = parsed.shipments || [];
    } else {
      const res = await fetch('data/shipments.json');
      const data = await res.json();
      state.shipments = data.shipments || [];
      localStorage.setItem('shipments_tracker_data', JSON.stringify(data));
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
  localStorage.setItem('shipments_tracker_data', JSON.stringify({ shipments: state.shipments }));
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
            <button class="w-6 h-6 rounded-md hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition ${isActive ? 'text-white/80 hover:text-white hover:bg-white/15' : ''}" onclick="toggleCardActionMenu(event, '${item.id}')" title="Menu Opsi Pengiriman">
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
    statusBadge.className = `badge-status ${item.status === 'COMPLETED' ? 'badge-delivered' :
        item.status === 'PORT_ARRIVED' ? 'badge-checking' :
          item.status === 'RISK_DELAY' ? 'badge-risk' : 'badge-in-transit'
      }`;
  }

  if (radarLink) {
    radarLink.href = item.marineRadarUrl || 'https://www.marinetraffic.com/';
  }

  // Floating Map Status Pill (Data Riil & Esensial)
  const metricLocation = document.getElementById('metricLocation');
  const metricEta = document.getElementById('metricEta');

  if (metricLocation) {
    if (item.status === 'COMPLETED') {
      metricLocation.innerText = `Site ${item.siteName}`;
    } else if (item.status === 'PORT_ARRIVED') {
      metricLocation.innerText = item.destPort ? item.destPort.split('(')[0].trim() : 'Pelabuhan Tujuan';
    } else {
      metricLocation.innerText = item.province.includes('Timur') ? 'Laut Sawu, NTT' : (item.province.includes('Bali') ? 'Selat Bali' : 'Laut Jawa');
    }
  }

  if (metricEta) {
    if (item.status === 'COMPLETED') {
      metricEta.innerText = 'Selesai (Tiba di Site)';
    } else {
      metricEta.innerText = item.etaSite ? item.etaSite.split(' ')[0] : (item.etaPort ? item.etaPort.split(' ')[0] : '-');
    }
  }

  // Vehicle Tab Specs
  const specVesselName = document.getElementById('specVesselName');
  const specShippingLine = document.getElementById('specShippingLine');
  const specVoyage = document.getElementById('specVoyage');
  const specImo = document.getElementById('specImo');
  const specTowerHeight = document.getElementById('specTowerHeight');
  const specRoute = document.getElementById('specRoute');
  const containerTag = document.getElementById('vehicleContainerTag');
  const vehicleImg = document.getElementById('vehicleImageTag');

  const isSea = !item.shippingLine.includes('TRUCKING');
  if (vehicleImg) {
    vehicleImg.src = isSea ? 'asset/image/ship-color.png' : 'asset/image/cargo.png';
    vehicleImg.alt = item.vesselName;
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
    'asset/image/warehouse-j.png',
    'asset/image/craine-j.png',
    isSea ? 'asset/image/ship-color-j.png' : 'asset/image/cargo-j.png',
    'asset/image/craine-j.png',
    'asset/image/cargo-j.png',
    'asset/image/warehouse-j.png'
  ];

  container.innerHTML = item.flowStages.map((stage, idx) => {
    const isDone = stage.status === 'DONE';
    const isActive = stage.status === 'ACTIVE';
    const illustration = stageImages[idx] || 'asset/image/cargo-j.png';

    // Card background styling (borderless with clean shadow)
    let cardStyle = 'bg-white shadow-xs hover:shadow-md';
    if (isActive) {
      cardStyle = 'bg-gradient-to-br from-[#f8fbfe] via-[#f0f7fc] to-[#e4f2fb] shadow-md shadow-[#2798D5]/15 ring-2 ring-[#2798D5]/20';
    } else if (!isDone) {
      cardStyle = 'bg-slate-50/80 opacity-85';
    }

    return `
      <div class="flow-card-horizontal shrink-0 w-[295px] sm:w-[325px] p-4 flex flex-col justify-between ${cardStyle}">
        
        <!-- Top Section: Header & Metadata -->
        <div class="relative z-10">
          <div class="flex items-center justify-between gap-2 mb-2">
            <span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${isActive ? 'bg-[#1D3D8F] text-white shadow-xs' : (isDone ? 'bg-slate-100 text-slate-700' : 'bg-slate-200 text-slate-500')
      }">
              TAHAP ${stage.step} DARI 6
            </span>

            <span class="badge-status ${isDone ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
        isActive ? 'bg-[#dbeafe] text-[#1D3D8F] border border-[#bae6fd] animate-pulse' :
          'bg-slate-100 text-slate-500 border border-slate-200'
      } text-[10px]">
              ${isDone ? '<span class="material-symbols-rounded text-[12px]">check</span> Selesai' : (isActive ? '<span class="w-1.5 h-1.5 rounded-full bg-[#1D3D8F] animate-pulse"></span> Berjalan' : 'Menunggu')}
            </span>
          </div>

          <h4 class="font-bold text-xs ${isActive ? 'text-[#1D3D8F]' : 'text-slate-900'} leading-snug line-clamp-2 max-w-[75%]">
            ${stage.title}
          </h4>

          <div class="text-[10.5px] font-semibold text-slate-500 mt-1.5 flex items-center gap-1">
            <span class="material-symbols-rounded text-[13px] text-slate-400">schedule</span>
            <span>${stage.date}</span>
          </div>

          <div class="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5 max-w-[70%] truncate" title="${stage.location}">
            <span class="material-symbols-rounded text-[13px] text-[#2798D5]">location_on</span>
            <span class="truncate">${stage.location}</span>
          </div>
        </div>

        <!-- Bottom Section: Deskripsi -->
        <div class="relative z-10 pt-3 border-t ${isActive ? 'border-[#bae6fd]/60' : 'border-slate-100'} mt-2">
          <p class="text-[11px] text-slate-600 leading-relaxed max-w-[68%] line-clamp-2">
            ${stage.desc}
          </p>
        </div>

        <!-- Right Side Overlapping Illustration (30% terpotong di tepi kanan) -->
        <img src="${illustration}" alt="Ilustrasi Tahap" class="flow-card-img-overlap">
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

  const isDark = document.documentElement.classList.contains('dark');
  const tileUrl = isDark
    ? 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
    : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';

  // Esri Map Layer (World Street Map / World Dark Gray Base)
  state.tileLayer = L.tileLayer(tileUrl, {
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
// 7. CRUD OPERATIONS, ACTION MENU & DOCUMENTATION
// -------------------------------------------------------------------------
function openNewShipmentModal() {
  const modal = document.getElementById('newShipmentModal');
  const title = document.getElementById('modalFormTitle');
  const sub = document.getElementById('modalFormSub');
  const editIdInput = document.getElementById('editShipmentId');

  if (editIdInput) editIdInput.value = '';
  if (title) title.innerText = 'Input Pengiriman Material Tower Baru';
  if (sub) sub.innerText = 'Masukkan nomor SO, jadwal kapal, dan estimasi tiba di site';

  const form = document.getElementById('newShipmentForm');
  if (form) form.reset();

  if (modal) modal.classList.remove('hidden');
}

function openEditShipmentModal(id) {
  closeCardActionMenu();
  const item = state.shipments.find(s => s.id === id);
  if (!item) return;

  const modal = document.getElementById('newShipmentModal');
  const title = document.getElementById('modalFormTitle');
  const sub = document.getElementById('modalFormSub');
  const editIdInput = document.getElementById('editShipmentId');

  if (editIdInput) editIdInput.value = item.id;
  if (title) title.innerText = 'Edit Data Pengiriman Material';
  if (sub) sub.innerText = `Ubah data pengiriman SO #${item.sonumb} (${item.siteName})`;

  // Isi data form dengan data pengiriman yang ada
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  setVal('newSoNumber', item.sonumb);
  setVal('newSiteId', item.siteId);
  setVal('newSiteName', item.siteName);
  setVal('newTowerHeight', item.towerHeight);
  setVal('newProvince', item.province);
  setVal('newResidence', item.residence);
  setVal('newContainerNo', item.containerNo);
  setVal('newShippingLine', item.shippingLine);
  setVal('newVesselName', item.vesselName);
  setVal('newOriginPort', item.originPort);
  setVal('newDestPort', item.destPort);
  setVal('newEtd', item.etd);
  setVal('newEtaPort', item.etaPort);
  setVal('newEtaSite', item.etaSite);

  if (modal) modal.classList.remove('hidden');
}

function closeNewShipmentModal() {
  const modal = document.getElementById('newShipmentModal');
  if (modal) modal.classList.add('hidden');
}

function submitNewShipment(e) {
  e.preventDefault();

  const editId = document.getElementById('editShipmentId') ? document.getElementById('editShipmentId').value : '';
  const so = document.getElementById('newSoNumber').value.trim();
  const siteId = document.getElementById('newSiteId').value.trim();
  const siteName = document.getElementById('newSiteName').value.trim();
  const height = document.getElementById('newTowerHeight').value.trim() || 'SST 52 M';
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

  // UPDATE JIKA MODE EDIT
  if (editId) {
    const idx = state.shipments.findIndex(s => s.id === editId);
    if (idx !== -1) {
      const item = state.shipments[idx];
      item.sonumb = so;
      item.siteId = siteId || item.siteId;
      item.siteName = siteName || item.siteName;
      item.towerHeight = height;
      item.province = province;
      item.residence = residence;
      item.containerNo = containerNo;
      item.shippingLine = shippingLine;
      item.vesselName = vesselName;
      item.originPort = originPort;
      item.destPort = destPort;
      item.originCoords = originCoords;
      item.destCoords = destCoords;
      item.etd = etd;
      item.etaPort = etaPort;
      item.etaSite = etaSite;

      saveShipmentsToLocal();
      closeNewShipmentModal();
      applyFilter();
      renderDetail();
      showToast(`Data pengiriman #${so} berhasil diperbarui!`);
      return;
    }
  }

  // CREATE PENGIRIMAN BARU
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
      { step: 6, title: 'Tiba Lengkap di Lokasi Site', location: siteName, date: etaSite, status: 'PENDING', desc: 'Serah terima material dengan waspang/tim penerima di site.' }
    ],
    marineRadarUrl: `https://www.marinetraffic.com/en/ais/details/ships/vessel:${vesselName.replace(/\s+/g, '_').toUpperCase()}`,
    evidenceNote: 'Input baru dari Delivery Tracking Portal.'
  };

  state.shipments.unshift(newEntry);
  state.activeId = newEntry.id;
  saveShipmentsToLocal();
  closeNewShipmentModal();
  applyFilter();
  renderDetail();
  showToast(`Pengiriman baru #${so} berhasil ditambahkan!`);
}

function deleteShipment(id) {
  closeCardActionMenu();
  const item = state.shipments.find(s => s.id === id);
  if (!item) return;

  if (!confirm(`Hapus pengiriman SO #${item.sonumb} (${item.siteName})?`)) {
    return;
  }

  state.shipments = state.shipments.filter(s => s.id !== id);
  saveShipmentsToLocal();

  if (state.activeId === id) {
    state.activeId = state.shipments.length > 0 ? state.shipments[0].id : null;
  }

  applyFilter();
  if (state.activeId) {
    renderDetail();
  }
  showToast(`Pengiriman SO #${item.sonumb} berhasil dihapus!`);
}

function updateShipmentStatus(id, newStatus) {
  closeCardActionMenu();
  const item = state.shipments.find(s => s.id === id);
  if (!item) return;

  item.status = newStatus;
  if (newStatus === 'IN_TRANSIT') {
    item.statusLabel = 'Sedang Berlayar';
    item.currentStageIndex = 2;
    if (item.flowStages && item.flowStages.length >= 3) {
      item.flowStages[0].status = 'DONE';
      item.flowStages[1].status = 'DONE';
      item.flowStages[2].status = 'ACTIVE';
      item.flowStages[3].status = 'PENDING';
      item.flowStages[4].status = 'PENDING';
      item.flowStages[5].status = 'PENDING';
    }
  } else if (newStatus === 'PORT_ARRIVED') {
    item.statusLabel = 'Tiba di Pelabuhan';
    item.currentStageIndex = 4;
    if (item.flowStages && item.flowStages.length >= 4) {
      item.flowStages[0].status = 'DONE';
      item.flowStages[1].status = 'DONE';
      item.flowStages[2].status = 'DONE';
      item.flowStages[3].status = 'ACTIVE';
      item.flowStages[4].status = 'PENDING';
      item.flowStages[5].status = 'PENDING';
    }
  } else if (newStatus === 'COMPLETED') {
    item.statusLabel = 'Tiba di Site';
    item.currentStageIndex = 6;
    if (item.flowStages) {
      item.flowStages.forEach(st => st.status = 'DONE');
    }
  }

  saveShipmentsToLocal();
  applyFilter();
  if (state.activeId === id) {
    renderDetail();
  }
  showToast(`Status #${item.sonumb} diubah menjadi "${item.statusLabel}"!`);
}

function copyWhatsAppFormat(id) {
  closeCardActionMenu();
  const item = state.shipments.find(s => s.id === id);
  if (!item) return;

  const text = `🚢 *[UPDATE MONITORING PENGIRIMAN & KAPAL]*\n` +
    `• *No. SO*: #${item.sonumb}\n` +
    `• *Site*: ${item.siteName} (${item.siteId})\n` +
    `• *Wilayah*: ${item.residence}, ${item.province}\n` +
    `• *Kapal/Armada*: ${item.vesselName} (${item.voyage})\n` +
    `• *No. Kontainer*: ${item.containerNo}\n` +
    `• *Status*: ${item.statusLabel}\n` +
    `• *ETA Site*: ${item.etaSite || '-'}\n` +
    `• *Rute*: ${item.originPort} ➔ ${item.destPort}\n\n` +
    `_Monitoring Pengiriman Material & Ekspedisi Kapal_`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Format laporan WhatsApp berhasil disalin!');
    }).catch(() => {
      fallbackCopyText(text);
    });
  } else {
    fallbackCopyText(text);
  }
}

function fallbackCopyText(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    showToast('Format laporan WhatsApp berhasil disalin!');
  } catch (err) {
    console.error('Fallback copy failed', err);
  }
  document.body.removeChild(textarea);
}

function showToast(msg) {
  const toast = document.getElementById('actionToast');
  const msgEl = document.getElementById('toastMessage');
  if (!toast || !msgEl) return;

  msgEl.innerText = msg;
  toast.classList.remove('hidden');
  toast.classList.add('flex');

  clearTimeout(window._toastTimeout);
  window._toastTimeout = setTimeout(() => {
    toast.classList.add('hidden');
    toast.classList.remove('flex');
  }, 3000);
}

// -------------------------------------------------------------------------
// FLOATING ACTION MENU (TITIK 3 DI CARD)
// -------------------------------------------------------------------------
function toggleCardActionMenu(event, itemId) {
  event.stopPropagation();
  const dropdown = document.getElementById('cardActionDropdown');
  if (!dropdown) return;

  if (dropdown.getAttribute('data-active-id') === itemId && !dropdown.classList.contains('hidden')) {
    closeCardActionMenu();
    return;
  }

  const item = state.shipments.find(s => s.id === itemId);
  if (!item) return;

  dropdown.setAttribute('data-active-id', itemId);

  dropdown.innerHTML = `
    <!-- Item Header -->
    <div class="px-3 py-2 border-b border-slate-100 dark:border-slate-800 mb-1">
      <div class="font-bold text-[11.5px] text-slate-900 dark:text-slate-100 truncate">#${item.sonumb}</div>
      <div class="text-[10px] text-slate-400 dark:text-slate-500 truncate">${item.siteName} (${item.siteId})</div>
    </div>

    <!-- Quick Status Change -->
    <div class="px-3 pt-1 pb-0.5 text-[9.5px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Update Status Cepat</div>
    <div class="grid grid-cols-3 gap-1 px-2.5 py-1 mb-1">
      <button onclick="updateShipmentStatus('${item.id}', 'IN_TRANSIT')" class="px-1.5 py-1 rounded-md text-[10px] font-bold text-center transition cursor-pointer ${item.status === 'IN_TRANSIT' ? 'bg-[#1D3D8F] text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}">
        Berlayar
      </button>
      <button onclick="updateShipmentStatus('${item.id}', 'PORT_ARRIVED')" class="px-1.5 py-1 rounded-md text-[10px] font-bold text-center transition cursor-pointer ${item.status === 'PORT_ARRIVED' ? 'bg-amber-500 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}">
        Pelabuhan
      </button>
      <button onclick="updateShipmentStatus('${item.id}', 'COMPLETED')" class="px-1.5 py-1 rounded-md text-[10px] font-bold text-center transition cursor-pointer ${item.status === 'COMPLETED' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}">
        Selesai
      </button>
    </div>

    <div class="border-t border-slate-100 dark:border-slate-800 my-1"></div>

    <!-- Actions List -->
    <button onclick="copyWhatsAppFormat('${item.id}')" class="w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-left transition cursor-pointer">
      <span class="material-symbols-rounded text-emerald-500 text-[16px]">chat</span>
      <span class="font-medium">Salin Format Laporan WA</span>
    </button>

    <button onclick="openEditShipmentModal('${item.id}')" class="w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-left transition cursor-pointer">
      <span class="material-symbols-rounded text-blue-500 text-[16px]">edit_note</span>
      <span class="font-medium">Edit Data Pengiriman</span>
    </button>

    <button onclick="openEvidenceModal('${item.id}')" class="w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-left transition cursor-pointer">
      <span class="material-symbols-rounded text-indigo-500 text-[16px]">receipt_long</span>
      <span class="font-medium">Surat Jalan &amp; Evidence</span>
    </button>

    <a href="${item.marineRadarUrl || '#'}" target="_blank" onclick="closeCardActionMenu()" class="w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-left transition cursor-pointer">
      <span class="material-symbols-rounded text-[#2798D5] text-[16px]">radar</span>
      <span class="font-medium">Buka Radar AIS Kapal</span>
    </a>

    <div class="border-t border-slate-100 dark:border-slate-800 my-1"></div>

    <button onclick="deleteShipment('${item.id}')" class="w-full px-3 py-2 flex items-center gap-2 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-left transition cursor-pointer">
      <span class="material-symbols-rounded text-[16px]">delete</span>
      <span class="font-semibold">Hapus Pengiriman</span>
    </button>
  `;

  const btn = event.currentTarget;
  const rect = btn.getBoundingClientRect();
  dropdown.classList.remove('hidden');

  let top = rect.bottom + 6;
  if (top + dropdown.offsetHeight > window.innerHeight) {
    top = Math.max(10, rect.top - dropdown.offsetHeight - 6);
  }
  let left = rect.right - dropdown.offsetWidth;
  if (left < 10) left = 10;

  dropdown.style.top = `${top}px`;
  dropdown.style.left = `${left}px`;
}

function closeCardActionMenu() {
  const dropdown = document.getElementById('cardActionDropdown');
  if (dropdown) {
    dropdown.classList.add('hidden');
    dropdown.removeAttribute('data-active-id');
  }
}

function openEvidenceModal(customId) {
  closeCardActionMenu();
  const targetId = customId || state.activeId;
  const item = state.shipments.find(s => s.id === targetId);
  if (!item) return;

  const modal = document.getElementById('evidenceModal');
  const content = document.getElementById('evidenceContent');
  if (!modal || !content) return;

  content.innerHTML = `
    <div class="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
      <div class="font-bold text-slate-800 dark:text-slate-100 mb-1">Catatan Evidence Lapangan:</div>
      <p class="text-slate-600 dark:text-slate-300 leading-relaxed">${item.evidenceNote || 'Belum ada catatan evidence khusus untuk pengiriman ini.'}</p>
    </div>
    <div class="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl text-blue-900 dark:text-blue-200 space-y-1">
      <div class="font-bold text-xs">Surat Jalan &amp; Seal Kontainer:</div>
      <div>No. Kontainer: <b class="font-mono">${item.containerNo}</b> (${item.shippingLine})</div>
      <div>Armada: <b>${item.vesselName}</b> (${item.voyage})</div>
      <div class="pt-1.5 border-t border-blue-200/60 dark:border-blue-800/60 text-[11px] text-blue-700 dark:text-blue-300">
        Tujuan: Site ${item.siteName} (${item.residence}, ${item.province})
      </div>
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
    searchInput.addEventListener('input', function () {
      state.searchQuery = this.value.trim();
      applyFilter();
    });
  }

  const form = document.getElementById('newShipmentForm');
  if (form) {
    form.addEventListener('submit', submitNewShipment);
  }

  // Tutup dropdown menu saat klik di luar atau tekan tombol ESC
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('cardActionDropdown');
    if (dropdown && !dropdown.classList.contains('hidden')) {
      if (!dropdown.contains(e.target) && !e.target.closest('button[onclick*="toggleCardActionMenu"]')) {
        closeCardActionMenu();
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeCardActionMenu();
      closeNewShipmentModal();
      closeEvidenceModal();
    }
  });
}

// -------------------------------------------------------------------------
// 9. THEME ENGINE (LIGHT & DARK MODE TOGGLE)
// -------------------------------------------------------------------------
function applyTheme(theme) {
  const isDark = theme === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
  document.body.classList.toggle('dark', isDark);

  try {
    localStorage.setItem('tracker_theme', theme);
  } catch (e) { }

  // Update theme toggle icon
  const icon = document.getElementById('themeToggleIcon');
  if (icon) {
    icon.innerText = isDark ? 'light_mode' : 'dark_mode';
  }

  // Update Leaflet Map Tile Layer to match theme
  if (state.tileLayer) {
    const tileUrl = isDark
      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
      : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
    state.tileLayer.setUrl(tileUrl);
  }
}

function toggleDarkMode() {
  const isCurrentlyDark = document.documentElement.classList.contains('dark');
  applyTheme(isCurrentlyDark ? 'light' : 'dark');
}

function initTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem('tracker_theme') || localStorage.getItem('tbig_theme');
  } catch (e) { }

  if (saved) {
    applyTheme(saved);
  } else {
    // Default to dark mode if user's device prefers dark
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }
}

// Expose functions globally to window for HTML inline events
window.toggleDarkMode = toggleDarkMode;
window.applyTheme = applyTheme;
window.toggleCardActionMenu = toggleCardActionMenu;
window.closeCardActionMenu = closeCardActionMenu;
window.openEditShipmentModal = openEditShipmentModal;
window.deleteShipment = deleteShipment;
window.updateShipmentStatus = updateShipmentStatus;
window.copyWhatsAppFormat = copyWhatsAppFormat;
window.openEvidenceModal = openEvidenceModal;
window.closeEvidenceModal = closeEvidenceModal;
