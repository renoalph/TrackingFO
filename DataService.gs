/**
 * ============================================================
 * DataService.gs
 * Baca Master (Sheet1) + Tracking_Harian (skema approval baru),
 * gabungkan jadi dataset "merged" per proyek dengan status Match/
 * Gap/Pending Approval.
 * ============================================================
 */

function buildKey_(sonumb, sonumbNew) {
  const so = cleanStr_(sonumb);
  const soNew = cleanStr_(sonumbNew);
  return soNew ? (so + '||' + soNew) : so;
}

function cleanStr_(v) {
  return String(v === null || v === undefined ? '' : v).trim();
}

function stripLeadingZero_(v) {
  return String(v === null || v === undefined ? '' : v).trim().replace(/^0+/, '');
}

function formatDate_(d) {
  return Utilities.formatDate(d, 'GMT+7', 'yyyy-MM-dd');
}

function toDateOrNull_(v) {
  if (v instanceof Date) return v;
  if (!v) return null;
  if (typeof v === 'number' && v > 30000 && v < 60000) {
    // Handle nomor serial tanggal Excel jika ada
    return new Date((v - 25569) * 86400 * 1000);
  }
  const s = String(v).trim();
  if (!s) return null;

  // Format DD/MM/YYYY atau DD-MM-YYYY
  const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? null : d;
  }

  // Format YYYY-MM-DD atau YYYY/MM/DD
  const ymdMatch = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function getYearOrNull_(v) {
  const d = toDateOrNull_(v);
  return d ? d.getFullYear() : null;
}

function isSameDay_(a, b) {
  if (!a || !b) return false;
  const strA = Utilities.formatDate(a, 'GMT+7', 'yyyy-MM-dd');
  const strB = Utilities.formatDate(b, 'GMT+7', 'yyyy-MM-dd');
  return strA === strB;
}

function buildColIndex_(headers) {
  const col = {};
  headers.forEach(function (h, i) {
    const name = cleanStr_(h);
    if (name) {
      col[name] = i;
      // Normalisasi (huruf kecil tanpa spasi dan underscore) agar kebal perbedaan kapital/spasi
      const norm = name.toLowerCase().replace(/[\s_]/g, '');
      if (col[norm] === undefined) col[norm] = i;
    }
  });
  return col;
}

// ------------------------------------------------------------------
// MASTER (Sheet1)
// ------------------------------------------------------------------

/**
 * Daftar mapping alias adaptif kolom master.
 * Format: nama properti internal -> array kemungkinan nama kolom di sheet Excel/Google Sheets
 */
const MASTER_COL_ALIASES = {
  sonumb: ['sonumb', 'so_number', 'so number'],
  SONumberNew: ['SONumberNew', 'sonumber_new', 'so number new'],
  SiteName: ['SiteName', 'sitename', 'site_name', 'site name'],
  operator_id: ['operator_id', 'operator', 'operator id', 'opr'],
  Site_Type: ['Site_Type', 'sitetype', 'site_type', 'site type'],
  Tahapan_Project: ['Tahapan_Project', 'tahapan_project', 'tahapan project', 'tahapan'],
  Status: ['Status', 'status_project', 'status'],
  kabupaten_name: ['kabupaten_name', 'kabupaten', 'kabupaten name', 'city'],
  province_name: ['province_name', 'province', 'provinsi'],
  RFS_FinishAactual: ['RFS_FinishAactual', 'RFS_Finish_Actual', 'IntegrationDate', 'latest_updated_date', 'rfs_actual'],
  RFI_date: ['RFI_date', 'rfi_date', 'rfi date'],
  TowerType: ['TowerType', 'towertype', 'tower_type'],
  ProjectName: ['ProjectName', 'projectname', 'project_name'],
  CLUSTER: ['CLUSTER', 'cluster'],
  latitude: ['latitude', 'lat'],
  longitude: ['longitude', 'long', 'lng'],
  Project_Manager: ['Project_Manager', 'project_manager', 'pm', 'lead_pm'],
  WaspangName: ['WaspangName', 'waspang', 'FieldController', 'field_controller'],
  STIP_Submit_Date: ['STIP_Submit_Date', 'stip_submit_date', 'stip_date', 'SubmitDate'],
  STIP_Number: ['STIP_Number', 'stip_number', 'stip number', 'STIPNumber'],
  Supplier_CME: ['Supplier_CME', 'supplier_cme', 'supplier cme', 'vendor_cme', 'vendor'],
  STIPCategory: ['STIPCategory', 'stipcategory', 'stip_category', 'stip category'],
  COMPANY_ID: ['COMPANY_ID', 'company_id', 'company']
};

