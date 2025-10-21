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
  window.SharingUtils.updateShareURLMenuItem(testBrowser, fileMenuPopup.querySelector("#menu_savePage"));

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

  await BrowserTestUtils.withNewTab(TEST_URL, async browser => {
    let { fileMenuPopup, shareSubmenu, qrCodeItem } = await openShareMenuAndGetQRItem(window);

    // Verify QR code item properties
    ok(!qrCodeItem.disabled, "QR Code menu item should be enabled for shareable URL");
    is(
      qrCodeItem.getAttribute("data-l10n-id"),
      "menu-file-share-qrcode",
      "QR Code menu item should have correct localization ID"
    );

    // No cleanup needed since we didn't actually open the menus
  });
});

add_task(async function test_qrcode_dialog_opens() {
  if (AppConstants.platform != "macosx") {
    ok(true, "Skipping test on non-macOS platform");
    return;
  }

  await BrowserTestUtils.withNewTab(TEST_URL, async browser => {
    info("Testing QR code dialog opening");

    // Set up dialog promise before clicking
    let dialogPromise = BrowserTestUtils.domWindowOpened(null, async win => {
      await BrowserTestUtils.waitForEvent(win, "load");
      info("Dialog window loaded");

      is(
        win.document.documentElement.id,
        "qrcode-dialog",
        "Should open QR code dialog"
      );

      // Wait for success container to be shown (not loading)
      await BrowserTestUtils.waitForCondition(
        () => !win.document.getElementById("success-container").hidden,
        "Waiting for QR code to be displayed"
      );

      let qrImage = win.document.getElementById("qrcode-image");
      ok(qrImage, "QR code image element should exist");
      ok(qrImage.src, "QR code image should have a src");
      ok(qrImage.src.startsWith("data:image/png"), "QR code should be PNG data URI");

      let urlDisplay = win.document.getElementById("qrcode-url");
      ok(urlDisplay, "URL display element should exist");
      is(urlDisplay.value, TEST_URL, "URL should be displayed correctly");

      // Check buttons exist
      ok(win.document.getElementById("copy-button"), "Copy button should exist");
      ok(win.document.getElementById("save-button"), "Save button should exist");
      ok(win.document.getElementById("close-button"), "Close button should exist");

      // Close dialog
      win.close();
      return true;
    });

    // Open menus and click QR code item
    let { fileMenuPopup, shareSubmenu, qrCodeItem } = await openShareMenuAndGetQRItem(window);

    info("Clicking QR code menu item");

    // Use doCommand which we know works from our testing
    info("Using doCommand to trigger QR code generation");
    qrCodeItem.doCommand();

    // Wait for the dialog to open
    info("Waiting for dialog to open");
    await dialogPromise;
    info("Dialog test completed");

    // No cleanup needed since we didn't actually open the menus
  });
});

add_task(async function test_qrcode_disabled_for_non_shareable_urls() {
  if (AppConstants.platform != "macosx") {
    ok(true, "Skipping test on non-macOS platform");
    return;
  }

  await BrowserTestUtils.withNewTab("about:blank", async browser => {
    info("Testing QR code disabled for non-shareable URLs");

    let { fileMenuPopup, shareSubmenu, qrCodeItem } = await openShareMenuAndGetQRItem(window);

    // Check QR code item is disabled for non-shareable URL
    ok(qrCodeItem.disabled, "QR Code menu item should be disabled for about:blank");

    // No cleanup needed since we didn't actually open the menus
  });
});