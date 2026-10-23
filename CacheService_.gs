/**
 * ============================================================
 * CacheService_.gs
 * Lapisan caching agar Master (26k+ baris) & Tracking_Harian
 * tidak dibaca ulang penuh di setiap request.
 *
 * Nama file diberi akhiran underscore ("CacheService_") supaya
 * tidak bentrok dengan kelas bawaan Apps Script "CacheService".
 * ============================================================
 */

const CACHE_FIELDS = [
  'key', 'sonumb', 'sonumbNew', 'siteName', 'operatorId', 'siteType',
  'kabupaten', 'provinceName', 'tahapanMaster', 'statusMaster', 'towerType',
  'projectName', 'cluster', 'pm', 'waspang', 'masterRfsDate',
  'stipNumber', 'mitra', 'jenis', 'tahapan', 'tanggalPengajuan',
  'statusApproval', 'approvedBy', 'tanggalApproval', 'remarks',
  'hasTracking', 'finalStatus', 'statusBadge', 'trackingRfsDate',
  'approvedToday', 'ambiguousTracking', 'projectYear'
];

/** Kolom ringan yang dikirim ke browser untuk render tabel */
const TABLE_PAYLOAD_FIELDS = [
  'key', 'sonumb', 'siteName', 'operatorId', 'kabupaten', 'mitra', 'stipNumber',
  'jenis', 'tahapanMaster', 'tahapan', 'statusApproval', 'approvedBy', 'tanggalPengajuan',
  'tanggalApproval', 'remarks', 'statusBadge', 'ambiguousTracking', 'projectYear'
];

/**
 * Mengambil dataset (dari Cache Sheet jika valid, atau rebuild jika expired).
 */
function getOrBuildDataset_(forceRefresh) {
  if (!forceRefresh && isCacheValid_()) {
    const cached = readCacheSheet_();
    if (cached) return cached;
  }
  return rebuildAndCache_();
}

const CACHE_VERSION = 'V_2026_LEAN_12';

function isCacheValid_() {
  const props = PropertiesService.getScriptProperties();
  const v = props.getProperty('CACHE_VERSION');
  if (v !== CACHE_VERSION) return false; // Otomatis refresh jika versi kode berubah

  const ts = props.getProperty('CACHE_TIMESTAMP');
  if (!ts) return false;
  const ageMinutes = (Date.now() - Number(ts)) / 60000;
  return ageMinutes < CONFIG.CACHE_TTL_MINUTES;
}

function rebuildAndCache_() {
  const result = buildFreshDataset_();
  writeCacheSheet_(result.merged);
  writeFilterOptionsCache_(result.filterOptions);
  
  const props = PropertiesService.getScriptProperties();
  props.setProperty('CACHE_VERSION', CACHE_VERSION);
  props.setProperty('CACHE_TIMESTAMP', String(Date.now()));
  props.setProperty('CACHE_TOTAL_MASTER_ROWS', String(result.totalMasterRows || result.merged.length));

  // Invalidate memory ScriptCache summary agar terhitung ulang
  try {
    const cache = CacheService.getScriptCache();
    cache.remove('DASHBOARD_SUMMARY_V1');
    removeLargeCache_(cache, 'BOOTSTRAP_PAYLOAD_V2');
    removeLargeCache_(cache, 'BOOTSTRAP_PAYLOAD_V3');
    removeLargeCache_(cache, 'BOOTSTRAP_PAYLOAD_V4');
    removeLargeCache_(cache, 'BOOTSTRAP_PAYLOAD_V5');
    removeLargeCache_(cache, 'BOOTSTRAP_PAYLOAD_V6');
  } catch (err) { /* abaikan */ }

  return result;
}

function getCacheSheet_(createIfMissing) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(CONFIG.SHEET_CACHE);
  if (!sheet && createIfMissing) {
    sheet = ss.insertSheet(CONFIG.SHEET_CACHE);
    try { sheet.hideSheet(); } catch (err) { /* abaikan */ }
  }
  return sheet;
}

function writeCacheSheet_(merged) {
  const sheet = getCacheSheet_(true);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, CACHE_FIELDS.length).setValues([CACHE_FIELDS]);
  if (!merged || merged.length === 0) return;

  // HANYA simpan proyek aktif / relevan (2025-2026 / CIP / tracking / on-progress) agar penulisan sheet < 1 detik (anti-timeout!)
  const activeItems = merged.filter(function (item) {
    const yr = String(item.projectYear || '').trim();
    return item.hasTracking || yr === '2026' || yr === '2025' || yr === '2025-2026' || yr === 'CIP' ||
           ['CME', 'SITAC', 'STIP_APPROVAL'].indexOf(String(item.statusMaster || '').toUpperCase()) !== -1;
  });

  const targetList = activeItems.length ? activeItems : merged.slice(0, 2000);
  const rows = targetList.map(function (item) {
    return CACHE_FIELDS.map(function (f) {
      const v = item[f];
      return (v === null || v === undefined) ? '' : v;
    });
  });
  sheet.getRange(2, 1, rows.length, CACHE_FIELDS.length).setValues(rows);
}

