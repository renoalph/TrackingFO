/**
 * app.js — Client Logic untuk Tracking CME (Mobile Web App)
 * Siap dideploy ke Vercel (tracking-cme.vercel.app)
 */

// Konfigurasi Tahapan Milestone CME Baku (6 Tahap)
const MILESTONE_STAGES = [
  { id: 'stip', label: '1. STIP & Assignment', desc: 'Penugasan vendor & approval awal' },
  { id: 'survey', label: '2. Survey & APD', desc: 'Site survey & gambar kerja teknik' },
  { id: 'material', label: '3. Material Onsite', desc: 'Pengiriman & kedatangan tiang/tray' },
  { id: 'cme', label: '4. CME & Civil Works', desc: 'Pondasi, grounding, pemasangan fisik' },
  { id: 'otdr', label: '5. OTDR Testing', desc: 'Pengujian loss & kelayakan koneksi' },
  { id: 'rfs', label: '6. RFS (Ready For Service)', desc: 'Serah terima & integrasi sistem' }
];

// Data Awal Mock/Demo (Sinkron dengan domain proyek FO JATIM)
const INITIAL_PROJECTS = [
  {
    sonumb: '0040372120041',
    siteId: '16GSK0308',
    siteName: 'TBG-SBY-Phase4a-DF022_16GSK0308',
    operator: 'ISAT',
    kabupaten: 'GRESIK',
    mitra: 'PT. FAJAR MITRA KRIDA ABADI',
    tahapanIndex: 3, // CME & Civil Works (Sedang Dikerjakan)
    tahapanName: 'CME & Civil Works',
    percent: 75,
    statusBadge: 'DALAM_PROSES',
    pm: 'Angen Cahya Asmara',
    waspang: 'Febriena Shahab',
    startDate: '2026-09-12',
    targetDate: '2026-10-30',
    remarks: 'Galian tiang dan penarikan tray 75% selesai, menunggu jointing FO.'
  },
  {
    sonumb: '0040374050041',
    siteId: '16SBY0358',
    siteName: 'TBG-SBS-Q2CapExpansion-DF105_16SBY0358',
    operator: 'ISAT',
    kabupaten: 'SURABAYA',
    mitra: 'PT. FAJAR MITRA KRIDA ABADI',
    tahapanIndex: 5, // RFS
    tahapanName: 'RFS (Ready For Service)',
    percent: 100,
    statusBadge: 'RFS_SELESAI',
    pm: 'Angen Cahya Asmara',
    waspang: 'Doni Pratama',
    startDate: '2026-08-10',
    targetDate: '2026-09-25',
    remarks: 'Pekerjaan selesai 100%, serah terima RFS approved.'
  },
  {
    sonumb: '0040387620041',
    siteId: '16MGT0012',
    siteName: 'TAKERAN_MAGETAN_PL-SUKATAM_MGT',
    operator: 'TSEL',
    kabupaten: 'MAGETAN',
    mitra: 'PT. TELAGA PASIR KUTA',
    tahapanIndex: 1, // Survey & APD
    tahapanName: 'Survey & APD',
    percent: 30,
    statusBadge: 'PENDING_REVIEW',
    pm: 'Budi Santoso',
    waspang: 'Ahmad Faisal',
    startDate: '2026-10-05',
    targetDate: '2026-11-15',
    remarks: 'Pengajuan revisi drawing APD sedang direview PM.'
  }
];

