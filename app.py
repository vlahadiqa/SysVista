import json, time, threading, psutil, os
from flask import Flask, render_template, Response, jsonify, request, send_from_directory

app = Flask(__name__)

try:
    import GPUtil
    GPU_AVAILABLE = True
except ImportError:
    GPU_AVAILABLE = False

_stress_active  = False
_stress_threads = []
_stress_lock    = threading.Lock()

def _stress_worker():
    while _stress_active:
        _ = sum(i * i for i in range(10000))

def collect_metrics():
    cpu_percent  = psutil.cpu_percent(interval=0.4)
    cpu_freq     = psutil.cpu_freq()
    cpu_freq_mhz = round(cpu_freq.current) if cpu_freq else 0
    cpu_cores    = psutil.cpu_count(logical=False) or 1
    cpu_threads  = psutil.cpu_count(logical=True)  or 1
    cpu_per_core = psutil.cpu_percent(percpu=True)

    cpu_temp = None
    # Coba baca dari LibreHardwareMonitor web server dulu (Windows)
    try:
        import urllib.request
        with urllib.request.urlopen('http://localhost:8085/data.json', timeout=0.8) as r:
            lhm = json.loads(r.read().decode())
        # Cari "CPU Package" atau "Core Average" di tree secara rekursif
        def find_temp(node):
            text = node.get('Text', '')
            val  = node.get('Value', '')
            typ  = node.get('SensorId', '')
            if 'temperature' in typ.lower() and ('package' in text.lower() or 'average' in text.lower()):
                try:
                    return float(val.replace('\u00b0C','').replace(',','.').strip())
                except Exception:
                    pass
            for child in node.get('Children', []):
                result = find_temp(child)
                if result is not None:
                    return result
            return None
        cpu_temp_lhm = find_temp(lhm)
        if cpu_temp_lhm:
            cpu_temp = round(cpu_temp_lhm, 1)
    except Exception:
        pass

    # Fallback: psutil sensors (Linux/macOS)
    if cpu_temp is None:
        try:
            temps = psutil.sensors_temperatures()
            if temps:
                for key in ['coretemp','cpu_thermal','k10temp','acpitz']:
                    if key in temps:
                        cpu_temp = round(temps[key][0].current, 1)
                        break
        except (AttributeError, NotImplementedError):
            pass

    ram          = psutil.virtual_memory()
    disk_io1     = psutil.disk_io_counters()
    time.sleep(0.15)
    disk_io2     = psutil.disk_io_counters()
    iv           = 0.15
    read_mbs     = round(max(0,(disk_io2.read_bytes  - disk_io1.read_bytes)  / iv / (1024**2)), 2)
    write_mbs    = round(max(0,(disk_io2.write_bytes - disk_io1.write_bytes) / iv / (1024**2)), 2)
    disk_usage   = psutil.disk_usage('/')

    gpu_data = []
    if GPU_AVAILABLE:
        try:
            for g in GPUtil.getGPUs():
                gpu_data.append({"name":g.name,"load":round(g.load*100,1),
                    "temp":round(g.temperature,1),"mem_used":round(g.memoryUsed,0),
                    "mem_total":round(g.memoryTotal,0)})
        except Exception:
            pass

    # ── FIX CPU% ──────────────────────────────────────────────
    # psutil di Windows mengembalikan CPU% per-thread (bukan per-proses 0-100%)
    # Solusi: gunakan interval=None lalu bagi dengan jumlah logical cores
    # Juga filter System Idle Process karena nilainya terbalik di Windows
    procs = []
    for p in psutil.process_iter(['pid','name','cpu_percent','memory_info','status']):
        try:
            raw_cpu = p.info['cpu_percent'] or 0.0
            # Normalisasi: bagi dengan jumlah logical cores → range 0-100%
            norm_cpu = round(min(100.0, raw_cpu / cpu_threads), 1)
            # Skip System Idle Process (selalu misleading di Windows)
            if p.info['name'] and 'idle' in p.info['name'].lower():
                continue
            mem_mb = round(p.info['memory_info'].rss / (1024**2), 1)
            procs.append({
                "pid":    p.info['pid'],
                "name":   p.info['name'],
                "cpu":    norm_cpu,
                "mem_mb": mem_mb,
                "status": p.info['status'],
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass

    procs.sort(key=lambda x: x['cpu'], reverse=True)

    return {
        "timestamp":     round(time.time() * 1000),
        "stress_active": _stress_active,
        "cpu": {
            "percent":   round(cpu_percent, 1),
            "freq_mhz":  cpu_freq_mhz,
            "cores":     cpu_cores,
            "threads":   cpu_threads,
            "temp":      cpu_temp,
            "per_core":  [round(c, 1) for c in cpu_per_core],
        },
        "ram": {
            "used_gb":   round(ram.used  / (1024**3), 2),
            "total_gb":  round(ram.total / (1024**3), 2),
            "percent":   round(ram.percent, 1),
        },
        "disk": {
            "read_mbs":   read_mbs,
            "write_mbs":  write_mbs,
            "used_gb":    round(disk_usage.used  / (1024**3), 1),
            "total_gb":   round(disk_usage.total / (1024**3), 1),
            "percent":    round(disk_usage.percent, 1),
        },
        "gpu":       gpu_data,
        "processes": procs[:10],
    }

@app.route('/sw.js')
def serve_sw():
    return send_from_directory(app.static_folder, 'js/sw.js', mimetype='application/javascript')

@app.route('/manifest.json')
def serve_manifest():
    return send_from_directory(app.static_folder, 'manifest.json', mimetype='application/json')

@app.route('/favicon.ico')
def serve_favicon():
    return send_from_directory(app.static_folder, 'icons/icon-192.png', mimetype='image/png')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/metrics')
def api_metrics():
    return jsonify(collect_metrics())

@app.route('/api/stream')
def api_stream():
    def generate():
        while True:
            try:
                yield f"data: {json.dumps(collect_metrics())}\n\n"
                time.sleep(1)
            except GeneratorExit:
                break
            except Exception as e:
                yield f"data: {json.dumps({'error':str(e)})}\n\n"
                time.sleep(2)
    return Response(generate(), mimetype='text/event-stream',
        headers={'Cache-Control':'no-cache','X-Accel-Buffering':'no',
                 'Access-Control-Allow-Origin':'*'})

@app.route('/api/stress', methods=['POST'])
def api_stress():
    global _stress_active, _stress_threads
    data   = request.get_json(silent=True) or {}
    action = data.get('action','start')
    cores  = psutil.cpu_count(logical=True) or 1
    with _stress_lock:
        if action == 'start' and not _stress_active:
            _stress_active = True
            _stress_threads = []
            for _ in range(cores):
                t = threading.Thread(target=_stress_worker, daemon=True)
                t.start()
                _stress_threads.append(t)
            return jsonify({"status":"started","cores":cores})
        elif action == 'stop':
            _stress_active = False
            _stress_threads = []
            return jsonify({"status":"stopped"})
    return jsonify({"status":"noop"})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print("="*50)
    print(f"  SysVista v2.0 — HPC Monitoring Tool")
    print(f"  Buka browser: http://localhost:{port}")
    print("="*50)
    app.run(debug=False, threaded=True, host='0.0.0.0', port=port)
