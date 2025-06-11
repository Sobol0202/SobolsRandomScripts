(async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const baseUrl = 'http://db-sandsteinklettern.gipfelbuch.de/';
  const parser = new DOMParser();

  async function fetchWithEncoding(url, encoding = "iso-8859-1") {
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    const decoder = new TextDecoder(encoding);
    return decoder.decode(buffer);
  }

  const sektorLinks = Array.from(document.querySelectorAll('table a[href^="gipfel.php?sektorid="]'))
    .map(a => a.getAttribute('href'))
    .filter((v, i, a) => a.indexOf(v) === i);

  console.log(`Gefundene Gebiete: ${sektorLinks.length}`);

  const gipfelData = [];

  for (let i = 0; i < sektorLinks.length; i++) {
    const sektorUrl = baseUrl + sektorLinks[i];
    console.log(`(${i + 1}/${sektorLinks.length}) Lade Gebiet: ${sektorUrl}`);
    const sektorHtml = await fetchWithEncoding(sektorUrl);
    await sleep(500);

    const doc = parser.parseFromString(sektorHtml, 'text/html');
    const gipfelLinks = Array.from(doc.querySelectorAll('table a[href^="weg.php?gipfelid="]'))
      .map(a => ({
        name: a.textContent.trim(),
        href: a.getAttribute('href')
      }));

    console.log(` - Gefundene Gipfel: ${gipfelLinks.length}`);

    for (let j = 0; j < gipfelLinks.length; j++) {
      const gipfel = gipfelLinks[j];
      const gipfelUrl = baseUrl + gipfel.href;
      console.log(`   (${j + 1}/${gipfelLinks.length}) Lade Gipfel: ${gipfel.name}`);
      const gipfelHtml = await fetchWithEncoding(gipfelUrl);
      await sleep(500);

      const gipfelDoc = parser.parseFromString(gipfelHtml, 'text/html');
      const fontElements = Array.from(gipfelDoc.querySelectorAll('font[size="-1"]'));

      let lat = null;
      let lon = null;

      for (const font of fontElements) {
        const rawText = font.textContent.replace(/\s+/g, ' ').trim();
        const match = rawText.match(/Gipfelkoordinaten:\s*([\d.]+)\s*Grad[^0-9]*([\d.]+)\s*Grad/);
        if (match) {
          lat = match[1];
          lon = match[2];
          break;
        }
      }

      if (lat && lon) {
        gipfelData.push({
          name: gipfel.name,
          lat: lat,
          lon: lon
        });
        console.log(`     ✔ ${gipfel.name}: ${lat} / ${lon}`);
      } else {
        console.log(`     ✘ ${gipfel.name}: Keine Koordinaten gefunden`);
      }
    }
  }

  const csvContent = "data:text/csv;charset=utf-8," + 
    "Gipfelname;Breite;Länge\n" + 
    gipfelData.map(g => `${g.name};${g.lat};${g.lon}`).join("\n");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "gipfel_koordinaten.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  console.log("✅ CSV-Download abgeschlossen.");
})();
