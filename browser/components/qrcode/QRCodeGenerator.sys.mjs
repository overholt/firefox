/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * QR Code Generator with Firefox logo overlay
 * This module generates QR codes with the Firefox logo in the center
 * Uses a worker thread for QR generation to avoid blocking the main thread
 */

const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "logConsole", function () {
  return console.createInstance({
    prefix: "QRCodeGenerator",
    maxLogLevel: Services.prefs.getBoolPref("browser.qrcode.log", false)
      ? "Debug"
      : "Warn",
  });
});

ChromeUtils.defineESModuleGetters(lazy, {
  QRCodeWorker: "moz-src:///browser/components/qrcode/QRCodeWorker.sys.mjs",
});

// Per ISO/IEC 18004, finder patterns are always 7x7 modules.
const FINDER_SIZE = 7;
const CELL_SIZE = 20;
// Per ISO/IEC 18004, the minimum quiet zone around the code is 4 modules.
const MARGIN_CELLS = 4;
// Dot radius as a fraction of cell size. 0.4 means dots are 80% of cell width,
// leaving a visible gap between adjacent dots.
const DOT_RADIUS_FACTOR = 0.4;
// Corner radius factors for finder pattern rounded rectangles (design choices).
const FINDER_OUTER_CORNER_RADIUS_FACTOR = 1.2;
const FINDER_INNER_CORNER_RADIUS_FACTOR = 0.6;

export const QRCodeGenerator = {
  /**
   * Generate a QR code for the given URL with Firefox logo overlay
   *
   * @param {string} url - The URL to encode
   * @param {Document} document - The document to use for creating elements
   * @returns {Promise<string>} - Data URI of the QR code with logo
   */
  async generateQRCode(url, document) {
    // Create a fresh worker for this generation
    // Worker will be terminated after use to free resources
    const worker = new lazy.QRCodeWorker();

    try {
      // Generate the QR code matrix with high error correction to allow for logo overlay
      // Use worker thread to avoid blocking main thread
      const { matrix, moduleCount } = await worker.generateQRMatrix(url, "H");

      if (
        !Array.isArray(matrix) ||
        matrix.length !== moduleCount ||
        matrix.some(row => row.length !== moduleCount)
      ) {
        throw new Error("QR worker returned malformed matrix data");
      }

      const margin = MARGIN_CELLS * CELL_SIZE;
      // margin * 2 because the quiet zone applies on both sides.
      const canvasSize = moduleCount * CELL_SIZE + margin * 2;

      const canvas = document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "canvas"
      );
      canvas.width = canvasSize;
      canvas.height = canvasSize;
      const ctx = canvas.getContext("2d");

      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvasSize, canvasSize);

      // Calculate logo size and position (center of QR code)
      // Use 18% of QR code size to stay within error correction limits.
      const logoSize = Math.round(canvasSize * 0.18);
      const centerX = Math.floor(canvasSize / 2);
      const centerY = Math.floor(canvasSize / 2);
      const logoClearRadius = logoSize / 2 + CELL_SIZE;

      this._drawQRDots(
        ctx,
        matrix,
        moduleCount,
        margin,
        centerX,
        centerY,
        logoClearRadius
      );

      // Load and draw the Firefox logo at high resolution
      try {
        const logoImage = await this._loadFirefoxLogo(document);
        // Re-enable smoothing for the logo to avoid pixelation
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        // Draw logo centered
        ctx.drawImage(
          logoImage,
          centerX - logoSize / 2,
          centerY - logoSize / 2,
          logoSize,
          logoSize
        );
      } catch (e) {
        lazy.logConsole.warn("Could not load Firefox logo for QR code:", e);
      }

      // Convert canvas to data URI
      return canvas.toDataURL("image/png");
    } finally {
      // Always terminate the worker to free resources
      try {
        await worker.terminate();
        lazy.logConsole.debug("QRCode worker terminated successfully");
      } catch (e) {
        lazy.logConsole.warn("Failed to terminate QRCode worker:", e);
      }
    }
  },

  _drawQRDots(ctx, matrix, moduleCount, margin, centerX, centerY, clearRadius) {
    const isInFinderPatternCorners = (row, col) =>
      (row < FINDER_SIZE && col < FINDER_SIZE) ||
      (row < FINDER_SIZE && col >= moduleCount - FINDER_SIZE) ||
      (row >= moduleCount - FINDER_SIZE && col < FINDER_SIZE);

    ctx.fillStyle = "black";
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        // Skip the three finder pattern corners because they are redrawn below.
        if (isInFinderPatternCorners(row, col) || !matrix[row][col]) {
          continue;
        }
        const dotX = margin + (col + 0.5) * CELL_SIZE;
        const dotY = margin + (row + 0.5) * CELL_SIZE;
        const offsetX = dotX - centerX;
        const offsetY = dotY - centerY;
        // Leave a circular clear zone so the Firefox logo never overlaps a dot.
        if (
          Math.hypot(offsetX, offsetY) <
          clearRadius + CELL_SIZE * DOT_RADIUS_FACTOR
        ) {
          continue;
        }
        ctx.beginPath();
        ctx.arc(dotX, dotY, CELL_SIZE * DOT_RADIUS_FACTOR, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    for (const [startRow, startCol] of [
      [0, 0],
      [0, moduleCount - FINDER_SIZE],
      [moduleCount - FINDER_SIZE, 0],
    ]) {
      this._drawFinderPattern(
        ctx,
        margin + startCol * CELL_SIZE,
        margin + startRow * CELL_SIZE
      );
    }
  },

  _drawFinderPattern(ctx, x, y) {
    const outerSize = FINDER_SIZE * CELL_SIZE;
    const ringSize = (FINDER_SIZE - 2) * CELL_SIZE;
    const centerSize = (FINDER_SIZE - 4) * CELL_SIZE;
    const outerR = CELL_SIZE * FINDER_OUTER_CORNER_RADIUS_FACTOR;
    const innerR = CELL_SIZE * FINDER_INNER_CORNER_RADIUS_FACTOR;

    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.roundRect(x, y, outerSize, outerSize, outerR);
    ctx.fill();

    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.roundRect(x + CELL_SIZE, y + CELL_SIZE, ringSize, ringSize, innerR);
    ctx.fill();

    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.roundRect(
      x + 2 * CELL_SIZE,
      y + 2 * CELL_SIZE,
      centerSize,
      centerSize,
      innerR
    );
    ctx.fill();
  },

  /**
   * Load an image from a URL/data URI
   *
   * @param {Document} document - The document to use for creating the image
   * @param {string} src - The image source
   * @returns {Promise<HTMLImageElement>}
   */
  _loadImage(document, src) {
    return new Promise((resolve, reject) => {
      const img = document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "img"
      );
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  },

  /**
   * Load the Firefox logo
   *
   * @param {Document} document - The document to use for creating the image
   * @returns {Promise<HTMLImageElement>}
   */
  async _loadFirefoxLogo(document) {
    // Use the Firefox branding logo
    return this._loadImage(
      document,
      "chrome://branding/content/about-logo.svg"
    );
  },
};
