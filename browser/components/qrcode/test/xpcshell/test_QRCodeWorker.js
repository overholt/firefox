/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Test QRCodeWorker functionality
 */

const { QRCodeWorker } = ChromeUtils.importESModule(
  "moz-src:///browser/components/qrcode/QRCodeWorker.sys.mjs"
);

add_task(async function test_worker_instantiation() {
  info("Testing QRCodeWorker can be instantiated");

  const worker = new QRCodeWorker();
  Assert.ok(worker, "QRCodeWorker instance should be created");

  // Clean up
  await worker.terminate();
});

add_task(async function test_worker_responds_to_ping() {
  info("Testing QRCodeWorker responds to ping message");
  const worker = new QRCodeWorker();

  // Test ping functionality
  const response = await worker.ping();
  Assert.equal(response, "pong", "Worker should respond with 'pong' to ping");

  // Clean up
  await worker.terminate();
});

add_task(async function test_worker_can_load_qrcode_library() {
  info("Testing QRCodeWorker can load QRCode library");

  const worker = new QRCodeWorker();

  // Test that the worker can check if the QRCode library is available
  const hasLibrary = await worker.hasQRCodeLibrary();
  Assert.ok(hasLibrary, "Worker should have access to QRCode library");

  // Clean up
  await worker.terminate();
});

add_task(async function test_worker_can_generate_simple_qrcode() {
  info("Testing QRCodeWorker can generate a simple QR code");

  const worker = new QRCodeWorker();

  // Test generating a very simple QR code
  const testUrl = "https://mozilla.org";
  const result = await worker.generateQRCode(testUrl);

  Assert.ok(result, "Should get a result from generateQRCode");
  Assert.ok(result.width, "Result should have a width");
  Assert.ok(result.height, "Result should have a height");
  Assert.ok(result.src, "Result should have a src data URI");
  Assert.ok(result.src.startsWith("data:image/"), "src should be a data URI");

  // Clean up
  await worker.terminate();
});

add_task(async function test_worker_generateQRCode_has_no_matrix() {
  info("Testing QRCodeWorker generateQRCode does not include matrix data");

  const worker = new QRCodeWorker();
  const result = await worker.generateQRCode("https://mozilla.org");

  Assert.equal(
    result.matrix,
    undefined,
    "generateQRCode should not return matrix"
  );
  Assert.equal(
    result.dotCount,
    undefined,
    "generateQRCode should not return dotCount"
  );

  await worker.terminate();
});

add_task(async function test_worker_generateQRMatrix() {
  info("Testing QRCodeWorker generateQRMatrix returns matrix data");

  const worker = new QRCodeWorker();
  const result = await worker.generateQRMatrix("https://mozilla.org");

  Assert.ok(Array.isArray(result.matrix), "Result should have a matrix array");
  Assert.equal(result.src, undefined, "Result should not include image data");
  Assert.equal(
    result.width,
    undefined,
    "Result should not include image width"
  );
  Assert.equal(
    result.height,
    undefined,
    "Result should not include image height"
  );
  Assert.greater(
    result.dotCount,
    0,
    "Result should have a positive dotCount"
  );
  Assert.equal(
    result.matrix.length,
    result.dotCount,
    "matrix should have dotCount rows"
  );
  Assert.equal(
    result.matrix[0].length,
    result.dotCount,
    "matrix rows should have dotCount columns"
  );
  Assert.ok(
    result.matrix[0][0],
    "top-left finder pattern corner should be dark"
  );

  await worker.terminate();
});

add_task(async function test_worker_can_generate_qrcode_for_long_url() {
  info("Testing QRCodeWorker can generate a QR code for a longer URL");

  const worker = new QRCodeWorker();

  // Test generating a long URL QR code
  const testUrl =
    "https://www.cnet.com/home/kitchen-and-household/keep-these-7-devices-far-away-from-extension-cords-or-power-strips/?utm_source=firefox-newtab-en-us";
  const result = await worker.generateQRCode(testUrl);

  Assert.ok(result, "Should get a result from generateQRCode");
  Assert.ok(result.width, "Result should have a width");
  Assert.ok(result.height, "Result should have a height");
  Assert.ok(result.src, "Result should have a src data URI");
  Assert.ok(result.src.startsWith("data:image/"), "src should be a data URI");

  // Clean up
  await worker.terminate();
});