// Riwayat Pengajuan Lapangan Awal
const INITIAL_HISTORY = [
  {
    id: 'sub_1',
    sonumb: '0040372120041',
    siteName: 'TBG-SBY-Phase4a-DF022_16GSK0308',
    mitra: 'PT. FAJAR MITRA KRIDA ABADI',
    tahapan: 'CME & Civil Works',
    percent: 75,
    date: '2026-10-22',
    status: 'Pending',
    remarks: 'Pengecoran tiang tumpu dan penarikan grounding rampung.'
  },
  {
    id: 'sub_2',
    sonumb: '0040374050041',
    siteName: 'TBG-SBS-Q2CapExpansion-DF105_16SBY0358',
    mitra: 'PT. FAJAR MITRA KRIDA ABADI',
    tahapan: 'RFS (Ready For Service)',
    percent: 100,
    date: '2026-09-24',
    status: 'Approved',
    remarks: 'BAP fisik dan hasil OTDR loss < 0.2dB disetujui PM.'
  }
];

// App State
const state = {
  currentTab: 'tracker',
  searchQuery: '',
  activeFilter: 'all',
  projects: [],
  history: [],
  selectedSoForForm: null
};

// ------------------------------------------------------------------
// INITIALIZATION
// ------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // Muat data dari localStorage jika ada, fallback ke initial mock
  state.projects = loadLocalData('cme_projects', INITIAL_PROJECTS);
  state.history = loadLocalData('cme_history', INITIAL_HISTORY);

  initEventListeners();
  renderTracker();
  renderHistory();
  setDefaultFormDate();
});

function loadLocalData(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function saveLocalData(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {}
}

function setDefaultFormDate() {
  const dateInput = document.getElementById('formDate');
  if (dateInput && !dateInput.value) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    dateInput.value = `${y}-${m}-${d}`;
  }
}

// ------------------------------------------------------------------
// EVENT LISTENERS
// ------------------------------------------------------------------
function initEventListeners() {
  // Navigation Tabs
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      switchTab(target);
    });
  });

  // Search input
  const searchInput = document.getElementById('trackerSearchInput');
  const clearBtn = document.getElementById('btnClearSearch');

  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.trim().toLowerCase();
    clearBtn.classList.toggle('hidden', !state.searchQuery);
    renderTracker();
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    state.searchQuery = '';
    clearBtn.classList.add('hidden');
    renderTracker();
    searchInput.focus();
  });

  // Filter Chips
  document.querySelectorAll('.chip-filter').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip-filter').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.activeFilter = chip.dataset.filter;
      renderTracker();
    });
  });

  // Progress Percent Selector Buttons
  document.querySelectorAll('.btn-progress').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-progress').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const val = btn.dataset.pct;
      document.getElementById('formProgressPercent').value = val;
      document.getElementById('progressPercentDisplay').textContent = val + '%';
    });
  });

  // Photo Upload Trigger & Preview
  const dropzone = document.getElementById('dropzonePhoto');
  const fileInput = document.getElementById('filePhoto');
  const previewImg = document.getElementById('photoPreviewImg');
  const placeholder = document.getElementById('photoPlaceholder');
  const previewBox = document.getElementById('photoPreviewContainer');
  const removePhotoBtn = document.getElementById('btnRemovePhoto');

  dropzone.addEventListener('click', (e) => {
    if (e.target === removePhotoBtn || removePhotoBtn.contains(e.target)) return;
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        previewImg.src = e.target.result;
        placeholder.classList.add('hidden');
        previewBox.classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    }
  });

  removePhotoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.value = '';
    previewImg.src = '';
    previewBox.classList.add('hidden');
    placeholder.classList.remove('hidden');
  });

  // Quick Auto Select SO from existing projects
  document.getElementById('btnAutoSelectSO').addEventListener('click', () => {
    if (state.projects.length) {
      const p = state.projects[0];
      fillFormWithProject(p);
    }
  });

  // Form Submit
  document.getElementById('submissionForm').addEventListener('submit', handleFormSubmit);

  // Refresh History Button
  document.getElementById('btnRefreshHistory').addEventListener('click', () => {
    renderHistory();
  });
}

