(() => {
  'use strict';
  const SITE = 'https://mapicons.mapsmarker.com';
  const ZIP_BASE = `${SITE}/wp-content/uploads/zip/`;
  const GENERATE_TIMEOUT_MS = 45000;
  const BETWEEN_CATEGORIES_MS = 1000;

  if (location.origin !== SITE) {
    alert('Dieses Script auf https://mapicons.mapsmarker.com/ ausführen.');
    return;
  }

  const menu = document.querySelector('#menu-item-1142') || document;
  const found = new Map();
  for (const a of menu.querySelectorAll('a[href*="/category/markers/"]')) {
    let u;
    try { u = new URL(a.href); } catch { continue; }
    if (u.origin !== SITE || !u.pathname.startsWith('/category/markers/')) continue;
    const pieces = u.pathname.split('/').filter(Boolean);
    const slug = pieces[pieces.length - 1];
    if (!slug || slug === 'markers') continue;
    const li = a.closest('li');
    const parent = !!li?.querySelector(':scope > ul.sub-menu, :scope > ul');
    const existing = found.get(slug);
    found.set(slug, {
      slug, href: `${u.origin}${u.pathname}`,
      title: a.textContent.trim().replace(/\s*»\s*$/, '') || slug,
      parent: parent || !!existing?.parent
    });
  }
  const categories = [...found.values()];
  if (!categories.length) {
    alert('Keine Kategorien gefunden. Öffne die Website mit dem vollständigen Kategorienmenü.');
    return;
  }

  window.__mapiconsBulkDownload?.dispose?.();
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;';
  document.body.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      * { box-sizing:border-box; }
      .panel { background:#fff;color:#1e293b;width:min(470px,calc(100vw - 24px));
        padding:17px;border:1px solid #cbd5e1;border-radius:12px;
        box-shadow:0 14px 40px #0005;font:13px/1.45 system-ui,sans-serif; }
      h2 { font-size:18px;margin:0 25px 5px 0; }
      p { margin:6px 0 10px;color:#475569; }
      #close { float:right;border:0;background:transparent;color:#334155;
        font-size:24px;line-height:1;cursor:pointer; }
      label { cursor:pointer; }
      .colors { display:flex;align-items:center;gap:9px;margin:12px 0; }
      #picker { width:54px;height:35px;cursor:pointer; }
      #hex { width:113px;padding:8px;border:1px solid #94a3b8;border-radius:5px; }
      #format { padding:6px;min-width:105px;border:1px solid #94a3b8;border-radius:5px; }
      .row { display:flex;align-items:center;gap:7px;margin:10px 0; }
      .buttons { display:flex;flex-wrap:wrap;gap:7px;margin-top:11px; }
      button { padding:9px 11px;border:0;border-radius:7px;cursor:pointer;
        font:600 12px system-ui,sans-serif; }
      button:disabled { opacity:.5;cursor:default; }
      #test { background:#dbeafe;color:#1e40af; }
      #start { background:#1565a3;color:white;flex:1; }
      #cancel { background:#e2e8f0;color:#334155; }
      #count, #hint { color:#64748b;font-size:12px; }
      progress { width:100%;height:16px;margin:15px 0 6px;display:block; }
      #status { font-size:13px;min-height:34px;overflow-wrap:anywhere; }
      #log { background:#f1f5f9;color:#0f172a;padding:9px;height:164px;
        white-space:pre-wrap;overflow:auto;overflow-wrap:anywhere;border-radius:6px;
        font:11px/1.5 monospace;margin:9px 0 0; }
      .footer { display:flex;justify-content:space-between;align-items:center;margin-top:6px; }
      .footer button { background:#e2e8f0;color:#334155;padding:5px 7px; }
    </style>
    <div class="panel">
      <button id="close" title="Schließen">×</button>
      <h2>Map Icons – Sammeldownload v4</h2>
      <p>Je Kategorie zuerst die Farbe <b>generieren</b>, dann die ZIP laden.
      Am Ende entsteht genau <b>eine</b> Gesamt-ZIP.</p>
      <div class="colors">
        <label for="picker">Farbe</label>
        <input id="picker" type="color" value="#ff0080">
        <input id="hex" type="text" value="#FF0080" maxlength="7" spellcheck="false">
      </div>
      <div class="row">
        <label for="format">Farbparameter:</label>
        <select id="format">
          <option value="auto">Automatisch</option>
          <option value="plain">Ohne #</option>
          <option value="hash">Mit #</option>
        </select>
      </div>
      <label class="row"><input id="parents" type="checkbox" checked>
        Auch übergeordnete Kategorien einschließen</label>
      <div id="count"></div>
      <div class="buttons">
        <button id="test">1 Kategorie testen</button>
        <button id="start">Gesamt-ZIP erstellen</button>
        <button id="cancel" disabled>Abbrechen</button>
      </div>
      <progress id="progress" value="0" max="100"></progress>
      <div id="status">Bereit. Zuerst „1 Kategorie testen“ anklicken.</div>
      <div id="hint">Die Generierungsseite wird per fetch im Hintergrund angefragt.
        Das Hauptfenster wird nicht verlassen; es werden keine einzelnen ZIP-Dateien gespeichert.</div>
      <pre id="log"></pre>
      <div class="footer"><span>Protokoll (auch bei Fehlern)</span>
        <button id="copy">Kopieren</button></div>
    </div>`;

  const el = id => shadow.getElementById(id);
  const picker = el('picker'), hexInput = el('hex'), format = el('format');
  const parents = el('parents'), start = el('start'), test = el('test');
  const cancel = el('cancel'), progress = el('progress'), status = el('status');
  const logBox = el('log');
  let busy = false;
  let controller = null;
  let preferredFormat = null;
  const testedBytes = new Map();

  function normalizeColor(value) {
    let c = String(value).trim().replace(/^#/, '');
    if (/^[a-f0-9]{3}$/i.test(c)) c = [...c].map(x => x + x).join('');
    return /^[a-f0-9]{6}$/i.test(c) ? c.toLowerCase() : null;
  }

  const sample = new URL(location.href).searchParams.get('custom_color') ||
    document.querySelector('input[name="custom_color"]')?.value || '';
  const detectedFormat = sample.includes('#') ? 'hash' : 'plain';
  const currentColor = normalizeColor(sample);
  if (currentColor) {
    picker.value = '#' + currentColor;
    hexInput.value = '#' + currentColor.toUpperCase();
  }

  function log(message) {
    logBox.textContent += `[${new Date().toLocaleTimeString()}] ${message}\n`;
    logBox.scrollTop = logBox.scrollHeight;
  }
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  function selectedCategories() {
    return categories.filter(c => parents.checked || !c.parent);
  }
  function refreshCount() {
    el('count').textContent = `${selectedCategories().length} ausgewählt – ` +
      `${categories.filter(c => !c.parent).length} Endkategorien, ` +
      `${categories.filter(c => c.parent).length} Oberkategorien (laut Seitenmenü).`;
  }
  refreshCount();
  parents.addEventListener('change', refreshCount);
  function invalidate() { preferredFormat = null; testedBytes.clear(); }
  picker.addEventListener('input', () => {
    hexInput.value = picker.value.toUpperCase(); invalidate();
  });
  hexInput.addEventListener('change', () => {
    const color = normalizeColor(hexInput.value);
    if (color) { hexInput.value = '#' + color.toUpperCase(); picker.value = '#' + color; }
    invalidate();
  });
  format.addEventListener('change', invalidate);

  function generateUrl(category, color, scheme) {
    const url = new URL(category.href);
    // „Generieren“ ist laut Formular ein GET mit diesen beiden Feldern.
    url.searchParams.set('custom_color', scheme === 'hash' ? '#' + color : color);
    url.searchParams.set('style', ''); // Originalformular: style=
    return url.href;
  }
  function zipUrl(category, color) {
    return ZIP_BASE + `mapiconscollection-${category.slug}-${color}-default.zip`;
  }
  function candidates() {
    if (format.value !== 'auto') return [format.value];
    const first = preferredFormat || detectedFormat;
    return [first, first === 'plain' ? 'hash' : 'plain'];
  }

  function setBusy(b) {
    busy = b;
    test.disabled = start.disabled = b;
    cancel.disabled = !b;
    picker.disabled = hexInput.disabled = format.disabled = parents.disabled = b;
  }

  async function requestGeneration(url, signal) {
    const timeout = AbortSignal.timeout(GENERATE_TIMEOUT_MS);
    const combined = AbortSignal.any([signal, timeout]);
    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        mode: 'same-origin',
        credentials: 'same-origin',
        redirect: 'follow',
        cache: 'no-store',
        headers: { 'Accept': 'text/html,application/xhtml+xml' },
        signal: combined
      });
      if (!response.ok) {
        const error = new Error(`Generierungs-GET: HTTP ${response.status}`);
        error.httpStatus = response.status;
        throw error;
      }
      if (new URL(response.url).origin !== SITE) {
        throw new Error('Generierungs-GET wurde zu einer anderen Domain umgeleitet.');
      }
      const contentType = response.headers.get('content-type') || '';
      if (!/html/i.test(contentType)) {
        throw new Error(`Generierungs-GET liefert kein HTML (${contentType || 'kein Content-Type'}).`);
      }
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const hasDownload = !!doc.querySelector('#downloadzip, #downloadzipbottom');
      const title = doc.title || '(ohne Titel)';
      const markerPage = !!doc.querySelector('input[name="custom_color"], #downloadzip, #downloadzipbottom');
      if (!markerPage) {
        throw new Error(`Generierungsantwort ist offenbar keine Marker-Kategorieseite (${title}).`);
      }
      return { title, hasDownload, arrived: response.url, htmlLength: html.length };
    } catch (err) {
      if (signal.aborted) throw new DOMException('Abgebrochen', 'AbortError');
      if (timeout.aborted) throw new Error('Generierungs-GET: Zeitüberschreitung (45 s).');
      throw err;
    }
  }

  async function fetchZip(category, color, signal, referrer) {
    const url = zipUrl(category, color);
    const response = await fetch(url, {
      method:'GET', credentials:'same-origin', mode:'same-origin',
      cache:'no-store', referrer, signal
    });
    if (!response.ok) {
      const type = response.headers.get('content-type') || '';
      let explanation = '';
      if (/text|html|json/i.test(type)) {
        explanation = (await response.text()).replace(/\s+/g, ' ').slice(0, 130);
      }
      const error = new Error(`HTTP ${response.status} (${type || 'unbekannter Typ'})` +
        (explanation ? ` – ${explanation}` : ''));
      error.httpStatus = response.status;
      throw error;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b ||
        !((bytes[2] === 3 && bytes[3] === 4) || (bytes[2] === 5 && bytes[3] === 6))) {
      throw new Error('Antwort ist keine gültig beginnende ZIP-Datei (PK-Signatur fehlt).');
    }
    return bytes;
  }

  async function generateAndDownload(category, color, signal) {
    const key = `${category.slug}:${color}`;
    if (testedBytes.has(key)) return testedBytes.get(key);
    const choices = candidates();
    let lastError;
    for (let i = 0; i < choices.length; i++) {
      if (signal.aborted) throw new DOMException('Abgebrochen', 'AbortError');
      const scheme = choices[i];
      const generation = generateUrl(category, color, scheme);
      log(`Generiere ${category.slug} (${scheme === 'hash' ? 'mit #' : 'ohne #'}): ${generation}`);
      let result;
      try { result = await requestGeneration(generation, signal); }
      catch (err) {
        if (signal.aborted) throw err;
        log(`Generierung fehlgeschlagen: ${err.message}`);
        lastError = err;
        if (err.httpStatus === 403 || err.httpStatus === 429) throw err;
        continue;
      }
      log(`Generierungs-GET erfolgreich: ${result.title}; HTML ${result.htmlLength} Zeichen; ` +
          `Download-Button: ${result.hasDownload ? 'ja' : 'nein'}; Ziel: ${result.arrived}`);
      if (!result.hasDownload) {
        log('Hinweis: Die Antwort enthält keinen erkannten Download-Button.');
      }

      await sleep(350);
      for (let attempt = 0; attempt < 3; attempt++) {
        if (signal.aborted) throw new DOMException('Abgebrochen', 'AbortError');
        if (attempt > 0) await sleep(attempt === 1 ? 900 : 1800);
        try {
          const bytes = await fetchZip(category, color, signal, generation);
          preferredFormat = scheme;
          log(`ZIP OK: ${category.slug}, ${bytes.length} Bytes`);
          return bytes;
        } catch (err) {
          if (signal.aborted) throw err;
          lastError = err;
          log(`ZIP-Test ${attempt + 1}/3: ${err.message}`);
          if (err.httpStatus !== 404) throw err;
        }
      }
      if (format.value !== 'auto') break;
      if (i === 0) log('ZIP fehlt weiterhin. Versuche alternative Schreibweise von custom_color.');
    }
    const finalError = new Error(`Nach Generierungs-GET keine ZIP für ${category.slug}: ` +
      (lastError?.message || 'unbekannter Fehler') +
      '. Downloadfehler');
    finalError.httpStatus = lastError?.httpStatus;
    throw finalError;
  }

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let j = 0; j < 8; j++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
  }
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const b of bytes) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function createArchive() {
    const parts = [], directory = [];
    const encoder = new TextEncoder();
    const now = new Date();
    const dosTime = now.getHours() << 11 | now.getMinutes() << 5 | now.getSeconds() >> 1;
    const dosDate = (Math.max(now.getFullYear(), 1980) - 1980) << 9 |
      (now.getMonth() + 1) << 5 | now.getDate();
    let offset = 0, dirSize = 0, total = 0;
    function add(filename, content) {
      const name = encoder.encode(filename);
      const bytes = content instanceof Uint8Array ? content : encoder.encode(content);
      const size = bytes.length;
      if (size > 0xffffffff || offset + 30 + name.length + size > 0xffffffff ||
          name.length > 65535 || total >= 65535) {
        throw new Error('ZIP32-Grenze erreicht (4 GiB / 65535 Einträge).');
      }
      const crc = crc32(bytes);
      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, dosTime, true);
      lv.setUint16(12, dosDate, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, size, true);
      lv.setUint32(22, size, true);
      lv.setUint16(26, name.length, true);
      local.set(name, 30);
      const central = new Uint8Array(46 + name.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, dosTime, true);
      cv.setUint16(14, dosDate, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      central.set(name, 46);
      parts.push(local, bytes);
      directory.push(central);
      offset += local.length + size;
      dirSize += central.length;
      total++;
    }
    function finish() {
      if (offset + dirSize > 0xffffffff) throw new Error('Gesamt-ZIP zu groß für ZIP32.');
      const end = new Uint8Array(22);
      const dv = new DataView(end.buffer);
      dv.setUint32(0, 0x06054b50, true);
      dv.setUint16(8, total, true);
      dv.setUint16(10, total, true);
      dv.setUint32(12, dirSize, true);
      dv.setUint32(16, offset, true);
      return new Blob([...parts, ...directory, end], {type:'application/zip'});
    }
    return {add, finish};
  }

  function dispose() {
    controller?.abort();
    host.remove();
    if (window.__mapiconsBulkDownload?.dispose === dispose) {
      delete window.__mapiconsBulkDownload;
    }
  }
  window.__mapiconsBulkDownload = {dispose};
  el('close').addEventListener('click', dispose);
  cancel.addEventListener('click', () => {
    controller?.abort();
    status.textContent = 'Abbruch angefordert …';
  });
  el('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(logBox.textContent); }
    catch { console.log('MAPICONS-PROTOKOLL:\n' + logBox.textContent); }
  });

  test.addEventListener('click', async () => {
    if (busy) return;
    const color = normalizeColor(hexInput.value);
    if (!color) { status.textContent = 'Ungültige HEX-Farbe.'; return; }
    const category = categories.find(c => c.slug === 'apparel') || selectedCategories()[0];
    if (!category) return;
    controller = new AbortController();
    setBusy(true);
    logBox.textContent = '';
    status.textContent = `Teste Generierung + ZIP für „${category.title}“ …`;
    try {
      const bytes = await generateAndDownload(category, color, controller.signal);
      testedBytes.set(`${category.slug}:${color}`, bytes);
      status.textContent = `Test erfolgreich: „${category.slug}“, ${(bytes.length / 1024).toFixed(1)} KiB. Gesamt-ZIP kann gestartet werden.`;
    } catch (err) {
      status.textContent = `Test fehlgeschlagen: ${err.message}`;
      log(`FEHLER: ${err.message}`);
    } finally { setBusy(false); controller = null; }
  });

  start.addEventListener('click', async () => {
    if (busy) return;
    const color = normalizeColor(hexInput.value);
    if (!color) { status.textContent = 'Ungültige HEX-Farbe.'; return; }
    const selected = selectedCategories();
    if (!selected.length) { status.textContent = 'Keine Kategorien ausgewählt.'; return; }
    controller = new AbortController();
    const signal = controller.signal;
    setBusy(true);
    logBox.textContent = '';
    progress.max = selected.length;
    progress.value = 0;
    const archive = createArchive();
    const failures = [];
    let ok = 0;
    try {
      for (let i = 0; i < selected.length; i++) {
        if (signal.aborted) throw new DOMException('Abgebrochen', 'AbortError');
        const category = selected[i];
        status.textContent = `Generiere und lade ${i + 1}/${selected.length}: ${category.title} …`;
        try {
          const bytes = await generateAndDownload(category, color, signal);
          archive.add(`mapiconscollection-${category.slug}-${color}-default.zip`, bytes);
          testedBytes.delete(`${category.slug}:${color}`);
          ok++;
        } catch (err) {
          if (signal.aborted) throw err;
          failures.push(`${category.slug}: ${err.message}`);
          log(`FEHLER ${category.slug}: ${err.message}`);
          if (!ok || err.httpStatus === 403 || err.httpStatus === 429) {
            throw new Error('Abbruch beim ersten/gesperrten Download: ' + err.message);
          }
        }
        progress.value = i + 1;
        if (i + 1 < selected.length) await sleep(BETWEEN_CATEGORIES_MS);
      }
      if (signal.aborted) throw new DOMException('Abgebrochen', 'AbortError');
      if (!ok) throw new Error('Keine Kategorie-ZIP konnte geladen werden.');
      if (failures.length) archive.add('FEHLER.txt', failures.join('\n'));
      status.textContent = `Packe ${ok} Kategorie-ZIPs zu einer Datei …`;
      const blob = archive.finish();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `mapiconscollection-gesamt-${color}-default.zip`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      status.textContent = `Fertig: ${ok}/${selected.length} ZIPs, ${failures.length} Fehler. ` +
        `Gesamt-ZIP ${(blob.size / (1024 * 1024)).toFixed(2)} MiB.`;
      log('Eine Gesamt-ZIP wurde zum Download angeboten.');
    } catch (err) {
      status.textContent = signal.aborted ? 'Abgebrochen, keine Gesamt-ZIP erzeugt.' : `Fehler: ${err.message}`;
      log(status.textContent);
    } finally { setBusy(false); controller = null; }
  });
})();
