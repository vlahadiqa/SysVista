# SysVista v2.0 — HPC Monitoring Tool

**Mata Kuliah:** Komputasi Tingkat Tinggi (HPC)  
**Dosen:** Lukman Hakim, ST. MT  
**Universitas Muhammadiyah Surabaya — Teknik Informatika**

---

## Deskripsi

SysVista adalah aplikasi *monitoring tool* berbasis web yang memantau penggunaan sumber daya komputer secara *real-time* saat sistem menjalankan berbagai beban kerja komputasi.

## Fitur v2.0

| Fitur | Deskripsi |
|-------|-----------|
| 🔵 Gauge Ring Animasi | Visualisasi CPU, RAM, Suhu, dan Disk I/O dengan ring SVG animasi |
| 🔴 Alert Threshold | Banner peringatan otomatis saat CPU >90%, RAM >85%, atau Suhu >85°C |
| ✨ Particle Background | Animasi partikel di background yang intensitasnya berubah sesuai CPU load |
| ⚡ Stress Test Launcher | Tombol untuk membebani semua core CPU secara penuh, grafik langsung melonjak |
| 🟥 Heatmap Per-Core | Visualisasi warna heatmap untuk setiap core CPU (hijau → amber → merah) |
| 📥 Export CSV | Download log data metrik selama sesi berjalan untuk keperluan analisis/makalah |
| 📊 Grafik Live | Tren 60 detik untuk CPU, RAM, Read/Write Disk |
| 🔍 Proses Aktif | Top 10 proses dengan CPU%, memory, dan status badge |

## Tech Stack

- **Backend:** Python 3 + Flask
- **Monitoring:** `psutil`, `GPUtil`  
- **Frontend:** HTML + CSS + Vanilla JavaScript
- **Grafik:** Chart.js 4
- **Komunikasi:** Server-Sent Events (SSE) — push data tiap 1 detik

## Cara Menjalankan

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Jalankan server

```bash
python app.py
```

### 3. Buka browser

```
http://localhost:5000
```

> Jika di Windows muncul error **Access Denied** saat baca proses, jalankan terminal sebagai **Administrator**.

## Struktur Folder

```
sysvista/
├── app.py                  # Backend Flask — monitoring + stress test API
├── requirements.txt
├── templates/
│   └── index.html          # Dashboard HTML
└── static/
    ├── css/style.css        # Liquid metal dark theme
    └── js/dashboard.js     # Gauge, heatmap, particle, CSV export, SSE
```

## API Endpoints

| Endpoint | Method | Deskripsi |
|----------|--------|-----------|
| `/` | GET | Halaman dashboard |
| `/api/metrics` | GET | Snapshot metrik saat ini (JSON) |
| `/api/stream` | GET | Server-Sent Events stream (tiap 1 detik) |
| `/api/stress` | POST | Start/stop stress test (`{"action":"start"\|"stop"}`) |

## Catatan

- **Suhu CPU** membutuhkan sensor kompatibel. Di Windows kadang tidak tersedia tanpa OpenHardwareMonitor.
- **GPU monitoring** hanya untuk kartu NVIDIA via `GPUtil`.
- Diuji pada **Windows 11, Python 3.11+**.
