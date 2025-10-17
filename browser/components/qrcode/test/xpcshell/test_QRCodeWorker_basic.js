/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Test basic QRCodeWorker infrastructure
 */

add_task(async function test_worker_instantiation() {
  info("Testing QRCodeWorker can be instantiated");

  const { QRCodeWorker } = ChromeUtils.importESModule(
    "resource:///modules/QRCodeWorker.sys.mjs"
  );

  const worker = new QRCodeWorker();
  Assert.ok(worker, "QRCodeWorker instance should be created");

  // Clean up
  await worker.terminate();
});

add_task(async function test_worker_responds_to_ping() {
  info("Testing QRCodeWorker responds to ping message");

  const { QRCodeWorker } = ChromeUtils.importESModule(
    "resource:///modules/QRCodeWorker.sys.mjs"
  );

  const worker = new QRCodeWorker();

  // Test ping functionality
  const response = await worker.ping();
  Assert.equal(response, "pong", "Worker should respond with 'pong' to ping");

  // Clean up
  await worker.terminate();
});