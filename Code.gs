/**
 * ============================================================
 * MONITORING APPROVAL RFS - PROYEK JATIM
 * Code.gs — Entry point & konfigurasi utama
 * ============================================================
 * Versi ini fokus ke alur kerja approval mitra->PM, sesuai
 * skema baru tab "Tracking_Harian":
 *   sonumb, site_id, mitra, jenis, tahapan, tanggal_pengajuan,
 *   status_approval (Done/Pending), approved_by, tanggal_approval, remarks
 */

const CONFIG = {
  SPREADSHEET_ID: '1LSH_HHMbYaWYEoRAnEyMm-0xHKjTm1No',
  SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/1LSH_HHMbYaWYEoRAnEyMm-0xHKjTm1No/edit?usp=sharing&ouid=102001982908865439766&rtpof=true&sd=true',

  SHEET_MASTER: 'Sheet1',
  SHEET_TRACKING: 'Tracking_Harian',
  SHEET_CACHE: 'Cache_Merged', // dibuat & disembunyikan otomatis oleh sistem

  CACHE_TTL_MINUTES: 360, // 6 jam
  DEFAULT_PAGE_SIZE: 50,
  DEFAULT_YEAR_FILTER: '2026', // Default filter tampilan: Proyek Aktif 2026
  APP_TITLE: 'Tracking FO',
  APP_SUBTITLE: 'Monitoring Milestone & Sinkronisasi Approval Lapangan dengan Sistem Pusat'
};

// Urutan milestone alur kerja lapangan (dipakai funnel chart & referensi RFS).
// ASUMSI: field "tahapan" di Tracking_Harian diisi salah satu dari 9 nilai ini.
const MILESTONE_STAGES = [
  'STIP', 'Project Manager Assignment', 'APD', 'SSR/TSSR/ESR',
  'Material Delivery', 'Material Onsite', 'FO & Civil Works', 'OTDR', 'RFS'
];

function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(CONFIG.APP_TITLE)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
