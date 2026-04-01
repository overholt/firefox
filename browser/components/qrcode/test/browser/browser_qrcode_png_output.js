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
const MIN_LOGO_MODULE_SPAN = 6;
const TEST_URL = "https://mozilla.org";
const LONG_TEST_URL =
  "https://www.cnet.com/home/kitchen-and-household/keep-these-7-devices-far-away-from-extension-cords-or-power-strips/?utm_source=firefox-newtab-en-us";

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
const getLogoPlacement = dotCount =>
  QRCodeGenerator.getLogoPlacement(dotCount, MARGIN);

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
  let matrix, dotCount;
  try {
    ({ matrix, dotCount } = await worker.generateQRMatrix(TEST_URL, "H"));
  } finally {
    await worker.terminate();
  }

  const placement = getLogoPlacement(dotCount);
  Assert.ok(placement.showLogo, "Baseline QR code should still render a logo");
  Assert.greaterOrEqual(
    placement.logoSize,
    MIN_LOGO_MODULE_SPAN * CELL_SIZE,
    "Rendered logo should not shrink below the minimum viable size"
  );

  const suppressedModules = [];
  for (let row = 0; row < dotCount; row++) {
    for (let col = 0; col < dotCount; col++) {
      if (!matrix[row][col] || placement.reservedMatrix[row][col]) {
        continue;
      }
      const dotX = MARGIN + (col + 0.5) * CELL_SIZE;
      const dotY = MARGIN + (row + 0.5) * CELL_SIZE;
      const offsetX = dotX - placement.centerX;
      const offsetY = dotY - placement.centerY;
      if (
        placement.showLogo &&
        Math.hypot(offsetX, offsetY) <
          placement.clearRadius + CELL_SIZE * DOT_RADIUS_FACTOR
      ) {
        suppressedModules.push({ dotX, dotY });
      }
    }
  }

  Assert.greater(
    suppressedModules.length,
    0,
    "Test URL should have dark QR dots in the clear zone (ensures test is meaningful)"
  );

  const { getPixel } = await renderToSamplingCanvas(TEST_URL);
  for (const { dotX, dotY } of suppressedModules) {
    Assert.ok(
      !isNearBlack(getPixel(dotX, dotY)),
      `Suppressed dot at (${Math.round(dotX)}, ${Math.round(dotY)}) should not render as a dark dot`
    );
  }
});

add_task(async function test_qrcode_png_long_url_center_alignment_pattern() {
  const worker = new QRCodeWorker();
  let matrix, dotCount;
  try {
    ({ matrix, dotCount } = await worker.generateQRMatrix(LONG_TEST_URL, "H"));
  } finally {
    await worker.terminate();
  }

  const placement = getLogoPlacement(dotCount);
  Assert.ok(placement.showLogo, "Long test URL should still render a logo");
  Assert.greaterOrEqual(
    placement.logoSize,
    MIN_LOGO_MODULE_SPAN * CELL_SIZE,
    "Long-URL logo should stay at or above the minimum viable size"
  );

  // Find the alignment pattern center nearest the QR code midpoint by looking for
  // a dark reserved cell (outside finder zones) surrounded by a full 5x5 reserved block.
  const isInFinderZone = (r, c) =>
    (r < 8 && c < 8) ||
    (r < 8 && c >= dotCount - 8) ||
    (r >= dotCount - 8 && c < 8);
  const mid = (dotCount - 1) / 2;
  let centerRow = -1,
    centerCol = -1,
    bestDist = Infinity;
  for (let row = 2; row < dotCount - 2; row++) {
    for (let col = 2; col < dotCount - 2; col++) {
      if (
        isInFinderZone(row, col) ||
        !matrix[row][col] ||
        !placement.reservedMatrix[row][col]
      ) {
        continue;
      }
      let isAlignmentCenter = true;
      for (let dr = -2; dr <= 2 && isAlignmentCenter; dr++) {
        for (let dc = -2; dc <= 2 && isAlignmentCenter; dc++) {
          if (!placement.reservedMatrix[row + dr]?.[col + dc]) {
            isAlignmentCenter = false;
          }
        }
      }
      if (!isAlignmentCenter) {
        continue;
      }
      const dist = (row - mid) ** 2 + (col - mid) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        centerRow = row;
        centerCol = col;
      }
    }
  }

  Assert.notEqual(
    centerRow,
    -1,
    "Long URL should produce a QR code with a center alignment pattern"
  );

  const { getPixel } = await renderToSamplingCanvas(LONG_TEST_URL);
  for (let row = centerRow - 2; row <= centerRow + 2; row++) {
    for (let col = centerCol - 2; col <= centerCol + 2; col++) {
      Assert.equal(
        isNearBlack(
          getPixel(
            MARGIN + (col + 0.5) * CELL_SIZE,
            MARGIN + (row + 0.5) * CELL_SIZE
          )
        ),
        matrix[row][col],
        `Center alignment pattern at (${row},${col}) should be preserved`
      );
    }
  }
});

// Validates that the rendered PNG faithfully represents reserved QR dots and
// keeps any data-dot suppression within H-level error correction capacity
// (30%). Tests two URL lengths: short (baseline) and long (stress).
add_task(async function test_qrcode_png_decodability() {
  const urls = [TEST_URL, LONG_TEST_URL];

  for (const url of urls) {
    const worker = new QRCodeWorker();
    let matrix, dotCount;
    try {
      ({ matrix, dotCount } = await worker.generateQRMatrix(url, "H"));
    } finally {
      await worker.terminate();
    }

    const placement = getLogoPlacement(dotCount);
    const { getPixel } = await renderToSamplingCanvas(url);

    let totalDataDots = 0;
    let dataMismatches = 0;
    let reservedMismatches = 0;

    for (let row = 0; row < dotCount; row++) {
      for (let col = 0; col < dotCount; col++) {
        const dotX = MARGIN + (col + 0.5) * CELL_SIZE;
        const dotY = MARGIN + (row + 0.5) * CELL_SIZE;
        const renderedDark = isNearBlack(getPixel(dotX, dotY));

        if (placement.reservedMatrix[row][col]) {
          if (renderedDark !== matrix[row][col]) {
            reservedMismatches++;
          }
          continue;
        }

        totalDataDots++;
        if (renderedDark !== matrix[row][col]) {
          dataMismatches++;
        }
      }
    }

    Assert.equal(
      reservedMismatches,
      0,
      `url="${url}" should preserve all reserved QR dots`
    );

    const suppressedFraction = dataMismatches / totalDataDots;
    Assert.less(
      suppressedFraction,
      0.3,
      `url="${url}" changed ${(suppressedFraction * 100).toFixed(1)}% of data dots; must be under 30% for H-level error correction`
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