function switchTab(tabId) {
  state.currentTab = tabId;

  // Update tabs active state
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabId);
  });

  // Hide all views and show active one
  document.getElementById('viewTracker').classList.toggle('hidden', tabId !== 'tracker');
  document.getElementById('viewForm').classList.toggle('hidden', tabId !== 'form');
  document.getElementById('viewHistory').classList.toggle('hidden', tabId !== 'history');

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ------------------------------------------------------------------
// RENDER VIEW 1: TRACKER ("UDAH SAMPAI MANA")
// ------------------------------------------------------------------
function renderTracker() {
  const container = document.getElementById('projectDetailContainer');
  container.innerHTML = '';

  const q = state.searchQuery;
  const f = state.activeFilter;

  const filtered = state.projects.filter(p => {
    const matchSearch = !q || p.sonumb.toLowerCase().includes(q) || p.siteName.toLowerCase().includes(q) || p.siteId.toLowerCase().includes(q);
    if (!matchSearch) return false;

    if (f === 'onprogress') return p.statusBadge === 'DALAM_PROSES';
    if (f === 'rfs') return p.statusBadge === 'RFS_SELESAI';
    if (f === 'pending') return p.statusBadge === 'PENDING_REVIEW';
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-2">
        <span class="material-symbols-rounded text-slate-500 text-[36px]">search_off</span>
        <h4 class="text-xs font-bold text-slate-300">Data Tidak Ditemukan</h4>
        <p class="text-[11px] text-slate-500">Coba cari dengan kata kunci SO Number atau Nama Site lainnya.</p>
      </div>
    `;
    return;
  }

  filtered.forEach(p => {
    const card = document.createElement('div');
    card.className = 'bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4 shadow-sm';

    // Badge styling
    let badgeHtml = '';
    if (p.statusBadge === 'RFS_SELESAI') {
      badgeHtml = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">RFS Selesai</span>`;
    } else if (p.statusBadge === 'PENDING_REVIEW') {
      badgeHtml = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">Review PM</span>`;
    } else {
      badgeHtml = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-500/15 text-brand-400 border border-brand-500/30">Sedang Dikerjakan</span>`;
    }

    // Stepper Milestones ("Udah Sampai Mana")
    const stepperHtml = MILESTONE_STAGES.map((st, idx) => {
      let stateClass = '';
      let icon = idx + 1;

      if (idx < p.tahapanIndex) {
        stateClass = 'completed';
        icon = '<span class="material-symbols-rounded text-[14px]">check</span>';
      } else if (idx === p.tahapanIndex) {
        stateClass = 'current';
        icon = '<span class="material-symbols-rounded text-[14px]">play_arrow</span>';
      }

      return `
        <div class="stepper-item ${stateClass}">
          <div class="stepper-line"></div>
          <div class="stepper-dot">${icon}</div>
          <div class="pb-3 text-xs">
            <div class="font-bold text-slate-200 flex items-center gap-1.5">
              <span>${st.label}</span>
              ${idx === p.tahapanIndex ? '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-brand-600 text-white">Posisi Terkini</span>' : ''}
            </div>
            <p class="text-[10px] text-slate-400 mt-0.5">${st.desc}</p>
          </div>
        </div>
      `;
    }).join('');

    card.innerHTML = `
      <!-- Header Card -->
      <div class="flex items-start justify-between gap-2 border-b border-slate-800 pb-3">
        <div>
          <div class="flex items-center gap-2">
            <span class="font-mono text-xs font-extrabold text-brand-400 tracking-wide">${p.sonumb}</span>
            <span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-800 text-slate-300">${p.operator}</span>
          </div>
          <h3 class="text-xs font-bold text-white mt-1 leading-snug">${p.siteName}</h3>
          <p class="text-[10px] text-slate-400 mt-0.5">Mitra: <span class="text-slate-300 font-medium">${p.mitra}</span></p>
        </div>
        ${badgeHtml}
      </div>

      <!-- Progres Bar Singkat -->
      <div>
        <div class="flex justify-between text-[11px] font-semibold mb-1">
          <span class="text-slate-400">Tahap Terakhir: <b class="text-white">${p.tahapanName}</b></span>
          <span class="font-mono text-brand-400 font-bold">${p.percent}%</span>
        </div>
        <div class="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
          <div class="bg-gradient-to-r from-brand-600 to-emerald-500 h-2 rounded-full transition-all duration-500" style="width: ${p.percent}%"></div>
        </div>
      </div>

      <!-- Timeline Milestone ("Udah Sampai Mana") -->
      <div class="pt-2">
        <h4 class="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-1">
          <span class="material-symbols-rounded text-[15px] text-brand-400">timeline</span>
          Garis Progres Milestone Lapangan
        </h4>
        <div class="pl-1">
          ${stepperHtml}
        </div>
      </div>

      <!-- Detail Info & Remarks -->
      <div class="bg-slate-950/80 rounded-xl p-3 border border-slate-800/80 space-y-1.5 text-[11px]">
        <div class="flex justify-between">
          <span class="text-slate-500">Project Manager:</span>
          <span class="font-semibold text-slate-300">${p.pm}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500">Waspang Lapangan:</span>
          <span class="font-semibold text-slate-300">${p.waspang}</span>
        </div>
        <div class="pt-1 border-t border-slate-800/60 text-slate-400">
          <span class="text-slate-500">Catatan Terbaru:</span> ${p.remarks}
        </div>
      </div>

      <!-- Tombol Ajukan Progres Cepat untuk SO ini -->
      <button class="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
        onclick="fillFormAndOpen('${p.sonumb}')">
        <span class="material-symbols-rounded text-[16px]">add_circle</span>
        Ajukan Progres untuk SO Ini
      </button>
    `;

    container.appendChild(card);
  });
}

