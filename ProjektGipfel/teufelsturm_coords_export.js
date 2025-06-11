(async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const baseUrl = "https://www.teufelsturm.de";

  async function fetchUtf8(url) {
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    const decoder = new TextDecoder("utf-8");
    return decoder.decode(buffer);
  }

  const parser = new DOMParser();

  const gipfelRows = Array.from(document.querySelectorAll('table tr')).filter(tr =>
    tr.querySelectorAll('td').length >= 2 &&
    tr.querySelectorAll('td')[1].querySelector('a')
  );

  const gipfelList = gipfelRows.map(tr => {
    const name = tr.querySelectorAll('td')[1].innerText.trim();
    const href = tr.querySelectorAll('td')[1].querySelector('a').getAttribute('href');
    return { name, href: baseUrl + href };
  });

  console.log(`🔍 Gefundene Gipfel: ${gipfelList.length}`);

  const gipfelData = [];

  for (let i = 0; i < gipfelList.length; i++) {
    const gipfel = gipfelList[i];
    console.log(`(${i + 1}/${gipfelList.length}) Lade: ${gipfel.name}`);

    try {
      const html = await fetchUtf8(gipfel.href);
      await sleep(500);

      const doc = parser.parseFromString(html, 'text/html');
      const rows = Array.from(doc.querySelectorAll("table tr"));

      let lat = null, lon = null;

      for (const row of rows) {
        const tds = row.querySelectorAll("td");
        if (tds.length === 2) {
          const label = tds[0].textContent.trim().toLowerCase();
          const value = tds[1].textContent.trim();
          if (label === "longitude") lon = value;
          if (label === "latitude") lat = value;
        }
      }

      if (lat && lon) {
        gipfelData.push({ name: gipfel.name, lat, lon });
        console.log(`   ✔ ${gipfel.name}: ${lon} / ${lat}`);
      } else {
        console.log(`   ✘ Koordinaten nicht gefunden`);
      }

    } catch (err) {
      console.log(`   ⚠️ Fehler bei ${gipfel.name}: ${err.message}`);
    }
  }

  const csv = "Gipfelname;Breite;Länge\n" + gipfelData.map(g =>
    `${g.name};${g.lon};${g.lat}`
  ).join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "teufelsturm_gipfel.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  console.log("✅ CSV erfolgreich generiert und Download gestartet.");
})();
