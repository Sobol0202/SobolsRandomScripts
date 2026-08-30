(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const fileInput = $('fileInput');
  const dropzone = $('dropzone');
  const summary = $('summary');
  const errorBox = $('error');
  const convertBtn = $('convertBtn');
  const downloadLink = $('downloadLink');
  const oxygenInput = $('oxygen');
  const heliumInput = $('helium');
  const sampleRateInput = $('sampleRate');

  let loaded = null;
  let currentUrl = null;

  const BASE = {
    ENUM: 0x00,
    SINT8: 0x01,
    UINT8: 0x02,
    SINT16: 0x83,
    UINT16: 0x84,
    SINT32: 0x85,
    UINT32: 0x86,
    STRING: 0x07,
    FLOAT32: 0x88,
    UINT8Z: 0x0A,
    UINT16Z: 0x8B,
    UINT32Z: 0x8C,
    BYTE: 0x0D,
  };

  const INVALID = {
    [BASE.ENUM]: 0xFF,
    [BASE.SINT8]: 0x7F,
    [BASE.UINT8]: 0xFF,
    [BASE.SINT16]: 0x7FFF,
    [BASE.UINT16]: 0xFFFF,
    [BASE.SINT32]: 0x7FFFFFFF,
    [BASE.UINT32]: 0xFFFFFFFF,
    [BASE.UINT8Z]: 0,
    [BASE.UINT16Z]: 0,
    [BASE.UINT32Z]: 0,
  };

  const FIT_EPOCH_MS = Date.UTC(1989, 11, 31, 0, 0, 0);
  const toFitTime = (ms) => Math.max(0, Math.round((ms - FIT_EPOCH_MS) / 1000));

  function fitCrc(bytes) {
    const table = [0x0000,0xCC01,0xD801,0x1400,0xF001,0x3C00,0x2800,0xE401,0xA001,0x6C00,0x7800,0xB401,0x5000,0x9C01,0x8801,0x4400];
    let crc = 0;
    for (const byte of bytes) {
      let tmp = table[crc & 0xF];
      crc = ((crc >> 4) & 0x0FFF) ^ tmp ^ table[byte & 0xF];
      tmp = table[crc & 0xF];
      crc = ((crc >> 4) & 0x0FFF) ^ tmp ^ table[(byte >> 4) & 0xF];
    }
    return crc & 0xFFFF;
  }

  class Writer {
    constructor() { this.bytes = []; }
    u8(v) { this.bytes.push(v & 0xFF); }
    i8(v) { this.u8(v < 0 ? 256 + v : v); }
    u16(v) { this.u8(v); this.u8(v >>> 8); }
    i16(v) { this.u16(v < 0 ? 0x10000 + v : v); }
    u32(v) { const n = Number(v) >>> 0; this.u8(n); this.u8(n >>> 8); this.u8(n >>> 16); this.u8(n >>> 24); }
    i32(v) { this.u32(v); }
    f32(v) { const b = new ArrayBuffer(4); new DataView(b).setFloat32(0, v, true); this.bytes.push(...new Uint8Array(b)); }
    raw(arr) { this.bytes.push(...arr); }
  }

  function field(num, size, type) { return { num, size, type }; }

  function writeDefinition(w, local, globalNum, fields) {
    w.u8(0x40 | (local & 0x0F));
    w.u8(0);          // reserved
    w.u8(0);          // little endian
    w.u16(globalNum);
    w.u8(fields.length);
    for (const f of fields) {
      w.u8(f.num);
      w.u8(f.size);
      w.u8(f.type);
    }
  }

  function writeValue(w, f, value) {
    let v = value;
    if (v === undefined || v === null || Number.isNaN(v)) v = INVALID[f.type];
    switch (f.type) {
      case BASE.ENUM:
      case BASE.UINT8:
      case BASE.UINT8Z:
      case BASE.BYTE: w.u8(v); break;
      case BASE.SINT8: w.i8(v); break;
      case BASE.UINT16:
      case BASE.UINT16Z: w.u16(v); break;
      case BASE.SINT16: w.i16(v); break;
      case BASE.UINT32:
      case BASE.UINT32Z: w.u32(v); break;
      case BASE.SINT32: w.i32(v); break;
      case BASE.FLOAT32: w.f32(v); break;
      default: throw new Error(`Nicht unterstützter FIT-Basistyp: ${f.type}`);
    }
  }

  function writeData(w, local, fields, values) {
    w.u8(local & 0x0F);
    fields.forEach((f, i) => writeValue(w, f, values[i]));
  }

  function makeFit(data, options) {
    const w = new Writer();
    const start = data.startMs;
    const end = data.endMs;
    const durationSec = Math.max(0, (end - start) / 1000);
    const maxDepth = data.depth.length ? Math.max(...data.depth.map(p => p.v)) : 0;
    const avgDepth = data.depth.length ? data.depth.reduce((a,p) => a + p.v, 0) / data.depth.length : 0;

    // file_id (global 0)
    const fileId = [
      field(0,1,BASE.ENUM), field(1,2,BASE.UINT16), field(2,2,BASE.UINT16),
      field(3,4,BASE.UINT32Z), field(4,4,BASE.UINT32)
    ];
    writeDefinition(w, 0, 0, fileId);
    writeData(w, 0, fileId, [4, 255, 1, 1, toFitTime(start)]); // type=activity, manufacturer=development

    // dive_gas (global 259)
    const gas = [field(254,2,BASE.UINT16), field(0,1,BASE.UINT8), field(1,1,BASE.UINT8), field(2,1,BASE.ENUM)];
    writeDefinition(w, 1, 259, gas);
    writeData(w, 1, gas, [0, options.helium, options.oxygen, 1]);

    // event (global 21)
    const event = [field(253,4,BASE.UINT32), field(0,1,BASE.ENUM), field(1,1,BASE.ENUM)];
    writeDefinition(w, 2, 21, event);

    // record (global 20): timestamp, temperature, absolute_pressure, depth
    const record = [field(253,4,BASE.UINT32), field(13,1,BASE.SINT8), field(91,4,BASE.UINT32), field(92,4,BASE.UINT32)];
    writeDefinition(w, 3, 20, record);

    // Subsurface/libdivecomputer builds its tank list from SENSOR_PROFILE (global 147).
    // Only sensor_type=28 is treated as a Garmin tank pod. TANK_UPDATE.sensor must use
    // the same ant_channel_id. The source JSON has no transmitter id, so use a stable
    // synthetic non-zero ANT channel id.
    const tankSensor = 1;
    let tank = null;
    if (data.tankPressure.length) {
      const sensorProfile = [
        field(0,4,BASE.UINT32Z),  // ant_channel_id
        field(3,1,BASE.ENUM),     // enabled
        field(52,1,BASE.ENUM),    // sensor_type: 28 = tank pod
        field(74,1,BASE.ENUM),    // pressure_units: 2 = bar
        field(75,2,BASE.UINT16),  // rated_pressure [bar]
        field(76,2,BASE.UINT16),  // reserve_pressure [bar]
        field(77,2,BASE.UINT16),  // volume [L * 10]
        field(78,1,BASE.ENUM)     // used_for_gas_rate
      ];
      writeDefinition(w, 9, 147, sensorProfile);
      writeData(w, 9, sensorProfile, [tankSensor, 1, 28, 2, 300, 50, 120, 1]);

      // Define tank_update before the chronological sample stream. Crucially, pressure
      // records are emitted immediately after the depth record at the SAME timestamp.
      // libdivecomputer suppresses the duplicate DC_SAMPLE_TIME callback, so Subsurface
      // receives depth and tank pressure in the same sample instead of a later, time-rewound
      // pressure-only series.
      tank = [field(0,4,BASE.UINT32Z), field(1,2,BASE.UINT16), field(253,4,BASE.UINT32)];
      writeDefinition(w, 4, 319, tank);
    }

    writeData(w, 2, event, [toFitTime(start), 0, 0]); // timer start

    const stepMs = options.sampleRate * 1000;
    for (let t = start; t <= end; t += stepMs) {
      const temp = interpolate(data.temperature, t);
      const abs = interpolate(data.absPressure, t);
      const depth = Math.max(0, interpolate(data.depth, t) ?? 0);
      writeData(w, 3, record, [
        toFitTime(t),
        temp == null ? null : Math.max(-127, Math.min(126, Math.round(temp))),
        abs == null ? null : Math.round(abs),
        Math.round(depth * 1000)
      ]);

      // Emit pressure on the exact same FIT timestamp as the record. We interpolate only
      // between actual transmitter readings and never extrapolate beyond their measured range.
      if (tank && t >= data.tankPressure[0].t && t <= data.tankPressure[data.tankPressure.length - 1].t) {
        const pressurePa = interpolate(data.tankPressure, t);
        if (pressurePa != null) {
          const raw = Math.max(1, Math.min(65534, Math.round((pressurePa / 100000) * 100)));
          writeData(w, 4, tank, [tankSensor, raw, toFitTime(t)]);
        }
      }
    }

    // tank_summary is kept for FIT completeness. Subsurface/libdivecomputer currently
    // ignores its start/end pressure fields and derives cylinder pressures from samples.
    if (data.tankPressure.length) {
      const tankSummary = [
        field(0,4,BASE.UINT32Z), field(1,2,BASE.UINT16), field(2,2,BASE.UINT16), field(253,4,BASE.UINT32)
      ];
      writeDefinition(w, 8, 323, tankSummary);
      const startRaw = Math.max(1, Math.min(65534, Math.round((data.tankPressure[0].v / 100000) * 100)));
      const endRaw = Math.max(1, Math.min(65534, Math.round((data.tankPressure[data.tankPressure.length - 1].v / 100000) * 100)));
      writeData(w, 8, tankSummary, [tankSensor, startRaw, endRaw, toFitTime(end)]);
    }

    writeData(w, 2, event, [toFitTime(end), 0, 1]); // timer stop

    // session (global 18)
    const session = [
      field(253,4,BASE.UINT32), field(2,4,BASE.UINT32), field(7,4,BASE.UINT32), field(8,4,BASE.UINT32),
      field(5,1,BASE.ENUM), field(6,1,BASE.ENUM), field(140,4,BASE.UINT32), field(141,4,BASE.UINT32)
    ];
    writeDefinition(w, 5, 18, session);
    writeData(w, 5, session, [
      toFitTime(end), toFitTime(start), Math.round(durationSec * 1000), Math.round(durationSec * 1000),
      53, 53, Math.round(avgDepth * 1000), Math.round(maxDepth * 1000)
    ]);

    // dive_summary (global 268)
    const diveSummary = [
      field(253,4,BASE.UINT32), field(0,2,BASE.UINT16), field(1,2,BASE.UINT16),
      field(2,4,BASE.UINT32), field(3,4,BASE.UINT32), field(11,4,BASE.UINT32)
    ];
    writeDefinition(w, 6, 268, diveSummary);
    writeData(w, 6, diveSummary, [toFitTime(end), 18, 0, Math.round(avgDepth * 1000), Math.round(maxDepth * 1000), Math.round(durationSec * 1000)]);

    // activity (global 34)
    const activity = [field(253,4,BASE.UINT32), field(0,4,BASE.UINT32), field(1,2,BASE.UINT16), field(2,1,BASE.ENUM), field(3,1,BASE.ENUM)];
    writeDefinition(w, 7, 34, activity);
    writeData(w, 7, activity, [toFitTime(end), Math.round(durationSec * 1000), 1, 0, 26]); // manual activity, event=activity

    const dataBytes = Uint8Array.from(w.bytes);
    const header = new Uint8Array(14);
    const hv = new DataView(header.buffer);
    header[0] = 14;
    header[1] = 0x20; // FIT protocol 2.0
    hv.setUint16(2, 21213, true); // compatible profile marker; consumers rely on field defs
    hv.setUint32(4, dataBytes.length, true);
    header.set([0x2E,0x46,0x49,0x54], 8); // .FIT
    hv.setUint16(12, fitCrc(header.slice(0,12)), true);

    const allNoFinal = new Uint8Array(header.length + dataBytes.length);
    allNoFinal.set(header, 0);
    allNoFinal.set(dataBytes, header.length);
    const crc = fitCrc(allNoFinal);

    const out = new Uint8Array(allNoFinal.length + 2);
    out.set(allNoFinal, 0);
    out[out.length - 2] = crc & 0xFF;
    out[out.length - 1] = (crc >>> 8) & 0xFF;
    return out;
  }

  function kelvinToC(v) { return v > 100 ? v - 273.15 : v; }
  function asMs(s) { const ms = Date.parse(s); return Number.isFinite(ms) ? ms : null; }
  function addPoint(arr, t, v) { if (t != null && Number.isFinite(v)) arr.push({t, v:Number(v)}); }
  function sortUnique(arr) {
    arr.sort((a,b) => a.t - b.t);
    const out = [];
    for (const p of arr) {
      if (out.length && out[out.length-1].t === p.t) out[out.length-1] = p;
      else out.push(p);
    }
    return out;
  }

  function extract(json) {
    const log = json?.DeviceLog;
    if (!log || !Array.isArray(log.Samples)) throw new Error('Erwartet wird ein JSON mit DeviceLog.Samples.');

    let depth = [], temperature = [], absPressure = [], tankPressure = [];
    for (const s of log.Samples) {
      const t = asMs(s.TimeISO8601);
      addPoint(depth, t, Number(s.Depth));
      if (Number.isFinite(Number(s.Temperature))) addPoint(temperature, t, kelvinToC(Number(s.Temperature)));
      addPoint(absPressure, t, Number(s.AbsPressure));
      const cylinders = Array.isArray(s.Cylinders) ? s.Cylinders : [];
      // Do not coerce null to Number(null) === 0. Missing transmitter values are not 0 bar.
      const hasPressure = c => c && c.Pressure !== null && c.Pressure !== undefined && c.Pressure !== '' && Number.isFinite(Number(c.Pressure));
      const cyl0 = cylinders.find(c => hasPressure(c) && c.GasNumber === 0) || cylinders.find(hasPressure);
      if (cyl0) addPoint(tankPressure, t, Number(cyl0.Pressure));
    }
    depth = sortUnique(depth); temperature = sortUnique(temperature); absPressure = sortUnique(absPressure); tankPressure = sortUnique(tankPressure);
    if (!depth.length) throw new Error('Keine Tiefenwerte (Samples[].Depth) gefunden.');

    const headerStart = asMs(log.Header?.DateTime);
    const candidates = [headerStart, depth[0]?.t, temperature[0]?.t, absPressure[0]?.t].filter(Number.isFinite);
    let startMs = Math.min(...candidates);
    const headerDuration = Number(log.Header?.Duration);
    const allLast = [depth.at(-1)?.t, temperature.at(-1)?.t, absPressure.at(-1)?.t, tankPressure.at(-1)?.t].filter(Number.isFinite);
    let endMs = Math.max(...allLast);
    if (Number.isFinite(headerDuration) && headerDuration > 0 && Number.isFinite(headerStart)) endMs = Math.max(endMs, headerStart + headerDuration * 1000);
    if (!(endMs > startMs)) throw new Error('Ungültiger Zeitbereich im JSON.');

    return {
      log, depth, temperature, absPressure, tankPressure, startMs, endMs,
      fileDate: new Date(startMs),
      maxDepth: Math.max(...depth.map(p => p.v)),
      startPressure: tankPressure[0]?.v,
      endPressure: tankPressure.at(-1)?.v,
    };
  }

  function interpolate(points, t) {
    if (!points.length) return null;
    if (t <= points[0].t) return points[0].v;
    if (t >= points[points.length-1].t) return points[points.length-1].v;
    let lo = 0, hi = points.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (points[mid].t <= t) lo = mid; else hi = mid;
    }
    const a = points[lo], b = points[hi];
    const f = (t - a.t) / (b.t - a.t || 1);
    return a.v + (b.v - a.v) * f;
  }

  function fmtBar(pa) { return pa == null ? '—' : `${(pa / 100000).toFixed(1)} bar`; }
  function fmtDuration(ms) {
    const s = Math.round(ms / 1000); const m = Math.floor(s / 60); const r = s % 60;
    return `${m}:${String(r).padStart(2,'0')} min`;
  }

  function showError(msg) { errorBox.textContent = msg; errorBox.hidden = false; }
  function clearError() { errorBox.hidden = true; errorBox.textContent = ''; }

  async function loadFile(file) {
    clearError(); downloadLink.hidden = true;
    if (currentUrl) { URL.revokeObjectURL(currentUrl); currentUrl = null; }
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      loaded = extract(json);
      loaded.inputName = file.name;
      summary.innerHTML = `<strong>${escapeHtml(file.name)}</strong><br>` +
        `${loaded.depth.length} Tiefenpunkte · max. ${loaded.maxDepth.toFixed(2)} m · ` +
        `${fmtDuration(loaded.endMs - loaded.startMs)} · Flaschendruck ${fmtBar(loaded.startPressure)} → ${fmtBar(loaded.endPressure)}`;
      convertBtn.disabled = false;
    } catch (err) {
      loaded = null; convertBtn.disabled = true; summary.textContent = 'Datei konnte nicht geladen werden.';
      showError(err?.message || String(err));
    }
  }

  function escapeHtml(s) { return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

  fileInput.addEventListener('change', () => fileInput.files?.[0] && loadFile(fileInput.files[0]));
  for (const ev of ['dragenter','dragover']) dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add('drag'); });
  for (const ev of ['dragleave','drop']) dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove('drag'); });
  dropzone.addEventListener('drop', e => e.dataTransfer?.files?.[0] && loadFile(e.dataTransfer.files[0]));

  if (typeof window !== 'undefined') window.ScubaFitConverter = { extract, makeFit, fitCrc };

  convertBtn.addEventListener('click', () => {
    clearError();
    try {
      if (!loaded) throw new Error('Bitte zuerst eine JSON-Datei wählen.');
      const oxygen = Number(oxygenInput.value), helium = Number(heliumInput.value);
      if (!Number.isFinite(oxygen) || !Number.isFinite(helium) || oxygen < 5 || helium < 0 || oxygen + helium > 100) {
        throw new Error('Ungültiges Gasgemisch: O₂ + He darf 100 % nicht überschreiten.');
      }
      const bytes = makeFit(loaded, { oxygen: Math.round(oxygen), helium: Math.round(helium), sampleRate: Number(sampleRateInput.value) || 1 });
      const blob = new Blob([bytes], {type:'application/octet-stream'});
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      currentUrl = URL.createObjectURL(blob);
      const base = (loaded.inputName || 'dive').replace(/\.json$/i,'');
      downloadLink.href = currentUrl;
      downloadLink.download = `${base}.fit`;
      downloadLink.textContent = `${base}.fit herunterladen`;
      downloadLink.hidden = false;
      downloadLink.click();
    } catch (err) { showError(err?.message || String(err)); }
  });
})();
