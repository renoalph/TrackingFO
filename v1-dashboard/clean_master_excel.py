"""
clean_master_excel.py
Tool pembersih mandiri untuk merampingkan file Excel Master (seperti Jatim_ProjectInformation_*.xlsx)
dari 133 kolom (~18MB) menjadi 18 Golden Columns (~2MB) tanpa merusak struktur data.

Cara pakai:
    python clean_master_excel.py [input_file.xlsx] [output_file.csv]
"""

import sys
import os
import zipfile
import xml.etree.ElementTree as ET
import csv
from datetime import datetime, timedelta

# Daftar 18 Kolom Emas yang dipertahankan (setelah penghapusan latitude & longitude)
GOLDEN_COLUMNS = [
    # 1. Kebutuhan Klien Wajib (Kuning)
    'sonumb',
    'Site_Type',
    'operator_id',
    'Tahapan_Project',
    'Supplier_CME',
    'RFI_date',
    
    # 2. Nilai Tambah Klien (Oren)
    'STIPCategory',
    'COMPANY_ID',
    
    # 3. Kebutuhan Teknis Dashboard & Matching Sistem
    'SONumberNew',
    'STIP_Number',
    'SiteName',
    'Status',
    'kabupaten_name',
    'CLUSTER',
    'Project_Manager',
    'WaspangName',      # FieldController
    'SubmitDate',       # STIP_Submit_Date
    'IntegrationDate'   # RFS_FinishAactual / latest_updated_date
]

DATE_COLUMNS = {'RFI_date', 'SubmitDate', 'IntegrationDate'}

def excel_serial_to_date_str(val):
    if not val:
        return ''
    try:
        fval = float(val)
        if 25000 <= fval <= 65000:
            # Excel base date is 1899-12-30 (due to Excel's 1900 leap year bug)
            d = datetime(1899, 12, 30) + timedelta(days=fval)
            return d.strftime('%Y-%m-%d')
    except (ValueError, TypeError):
        pass
    return str(val).strip()

COLUMN_ALIASES = {
    'sonumb': ['sonumb', 'so_number', 'so number'],
    'Site_Type': ['Site_Type', 'site_type', 'sitetype'],
    'operator_id': ['operator_id', 'operator', 'operator id'],
    'Tahapan_Project': ['Tahapan_Project', 'tahapan_project', 'tahapan'],
    'Supplier_CME': ['Supplier_CME', 'supplier_cme', 'vendor_cme'],
    'RFI_date': ['RFI_date', 'rfi_date', 'rfi date'],
    'STIPCategory': ['STIPCategory', 'stipcategory', 'stip_category'],
    'COMPANY_ID': ['COMPANY_ID', 'company_id', 'company'],
    'SONumberNew': ['SONumberNew', 'sonumber_new', 'so number new'],
    'STIP_Number': ['STIP_Number', 'stip_number', 'stip number'],
    'SiteName': ['SiteName', 'sitename', 'site_name'],
    'Status': ['Status', 'status_project', 'status'],
    'kabupaten_name': ['kabupaten_name', 'kabupaten', 'city'],
    'CLUSTER': ['CLUSTER', 'cluster'],
    'Project_Manager': ['Project_Manager', 'project_manager', 'pm'],
    'WaspangName': ['WaspangName', 'FieldController', 'waspang', 'field_controller'],
    'SubmitDate': ['SubmitDate', 'STIP_Submit_Date', 'stip_submit_date', 'stip_date'],
    'IntegrationDate': ['IntegrationDate', 'RFS_FinishAactual', 'latest_updated_date', 'rfs_actual'],
    'latitude': ['latitude', 'lat'],
    'longitude': ['longitude', 'long', 'lng']
}

