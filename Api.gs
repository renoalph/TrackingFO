/**
 * ============================================================
 * Api.gs
 * Fungsi yang dipanggil client via google.script.run.
 * ============================================================
 */

/**
 * Mengambil ringkasan KPI, Chart, dan Opsi Filter dengan sangat cepat.
 * Memanfaatkan ScriptCache (RAM GAS) sehingga reload halaman hanya butuh < 500ms.
 */
function getDashboardSummary(forceRefresh) {
  const cache = CacheService.getScriptCache();
  const CACHE_KEY = 'DASHBOARD_SUMMARY_V1';

  if (!forceRefresh) {
    try {
      const cached = cache.get(CACHE_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) { /* fallback jika cache error */ }
  }

  const data = getOrBuildDataset_(!!forceRefresh);
  const merged = data.merged;
  const totalMasterRows = data.totalMasterRows || merged.length;
  const defaultYearPeriod = CONFIG.DEFAULT_YEAR_FILTER || '2025-2026';

  const activePeriodMerged = merged.filter(function (i) {
    return defaultYearPeriod === 'Semua Tahun' || i.projectYear === defaultYearPeriod;
  });

  const userEmail = (Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const canUploadMaster = (userEmail === 'fiberopticjatim@gmail.com');

  const payload = {
    summary: computeSummary_(activePeriodMerged, totalMasterRows, defaultYearPeriod),
    charts: computeChartData_(activePeriodMerged),
    filterOptions: data.filterOptions,
    generatedAt: Utilities.formatDate(new Date(), 'GMT+7', 'dd MMM yyyy, HH:mm') + ' WIB',
    totalMasterRows: totalMasterRows,
    currentUser: userEmail,
    canUploadMaster: canUploadMaster
  };

  try {
    // Simpan ke ScriptCache RAM selama 2 jam (7200 detik)
    cache.put(CACHE_KEY, JSON.stringify(payload), 7200);
  } catch (err) { /* abaikan jika ukuran payload melebihi limit 100KB */ }

  return payload;
}

const BOOTSTRAP_CACHE_KEY = 'BOOTSTRAP_PAYLOAD_V11';

function isYearMatch_(itemYear, targetPeriod) {
  if (!targetPeriod || targetPeriod === 'Semua Tahun') return true;
  const yr = String(itemYear === null || itemYear === undefined ? '' : itemYear).trim();
  const target = String(targetPeriod).trim();
  if (target === '2026' || target === 'CIP' || target === '2025-2026') {
    // Proyek Aktif CIP: rentang 2025-2026 atau proyek aktif berjalan di lapangan
    return !yr || yr === '2026' || yr === '2025' || yr === '2025-2026' || yr === 'CIP';
  }
  return yr === target;
}

function buildBootstrapPayload_(forceRefresh) {
  const t0 = new Date();
  const data = getOrBuildDataset_(!!forceRefresh);
  const defaultYearPeriod = CONFIG.DEFAULT_YEAR_FILTER || '2026';
  const defaultParams = { page: 1, pageSize: CONFIG.DEFAULT_PAGE_SIZE, sortBy: 'sonumb', sortDir: 'asc', filters: { yearPeriod: defaultYearPeriod } };

  const totalMasterRows = data.totalMasterRows || data.merged.length;
  let activePeriodMerged = data.merged.filter(function (i) {
    return isYearMatch_(i.projectYear, defaultYearPeriod);
  });

  // Safety net: jika filter tahun tidak menghasilkan baris, gunakan data.merged agar tabel tidak pernah kosong
  if (activePeriodMerged.length === 0 && data.merged.length > 0) {
    activePeriodMerged = data.merged;
  }

  const userEmail = (Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const canUploadMaster = (userEmail === 'fiberopticjatim@gmail.com');

  const trackingOnly = (data.merged || []).filter(function (item) {
    return !!item.hasTracking;
  });

  const now = new Date();
  const payload = {
    summary: computeSummary_(activePeriodMerged, totalMasterRows, defaultYearPeriod),
    charts: computeChartData_(activePeriodMerged),
    filterOptions: data.filterOptions,
    table: buildTablePayload_(trackingOnly, defaultParams),
    generatedAt: Utilities.formatDate(now, 'GMT+7', 'dd/MM/yyyy, HH.mm.ss') + ' WIB',
    tookMs: new Date() - t0,
    totalRows: trackingOnly.length,
    totalMasterRows: totalMasterRows,
    currentUser: userEmail,
    canUploadMaster: canUploadMaster
  };

  return payload;
}

function getDashboardBootstrap() {
  const cache = CacheService.getScriptCache();
  try {
    const cachedStr = getLargeCache_(cache, BOOTSTRAP_CACHE_KEY);
    if (cachedStr) {
      return JSON.parse(cachedStr);
    }
  } catch (err) {
    // Fallback jika cache deserialization gagal
  }

  const payload = buildBootstrapPayload_(false);
  try {
    putLargeCache_(cache, BOOTSTRAP_CACHE_KEY, JSON.stringify(payload), 21600); // 6 jam
  } catch (err) { /* abaikan */ }

  return payload;
}

function forceRefreshCache() {
  const cache = CacheService.getScriptCache();
  removeLargeCache_(cache, BOOTSTRAP_CACHE_KEY);
  try {
    cache.remove('DASHBOARD_SUMMARY_V1');
    removeLargeCache_(cache, 'BOOTSTRAP_PAYLOAD_V4');
    removeLargeCache_(cache, 'BOOTSTRAP_PAYLOAD_V5');
    removeLargeCache_(cache, 'BOOTSTRAP_PAYLOAD_V6');
  } catch (err) {}

  const payload = buildBootstrapPayload_(true);
  try {
    putLargeCache_(cache, BOOTSTRAP_CACHE_KEY, JSON.stringify(payload), 21600);
  } catch (err) { /* abaikan */ }

  return payload;
}

/** Tabel Log Tracking Harian Lapangan (hanya menampilkan proyek yang memiliki pengajuan di Tracking_Harian) */
function getProjectList(params) {
  const data = getOrBuildDataset_(false);
  const trackingOnly = (data.merged || []).filter(function (item) {
    return !!item.hasTracking;
  });
  return buildTablePayload_(trackingOnly, params || {});
}

function buildTablePayload_(merged, params) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(200, Math.max(10, Number(params.pageSize) || CONFIG.DEFAULT_PAGE_SIZE));

  let filtered = applyFilters_(merged, params);
  if (params.sortBy) filtered = sortItems_(filtered, params.sortBy, params.sortDir === 'desc');

  const totalRows = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pagedItems = filtered.slice(start, start + pageSize);

  return {
    items: stripToTablePayload_(pagedItems), // Pangkas hanya kolom yang dibutuhkan tabel
    totalRows: totalRows,
    totalPages: totalPages,
    page: safePage,
    pageSize: pageSize,
    reqId: (params && params.reqId) ? params.reqId : 0
  };
}

function getProjectDetail(key) {
  const data = getOrBuildDataset_(false);
  const target = String(key || '').trim();
  const targetStripped = stripLeadingZero_(target);

  let item = (data.merged || []).filter(function (m) {
    const k = String(m.key || '').trim();
    const so = String(m.sonumb || '').trim();
    return k === target || so === target ||
           (targetStripped && (stripLeadingZero_(k) === targetStripped || stripLeadingZero_(so) === targetStripped));
  })[0];

  // Fallback jika tidak ada di cache (misal proyek lama di luar filter activeItems)
  if (!item) {
    try {
      const raw = readMasterRaw_();
      const tr = readTrackingLatestRaw_();
      const fullRes = buildMasterMap_(raw, tr);
      const mergedAll = mergeData_(fullRes, tr).merged;
      item = mergedAll.filter(function (m) {
        const k = String(m.key || '').trim();
        const so = String(m.sonumb || '').trim();
        return k === target || so === target ||
               (targetStripped && (stripLeadingZero_(k) === targetStripped || stripLeadingZero_(so) === targetStripped));
      })[0];
    } catch (e) {}
  }

  if (!item) return { found: false };
  return { found: true, item: item, history: getProjectHistory_(item.sonumb) };
}

function getKpiProjectList(type) {
  const data = getOrBuildDataset_(false);
  const merged = data.merged || [];

  if (type === 'approvedToday') {
    return merged.filter(function (m) {
      return !!m.approvedToday;
    }).map(formatKpiItem_);
  }

  if (type === 'pending') {
    return merged.filter(function (m) {
      const s = String(m.statusApproval || '').toLowerCase();
      return s === 'pending' || m.statusBadge === 'PENDING';
    }).map(formatKpiItem_);
  }

  if (type === 'gap') {
    return merged.filter(function (m) {
      return m.statusBadge === 'GAP';
    }).map(formatKpiItem_);
  }

  if (type === 'onProgress') {
    return merged.filter(function (m) {
      return m.finalStatus === 'DALAM_PROSES';
    }).map(formatKpiItem_);
  }

  if (type === 'rfs') {
    return merged.filter(function (m) {
      return m.finalStatus === 'RFS_SELESAI' || (m.statusBadge === 'MATCH' && !!m.masterRfsDate);
    }).map(formatKpiItem_);
  }

  return [];
}

function formatKpiItem_(m) {
  return {
    key: m.key,
    sonumb: m.sonumb,
    siteName: m.siteName,
    operatorId: m.operatorId || '-',
    kabupaten: m.kabupaten || '-',
    mitra: m.mitra || '-',
    tahapan: m.tahapan || m.tahapanMaster || '-',
    statusApproval: m.statusApproval || 'Pending',
    statusBadge: m.statusBadge,
    approvedBy: m.approvedBy || '-',
    tanggalApproval: m.tanggalApproval || '-',
    tanggalPengajuan: m.tanggalPengajuan || '-',
    masterRfsDate: m.masterRfsDate || '-',
    remarks: m.remarks || '-'
  };
}

// ------------------------------------------------------------------
// FILTER, SORT, AGREGASI
// ------------------------------------------------------------------

function applyFilters_(items, params) {
  let out = items || [];
  const f = params.filters || {};

  // Filter Periode / Tahun Proyek
  if (f.yearPeriod && f.yearPeriod !== 'Semua Tahun') {
    out = out.filter(function (i) { return isYearMatch_(i.projectYear, f.yearPeriod); });
  }

  if (f.operator && f.operator.length) {
    out = out.filter(function (i) { return f.operator.indexOf(String(i.operatorId || '')) !== -1; });
  }
  if (f.kabupaten && f.kabupaten.length) {
    out = out.filter(function (i) { return f.kabupaten.indexOf(String(i.kabupaten || '')) !== -1; });
  }
  if (f.mitra && f.mitra.length) {
    out = out.filter(function (i) { return f.mitra.indexOf(String(i.mitra || '')) !== -1; });
  }
  if (f.tahapan && f.tahapan.length) {
    out = out.filter(function (i) { return f.tahapan.indexOf(String(i.tahapan || '')) !== -1; });
  }
  if (f.approvedBy && f.approvedBy.length) {
    out = out.filter(function (i) { return f.approvedBy.indexOf(String(i.approvedBy || '')) !== -1; });
  }
  if (f.statusBadge && f.statusBadge.length) {
    out = out.filter(function (i) { return f.statusBadge.indexOf(String(i.statusBadge || '')) !== -1; });
  }
  if (f.onlyGap) {
    out = out.filter(function (i) { return i.statusBadge === 'GAP'; });
  }
  if (f.onlyApprovedToday) {
    out = out.filter(function (i) { return !!i.approvedToday; });
  }
  if (f.onlyPending) {
    out = out.filter(function (i) {
      const s = String(i.statusApproval || '').toLowerCase();
      return s === 'pending' || i.statusBadge === 'PENDING';
    });
  }

  if (params.search) {
    const q = String(params.search).toLowerCase().trim();
    if (q) {
      out = out.filter(function (i) {
        return (String(i.sonumb || '').toLowerCase().indexOf(q) !== -1) ||
          (String(i.siteName || '').toLowerCase().indexOf(q) !== -1) ||
          (String(i.mitra || '').toLowerCase().indexOf(q) !== -1) ||
          (String(i.operatorId || '').toLowerCase().indexOf(q) !== -1) ||
          (String(i.kabupaten || '').toLowerCase().indexOf(q) !== -1) ||
          (String(i.stipNumber || '').toLowerCase().indexOf(q) !== -1) ||
          (String(i.projectName || '').toLowerCase().indexOf(q) !== -1);
      });
    }
  }
  return out;
}

function sortItems_(items, field, desc) {
  const sorted = items.slice().sort(function (a, b) {
    const av = a[field], bv = b[field];
    if (av === null || av === undefined || av === '') return 1;
    if (bv === null || bv === undefined || bv === '') return -1;
    if (av < bv) return -1;
    if (av > bv) return 1;
    return 0;
  });
  if (desc) sorted.reverse();
  return sorted;
}

function computeSummary_(merged, totalMaster, currentPeriod) {
  const totalInPeriod = merged.length;
  let rfs = 0, onProgress = 0, gap = 0, pending = 0, approvedToday = 0;

  merged.forEach(function (m) {
    if (m.finalStatus === 'RFS_SELESAI') rfs++;
    else if (m.finalStatus === 'DALAM_PROSES') onProgress++;

    if (m.statusBadge === 'GAP') gap++;
    if (m.statusBadge === 'PENDING') pending++;
    if (m.approvedToday) approvedToday++;
  });

  return {
    totalMaster: totalMaster || totalInPeriod,
    total: totalInPeriod,
    rfs: rfs,
    onProgress: onProgress,
    gap: gap,
    pending: pending,
    approvedToday: approvedToday,
    periodLabel: currentPeriod === 'Semua Tahun' ? 'Semua Portofolio' : (currentPeriod === '2026' || currentPeriod === 'CIP' ? 'Proyek CIP' : 'Tahun ' + currentPeriod),
    persenRfs: totalInPeriod > 0 ? +(100 * rfs / totalInPeriod).toFixed(1) : 0
  };
}

function computeChartData_(merged) {
  // Funnel kumulatif berdasarkan "tahapan" (Tracking) terhadap MILESTONE_STAGES.
  // ASUMSI progres linear (lihat catatan di DataService.gs / README).
  const funnel = MILESTONE_STAGES.map(function (stage, idx) {
    const count = merged.filter(function (m) {
      const si = MILESTONE_STAGES.indexOf(m.tahapan);
      return si !== -1 && si >= idx;
    }).length;
    return { stage: stage, count: count };
  });

  // Distribusi Status Akhir: Aktual (Tracking) vs Sistem (Master) — dihitung
  // independen dari masing-masing sumber agar perbandingannya jujur.
  const categories = ['Sudah RFS', 'Dalam Proses', 'Belum Ada Data'];
  const aktual = [0, 0, 0];
  const sistem = [0, 0, 0];

  merged.forEach(function (m) {
    // sisi Aktual (dari finalStatus yg sudah dihitung di DataService)
    if (m.finalStatus === 'RFS_SELESAI') aktual[0]++;
    else if (m.finalStatus === 'DALAM_PROSES') aktual[1]++;
    else aktual[2]++;

    // sisi Sistem (murni dari Master, tanpa lihat Tracking sama sekali)
    if (m.masterRfsDate) sistem[0]++;
    else if (m.tahapanMaster) sistem[1]++;
    else sistem[2]++;
  });

  return {
    funnel: funnel,
    statusComparison: { categories: categories, aktual: aktual, sistem: sistem }
  };
}

/**
 * ============================================================
 * IMPORT & AUTO-FILTER MASTER DATA (EXCEL BATCH INGESTION)
 * Menulis data master yang sudah difilter menjadi 18/20 Kolom Emas ke Sheet1.
 * ============================================================
 */
function importMasterDataChunk(headers, rowsChunk, isFirstChunk, isLastChunk, adminPin) {
  const expectedPin = CONFIG.ADMIN_PIN || '2026';
  if (String(adminPin).trim() !== String(expectedPin).trim()) {
    throw new Error('Akses Ditolak: PIN Keamanan Admin tidak valid.');
  }

  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(CONFIG.SHEET_MASTER);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_MASTER);
  }

  if (isFirstChunk) {
    sheet.clearContents();
    if (headers && headers.length > 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  }

  if (rowsChunk && rowsChunk.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    const numCols = rowsChunk[0].length;
    sheet.getRange(startRow, 1, rowsChunk.length, numCols).setValues(rowsChunk);
  }

  if (isLastChunk) {
    // Segarkan cache dan dataset setelah chunk terakhir selesai
    forceRefreshCache();
  }

  return { success: true, processedRows: rowsChunk ? rowsChunk.length : 0, isComplete: !!isLastChunk };
}

/**
 * Validasi PIN Admin dari modal
 */
function verifyAdminPin(pin) {
  const expectedPin = CONFIG.ADMIN_PIN || '2026';
  const isValid = String(pin).trim() === String(expectedPin).trim();
  return {
    valid: isValid,
    spreadsheetUrl: isValid ? CONFIG.SPREADSHEET_URL : ''
  };
}

/**
 * ============================================================
 * SUBMIT PENGISIAN TRACKING HARIAN LANGSUNG DARI WEB
 * Kontraktor submit baris pengajuan, sistem memvalidasi anti-duplikasi,
 * mengunci status_approval = Pending, dan mengupdate cache.
 * ============================================================
 */
function submitTrackingBatch(records) {
  if (!records || !records.length) {
    throw new Error('Tidak ada data yang diajukan.');
  }

  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(CONFIG.SHEET_TRACKING);
  if (!sheet) {
    throw new Error('Sheet "' + CONFIG.SHEET_TRACKING + '" tidak ditemukan.');
  }

  const lastRow = sheet.getLastRow();
  const existingKeys = {};

  // Baca data yang ada untuk deteksi duplikasi (jika sheet sudah ada isinya)
  if (lastRow >= 2) {
    const dataRange = sheet.getDataRange().getValues();
    const headers = dataRange.shift();
    const col = buildColIndex_(headers);
    const cSo = col['sonumb'];
    const cTahapan = col['tahapan'];
    const cTgl = col['tanggal_pengajuan'];

    if (cSo !== undefined && cTahapan !== undefined && cTgl !== undefined) {
      dataRange.forEach(function (r) {
        const so = cleanStr_(r[cSo]);
        const tahapan = cleanStr_(r[cTahapan]).toLowerCase();
        let tgl = cleanStr_(r[cTgl]);
        if (r[cTgl] instanceof Date) {
          tgl = Utilities.formatDate(r[cTgl], 'GMT+7', 'yyyy-MM-dd');
        }
        if (so) {
          existingKeys[so + '||' + tahapan + '||' + tgl] = true;
          existingKeys[stripLeadingZero_(so) + '||' + tahapan + '||' + tgl] = true;
        }
      });
    }
  }

  const newRows = [];
  let duplicateCount = 0;

  records.forEach(function (rec) {
    const sonumb = cleanStr_(rec.sonumb);
    const tahapan = cleanStr_(rec.tahapan);
    const tgl = cleanStr_(rec.tanggal_pengajuan);
    const key = sonumb + '||' + tahapan.toLowerCase() + '||' + tgl;

    // Lewati jika kombinasi SO + Tahapan + Tanggal sudah pernah diajukan sebelumnya
    if (existingKeys[key] || existingKeys[stripLeadingZero_(sonumb) + '||' + tahapan.toLowerCase() + '||' + tgl]) {
      duplicateCount++;
      return;
    }

    // Tandai agar tidak dobel dalam batch yang sama
    existingKeys[key] = true;

    // Susunan kolom sesuai TRACKING_COLS:
    // ['sonumb', 'site_id', 'mitra', 'jenis', 'tahapan', 'tanggal_pengajuan', 'status_approval', 'approved_by', 'tanggal_approval', 'remarks']
    newRows.push([
      "'" + sonumb,                         // Pastikan format teks agar 0 depan aman
      cleanStr_(rec.site_id),
      cleanStr_(rec.mitra),
      cleanStr_(rec.jenis || 'Project'),
      tahapan,
      tgl,
      'Pending',                            // Otomatis Pending (Anti Manipulasi)
      '',                                   // approved_by dikosongkan (hanya PM saat verifikasi)
      '',                                   // tanggal_approval dikosongkan
      cleanStr_(rec.remarks || '')
    ]);
  });

  if (newRows.length === 0) {
    if (duplicateCount > 0) {
      throw new Error('Semua data yang diajukan (' + duplicateCount + ' baris) terdeteksi sudah pernah ada di sheet sebelumnya (Duplikat).');
    }
    throw new Error('Tidak ada baris data valid untuk ditambahkan.');
  }

  // Tulis ke Google Sheet
  const insertStart = sheet.getLastRow() + 1;
  sheet.getRange(insertStart, 1, newRows.length, 10).setValues(newRows);

  // Segarkan cache agar dashboard langsung update
  forceRefreshCache();

  return {
    success: true,
    insertedCount: newRows.length,
    duplicateCount: duplicateCount
  };
}