function fillFormAndOpen(soNumber) {
  const p = state.projects.find(item => item.sonumb === soNumber);
  if (p) {
    fillFormWithProject(p);
    switchTab('form');
  }
}

function fillFormWithProject(p) {
  document.getElementById('formSoNumber').value = p.sonumb;
  document.getElementById('formSiteId').value = `${p.operator} / ${p.siteId}`;
  document.getElementById('formSiteName').value = p.siteName;
  document.getElementById('formMitra').value = p.mitra;
}

// ------------------------------------------------------------------
// VIEW 2: FORM SUBMISSION HANDLER
// ------------------------------------------------------------------
function handleFormSubmit(e) {
  e.preventDefault();

  const btn = document.getElementById('btnSubmitForm');
  const btnText = document.getElementById('submitText');
  const btnIcon = document.getElementById('submitIcon');

  btn.disabled = true;
  btn.classList.add('opacity-75');
  btnText.textContent = 'Mengirim data pengajuan...';
  btnIcon.textContent = 'sync';
  btnIcon.classList.add('animate-spin');

  const sonumb = document.getElementById('formSoNumber').value.trim();
  const siteId = document.getElementById('formSiteId').value.trim();
  const siteName = document.getElementById('formSiteName').value.trim();
  const mitra = document.getElementById('formMitra').value;
  const tahapan = document.getElementById('formTahapan').value;
  const percent = parseInt(document.getElementById('formProgressPercent').value, 10) || 75;
  const date = document.getElementById('formDate').value;
  const remarks = document.getElementById('formRemarks').value.trim() || 'Pengajuan progres lapangan oleh mitra.';

  // Buat objek record baru
  const newSubmission = {
    id: 'sub_' + Date.now(),
    sonumb: sonumb,
    siteName: siteName || siteId || 'Site Lapangan',
    mitra: mitra,
    tahapan: tahapan,
    percent: percent,
    date: date,
    status: 'Pending',
    remarks: remarks
  };

  // Simulasikan latency pengiriman jaringan
  setTimeout(() => {
    // 1. Masukkan ke riwayat
    state.history.unshift(newSubmission);
    saveLocalData('cme_history', state.history);

    // 2. Update progres proyek jika ada di tracker
    let existingProject = state.projects.find(p => p.sonumb === sonumb);
    const tahapanIdx = MILESTONE_STAGES.findIndex(st => tahapan.toLowerCase().includes(st.label.toLowerCase().slice(3, 8)));

    if (existingProject) {
      if (tahapanIdx !== -1) existingProject.tahapanIndex = tahapanIdx;
      existingProject.tahapanName = tahapan;
      existingProject.percent = percent;
      existingProject.remarks = remarks;
      existingProject.statusBadge = percent >= 100 ? 'RFS_SELESAI' : 'DALAM_PROSES';
    } else {
      // Jika SO baru diajukan pertama kali
      state.projects.unshift({
        sonumb: sonumb,
        siteId: siteId || 'SITE-NEW',
        siteName: siteName || `Site ${sonumb}`,
        operator: 'TBG',
        kabupaten: 'JATIM',
        mitra: mitra,
        tahapanIndex: tahapanIdx !== -1 ? tahapanIdx : 3,
        tahapanName: tahapan,
        percent: percent,
        statusBadge: 'PENDING_REVIEW',
        pm: 'Team PM Jatim',
        waspang: 'Field Controller',
        startDate: date,
        targetDate: '2026-11-30',
        remarks: remarks
      });
    }

    saveLocalData('cme_projects', state.projects);

    // Reset tombol
    btn.disabled = false;
    btn.classList.remove('opacity-75');
    btnText.textContent = 'Kirim Pengajuan Progres';
    btnIcon.textContent = 'send';
    btnIcon.classList.remove('animate-spin');

    // Buka feedback modal sukses
    document.getElementById('modalSuccess').classList.remove('hidden');

    // Reset form
    document.getElementById('submissionForm').reset();
    setDefaultFormDate();
    document.getElementById('photoPreviewContainer').classList.add('hidden');
    document.getElementById('photoPlaceholder').classList.remove('hidden');

    renderTracker();
    renderHistory();
  }, 1000);
}