def clean_excel(input_path, output_csv_path):
    print(f"[*] Membuka file sumber: {input_path}")
    if not os.path.exists(input_path):
        print(f"[!] Error: File {input_path} tidak ditemukan!")
        return

    file_size_mb = os.path.getsize(input_path) / (1024 * 1024)
    print(f"[*] Ukuran file asli: {file_size_mb:.2f} MB")

    ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

    with zipfile.ZipFile(input_path, 'r') as z:
        print("[*] Membaca shared strings tabel...")
        strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            with z.open('xl/sharedStrings.xml') as f:
                for event, elem in ET.iterparse(f):
                    if elem.tag.endswith('}t'):
                        strings.append(elem.text or '')
                        elem.clear()

        print("[*] Mengurai data baris dari sheet1.xml...")
        with z.open('xl/worksheets/sheet1.xml') as f:
            context = ET.iterparse(f, events=('start', 'end'))
            _, root = next(context)

            target_indices = {}
            total_rows = 0

            with open(output_csv_path, 'w', newline='', encoding='utf-8-sig') as out_f:
                writer = csv.writer(out_f)

                for event, elem in context:
                    if event == 'end' and elem.tag.endswith('}row'):
                        row_r = elem.attrib.get('r', '')
                        cells = elem.findall('s:c', ns)
                        row_vals = {}
                        for c in cells:
                            r_cell = c.attrib.get('r', '')
                            col_letters = ''.join([ch for ch in r_cell if ch.isalpha()])
                            t = c.attrib.get('t', '')
                            v = c.find('s:v', ns)
                            val = ''
                            if v is not None and v.text is not None:
                                if t == 's':
                                    idx = int(v.text)
                                    val = strings[idx] if idx < len(strings) else ''
                                else:
                                    val = v.text
                            row_vals[col_letters] = val

                        if row_r == '1':
                            col_letters_sorted = sorted(row_vals.keys(), key=lambda x: (len(x), x))
                            header_map = {}
                            for let in col_letters_sorted:
                                h_name = row_vals[let].strip()
                                header_map[h_name.lower().replace(' ', '').replace('_', '')] = let

                            mapped_cols = []
                            for g_col in GOLDEN_COLUMNS:
                                matched_letter = None
                                aliases = COLUMN_ALIASES.get(g_col, [g_col])
                                for a in aliases:
                                    norm_a = a.lower().replace(' ', '').replace('_', '')
                                    if norm_a in header_map:
                                        matched_letter = header_map[norm_a]
                                        break
                                target_indices[g_col] = matched_letter
                                mapped_cols.append(g_col)

                            writer.writerow(mapped_cols)
                            print(f"[+] Berhasil memetakan {len(mapped_cols)} Kolom Emas.")
                        else:
                            row_out = []
                            for g_col in GOLDEN_COLUMNS:
                                let = target_indices.get(g_col)
                                val = row_vals.get(let, '') if let else ''
                                if g_col in DATE_COLUMNS and val:
                                    val = excel_serial_to_date_str(val)
                                row_out.append(val)
                            writer.writerow(row_out)
                            total_rows += 1
                            if total_rows % 5000 == 0:
                                print(f"    -> Memproses {total_rows:,} baris...")

                        elem.clear()
                        root.clear()

    out_size_mb = os.path.getsize(output_csv_path) / (1024 * 1024)
    print(f"[V] SELESAI!")
    print(f"    - Total baris berhasil disimpan: {total_rows:,}")
    print(f"    - File hasil: {output_csv_path}")
    print(f"    - Ukuran berkurang dari {file_size_mb:.2f} MB menjadi {out_size_mb:.2f} MB (Hemat {(1 - out_size_mb/file_size_mb)*100:.1f}%)")

if __name__ == '__main__':
    default_in = r'C:\laragon\www\TrackingFO\Jatim_ProjectInformation_140926.xlsx'
    default_out = r'C:\laragon\www\TrackingFO\Jatim_ProjectInformation_Cleaned.csv'
    
    in_file = sys.argv[1] if len(sys.argv) > 1 else default_in
    out_file = sys.argv[2] if len(sys.argv) > 2 else default_out
    
    clean_excel(in_file, out_file)
