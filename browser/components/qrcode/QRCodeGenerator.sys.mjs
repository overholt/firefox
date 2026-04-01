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
// Minimum logo size in QR modules — below this the logo is too small to recognise.
const MIN_LOGO_MODULE_SPAN = 6;
// Maximum logo size in QR modules — keeps the logo within the H-level error correction budget.
const MAX_LOGO_MODULE_SPAN = 8;
// Alignment pattern center coordinates by QR version (1-indexed), from ISO/IEC 18004 Table E.1.
const PATTERN_POSITION_TABLE = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
  [6, 26, 48, 70],
  [6, 26, 50, 74],
  [6, 30, 54, 78],
  [6, 30, 56, 82],
  [6, 30, 58, 86],
  [6, 34, 62, 90],
  [6, 28, 50, 72, 94],
  [6, 26, 50, 74, 98],
  [6, 30, 54, 78, 102],
  [6, 28, 54, 80, 106],
  [6, 32, 58, 84, 110],
  [6, 30, 58, 86, 114],
  [6, 34, 62, 90, 118],
  [6, 26, 50, 74, 98, 122],
  [6, 30, 54, 78, 102, 126],
  [6, 26, 52, 78, 104, 130],
  [6, 30, 56, 82, 108, 134],
  [6, 34, 60, 86, 112, 138],
  [6, 30, 58, 86, 114, 142],
  [6, 34, 62, 90, 118, 146],
  [6, 30, 54, 78, 102, 126, 150],
  [6, 24, 50, 76, 102, 128, 154],
  [6, 28, 54, 80, 106, 132, 158],
  [6, 32, 58, 84, 110, 136, 162],
  [6, 26, 54, 82, 110, 138, 166],
  [6, 30, 58, 86, 114, 142, 170],
];

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
      const { matrix, dotCount } = await worker.generateQRMatrix(url, "H");

      if (
        !Array.isArray(matrix) ||
        matrix.length !== dotCount ||
        matrix.some(row => row.length !== dotCount)
      ) {
        throw new Error("QR worker returned malformed matrix data");
      }

      const margin = MARGIN_CELLS * CELL_SIZE;
      // margin * 2 because the quiet zone applies on both sides.
      const canvasSize = dotCount * CELL_SIZE + margin * 2;

      const canvas = document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "canvas"
      );
      canvas.width = canvasSize;
      canvas.height = canvasSize;
      const ctx = canvas.getContext("2d");

      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvasSize, canvasSize);

      const placement = this.getLogoPlacement(dotCount, margin);

      this._drawQRDots(
        ctx,
        matrix,
        placement.reservedMatrix,
        dotCount,
        margin,
        placement.centerX,
        placement.centerY,
        placement.clearRadius,
        placement.showLogo
      );

      // Load and draw the Firefox logo at high resolution
      if (placement.showLogo) {
        try {
          const logoImage = await this._loadFirefoxLogo(document);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(
            logoImage,
            placement.centerX - placement.logoSize / 2,
            placement.centerY - placement.logoSize / 2,
            placement.logoSize,
            placement.logoSize
          );
        } catch (e) {
          lazy.logConsole.warn("Could not load Firefox logo for QR code:", e);
        }
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

  _drawQRDots(
    ctx,
    matrix,
    reservedMatrix,
    dotCount,
    margin,
    centerX,
    centerY,
    clearRadius,
    showLogo
  ) {
    const isInFinderPatternCorners = (row, col) =>
      (row < FINDER_SIZE && col < FINDER_SIZE) ||
      (row < FINDER_SIZE && col >= dotCount - FINDER_SIZE) ||
      (row >= dotCount - FINDER_SIZE && col < FINDER_SIZE);

    ctx.fillStyle = "black";
    for (let row = 0; row < dotCount; row++) {
      for (let col = 0; col < dotCount; col++) {
        // Skip the three finder pattern corners because they are redrawn below.
        if (isInFinderPatternCorners(row, col) || !matrix[row][col]) {
          continue;
        }
        const dotX = margin + (col + 0.5) * CELL_SIZE;
        const dotY = margin + (row + 0.5) * CELL_SIZE;
        const offsetX = dotX - centerX;
        const offsetY = dotY - centerY;
        if (
          showLogo &&
          !reservedMatrix[row][col] &&
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
      [0, dotCount - FINDER_SIZE],
      [dotCount - FINDER_SIZE, 0],
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
   * Compute logo placement for a QR code of the given size.
   *
   * @param {number} dotCount - Number of modules per side of the QR code.
   * @param {number} margin - Pixel margin (quiet zone) around the module grid.
   * @returns {{ centerX: number, centerY: number, clearRadius: number,
   *             logoSize: number, reservedMatrix: boolean[][], showLogo: boolean }}
   *   centerX/centerY: pixel center of the logo on the canvas.
   *   clearRadius: radius of the dot-suppression zone around the logo center.
   *   logoSize: pixel size of the logo square.
   *   reservedMatrix: which modules must not be suppressed (finder, timing, alignment, format info).
   *   showLogo: false if no valid placement exists.
   */
  getLogoPlacement(dotCount, margin) {
    const canvasSize = dotCount * CELL_SIZE + margin * 2;
    const reservedMatrix = this._createReservedMatrix(dotCount);
    const preferredLogoSize = this._getPreferredLogoSize(canvasSize);
    const minimumLogoSize = MIN_LOGO_MODULE_SPAN * CELL_SIZE;
    let logoSize = Math.max(preferredLogoSize, minimumLogoSize);
    let centerCell = null;

    while (logoSize >= minimumLogoSize && !centerCell) {
      centerCell = this._findLogoCenterCell(dotCount, logoSize, reservedMatrix);
      if (!centerCell) {
        logoSize -= CELL_SIZE;
      }
    }

    if (!centerCell) {
      return {
        centerX: Math.floor(canvasSize / 2),
        centerY: Math.floor(canvasSize / 2),
        clearRadius: 0,
        logoSize: minimumLogoSize,
        reservedMatrix,
        showLogo: false,
      };
    }

    return {
      centerX: margin + (centerCell.col + 0.5) * CELL_SIZE,
      centerY: margin + (centerCell.row + 0.5) * CELL_SIZE,
      clearRadius: logoSize / 2,
      logoSize,
      reservedMatrix,
      showLogo: true,
    };
  },

  _getPreferredLogoSize(canvasSize) {
    const desiredLogoSize = Math.round(canvasSize * 0.18);
    return Math.min(desiredLogoSize, MAX_LOGO_MODULE_SPAN * CELL_SIZE);
  },

  _createReservedMatrix(dotCount) {
    const version = (dotCount - 17) / 4;
    const reservedMatrix = Array.from({ length: dotCount }, () =>
      Array(dotCount).fill(false)
    );
    const mark = (row, col) => {
      if (row >= 0 && row < dotCount && col >= 0 && col < dotCount) {
        reservedMatrix[row][col] = true;
      }
    };

    for (const [startRow, startCol] of [
      [0, 0],
      [0, dotCount - 7],
      [dotCount - 7, 0],
    ]) {
      for (let rowOffset = -1; rowOffset <= 7; rowOffset++) {
        for (let colOffset = -1; colOffset <= 7; colOffset++) {
          mark(startRow + rowOffset, startCol + colOffset);
        }
      }
    }

    for (let index = 8; index < dotCount - 8; index++) {
      mark(index, 6);
      mark(6, index);
    }

    const alignmentPositions = PATTERN_POSITION_TABLE[version - 1] ?? [];
    for (const row of alignmentPositions) {
      for (const col of alignmentPositions) {
        if (reservedMatrix[row][col]) {
          continue;
        }
        for (let rowOffset = -2; rowOffset <= 2; rowOffset++) {
          for (let colOffset = -2; colOffset <= 2; colOffset++) {
            mark(row + rowOffset, col + colOffset);
          }
        }
      }
    }

    for (let index = 0; index < 15; index++) {
      if (index < 6) {
        mark(index, 8);
      } else if (index < 8) {
        mark(index + 1, 8);
      } else {
        mark(dotCount - 15 + index, 8);
      }

      if (index < 8) {
        mark(8, dotCount - index - 1);
      } else if (index < 9) {
        mark(8, 15 - index);
      } else {
        mark(8, 14 - index);
      }
    }

    mark(dotCount - 8, 8);

    if (version >= 7) {
      for (let index = 0; index < 18; index++) {
        mark(Math.floor(index / 3), (index % 3) + dotCount - 11);
        mark((index % 3) + dotCount - 11, Math.floor(index / 3));
      }
    }

    return reservedMatrix;
  },

  _findLogoCenterCell(dotCount, logoSize, reservedMatrix) {
    const midpoint = (dotCount - 1) / 2;
    const candidates = [];

    for (let row = 0; row < dotCount; row++) {
      for (let col = 0; col < dotCount; col++) {
        candidates.push({
          col,
          row,
          distance: (row - midpoint) ** 2 + (col - midpoint) ** 2,
        });
      }
    }

    candidates.sort((a, b) => a.distance - b.distance);

    for (const candidate of candidates) {
      if (this._logoFitsAtCell(candidate, dotCount, logoSize, reservedMatrix)) {
        return candidate;
      }
    }

    return null;
  },

  _logoFitsAtCell(centerCell, dotCount, logoSize, reservedMatrix) {
    const halfLogoSize = logoSize / 2;
    const halfLogoDots = halfLogoSize / CELL_SIZE;
    const suppressionRadius = halfLogoSize + CELL_SIZE * DOT_RADIUS_FACTOR;
    const maxOffset = Math.ceil(suppressionRadius / CELL_SIZE);

    if (
      centerCell.row + 0.5 - halfLogoDots < 0 ||
      centerCell.col + 0.5 - halfLogoDots < 0 ||
      centerCell.row + 0.5 + halfLogoDots > dotCount ||
      centerCell.col + 0.5 + halfLogoDots > dotCount
    ) {
      return false;
    }

    for (
      let row = Math.max(0, centerCell.row - maxOffset);
      row <= Math.min(dotCount - 1, centerCell.row + maxOffset);
      row++
    ) {
      for (
        let col = Math.max(0, centerCell.col - maxOffset);
        col <= Math.min(dotCount - 1, centerCell.col + maxOffset);
        col++
      ) {
        if (!reservedMatrix[row][col]) {
          continue;
        }

        const offsetX = (col - centerCell.col) * CELL_SIZE;
        const offsetY = (row - centerCell.row) * CELL_SIZE;
        // Circular check: would this reserved dot be suppressed by the clear zone?
        // Rectangular check: is this reserved cell within the square logo bounding box?
        // Both are needed because the logo is square — its corners reach ~1.41× the
        // circular suppression radius, so corner cells would be missed by the circle alone.
        if (
          Math.hypot(offsetX, offsetY) < suppressionRadius ||
          (Math.abs(offsetX) < halfLogoSize && Math.abs(offsetY) < halfLogoSize)
        ) {
          return false;
        }
      }
    }

    return true;
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
