/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Test QRCodeGenerator with worker integration
 */

add_task(async function test_generator_uses_worker() {
  info("Testing QRCodeGenerator uses worker for QR generation");

  const { QRCodeGenerator } = ChromeUtils.importESModule(
    "resource:///modules/QRCodeGenerator.sys.mjs"
  );

  // Create a minimal mock document with required methods
  const mockDocument = {
    createElementNS: (ns, tagName) => {
      if (tagName === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            imageSmoothingEnabled: false,
            imageSmoothingQuality: "high",
            fillStyle: "white",
            beginPath: () => {},
            arc: () => {},
            fill: () => {},
            drawImage: () => {},
          }),
          toDataURL: () => "data:image/png;base64,mock",
        };
      } else if (tagName === "img") {
        return {
          onload: null,
          onerror: null,
          src: null,
          set src(value) {
            // Simulate image load
            Services.tm.dispatchToMainThread(() => {
              if (this.onload) {
                this.onload();
              }
            });
          },
        };
      }
      return {};
    },
  };

  // Generate a QR code using the worker
  const testUrl = "https://mozilla.org";
  const dataUri = await QRCodeGenerator.generateQRCode(testUrl, mockDocument);

  Assert.ok(dataUri, "Should get a data URI from generateQRCode");
  Assert.ok(dataUri.startsWith("data:image/"), "Should be a data URI");

  // Verify that the worker was created
  Assert.ok(QRCodeGenerator._worker, "Worker should be created");

  // Clean up the worker
  await QRCodeGenerator.cleanup();
  Assert.equal(QRCodeGenerator._worker, null, "Worker should be cleaned up");
});

add_task(async function test_generator_worker_reuse() {
  info("Testing QRCodeGenerator reuses the same worker instance");

  const { QRCodeGenerator } = ChromeUtils.importESModule(
    "resource:///modules/QRCodeGenerator.sys.mjs"
  );

  // Create a minimal mock document
  const mockDocument = {
    createElementNS: (ns, tagName) => {
      if (tagName === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            imageSmoothingEnabled: false,
            imageSmoothingQuality: "high",
            fillStyle: "white",
            beginPath: () => {},
            arc: () => {},
            fill: () => {},
            drawImage: () => {},
          }),
          toDataURL: () => "data:image/png;base64,mock",
        };
      } else if (tagName === "img") {
        return {
          onload: null,
          onerror: null,
          src: null,
          set src(value) {
            Services.tm.dispatchToMainThread(() => {
              if (this.onload) {
                this.onload();
              }
            });
          },
        };
      }
      return {};
    },
  };

  // Generate first QR code
  await QRCodeGenerator.generateQRCode("https://mozilla.org", mockDocument);
  const firstWorker = QRCodeGenerator._worker;
  Assert.ok(firstWorker, "First worker should be created");

  // Generate second QR code
  await QRCodeGenerator.generateQRCode("https://firefox.com", mockDocument);
  const secondWorker = QRCodeGenerator._worker;
  Assert.equal(
    firstWorker,
    secondWorker,
    "Should reuse the same worker instance"
  );

  // Clean up
  await QRCodeGenerator.cleanup();
  Assert.equal(QRCodeGenerator._worker, null, "Worker should be cleaned up");
});