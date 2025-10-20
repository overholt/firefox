/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Test panel lifecycle in CustomizableWidgets implementation
 */

/**
 * Test panel open and close lifecycle
 */
add_task(async function test_panel_open_close_lifecycle() {
  info("Testing panel open and close lifecycle");

  await BrowserTestUtils.withNewTab("https://example.com", async browser => {
    // Get initial state
    let view = window.document.getElementById("PanelUI-qrcode");
    ok(!view || !view.firstChild, "Panel view should be empty initially");

    // Open panel
    await openQRCodePanel();

    // Verify panel is populated
    view = window.document.getElementById("PanelUI-qrcode");
    ok(view, "Panel view should exist");
    ok(view.firstChild, "Panel view should have content");

    let body = view.querySelector(".panel-subview-body");
    ok(body, "Panel should have body element");

    // Wait for QR code to load
    let elements = await waitForQRCodeLoad();
    ok(elements.qrcodeImage, "QR code image should exist");

    // Close panel
    await closeQRCodePanel();

    // Verify panel is cleaned up (onViewHiding clears content)
    view = window.document.getElementById("PanelUI-qrcode");
    ok(!view.firstChild, "Panel view should be empty after close");
  });
});

/**
 * Test rapid panel open/close cycles
 */
add_task(async function test_rapid_panel_cycles() {
  info("Testing rapid panel open/close cycles");

  await BrowserTestUtils.withNewTab("https://example.com", async browser => {
    for (let i = 0; i < 5; i++) {
      info(`Cycle ${i + 1}`);

      // Open panel
      await openQRCodePanel();

      // Verify panel has content
      let view = window.document.getElementById("PanelUI-qrcode");
      ok(view && view.firstChild, `Panel should have content on cycle ${i + 1}`);

      // Close immediately
      await closeQRCodePanel();

      // Verify cleanup
      view = window.document.getElementById("PanelUI-qrcode");
      ok(!view.firstChild, `Panel should be empty after close on cycle ${i + 1}`);
    }

    // Final verification - panel should still work
    await openQRCodePanel();
    let elements = await waitForQRCodeLoad();
    ok(elements.qrcodeImage, "QR code should load after rapid cycles");
    await closeQRCodePanel();
  });
});

/**
 * Test panel events (onViewShowing, onViewHiding)
 */
add_task(async function test_panel_events() {
  info("Testing panel lifecycle events");

  await BrowserTestUtils.withNewTab("https://example.com", async browser => {
    let button = window.document.getElementById("qrcode-button");
    ok(button, "QR code button should exist");

    // Click button to trigger onViewShowing
    button.click();

    // Wait for panel to show
    await BrowserTestUtils.waitForCondition(() => {
      let view = window.document.getElementById("PanelUI-qrcode");
      return view && view.querySelector(".panel-subview-body");
    }, "Waiting for panel to show");

    let view = window.document.getElementById("PanelUI-qrcode");
    let body = view.querySelector(".panel-subview-body");

    // Verify onViewShowing populated the panel
    ok(body, "Panel body should exist after onViewShowing");
    ok(body.style.minWidth === "332px", "Body should have correct min width");
    ok(body.style.padding === "16px", "Body should have correct padding");

    // Wait for content
    await waitForQRCodeLoad();

    // Close panel (triggers onViewHiding)
    let panel = view.closest("panel");
    panel.hidePopup();

    await BrowserTestUtils.waitForCondition(() => {
      return panel.state === "closed";
    }, "Waiting for panel to close");

    // Verify onViewHiding cleaned up
    view = window.document.getElementById("PanelUI-qrcode");
    ok(!view.firstChild, "Panel should be empty after onViewHiding");
  });
});

/**
 * Test panel state persistence across tabs
 */
add_task(async function test_panel_tab_switching() {
  info("Testing panel with tab switching");

  const URL1 = "https://example.com/page1";
  const URL2 = "https://example.com/page2";

  let tab1 = await BrowserTestUtils.openNewForegroundTab(gBrowser, URL1);

  // Open panel on tab1
  await openQRCodePanel();
  let elements = await waitForQRCodeLoad();
  is(elements.qrcodeUrl?.textContent, URL1, "Should show URL1");

  // Switch to new tab
  let tab2 = await BrowserTestUtils.openNewForegroundTab(gBrowser, URL2);

  // Panel should close when switching tabs
  let view = window.document.getElementById("PanelUI-qrcode");
  let panel = view?.closest("panel");

  if (panel && panel.state === "open") {
    // Panel might still be open, close it
    await closeQRCodePanel();
  }

  // Open panel on tab2
  await openQRCodePanel();
  elements = await waitForQRCodeLoad();
  is(elements.qrcodeUrl?.textContent, URL2, "Should show URL2");

  await closeQRCodePanel();

  // Clean up
  BrowserTestUtils.removeTab(tab1);
  BrowserTestUtils.removeTab(tab2);
});

/**
 * Test panel cleanup on window unload
 */
add_task(async function test_panel_window_unload() {
  info("Testing panel cleanup on window navigation");

  await BrowserTestUtils.withNewTab("https://example.com", async browser => {
    // Open panel
    await openQRCodePanel();
    let elements = await waitForQRCodeLoad();
    is(elements.qrcodeUrl?.textContent, "https://example.com/", "Initial URL should be correct");

    // Get panel reference before navigation
    let view = window.document.getElementById("PanelUI-qrcode");
    let panel = view?.closest("panel");
    ok(panel, "Panel should exist");

    // Close panel before navigation to avoid race conditions
    await closeQRCodePanel();

    // Verify panel is closed
    ok(panel.state === "closed", "Panel should be closed before navigation");
    ok(!view.firstChild, "Panel view should be empty after close");

    // Now navigate to a new page
    BrowserTestUtils.startLoadingURIString(browser, "https://example.org");
    await BrowserTestUtils.browserLoaded(browser, false, "https://example.org");

    // Verify we can open panel on new page
    await openQRCodePanel();

    // Wait for QR code to load with new URL
    elements = await waitForQRCodeLoad();

    // Verify the new URL is shown
    is(
      elements.qrcodeUrl?.textContent,
      "https://example.org/",
      "Should show new URL after navigation"
    );

    // Verify panel elements are correctly populated
    ok(elements.qrcodeImage, "QR code image should exist after navigation");
    ok(elements.copyButton, "Copy button should exist after navigation");
    ok(elements.saveButton, "Save button should exist after navigation");

    // Close panel cleanly
    await closeQRCodePanel();

    // Final verification
    view = window.document.getElementById("PanelUI-qrcode");
    ok(!view.firstChild, "Panel should be empty after final close");
  });
});