function closeSuccessModal() {
  document.getElementById('modalSuccess').classList.add('hidden');
  switchTab('history');
}

// ------------------------------------------------------------------
// VIEW 3: RENDER RIWAYAT PENGAJUAN
// ------------------------------------------------------------------
function renderHistory() {
  const container = document.getElementById('historyListContainer');
  container.innerHTML = '';

  if (state.history.length === 0) {
    container.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-2">
        <span class="material-symbols-rounded text-slate-500 text-[36px]">history_toggle_off</span>
        <h4 class="text-xs font-bold text-slate-300">Belum Ada Riwayat</h4>
        <p class="text-[11px] text-slate-500">Pengajuan progres dari lapangan akan tampil di sini.</p>
      </div>
    `;
    return;
  }

  state.history.forEach(item => {
    const card = document.createElement('div');
    card.className = 'bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-2 shadow-sm';

    let statusPill = '';
    if (item.status === 'Approved') {
      statusPill = `<span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">Disetujui PM</span>`;
    } else if (item.status === 'Revisi') {
      statusPill = `<span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">Perlu Revisi</span>`;
    } else {
      statusPill = `<span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">Pending Review</span>`;
    }

    card.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-1.5">
          <span class="font-mono text-xs font-bold text-brand-400">${item.sonumb}</span>
          <span class="text-[11px] text-slate-400">· ${item.date}</span>
        </div>
        ${statusPill}
      </div>

      <div>
        <h4 class="text-xs font-bold text-white">${item.siteName}</h4>
        <p class="text-[10px] text-slate-400 mt-0.5">Tahapan: <b class="text-slate-200">${item.tahapan}</b> (${item.percent}%)</p>
      </div>

      <div class="bg-slate-950/70 rounded-lg p-2 text-[11px] text-slate-400 border border-slate-800/60">
        <span class="text-slate-500">Catatan:</span> ${item.remarks}
      </div>
    `;

    container.appendChild(card);
  });
}