function normalizeTahapan_(t) {
  if (!t) return '';
  const s = String(t).trim();
  const lower = s.toLowerCase();
  if (lower.indexOf('rfs') !== -1) return 'RFS';
  if (lower.indexOf('otdr') !== -1) return 'OTDR';
  if (lower.indexOf('civil') !== -1 || lower.indexOf('fo &') !== -1 || lower.indexOf('fo and') !== -1) return 'FO & Civil Works';
  if (lower.indexOf('onsite') !== -1 || lower.indexOf('on site') !== -1) return 'Material Onsite';
  if (lower.indexOf('delivery') !== -1) return 'Material Delivery';
  if (lower.indexOf('ssr') !== -1 || lower.indexOf('tssr') !== -1 || lower.indexOf('esr') !== -1) return 'SSR/TSSR/ESR';
  if (lower.indexOf('apd') !== -1) return 'APD';
  if (lower.indexOf('assignment') !== -1 || lower.indexOf('pm assign') !== -1) return 'Project Manager Assignment';
  if (lower.indexOf('stip') !== -1) return 'STIP';
  return s;
}

function resolveColIndex_(colIndex, aliases) {
  for (let i = 0; i < aliases.length; i++) {
    const a = aliases[i];
    if (colIndex[a] !== undefined) return colIndex[a];
    const norm = a.toLowerCase().replace(/[\s_]/g, '');
    if (colIndex[norm] !== undefined) return colIndex[norm];
  }
  return undefined;
}

function readMasterRaw_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_MASTER);
  if (!sheet) throw new Error('Sheet Master "' + CONFIG.SHEET_MASTER + '" tidak ditemukan.');

  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  const rawCol = buildColIndex_(headers);

  // Mapping adaptif: cari kolom berdasarkan alias
  const col = {};
  const requiredKeys = ['sonumb', 'SiteName', 'operator_id', 'Tahapan_Project', 'Status'];
  const missing = [];

  Object.keys(MASTER_COL_ALIASES).forEach(function (propKey) {
    const idx = resolveColIndex_(rawCol, MASTER_COL_ALIASES[propKey]);
    if (idx !== undefined) {
      col[propKey] = idx;
    } else if (requiredKeys.indexOf(propKey) !== -1) {
      missing.push(propKey);
    }
  });

  if (missing.length) {
    throw new Error('Kolom Master wajib berikut tidak ditemukan: ' + missing.join(', '));
  }

  return { col: col, rows: data };
}

