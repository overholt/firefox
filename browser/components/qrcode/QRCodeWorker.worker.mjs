/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Now load the QRCode library with the full resource URI
import { QR } from "moz-src:///toolkit/components/qrcode/encoder.mjs";
import { PromiseWorker } from "resource://gre/modules/workers/PromiseWorker.mjs";

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
// Minimum logo size in QR modules - below this the logo is too small to recognize.
const MIN_LOGO_MODULE_SPAN = 6;
// Maximum logo size in QR modules - keeps the logo within the H-level error correction budget.
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

function getMargin() {
  return MARGIN_CELLS * CELL_SIZE;
}

function getCanvasSize(dotCount, margin = getMargin()) {
  return dotCount * CELL_SIZE + margin * 2;
}

function generateStyledQRCodeSVG(matrix, placement, margin = getMargin()) {
  const dotCount = matrix.length;
  const canvasSize = getCanvasSize(dotCount, margin);
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasSize}" height="${canvasSize}" viewBox="0 0 ${canvasSize} ${canvasSize}">`,
    `<rect width="${canvasSize}" height="${canvasSize}" fill="white"/>`,
  ];

  forEachVisibleDarkModule(matrix, placement, margin, (dotX, dotY) => {
    parts.push(
      `<circle cx="${dotX}" cy="${dotY}" r="${CELL_SIZE * DOT_RADIUS_FACTOR}" fill="black"/>`
    );
  });

  for (const [startRow, startCol] of getFinderPatternOrigins(dotCount)) {
    const x = margin + startCol * CELL_SIZE;
    const y = margin + startRow * CELL_SIZE;
    parts.push(...getFinderPatternSVGParts(x, y));
  }

  parts.push("</svg>");
  return parts.join("");
}

function getFinderPatternSVGParts(x, y) {
  const outerSize = FINDER_SIZE * CELL_SIZE;
  const ringSize = (FINDER_SIZE - 2) * CELL_SIZE;
  const centerSize = (FINDER_SIZE - 4) * CELL_SIZE;
  const outerR = CELL_SIZE * FINDER_OUTER_CORNER_RADIUS_FACTOR;
  const innerR = CELL_SIZE * FINDER_INNER_CORNER_RADIUS_FACTOR;

  return [
    `<rect x="${x}" y="${y}" width="${outerSize}" height="${outerSize}" rx="${outerR}" ry="${outerR}" fill="black"/>`,
    `<rect x="${x + CELL_SIZE}" y="${y + CELL_SIZE}" width="${ringSize}" height="${ringSize}" rx="${innerR}" ry="${innerR}" fill="white"/>`,
    `<rect x="${x + 2 * CELL_SIZE}" y="${y + 2 * CELL_SIZE}" width="${centerSize}" height="${centerSize}" rx="${innerR}" ry="${innerR}" fill="black"/>`,
  ];
}

function getFinderPatternOrigins(dotCount) {
  return [
    [0, 0],
    [0, dotCount - FINDER_SIZE],
    [dotCount - FINDER_SIZE, 0],
  ];
}

function forEachVisibleDarkModule(matrix, placement, margin, callback) {
  const dotCount = matrix.length;
  const isInFinderPatternCorners = (row, col) =>
    (row < FINDER_SIZE && col < FINDER_SIZE) ||
    (row < FINDER_SIZE && col >= dotCount - FINDER_SIZE) ||
    (row >= dotCount - FINDER_SIZE && col < FINDER_SIZE);

  for (let row = 0; row < dotCount; row++) {
    for (let col = 0; col < dotCount; col++) {
      if (isInFinderPatternCorners(row, col) || !matrix[row][col]) {
        continue;
      }
      const dotX = margin + (col + 0.5) * CELL_SIZE;
      const dotY = margin + (row + 0.5) * CELL_SIZE;
      const offsetX = dotX - placement.centerX;
      const offsetY = dotY - placement.centerY;
      if (
        placement.showLogo &&
        !placement.reservedMatrix[row][col] &&
        Math.hypot(offsetX, offsetY) <
          placement.clearRadius + CELL_SIZE * DOT_RADIUS_FACTOR
      ) {
        continue;
      }
      callback(dotX, dotY);
    }
  }
}

