/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  CustomizableUI: "resource:///modules/CustomizableUI.sys.mjs",
  QRCodeGenerator: "resource:///modules/QRCodeGenerator.sys.mjs",
});

const WIDGET_ID = "qrcode-button";
const PANEL_ID = "qrcode-panel";

export const QRCodeWidget = {
  _initialized: false,
  _currentBrowser: null,

  init() {
    if (this._initialized) {
      return;
    }

    lazy.CustomizableUI.createWidget({
      id: WIDGET_ID,
      type: "view",
      viewId: PANEL_ID,
      l10nId: "qrcode-button",
      // QR code icon - we'll use a simple icon for now
      onViewShowing: this._onViewShowing.bind(this),
      onViewHiding: this._onViewHiding.bind(this),
    });

    this._initialized = true;
  },

  uninit() {
    if (!this._initialized) {
      return;
    }

    lazy.CustomizableUI.destroyWidget(WIDGET_ID);
    this._initialized = false;
    this._currentBrowser = null;
  },

  _onViewShowing(event) {
    const document = event.target.ownerDocument;
    const panelview = document.getElementById(PANEL_ID);

    if (!panelview) {
      return;
    }

    // Clean up any existing content properly
    this._cleanupPanel(panelview);

    // Create an iframe to load the QR code panel
    const browser = document.createXULElement("browser");
    browser.setAttribute("type", "content");
    browser.setAttribute("disableglobalhistory", "true");
    browser.setAttribute("messagemanagergroup", "qrcode");
    browser.setAttribute("flex", "1");
    browser.style.width = "332px";
    browser.style.height = "400px";

    // Track this browser for cleanup
    this._currentBrowser = browser;

    // Set src last to avoid loading race
    browser.setAttribute("src", "chrome://browser/content/qrcode/qrcode-panel.html");
    panelview.appendChild(browser);
  },

  async _onViewHiding(event) {
    const document = event.target.ownerDocument;
    const panelview = document.getElementById(PANEL_ID);

    if (!panelview) {
      return;
    }

    // Clean up properly
    this._cleanupPanel(panelview);
    this._currentBrowser = null;

    // Terminate the worker to free memory
    await lazy.QRCodeGenerator.cleanup();
  },

  // Helper method for proper cleanup
  _cleanupPanel(panelview) {
    // Clean up browser elements properly
    while (panelview.firstChild) {
      const child = panelview.firstChild;
      if (child.tagName === "browser") {
        // Stop any ongoing loads
        try {
          child.stop();
        } catch (e) {
          // Ignore errors from stopping
        }
      }
      child.remove();
    }
  },
};