function buildMasterMap_(raw, trackingResult) {
  const col = raw.col;
  const rows = raw.rows;
  const map = {};
  const sonumbCount = {};
  const filterOptions = { operator: {}, yearPeriod: {}, kabupaten: {}, tahapan: {} };
  const activeTrackings = (trackingResult && trackingResult.bySonumbOnly) ? trackingResult.bySonumbOnly : {};

  // Hitung frekuensi sonumb
  rows.forEach(function (row) {
    const sonumb = cleanStr_(row[col.sonumb]);
    if (!sonumb) return;
    sonumbCount[sonumb] = (sonumbCount[sonumb] || 0) + 1;
  });

  rows.forEach(function (row) {
    const sonumb = cleanStr_(row[col.sonumb]);
    if (!sonumb) return;

    const rfsDate = col.RFS_FinishAactual !== undefined ? toDateOrNull_(row[col.RFS_FinishAactual]) : null;
    const rfiDate = col.RFI_date !== undefined ? toDateOrNull_(row[col.RFI_date]) : null;
    const stipDate = col.STIP_Submit_Date !== undefined ? toDateOrNull_(row[col.STIP_Submit_Date]) : null;

    const stipYear = stipDate ? stipDate.getFullYear() : null;
    const rfsYear = rfsDate ? rfsDate.getFullYear() : null;
    const rfiYear = rfiDate ? rfiDate.getFullYear() : null;

    const statusMaster = col.Status !== undefined ? cleanStr_(row[col.Status]).toUpperCase() : '';
    const tahapanMaster = col.Tahapan_Project !== undefined ? cleanStr_(row[col.Tahapan_Project]).toUpperCase() : '';
    const isActiveOperational = ['CME', 'SITAC', 'STIP_APPROVAL'].indexOf(statusMaster) !== -1 ||
                                ['CIP', 'STIP'].indexOf(tahapanMaster) !== -1;

    // Klasifikasi periode tahun proyek (mencakup proyek aktif rentang 2025-2026 & yang berjalan di lapangan)
    let projectYear = '';
    const strippedSo = stripLeadingZero_(sonumb);
    const hasActiveTracking = !!(activeTrackings[sonumb] || (strippedSo && activeTrackings[strippedSo]));
    if (stipYear >= 2025 || rfsYear >= 2025 || rfiYear >= 2025 || hasActiveTracking || isActiveOperational) {
      projectYear = '2025-2026';
    } else if (stipYear) {
      projectYear = String(stipYear);
    } else if (rfsYear) {
      projectYear = String(rfsYear);
    } else if (rfiYear) {
      projectYear = String(rfiYear);
    } else {
      projectYear = 'Lainnya';
    }

    const sonumbNew = col.SONumberNew !== undefined ? cleanStr_(row[col.SONumberNew]) : '';
    const key = buildKey_(sonumb, sonumbNew);
    const stipNumber = col.STIP_Number !== undefined ? cleanStr_(row[col.STIP_Number]) : '';

    const lat = col.latitude !== undefined ? parseFloat(row[col.latitude]) : NaN;
    const lng = col.longitude !== undefined ? parseFloat(row[col.longitude]) : NaN;

    const entry = {
      key: key,
      sonumb: sonumb,
      sonumbNew: sonumbNew,
      stipNumber: stipNumber,
      stipDate: stipDate,
      projectYear: projectYear,
      siteName: col.SiteName !== undefined ? cleanStr_(row[col.SiteName]) : '',
      operatorId: col.operator_id !== undefined ? cleanStr_(row[col.operator_id]) : '',
      siteType: col.Site_Type !== undefined ? cleanStr_(row[col.Site_Type]) : '',
      kabupaten: col.kabupaten_name !== undefined ? cleanStr_(row[col.kabupaten_name]) : '',
      provinceName: col.province_name !== undefined ? cleanStr_(row[col.province_name]) : '',
      tahapanMaster: col.Tahapan_Project !== undefined ? cleanStr_(row[col.Tahapan_Project]) : '',
      statusMaster: col.Status !== undefined ? cleanStr_(row[col.Status]) : '',
      towerType: col.TowerType !== undefined ? cleanStr_(row[col.TowerType]) : '',
      projectName: col.ProjectName !== undefined ? cleanStr_(row[col.ProjectName]) : '',
      cluster: col.CLUSTER !== undefined ? cleanStr_(row[col.CLUSTER]) : '',
      latitude: isNaN(lat) ? null : lat,
      longitude: isNaN(lng) ? null : lng,
      pm: col.Project_Manager !== undefined ? cleanStr_(row[col.Project_Manager]) : '',
      waspang: col.WaspangName !== undefined ? cleanStr_(row[col.WaspangName]) : '',
      masterRfsDate: rfsDate,
      rfiDate: rfiDate,
      supplierCme: col.Supplier_CME !== undefined ? cleanStr_(row[col.Supplier_CME]) : '',
      stipCategory: col.STIPCategory !== undefined ? cleanStr_(row[col.STIPCategory]) : '',
      companyId: col.COMPANY_ID !== undefined ? cleanStr_(row[col.COMPANY_ID]) : ''
    };

    map[key] = entry;
    if (entry.operatorId) filterOptions.operator[entry.operatorId] = true;
    if (entry.kabupaten) filterOptions.kabupaten[entry.kabupaten] = true;
    if (projectYear) filterOptions.yearPeriod[projectYear] = true;
  });

  return { map: map, filterOptions: filterOptions, sonumbCount: sonumbCount, totalMasterRows: rows.length };
}

