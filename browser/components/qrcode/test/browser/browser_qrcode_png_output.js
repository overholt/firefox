/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { QRCodeGenerator } = ChromeUtils.importESModule(
  "moz-src:///browser/components/qrcode/QRCodeGenerator.sys.mjs"
);
const { QRCodeWorker } = ChromeUtils.importESModule(
  "moz-src:///browser/components/qrcode/QRCodeWorker.sys.mjs"
);

const CELL_SIZE = 20;
const MARGIN = 4 * CELL_SIZE;
const DOT_RADIUS_FACTOR = 0.4;
const TEST_URL = "https://mozilla.org";

async function renderToSamplingCanvas(url) {
  const dataURI = await QRCodeGenerator.generateQRCode(url, document);

  const img = document.createElementNS("http://www.w3.org/1999/xhtml", "img");
  img.src = dataURI;
  await new Promise(resolve => (img.onload = resolve));

  const canvas = document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "canvas"
  );
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  return {
    width: img.naturalWidth,
    height: img.naturalHeight,
    dataURI,
    getPixel(x, y) {
      const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
      return { r: d[0], g: d[1], b: d[2] };
    },
  };
}

const isNearBlack = ({ r, g, b }) => r < 30 && g < 30 && b < 30;
const isNearWhite = ({ r, g, b }) => r > 200 && g > 200 && b > 200;

add_task(async function test_qrcode_png_dimensions_and_background() {
  const { width, height, getPixel } = await renderToSamplingCanvas(TEST_URL);

  Assert.equal(width, height, "QR code should be square");
  Assert.strictEqual(
    (width - 2 * MARGIN) % CELL_SIZE,
    0,
    "Canvas width should fit the module grid exactly"
  );

  Assert.ok(isNearWhite(getPixel(0, 0)), "Top-left corner should be white");
  Assert.ok(
    isNearWhite(getPixel(width - 1, 0)),
    "Top-right corner should be white"
  );
  Assert.ok(
    isNearWhite(getPixel(0, height - 1)),
    "Bottom-left corner should be white"
  );
  Assert.ok(
    isNearWhite(getPixel(width - 1, height - 1)),
    "Bottom-right corner should be white"
  );
});

add_task(async function test_qrcode_png_finder_patterns() {
  const { width, height, getPixel } = await renderToSamplingCanvas(TEST_URL);

  const finderSize = 7 * CELL_SIZE;
  const finders = [
    [MARGIN, MARGIN, "top-left"],
    [width - MARGIN - finderSize, MARGIN, "top-right"],
    [MARGIN, height - MARGIN - finderSize, "bottom-left"],
  ];

  for (const [startX, startY, label] of finders) {
    Assert.ok(
      isNearBlack(getPixel(startX + CELL_SIZE * 0.5, startY + CELL_SIZE * 3.5)),
      `${label} finder outer ring should be dark`
    );
    Assert.ok(
      isNearWhite(getPixel(startX + CELL_SIZE * 1.5, startY + CELL_SIZE * 1.5)),
      `${label} finder inner white ring should be light`
    );
    Assert.ok(
      isNearBlack(getPixel(startX + CELL_SIZE * 3.5, startY + CELL_SIZE * 3.5)),
      `${label} finder inner center should be dark`
    );
  }
});

add_task(async function test_qrcode_png_logo_clear_zone() {
  // Use the raw matrix to identify which modules are actually dark within the
  // clear zone for this URL. This ensures the test is meaningful: we only assert on
  // positions that would have rendered as dots if the clear zone weren't applied.
  const worker = new QRCodeWorker();
  let matrix, moduleCount;
  try {
    ({ matrix, moduleCount } = await worker.generateQRMatrix(TEST_URL, "H"));
  } finally {
    await worker.terminate();
  }

  const canvasSize = moduleCount * CELL_SIZE + MARGIN * 2;
  const centerX = canvasSize / 2;
  const centerY = canvasSize / 2;
  const clearRadius = Math.round(canvasSize * 0.18) / 2 + CELL_SIZE;

  const suppressedModules = [];
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (!matrix[row][col]) {
        continue;
      }
      const dotX = MARGIN + (col + 0.5) * CELL_SIZE;
      const dotY = MARGIN + (row + 0.5) * CELL_SIZE;
      const offsetX = dotX - centerX;
      const offsetY = dotY - centerY;
      if (
        Math.hypot(offsetX, offsetY) <
        clearRadius + CELL_SIZE * DOT_RADIUS_FACTOR
      ) {
        suppressedModules.push({ dotX, dotY });
      }
    }
  }

  Assert.greater(
    suppressedModules.length,
    0,
    "Test URL should have dark QR modules in the clear zone (ensures test is meaningful)"
  );

  const { getPixel } = await renderToSamplingCanvas(TEST_URL);
  for (const { dotX, dotY } of suppressedModules) {
    Assert.ok(
      !isNearBlack(getPixel(dotX, dotY)),
      `Suppressed module at (${Math.round(dotX)}, ${Math.round(dotY)}) should not render as a dark dot`
    );
  }
});

