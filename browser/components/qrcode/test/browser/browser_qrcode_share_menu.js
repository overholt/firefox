/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Test QR code generation from File > Share menu on macOS
 */

const TEST_URL = "https://example.com/test";

// Helper function to open File > Share menu and get QR code item
async function openShareMenuAndGetQRItem(window) {
  info("Accessing File > Share menu directly");

  // Get the File menu popup directly
  let fileMenuPopup = window.document.getElementById("menu_FilePopup");
  ok(fileMenuPopup, "File menu popup should exist");

  // Find the Share menu item (it should be created even if menu isn't shown)
  // First trigger the menu creation by calling the sharing utility
  let testBrowser = window.gBrowser.selectedBrowser;
  window.SharingUtils.updateShareURLMenuItem(
    testBrowser,
    fileMenuPopup.querySelector("#menu_savePage")
  );

  let shareMenuItem = fileMenuPopup.querySelector(".share-tab-url-item");
  ok(shareMenuItem, "Share menu item should exist in File menu");

  // Get the Share submenu
  let shareSubmenu = shareMenuItem.menupopup;
  ok(shareSubmenu, "Share submenu should exist");

  // Initialize the share menu popup without actually showing it
  window.SharingUtils.initializeShareURLPopup(shareSubmenu);

  // Find QR code menu item
  let qrCodeItem = shareSubmenu.querySelector(".share-qrcode-item");
  ok(qrCodeItem, "QR Code menu item should exist in Share submenu");

  return { fileMenuPopup, shareSubmenu, qrCodeItem };
}

add_task(async function test_qrcode_share_menu_macos() {
  // This test is macOS-specific
  if (AppConstants.platform != "macosx") {
    ok(true, "Skipping test on non-macOS platform");
    return;
  }

  await BrowserTestUtils.withNewTab(TEST_URL, async _browser => {
    let { qrCodeItem } = await openShareMenuAndGetQRItem(window);

    // Verify QR code item properties
    ok(
      !qrCodeItem.disabled,
      "QR Code menu item should be enabled for shareable URL"
    );
    is(
      qrCodeItem.getAttribute("data-l10n-id"),
      "menu-file-share-qrcode",
      "QR Code menu item should have correct localization ID"
    );

    // No cleanup needed since we didn't actually open the menus
  });
});

add_task(async function test_qrcode_identity_panel_opens() {
  if (AppConstants.platform != "macosx") {
    ok(true, "Skipping test on non-macOS platform");
    return;
  }

  await BrowserTestUtils.withNewTab(TEST_URL, async _browser => {
    info("Testing QR code part of identity panel opening");

    // Initialize the identity popup (it's in a template until initialized)
    window.gIdentityHandler._initializePopup();

    let identityPopup = window.document.getElementById("identity-popup");
    ok(identityPopup, "QR code part of identity panel: popup should exist");

    // Open menus and click QR code item
    let { qrCodeItem } = await openShareMenuAndGetQRItem(window);

    info("QR code part of identity panel: clicking QR code menu item");

    // Set up popup shown promise
    let popupShownPromise = BrowserTestUtils.waitForEvent(
      identityPopup,
      "popupshown"
    );

    // Trigger QR code command
    qrCodeItem.doCommand();

    // Wait for identity popup to open
    await popupShownPromise;
    info("QR code part of identity panel: identity popup opened");

    // Wait for QR code subview to be shown
    let qrcodeView = window.document.getElementById(
      "identity-popup-qrcodeView"
    );
    ok(qrcodeView, "QR code subview should exist in identity panel");

    await BrowserTestUtils.waitForCondition(
      () =>
        window.gIdentityHandler._identityPopupMultiView.getAttribute(
          "mainViewId"
        ) !== "identity-popup-qrcodeView" ||
        qrcodeView.classList.contains("current"),
      "Waiting for QR code subview to be shown in identity panel"
    );

    // Wait for success state to be displayed
    let successContainer = window.document.getElementById(
      "identity-popup-qrcode-success"
    );
    await BrowserTestUtils.waitForCondition(
      () => !successContainer.hidden,
      "Waiting for QR code to be generated and displayed in identity panel"
    );

    // Verify QR code elements in identity panel
    let qrImage = window.document.getElementById("identity-popup-qrcode-image");
    ok(qrImage, "QR code image element should exist in identity panel");
    ok(qrImage.src, "QR code image should have a src in identity panel");
    ok(
      qrImage.src.startsWith("data:image/png"),
      "QR code should be PNG data URI in identity panel"
    );

    let urlDisplay = window.document.getElementById(
      "identity-popup-qrcode-url"
    );
    ok(urlDisplay, "URL display element should exist in identity panel");
    is(
      urlDisplay.textContent,
      TEST_URL,
      "URL should be displayed correctly in identity panel"
    );

    // Check buttons exist in identity panel
    ok(
      window.document.getElementById("identity-popup-qrcode-copy"),
      "Copy button should exist in identity panel"
    );
    ok(
      window.document.getElementById("identity-popup-qrcode-save"),
      "Save button should exist in identity panel"
    );

    // Close the panel
    let popupHiddenPromise = BrowserTestUtils.waitForEvent(
      identityPopup,
      "popuphidden"
    );
    identityPopup.hidePopup();
    await popupHiddenPromise;
    info("QR code part of identity panel: test completed");
  });
});

add_task(async function test_qrcode_disabled_for_non_shareable_urls() {
  if (AppConstants.platform != "macosx") {
    ok(true, "Skipping test on non-macOS platform");
    return;
  }

  await BrowserTestUtils.withNewTab("about:blank", async _browser => {
    info("Testing QR code disabled for non-shareable URLs");

    let { qrCodeItem } = await openShareMenuAndGetQRItem(window);

    // Check QR code item is disabled for non-shareable URL
    ok(
      qrCodeItem.disabled,
      "QR Code menu item should be disabled for about:blank"
    );

    // No cleanup needed since we didn't actually open the menus
  });
});