// ------------------------------------------------------------------
// TRACKING_HARIAN (skema approval baru)
// ------------------------------------------------------------------

const TRACKING_COLS = ['sonumb', 'site_id', 'mitra', 'jenis', 'tahapan',
  'tanggal_pengajuan', 'status_approval', 'approved_by', 'tanggal_approval', 'remarks'];

function readTrackingLatestRaw_() {
  const byComposite = {};
  const bySonumbOnly = {};

  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_TRACKING);
  if (!sheet || sheet.getLastRow() < 2) return { byComposite: byComposite, bySonumbOnly: bySonumbOnly };

  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  const col = buildColIndex_(headers);

  const getCol = function (c) {
    const norm = c.toLowerCase().replace(/[\s_]/g, '');
    return col[c] !== undefined ? col[c] : col[norm];
  };

  const required = ['sonumb', 'tahapan', 'tanggal_pengajuan', 'status_approval', 'approved_by', 'tanggal_approval', 'mitra', 'remarks'];
  const missing = required.filter(function (c) { return getCol(c) === undefined; });
  if (missing.length) throw new Error('Kolom Tracking_Harian berikut tidak ditemukan: ' + missing.join(', '));

  function isNewer(candidate, current) {
    if (!current) return true;
    if (!candidate.tanggal_pengajuan) return false;
    if (!current.tanggal_pengajuan) return true;
    return candidate.tanggal_pengajuan >= current.tanggal_pengajuan;
  }

  const cSonumb = getCol('sonumb');
  const cSonumbNew = getCol('SONumberNew');
  const cSiteId = getCol('site_id');
  const cMitra = getCol('mitra');
  const cJenis = getCol('jenis');
  const cTahapan = getCol('tahapan');
  const cTglPengajuan = getCol('tanggal_pengajuan');
  const cStatusApproval = getCol('status_approval');
  const cApprovedBy = getCol('approved_by');
  const cTglApproval = getCol('tanggal_approval');
  const cRemarks = getCol('remarks');

  data.forEach(function (row) {
    const sonumb = cleanStr_(row[cSonumb]);
    if (!sonumb) return;
    const sonumbNew = cSonumbNew !== undefined ? cleanStr_(row[cSonumbNew]) : '';

    const rec = {
      siteId: cSiteId !== undefined ? cleanStr_(row[cSiteId]) : '',
      mitra: cleanStr_(row[cMitra]),
      jenis: cJenis !== undefined ? cleanStr_(row[cJenis]) : '',
      tahapan: normalizeTahapan_(cleanStr_(row[cTahapan])),
      tanggal_pengajuan: toDateOrNull_(row[cTglPengajuan]),
      statusApproval: cleanStr_(row[cStatusApproval]),
      approvedBy: cleanStr_(row[cApprovedBy]),
      tanggalApproval: toDateOrNull_(row[cTglApproval]),
      remarks: cleanStr_(row[cRemarks])
    };

    const strippedSo = stripLeadingZero_(sonumb);
    if (isNewer(rec, bySonumbOnly[sonumb])) bySonumbOnly[sonumb] = rec;
    if (strippedSo && isNewer(rec, bySonumbOnly[strippedSo])) bySonumbOnly[strippedSo] = rec;

    const key = buildKey_(sonumb, sonumbNew);
    if (isNewer(rec, byComposite[key])) byComposite[key] = rec;
    if (strippedSo) {
      const strippedKey = buildKey_(strippedSo, sonumbNew);
      if (isNewer(rec, byComposite[strippedKey])) byComposite[strippedKey] = rec;
    }
  });

  return { byComposite: byComposite, bySonumbOnly: bySonumbOnly };
}

