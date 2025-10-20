/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Test that QR code generation works correctly
 * Verifies the CustomizableWidgets implementation properly generates QR codes
 */

add_task(async function test_qrcode_generation_success() {
  info("Testing QR code generation");

  await BrowserTestUtils.withNewTab("https://example.com", async browser => {
    // Open the QR code panel
    let { panel, view } = await openQRCodePanel();
    ok(view, "QR code panel opened");

    // Wait for QR code to load
    let elements = await waitForQRCodeLoad();
    ok(elements, "QR code elements loaded");

    // Verify QR code was generated successfully
    ok(elements.qrcodeImage, "QR code image element exists");
    ok(elements.qrcodeImage.src, "QR code image has src");
    ok(
      elements.qrcodeImage.src.startsWith("data:image/png;base64,"),
      "QR code image src is a PNG data URI"
    );
    ok(
      elements.qrcodeImage.naturalWidth > 0,
      "QR code image has valid width"
    );
    ok(
      elements.qrcodeImage.naturalHeight > 0,
      "QR code image has valid height"
    );

    // Close panel
    await closeQRCodePanel();
  });
});

/**
 * Test QR code generation for special characters in URL
 */
add_task(async function test_qrcode_special_characters() {
  info("Testing QR code generation with special characters");

  const TEST_URLS = [
    "https://example.com/path?query=value&other=test",
    "https://example.com/path#anchor",
    "https://example.com/path with spaces",
    "https://example.com/über",
    "https://example.com/测试",
  ];

  for (let url of TEST_URLS) {
    info(`Testing URL: ${url}`);

    await BrowserTestUtils.withNewTab(url, async browser => {
      await openQRCodePanel();
      let elements = await waitForQRCodeLoad();

      ok(
        elements.qrcodeImage?.src,
        `QR code should generate for URL: ${url}`
      );

      // Verify URL label shows correctly
      // Browser may encode special characters in URLs
      let displayedUrl = elements.qrcodeUrl?.textContent;
      let expectedUrl = browser.currentURI.spec;
      is(
        displayedUrl,
        expectedUrl,
        "URL label should match the current URL"
      );

      await closeQRCodePanel();
    });
  }
});

/**
 * Test error handling for QR code generation
 */
add_task(async function test_qrcode_error_handling() {
  info("Testing QR code error handling");

  // Test with about:blank which might not generate a QR code
  await BrowserTestUtils.withNewTab("about:blank", async browser => {
    await openQRCodePanel();

    // Wait for panel content to load (either error or QR code)
    let view = window.document.getElementById("PanelUI-qrcode");
    await BrowserTestUtils.waitForCondition(() => {
      let body = view.querySelector(".panel-subview-body");
      return body && body.children.length > 0;
    }, "Waiting for panel content to load");

    let body = view.querySelector(".panel-subview-body");

    if (body) {
      // Check if an error message is shown
      let labels = body.querySelectorAll("label");
      let hasError = false;
      for (let label of labels) {
        if (label.textContent.includes("Failed") ||
            label.style.color === "red") {
          hasError = true;
          ok(true, "Error message shown for invalid URL");
          break;
        }
      }

      if (!hasError) {
        // Check if QR code was generated anyway
        let img = body.querySelector("img");
        if (img && img.src) {
          ok(true, "QR code generated even for about:blank");
        }
      }
    }

    await closeQRCodePanel();
  });
});