function getLogoPlacement(dotCount, margin = getMargin()) {
  const canvasSize = getCanvasSize(dotCount, margin);
  const reservedMatrix = createReservedMatrix(dotCount);
  const preferredLogoSize = getPreferredLogoSize(canvasSize);
  const minimumLogoSize = MIN_LOGO_MODULE_SPAN * CELL_SIZE;
  let logoSize = Math.max(preferredLogoSize, minimumLogoSize);
  let centerCell = null;

  while (logoSize >= minimumLogoSize && !centerCell) {
    centerCell = findLogoCenterCell(dotCount, logoSize, reservedMatrix);
    if (!centerCell) {
      logoSize -= CELL_SIZE;
    }
  }

  if (!centerCell) {
    return {
      centerX: Math.floor(canvasSize / 2),
      centerY: Math.floor(canvasSize / 2),
      clearRadius: 0,
      logoSize,
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
}

function getPreferredLogoSize(canvasSize) {
  const desiredLogoSize = Math.round(canvasSize * 0.18);
  return Math.min(desiredLogoSize, MAX_LOGO_MODULE_SPAN * CELL_SIZE);
}

function createReservedMatrix(dotCount) {
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
}

function findLogoCenterCell(dotCount, logoSize, reservedMatrix) {
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
    if (logoFitsAtCell(candidate, dotCount, logoSize, reservedMatrix)) {
      return candidate;
    }
  }

  return null;
}

function logoFitsAtCell(centerCell, dotCount, logoSize, reservedMatrix) {
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
      if (
        Math.hypot(offsetX, offsetY) < suppressionRadius ||
        (Math.abs(offsetX) < halfLogoSize && Math.abs(offsetY) < halfLogoSize)
      ) {
        return false;
      }
    }
  }

  return true;
}

/**
 * QRCode Worker Implementation
 *
 * This worker handles QR code generation off the main thread.
 */

/**
 * The QR Code generator that runs in a worker thread
 */
class QRCodeWorkerImpl {
  constructor() {
    this.#connectToPromiseWorker();
  }

  /**
   * Simple ping test for worker communication
   *
   * @returns {string} Returns "pong"
   */
  ping() {
    return "pong";
  }

  /**
   * Check if the QRCode library is available
   *
   * @returns {boolean} True if library is loaded
   */
  hasQRCodeLibrary() {
    return typeof QR !== "undefined" && QR !== null;
  }

  /**
   * Generate a QR code for the given URL
   *
   * @param {string} url - The URL to encode
   * @param {string} errorCorrectionLevel - Error correction level (L, M, Q, H)
   * @returns {object} Object with width, height, and src data URI
   */
  generateQRCode(url, errorCorrectionLevel = "H") {
    if (!QR || !QR.encodeToDataURI) {
      throw new Error("QRCode library not available in worker");
    }
    const { src, width, height } = QR.encodeToDataURI(
      url,
      errorCorrectionLevel
    );
    return { src, width, height };
  }

  /**
   * @param {string} url
   * @param {string} errorCorrectionLevel
   * @returns {{ matrix: boolean[][], dotCount: number }}
   */
  generateQRMatrix(url, errorCorrectionLevel = "H") {
    if (!QR || !QR.encodeToMatrix) {
      throw new Error("QRCode library not available in worker");
    }
    const { matrix, dotCount } = QR.encodeToMatrix(url, errorCorrectionLevel);
    return { matrix, dotCount };
  }

  /**
   * Render the QR body as an SVG in the worker. The main thread still draws
   * the Firefox logo on top, but all per-module layout happens off-thread.
   *
   * @param {string} url
   * @param {string} errorCorrectionLevel
   * @returns {{ src: string, width: number, height: number, dotCount: number }}
   */
  async generateStyledQRCode(url, errorCorrectionLevel = "H") {
    if (!QR || !QR.encodeToMatrix) {
      throw new Error("QRCode library not available in worker");
    }

    const { matrix, dotCount } = QR.encodeToMatrix(url, errorCorrectionLevel);
    const margin = getMargin();
    const placement = getLogoPlacement(dotCount, margin);
    const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      generateStyledQRCodeSVG(matrix, placement, margin)
    )}`;
    const size = getCanvasSize(dotCount, margin);
    return {
      src,
      width: size,
      height: size,
      dotCount,
    };
  }

  /**
   * Glue code to connect the `QRCodeWorkerImpl` to the PromiseWorker interface.
   */
  #connectToPromiseWorker() {
    const worker = new PromiseWorker.AbstractWorker();

    worker.dispatch = (method, args = []) => {
      if (!this[method]) {
        throw new Error("Method does not exist: " + method);
      }
      return this[method](...args);
    };

    worker.close = () => self.close();

    worker.postMessage = (message, ...transfers) => {
      self.postMessage(message, ...transfers);
    };

    self.addEventListener("message", msg => worker.handleMessage(msg));
    self.addEventListener("unhandledrejection", function (error) {
      throw error.reason;
    });
  }
}

// Create the worker instance
new QRCodeWorkerImpl();