/** Riwayat lengkap pengajuan approval untuk satu sonumb (panel detail). */
function getProjectHistory_(sonumb) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_TRACKING);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  const colIndex = buildColIndex_(headers);
  const getCol = function (c) {
    const norm = c.toLowerCase().replace(/[\s_]/g, '');
    return colIndex[c] !== undefined ? colIndex[c] : colIndex[norm];
  };

  const cSonumb = getCol('sonumb');
  const cTahapan = getCol('tahapan');
  const cTglPengajuan = getCol('tanggal_pengajuan');
  const cStatusApproval = getCol('status_approval');
  const cApprovedBy = getCol('approved_by');
  const cTglApproval = getCol('tanggal_approval');
  const cRemarks = getCol('remarks');
  const cMitra = getCol('mitra');

  const targetSo = cleanStr_(sonumb);
  const targetStripped = stripLeadingZero_(targetSo);

  return data
    .filter(function (row) {
      const s = cleanStr_(row[cSonumb]);
      return s === targetSo || (targetStripped && stripLeadingZero_(s) === targetStripped);
    })
    .map(function (row) {
      const tglAjuan = toDateOrNull_(row[cTglPengajuan]);
      const tglApprove = toDateOrNull_(row[cTglApproval]);
      return {
        tahapan: normalizeTahapan_(cleanStr_(row[cTahapan])),
        tanggalPengajuan: tglAjuan ? formatDate_(tglAjuan) : '',
        statusApproval: cleanStr_(row[cStatusApproval]),
        approvedBy: cleanStr_(row[cApprovedBy]),
        tanggalApproval: tglApprove ? formatDate_(tglApprove) : '',
        remarks: cleanStr_(row[cRemarks]),
        mitra: cleanStr_(row[cMitra])
      };
    })
    .sort(function (a, b) { return a.tanggalPengajuan < b.tanggalPengajuan ? 1 : (a.tanggalPengajuan > b.tanggalPengajuan ? -1 : 0); });
}

// ------------------------------------------------------------------
// MERGE
// ------------------------------------------------------------------