// Validates that the rendered PNG faithfully represents the QR matrix outside
// the clear zone, and that the suppressed module count stays within H-level
// error correction capacity (30%). This is the closest approximation to an
// end-to-end decode test achievable without a QR decoder in the test
// environment. Tests two URL lengths: short (baseline) and long (stress).
add_task(async function test_qrcode_png_decodability() {
  const FINDER_SIZE = 7;
  const isInFinderZone = (row, col, n) =>
    (row < FINDER_SIZE && col < FINDER_SIZE) ||
    (row < FINDER_SIZE && col >= n - FINDER_SIZE) ||
    (row >= n - FINDER_SIZE && col < FINDER_SIZE);

  const urls = [
    TEST_URL,
    "https://www.cnet.com/home/kitchen-and-household/keep-these-7-devices-far-away-from-extension-cords-or-power-strips/?utm_source=firefox-newtab-en-us",
  ];

  for (const url of urls) {
    const worker = new QRCodeWorker();
    let matrix, moduleCount;
    try {
      ({ matrix, moduleCount } = await worker.generateQRMatrix(url, "H"));
    } finally {
      await worker.terminate();
    }

    const canvasSize = moduleCount * CELL_SIZE + MARGIN * 2;
    const centerX = canvasSize / 2;
    const centerY = canvasSize / 2;
    const clearRadius = Math.round(canvasSize * 0.18) / 2 + CELL_SIZE;

    const { getPixel } = await renderToSamplingCanvas(url);

    let totalModules = 0;
    let suppressedModules = 0;

    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (isInFinderZone(row, col, moduleCount)) {
          continue;
        }
        totalModules++;
        const dotX = MARGIN + (col + 0.5) * CELL_SIZE;
        const dotY = MARGIN + (row + 0.5) * CELL_SIZE;
        const offsetX = dotX - centerX;
        const offsetY = dotY - centerY;
        if (
          Math.hypot(offsetX, offsetY) <
          clearRadius + CELL_SIZE * DOT_RADIUS_FACTOR
        ) {
          if (matrix[row][col]) {
            suppressedModules++;
          }
          continue;
        }
        // Outside the clear zone: pixel must faithfully match the matrix.
        const pixel = getPixel(dotX, dotY);
        if (matrix[row][col]) {
          Assert.ok(
            isNearBlack(pixel),
            `url="${url}" dark module at (${row},${col}) should render as a dot`
          );
        } else {
          Assert.ok(
            isNearWhite(pixel),
            `url="${url}" light module at (${row},${col}) should render as background`
          );
        }
      }
    }

    // Suppressed modules must stay well within H-level error correction (30%).
    const suppressedFraction = suppressedModules / totalModules;
    Assert.less(
      suppressedFraction,
      0.3,
      `url="${url}" suppressed ${(suppressedFraction * 100).toFixed(1)}% of modules; must be under 30% for H-level error correction`
    );
  }
});

add_task(async function test_qrcode_png_save_bytes() {
  const { dataURI, width } = await renderToSamplingCanvas(TEST_URL);

  const DATA_PREFIX = "data:image/png;base64,";
  Assert.ok(dataURI.startsWith(DATA_PREFIX), "Data URI should be a PNG");

  // Decode exactly as the dialog's save/copy path does.
  const bytes = Uint8Array.fromBase64(dataURI.slice(DATA_PREFIX.length));

  // Verify PNG magic header.
  const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < PNG_MAGIC.length; i++) {
    Assert.equal(bytes[i], PNG_MAGIC[i], `PNG magic byte ${i} should match`);
  }

  // First chunk must be IHDR.
  const IHDR = [0x49, 0x48, 0x44, 0x52];
  for (let i = 0; i < IHDR.length; i++) {
    Assert.equal(
      bytes[12 + i],
      IHDR[i],
      `IHDR chunk type byte ${i} should match`
    );
  }

  // Width and height are big-endian uint32s at bytes 16 and 20.
  const view = new DataView(bytes.buffer);
  const pngWidth = view.getUint32(16, false);
  const pngHeight = view.getUint32(20, false);

  Assert.equal(pngWidth, width, "PNG width in IHDR should match canvas width");
  Assert.equal(pngWidth, pngHeight, "Saved PNG should be square");
  Assert.strictEqual(
    (pngWidth - 2 * MARGIN) % CELL_SIZE,
    0,
    "Saved PNG width should fit the module grid"
  );
});
