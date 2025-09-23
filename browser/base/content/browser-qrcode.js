/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// QR Code utilities for Firefox toolbar

// Initialize the QR Code widget when the browser loads
ChromeUtils.defineESModuleGetters(this, {
  QRCodeCustomizableWidget: "chrome://browser/content/QRCodeWidget.sys.mjs",
});

// Initialize the widget on browser startup
document.addEventListener("DOMContentLoaded", () => {
  QRCodeCustomizableWidget.init();
});

var QRCodeUtils = {
  async generateAndShowQRCode() {
    try {
      const { QRCodeGenerator } = await import("chrome://browser/content/QRCodeGenerator.sys.mjs");
      await QRCodeGenerator.generateAndShowQRCode();
    } catch (error) {
      console.error("Error loading QR code module:", error);
      this.showErrorDialog("Failed to load QR code generator");
    }
  },

  showErrorDialog(message) {
    const dialog = document.createElement("dialog");
    dialog.style.cssText = `
      padding: 20px;
      border: none;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      background: white;
      text-align: center;
      font-family: system-ui, -apple-system, sans-serif;
    `;

    dialog.innerHTML = `
      <h3 style="margin: 0 0 16px 0; color: #333;">Error</h3>
      <p style="margin: 0 0 16px 0; color: #666;">${message}</p>
      <button onclick="this.parentElement.close(); this.parentElement.remove();"
              style="padding: 8px 16px; border: 1px solid #ccc; border-radius: 4px; background: #f5f5f5; cursor: pointer;">
        Close
      </button>
    `;

    document.body.appendChild(dialog);
    dialog.showModal();
  }
};

// Make sure QRCodeUtils is available globally
window.QRCodeUtils = QRCodeUtils;