function mergeData_(masterResult, trackingResult) {
  const masterMap = masterResult.map;
  const sonumbCount = masterResult.sonumbCount;
  const byComposite = trackingResult.byComposite;
  const bySonumbOnly = trackingResult.bySonumbOnly;
  const today = new Date();
  const merged = [];

  Object.keys(masterMap).forEach(function (key) {
    const m = masterMap[key];
    let t = byComposite[key];
    let ambiguousTracking = false;

    if (!t) {
      const strippedKey = buildKey_(stripLeadingZero_(m.sonumb), m.sonumbNew);
      t = byComposite[strippedKey];
    }

    if (!t) {
      t = bySonumbOnly[m.sonumb] || bySonumbOnly[stripLeadingZero_(m.sonumb)];
      if (t && sonumbCount[m.sonumb] > 1) ambiguousTracking = true;
    }

    const hasTracking = !!t;
    const statusApproval = t ? t.statusApproval : '';
    const isDone = statusApproval.toLowerCase() === 'done';
    const isPending = statusApproval.toLowerCase() === 'pending';
    const isTahapanRfs = !!(t && t.tahapan && t.tahapan.toLowerCase().indexOf('rfs') !== -1);

    // finalStatus: klasifikasi 3-kelas dari sisi AKTUAL (Tracking), dipakai
    // utk KPI & chart perbandingan Aktual vs Sistem.
    let finalStatus;
    if (!hasTracking) finalStatus = 'BELUM_ADA_PENGAJUAN';
    else if (isDone && isTahapanRfs) finalStatus = 'RFS_SELESAI';
    else finalStatus = 'DALAM_PROSES';

    // statusBadge: MATCH / GAP / PENDING — dipakai kolom "Status" di tabel.
    // ASUMSI (perlu diverifikasi bersama klien): karena Tahapan_Project di
    // Master memakai istilah lama (BAPS/RFI/CIP/dst) sedangkan "tahapan" di
    // Tracking memakai 9 milestone baru (STIP..RFS), keduanya TIDAK bisa
    // dicocokkan kata-per-kata. Maka deteksi GAP difokuskan ke 2 pola yang
    // paling jelas & paling penting secara bisnis:
    //   1) RFS sudah di-approve PM di lapangan, tapi Master belum tercatat RFS
    //      (persis kasus time-lag yang jadi keluhan utama klien).
    //   2) Master menunjukkan CANCEL/PRECANCEL padahal lapangan aktif disetujui.
    let statusBadge;
    if (!hasTracking || isPending) {
      statusBadge = 'PENDING';
    } else if (isDone) {
      const rfsGap = isTahapanRfs && !m.masterRfsDate;
      const cancelledInMaster = ['CANCEL', 'PRECANCEL'].indexOf(String(m.statusMaster).toUpperCase()) !== -1;
      statusBadge = (rfsGap || cancelledInMaster) ? 'GAP' : 'MATCH';
    } else {
      statusBadge = 'PENDING';
    }

    const trackingRfsDate = (isDone && isTahapanRfs && t && t.tanggalApproval) ? t.tanggalApproval : null;
    const approvedToday = !!(isDone && t && t.tanggalApproval && isSameDay_(t.tanggalApproval, today));

    merged.push({
      key: m.key,
      sonumb: m.sonumb,
      sonumbNew: m.sonumbNew,
      siteName: m.siteName,
      operatorId: m.operatorId,
      siteType: m.siteType,
      kabupaten: m.kabupaten,
      provinceName: m.provinceName,
      tahapanMaster: m.tahapanMaster,
      statusMaster: m.statusMaster,
      towerType: m.towerType,
      projectName: m.projectName,
      cluster: m.cluster,
      pm: m.pm,
      waspang: m.waspang,
      masterRfsDate: m.masterRfsDate ? formatDate_(m.masterRfsDate) : '',
      rfiDate: m.rfiDate ? formatDate_(m.rfiDate) : '',
      supplierCme: m.supplierCme || '',
      stipCategory: m.stipCategory || '',
      companyId: m.companyId || '',

      // STIP Number: gunakan STIP_Number dari Master jika ada, fallback ke site_id dari Tracking
      stipNumber: m.stipNumber || (t ? t.siteId : ''),

      mitra: t ? t.mitra : '',
      jenis: t ? t.jenis : '',
      tahapanAktual: statusApproval ? statusApproval : '', // dipakai internal
      tahapan: t ? t.tahapan : '',
      tanggalPengajuan: (t && t.tanggal_pengajuan) ? formatDate_(t.tanggal_pengajuan) : '',
      statusApproval: statusApproval,
      approvedBy: t ? t.approvedBy : '',
      tanggalApproval: (t && t.tanggalApproval) ? formatDate_(t.tanggalApproval) : '',
      remarks: t ? t.remarks : '',

      hasTracking: hasTracking,
      finalStatus: finalStatus,
      statusBadge: statusBadge,
      trackingRfsDate: trackingRfsDate ? formatDate_(trackingRfsDate) : '',
      approvedToday: approvedToday,
      ambiguousTracking: ambiguousTracking,
      projectYear: m.projectYear || 'Lainnya'
    });
  });

  return { merged: merged, filterOptions: masterResult.filterOptions, totalMasterRows: masterResult.totalMasterRows };
}

function buildFreshDataset_() {
  const masterRaw = readMasterRaw_();
  const trackingResult = readTrackingLatestRaw_();
  const masterResult = buildMasterMap_(masterRaw, trackingResult);
  const result = mergeData_(masterResult, trackingResult);

  // Lengkapi filterOptions dgn dimensi dari sisi tracking (mitra, approvedBy, tahapan)
  const mitraSet = {};
  const approvedBySet = {};
  const tahapanSet = {};
  MILESTONE_STAGES.forEach(function (s) { tahapanSet[s] = true; });

  result.merged.forEach(function (m) {
    if (m.mitra) mitraSet[m.mitra] = true;
    if (m.approvedBy) approvedBySet[m.approvedBy] = true;
    if (m.tahapan) tahapanSet[m.tahapan] = true;
  });
  result.filterOptions.mitra = mitraSet;
  result.filterOptions.approvedBy = approvedBySet;
  result.filterOptions.tahapan = tahapanSet;

  return result;
}
