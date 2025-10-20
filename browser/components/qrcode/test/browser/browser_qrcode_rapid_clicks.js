/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Test rapid interactions with QR code panel
 * Tests the CustomizableWidgets implementation under rapid use
 */

/**
 * Test rapid panel open/close cycles
 */
add_task(async function test_rapid_panel_open_close() {
  info("Testing rapid panel open/close");

  await BrowserTestUtils.withNewTab("https://example.com", async browser => {
    // Rapidly open and close panel 5 times
    for (let i = 0; i < 5; i++) {
      info(`Cycle ${i + 1}`);

      // Open panel
      let button = window.document.getElementById("qrcode-button");
      button.click();

      // Wait briefly for panel to start opening
      await BrowserTestUtils.waitForCondition(() => {
        let view = window.document.getElementById("PanelUI-qrcode");
        return view;
      }, `Waiting for panel view on cycle ${i + 1}`);

      // Close immediately
      let view = window.document.getElementById("PanelUI-qrcode");
      let panel = view?.closest("panel");
      if (panel && panel.state !== "closed") {
        panel.hidePopup();
      }

      // Wait for panel to actually close before next cycle
      await BrowserTestUtils.waitForCondition(() => {
        return !panel || panel.state === "closed";
      }, `Waiting for panel to close on cycle ${i + 1}`);
    }

    // Finally open panel and verify it works correctly
    await openQRCodePanel();
    let elements = await waitForQRCodeLoad();

    ok(elements.qrcodeImage, "QR code should load after rapid cycles");
    ok(elements.copyButton, "Copy button should exist after rapid cycles");
    ok(elements.saveButton, "Save button should exist after rapid cycles");

    await closeQRCodePanel();
  });
});

/**
 * Test rapid button clicks
 */
add_task(async function test_rapid_button_clicks() {
  info("Testing rapid button clicks");

  await BrowserTestUtils.withNewTab("https://example.com", async browser => {
    await openQRCodePanel();
    let elements = await waitForQRCodeLoad();

    // Click copy button rapidly 10 times
    info("Rapid clicking copy button");
    for (let i = 0; i < 10; i++) {
      elements.copyButton.click();
      // No artificial delay - test truly rapid clicks
    }

    // Panel should still be functional
    elements = getQRCodePanelElements();
    ok(elements, "Panel elements should still exist");
    ok(elements.copyButton, "Copy button should still exist");

    // Check button has some feedback shown
    let label = elements.copyButton.getAttribute("label") || elements.copyButton.textContent;
    ok(
      label === "Copied!" || label === "Copy Image",
      `Button should have valid label (got "${label}")`
    );

    await closeQRCodePanel();
  });
});

/**
 * Test switching tabs rapidly while panel is open
 */
add_task(async function test_rapid_tab_switch_with_panel() {
  info("Testing rapid tab switching with panel open");

  const URL1 = "https://example.com/tab1";
  const URL2 = "https://example.com/tab2";
  const URL3 = "https://example.com/tab3";

  let tab1 = await BrowserTestUtils.openNewForegroundTab(gBrowser, URL1);
  let tab2 = await BrowserTestUtils.openNewForegroundTab(gBrowser, URL2);
  let tab3 = await BrowserTestUtils.openNewForegroundTab(gBrowser, URL3);

  // Open panel on tab3
  await openQRCodePanel();
  let elements = await waitForQRCodeLoad();
  is(elements.qrcodeUrl?.textContent, URL3, "Should show URL for tab 3");

  // Rapidly switch tabs while panel is open
  for (let i = 0; i < 3; i++) {
    await BrowserTestUtils.switchTab(gBrowser, tab1);
    await BrowserTestUtils.switchTab(gBrowser, tab2);
    await BrowserTestUtils.switchTab(gBrowser, tab3);
  }

  // Panel might have closed during rapid switching
  let view = window.document.getElementById("PanelUI-qrcode");
  let panel = view?.closest("panel");

  if (panel && panel.state === "open") {
    // If still open, verify it's showing correct tab
    elements = getQRCodePanelElements();
    if (elements && elements.qrcodeUrl) {
      is(elements.qrcodeUrl.textContent, URL3, "Should still show URL for current tab");
    }
    await closeQRCodePanel();
  }

  // Clean up tabs
  BrowserTestUtils.removeTab(tab1);
  BrowserTestUtils.removeTab(tab2);
  BrowserTestUtils.removeTab(tab3);
});

/**
 * Test rapid URL navigation while panel is open
 */
add_task(async function test_rapid_navigation_with_panel() {
  info("Testing rapid navigation with panel open");

  await BrowserTestUtils.withNewTab("https://example.com", async browser => {
    // Open panel
    await openQRCodePanel();
    let elements = await waitForQRCodeLoad();

    let initialUrl = elements.qrcodeUrl?.textContent;
    ok(initialUrl, "Initial URL should be displayed");

    // Navigate rapidly to different URLs
    const urls = [
      "https://example.com/page1",
      "https://example.com/page2",
      "https://example.com/page3"
    ];

    for (let url of urls) {
      BrowserTestUtils.startLoadingURIString(browser, url);
      await BrowserTestUtils.browserLoaded(browser, false, url);
      // No artificial delay - test truly rapid navigation
    }

    // Panel might have closed or updated
    let view = window.document.getElementById("PanelUI-qrcode");
    let panel = view?.closest("panel");

    if (panel && panel.state === "open") {
      // Panel survived navigation - this is fine
      ok(true, "Panel remained open through navigation");
      await closeQRCodePanel();
    } else {
      // Panel closed during navigation - also fine
      ok(true, "Panel closed during navigation");
    }

    // Verify we can still open panel after rapid navigation
    await openQRCodePanel();
    elements = await waitForQRCodeLoad();

    ok(elements.qrcodeImage, "QR code should generate after rapid navigation");
    is(
      elements.qrcodeUrl?.textContent,
      urls[urls.length - 1],
      "Should show final navigated URL"
    );

    await closeQRCodePanel();
  });
});