function readCacheSheet_() {
  const sheet = getCacheSheet_(false);
  if (!sheet || sheet.getLastRow() < 2) return null;

  const data = sheet.getDataRange().getValues();
  const headers = data.shift();

  // Mapping nama kolom adaptif berdasarkan header baris 1
  const colMap = {};
  headers.forEach(function (h, idx) {
    if (h) colMap[String(h).trim()] = idx;
  });

  const merged = data.map(function (row) {
    const obj = {};
    CACHE_FIELDS.forEach(function (f, i) {
      const idx = colMap[f] !== undefined ? colMap[f] : i;
      let val = row[idx];
      // Normalisasi tipe data: cegah error Date dan number
      if (val instanceof Date) {
        val = Utilities.formatDate(val, 'GMT+7', 'yyyy-MM-dd');
      } else if (val !== null && val !== undefined) {
        val = String(val).trim();
      } else {
        val = '';
      }
      obj[f] = val;
    });
    obj.hasTracking = (obj.hasTracking === true || obj.hasTracking === 'TRUE' || obj.hasTracking === 'true');
    obj.approvedToday = (obj.approvedToday === true || obj.approvedToday === 'TRUE' || obj.approvedToday === 'true');
    obj.ambiguousTracking = (obj.ambiguousTracking === true || obj.ambiguousTracking === 'TRUE' || obj.ambiguousTracking === 'true');
    return obj;
  });

  const filterOptionsRaw = PropertiesService.getScriptProperties().getProperty('CACHE_FILTER_OPTIONS');
  const filterOptions = filterOptionsRaw ? JSON.parse(filterOptionsRaw) : {};
  const totalMasterRaw = PropertiesService.getScriptProperties().getProperty('CACHE_TOTAL_MASTER_ROWS');
  const totalMasterRows = totalMasterRaw ? Number(totalMasterRaw) : merged.length;

  return { merged: merged, filterOptions: filterOptions, totalMasterRows: totalMasterRows };
}

function writeFilterOptionsCache_(filterOptions) {
  const plain = {};
  Object.keys(filterOptions).forEach(function (k) {
    plain[k] = Object.keys(filterOptions[k]).sort();
  });
  PropertiesService.getScriptProperties().setProperty('CACHE_FILTER_OPTIONS', JSON.stringify(plain));
}

/**
 * Memotong objek proyek ke field tabel minimal agar ukuran payload JSON kecil dan cepat ditransfer.
 */
function stripToTablePayload_(items) {
  return (items || []).map(function (item) {
    const min = {};
    TABLE_PAYLOAD_FIELDS.forEach(function (f) {
      let v = item[f];
      if (v instanceof Date) {
        v = Utilities.formatDate(v, 'GMT+7', 'yyyy-MM-dd');
      }
      min[f] = (v !== null && v !== undefined) ? v : '';
    });
    return min;
  });
}

/**
 * Menyimpan JSON string besar ke ScriptCache (RAM GAS) dengan teknik chunking
 * agar tidak terbentur limit 100KB per key. TTL default 6 jam (21600 detik).
 */
function putLargeCache_(cache, baseKey, jsonStr, ttlSec) {
  try {
    const ttl = ttlSec || 21600;
    const CHUNK_SIZE = 90000; // 90KB safe margin di bawah 100KB
    const numChunks = Math.ceil(jsonStr.length / CHUNK_SIZE);
    const entries = {};
    for (let i = 0; i < numChunks; i++) {
      entries[baseKey + '_c_' + i] = jsonStr.substr(i * CHUNK_SIZE, CHUNK_SIZE);
    }
    entries[baseKey + '_meta'] = JSON.stringify({ numChunks: numChunks });
    cache.putAll(entries, ttl);
  } catch (err) {
    // Abaikan jika quota cache meluap
  }
}

/**
 * Mengambil JSON string besar yang disimpan secara chunked dari ScriptCache.
 */
function getLargeCache_(cache, baseKey) {
  try {
    const metaStr = cache.get(baseKey + '_meta');
    if (!metaStr) return null;
    const meta = JSON.parse(metaStr);
    const keys = [];
    for (let i = 0; i < meta.numChunks; i++) {
      keys.push(baseKey + '_c_' + i);
    }
    const chunkMap = cache.getAll(keys);
    let fullStr = '';
    for (let i = 0; i < meta.numChunks; i++) {
      const c = chunkMap[baseKey + '_c_' + i];
      if (!c) return null; // data chunk ada yang hilang/expired
      fullStr += c;
    }
    return fullStr;
  } catch (err) {
    return null;
  }
}

/**
 * Menghapus cache chunked dari ScriptCache.
 */
function removeLargeCache_(cache, baseKey) {
  try {
    const metaStr = cache.get(baseKey + '_meta');
    if (metaStr) {
      const meta = JSON.parse(metaStr);
      const keys = [baseKey + '_meta'];
      for (let i = 0; i < meta.numChunks; i++) {
        keys.push(baseKey + '_c_' + i);
      }
      cache.removeAll(keys);
    }
  } catch (err) { /* abaikan */ }
}

