# Tracking CME — Mobile Web App (Proyek JATIM)

Aplikasi web mobile khusus untuk **Tracking Milestone CME** (*Civil, Mechanical, and Electrical*) dan **Form Pengajuan Progres Lapangan** oleh mitra kontraktor ke Project Manager (PM).

Dirancang khusus untuk kebutuhan mobile (smartphone) dengan tampilan responsif, garis progres timeline ("Udah Sampai Mana"), form upload dokumentasi, dan activity feed.

---

## 🚀 Fitur Utama
1. **Timeline Tracker ("Udah Sampai Mana")**:
   - Visualisasi tahapan milestone real-time: `STIP` ➔ `Survey & APD` ➔ `Material Onsite` ➔ `CME & Civil Works` ➔ `OTDR Testing` ➔ `RFS (Ready For Service)`.
   - Pencarian instan berdasarkan SO Number / Nama Site.
   - Filter cepat (Semua, Sedang Dikerjakan, RFS, Review PM).
2. **Form Pengajuan Lapangan (CME Submission)**:
   - Input cepat SO Number, Site ID, Mitra, dan Tahapan.
   - Selector persentase progres (25%, 50%, 75%, 100%).
   - Upload foto bukti fisik pengerjaan langsung dari kamera HP.
   - Otomatis diset ke status `Pending Review` untuk verifikasi approval PM.
3. **Riwayat Pengajuan**:
   - Log pengajuan harian lapangan dengan label status approval.

---

## 🌐 Cara Deploy ke Vercel (`tracking-cme.vercel.app`)

### Opsi A: Deploy Langsung via Vercel CLI (1 Menit)
1. Buka terminal di folder ini:
   ```bash
   cd tracking-cme
   ```
2. Jalankan:
   ```bash
   npx vercel
   ```
3. Ikuti prompt (pilih nama proyek: `tracking-cme`). Web langsung live di `https://tracking-cme.vercel.app`!

### Opsi B: Deploy via GitHub
1. Hubungkan repo ini ke GitHub.
2. Di dashboard [Vercel](https://vercel.com):
   - Klik **Add New Project** -> Pilih repository.
   - Di bagian **Root Directory**, pilih folder: `tracking-cme`.
   - Set project name: `tracking-cme`.
   - Klik **Deploy**!
