const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const sharp = require("sharp");
const PDFDocument = require("pdfkit");

const INPUT_DIR = path.join(__dirname, "Bilder");
const OUTPUT_DIR = path.join(__dirname, "Kontaktabzuege");

const COLUMNS = 5;
const ROWS = 4;
const IMAGES_PER_SHEET = COLUMNS * ROWS;

// A4 quer bei ca. 300 dpi
const PAGE_WIDTH = 3508;
const PAGE_HEIGHT = 2480;

const MARGIN = 80;
const GAP = 35;
const CAPTION_HEIGHT = 75;
const FONT_SIZE = 28;

const ALLOWED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".tif",
  ".tiff",
  ".avif"
]);

function escapeXml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function shorten(text, maxLength = 36) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

async function getImageFiles(folder) {
  const entries = await fsp.readdir(folder, { withFileTypes: true });

  return entries
    .filter(entry => entry.isFile())
    .map(entry => path.join(folder, entry.name))
    .filter(file => ALLOWED_EXTENSIONS.has(path.extname(file).toLowerCase()));
}

function makeCaptionSvg(text, width, height) {
  const safeText = escapeXml(shorten(text));

  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .caption {
          fill: black;
          font-size: ${FONT_SIZE}px;
          font-family: Arial, Helvetica, sans-serif;
        }
      </style>
      <text x="0" y="${FONT_SIZE + 8}" class="caption">${safeText}</text>
    </svg>
  `);
}

async function main() {
  await fsp.mkdir(OUTPUT_DIR, { recursive: true });

  const collator = new Intl.Collator("de", {
    numeric: true,
    sensitivity: "base"
  });

  const files = (await getImageFiles(INPUT_DIR)).sort((a, b) =>
    collator.compare(path.basename(a), path.basename(b))
  );

  if (files.length === 0) {
    console.error("Keine Bilder gefunden. Prüfe den Ordner 'Bilder'.");
    process.exit(1);
  }

  const cellWidth = Math.floor(
    (PAGE_WIDTH - 2 * MARGIN - (COLUMNS - 1) * GAP) / COLUMNS
  );

  const cellHeight = Math.floor(
    (PAGE_HEIGHT - 2 * MARGIN - (ROWS - 1) * GAP) / ROWS
  );

  const imageAreaHeight = cellHeight - CAPTION_HEIGHT;

  const pdfPath = path.join(OUTPUT_DIR, "kontaktabzuege.pdf");
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 0
  });

  const pdfStream = fs.createWriteStream(pdfPath);
  doc.pipe(pdfStream);

  let sheetNumber = 0;

  for (let start = 0; start < files.length; start += IMAGES_PER_SHEET) {
    sheetNumber++;

    const group = files.slice(start, start + IMAGES_PER_SHEET);
    const composites = [];

    for (let i = 0; i < group.length; i++) {
      const file = group[i];

      const column = i % COLUMNS;
      const row = Math.floor(i / COLUMNS);

      const x = MARGIN + column * (cellWidth + GAP);
      const y = MARGIN + row * (cellHeight + GAP);

      try {
        const resized = await sharp(file)
          .rotate()
          .resize({
            width: cellWidth,
            height: imageAreaHeight,
            fit: "inside",
            withoutEnlargement: true
          })
          .jpeg({ quality: 90 })
          .toBuffer({ resolveWithObject: true });

        const imageX = x + Math.floor((cellWidth - resized.info.width) / 2);
        const imageY = y + Math.floor((imageAreaHeight - resized.info.height) / 2);

        composites.push({
          input: resized.data,
          left: imageX,
          top: imageY
        });

        composites.push({
          input: makeCaptionSvg(path.basename(file), cellWidth, CAPTION_HEIGHT),
          left: x,
          top: y + imageAreaHeight + 10
        });
      } catch (error) {
        console.warn(`Fehler bei Datei: ${file}`);
        console.warn(error.message);
      }
    }

    const sheetBuffer = await sharp({
      create: {
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        channels: 3,
        background: "white"
      }
    })
      .composite(composites)
      .jpeg({ quality: 95 })
      .toBuffer();

    const sheetPath = path.join(
      OUTPUT_DIR,
      `kontaktabzug_${String(sheetNumber).padStart(3, "0")}.jpg`
    );

    await fsp.writeFile(sheetPath, sheetBuffer);

    if (sheetNumber > 1) {
      doc.addPage({
        size: "A4",
        layout: "landscape",
        margin: 0
      });
    }

    doc.image(sheetBuffer, 0, 0, {
      width: doc.page.width,
      height: doc.page.height
    });

    console.log(`Erstellt: ${path.basename(sheetPath)}`);
  }

  doc.end();

  await new Promise((resolve, reject) => {
    pdfStream.on("finish", resolve);
    pdfStream.on("error", reject);
  });

  console.log("");
  console.log(`Fertig. ${sheetNumber} Kontaktabzüge erstellt.`);
  console.log(`Ausgabeordner: ${OUTPUT_DIR}`);
  console.log(`PDF: ${pdfPath}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
