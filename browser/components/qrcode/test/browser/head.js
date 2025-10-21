/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Setup for QR code tests
// Note: QR code is now accessed via File > Share menu on macOS
// The toolbar button has been disabled
add_setup(async function () {
  // No specific setup needed for menu-based tests
  info("QR code test setup complete");
});

/**
 * Open QR code panel and wait for it to be shown
 * @param {Window} win - The browser window
 * @returns {Promise<Object>} The panel and view elements
 */
async function openQRCodePanel(win = window) {
  let button = win.document.getElementById("qrcode-button");
  ok(button, "QR code button should exist");

  // Click button to open panel
  button.click();

  // Wait for the panel view to be created and shown
  await BrowserTestUtils.waitForCondition(() => {
    let view = win.document.getElementById("PanelUI-qrcode");
    return view && view.querySelector(".panel-subview-body");
  }, "Waiting for QR code panel to open");

  let view = win.document.getElementById("PanelUI-qrcode");
  let panel = view?.closest("panel");

  ok(view, "QR code panel view should exist");
  ok(panel, "Parent panel should exist");

  return { panel, view };
}

/**
 * Close QR code panel and wait for it to be hidden
 * @param {Window} win - The browser window
 */
async function closeQRCodePanel(win = window) {
  let view = win.document.getElementById("PanelUI-qrcode");
  let panel = view?.closest("panel");

  if (!panel || panel.state === "closed") {
    // Panel might already be closed
    return;
  }

  let hiddenPromise = BrowserTestUtils.waitForEvent(panel, "popuphidden");
  panel.hidePopup();
  await hiddenPromise;
}

/**
 * Get panel content elements
 * @param {Window} win - The browser window
 * @returns {Object|null} Object containing panel elements, or null if not ready
 */
function getQRCodePanelElements(win = window) {
  let view = win.document.getElementById("PanelUI-qrcode");
  if (!view) {
    return null;
  }

  let body = view.querySelector(".panel-subview-body");
  if (!body) {
    return null;
  }

  // Find the elements - the CustomizableWidgets implementation creates them directly
  let qrcodeImage = body.querySelector("img");
  let buttons = body.querySelectorAll("button");
  let labels = body.querySelectorAll("label");

  // Identify the elements based on their content/position
  let copyButton = buttons[0];
  let saveButton = buttons[1];

  // URL label is typically after the image
  let qrcodeUrl = null;
  for (let label of labels) {
    if (label.style.wordBreak === "break-all" ||
        (label.textContent && label.textContent.startsWith("http"))) {
      qrcodeUrl = label;
      break;
    }
  }

  return {
    qrcodeImage,
    qrcodeUrl,
    copyButton,
    saveButton,
    body,
  };
}

/**
 * Helper to assert button state
 * @param {Element} button - The button element
 * @param {string} expectedText - Expected button text
 * @param {boolean} expectedDisabled - Expected disabled state
 * @param {string} message - Test message prefix
 */
function assertButtonState(button, expectedText, expectedDisabled, message) {
  is(
    button.getAttribute("label") || button.textContent,
    expectedText,
    `${message}: button text should be "${expectedText}"`
  );
  is(
    button.disabled,
    expectedDisabled,
    `${message}: button disabled should be ${expectedDisabled}`
  );
}

/**
 * Wait for QR code to be fully loaded and displayed
 * @param {Window} win - The browser window
 * @returns {Promise<Object>} The panel elements
 */
async function waitForQRCodeLoad(win = window) {
  // Wait for QR code image to appear and load
  await BrowserTestUtils.waitForCondition(() => {
    let elements = getQRCodePanelElements(win);
    return (
      elements &&
      elements.qrcodeImage &&
      elements.qrcodeImage.src &&
      elements.qrcodeImage.src.startsWith("data:image/png;base64,") &&
      elements.qrcodeImage.complete &&
      elements.qrcodeImage.naturalWidth > 0
    );
  }, "Waiting for QR code image to fully load");

  return getQRCodePanelElements(win);
}