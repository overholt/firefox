/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var QRCodeDialog = {
  _url: null,
  _title: null,
  _qrCodeDataURI: null,
  _copyTimeoutId: null,
  _saveTimeoutId: null,

  init() {
    // Get parameters passed to the dialog
    if (window.arguments && window.arguments[0]) {
      const params = window.arguments[0];
      this._url = params.url;
      this._title = params.title;
      this._qrCodeDataURI = params.qrCodeDataURI;
    }

    // Set up the dialog
    this.setupDialog();

    // Add event listeners for buttons
    document.getElementById("copy-button").addEventListener("click", () => this.copyImage());
    document.getElementById("save-button").addEventListener("click", () => this.saveImage());
    document.getElementById("close-button").addEventListener("click", () => window.close());
  },

  setupDialog() {
    if (!this._qrCodeDataURI) {
      this.showError();
      return;
    }

    // Make sure DOM elements exist before accessing them
    const loadingContainer = document.getElementById("loading-container");
    const errorContainer = document.getElementById("error-container");
    const successContainer = document.getElementById("success-container");

    if (!loadingContainer || !successContainer || !errorContainer) {
      console.error("QR Code Dialog: Required DOM elements not found");
      return;
    }

    // Hide loading and error, show success
    loadingContainer.hidden = true;
    errorContainer.hidden = true;
    successContainer.hidden = false;

    // Set the QR code image
    const imageElement = document.getElementById("qrcode-image");
    imageElement.src = this._qrCodeDataURI;

    // Set the URL text
    const urlElement = document.getElementById("qrcode-url");
    urlElement.value = this._url;
    urlElement.tooltipText = this._url;

    // Set dialog title
    if (this._title && this._title !== this._url) {
      document.title = `QR Code - ${this._title}`;
    }
  },

  showError() {
    const loadingContainer = document.getElementById("loading-container");
    const errorContainer = document.getElementById("error-container");

    if (!loadingContainer || !errorContainer) {
      console.error("QR Code Dialog: Error containers not found");
      return;
    }

    loadingContainer.hidden = true;
    errorContainer.hidden = false;
  },

  async copyImage() {
    try {
      // Convert data URI to blob
      const response = await fetch(this._qrCodeDataURI);
      const blob = await response.blob();

      // Create clipboard item
      const item = new ClipboardItem({ "image/png": blob });
      await navigator.clipboard.write([item]);

      this.showButtonFeedback("copy-button", "success", "qrcode-copy-success");
    } catch (error) {
      console.error("Failed to copy QR code:", error);
      this.showButtonFeedback("copy-button", "error", "qrcode-copy-error");
    }
  },

  async saveImage() {
    const nsIFilePicker = Ci.nsIFilePicker;
    const fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);

    // Set up file picker - use window.browsingContext for HTML dialogs
    fp.init(window.browsingContext, "Save QR Code", nsIFilePicker.modeSave);
    fp.appendFilter("PNG Image", "*.png");
    fp.defaultString = "qrcode.png";
    fp.defaultExtension = "png";

    const result = await new Promise(resolve => fp.open(resolve));

    if (result === nsIFilePicker.returnOK || result === nsIFilePicker.returnReplace) {
      try {
        // Convert data URI to array buffer
        const response = await fetch(this._qrCodeDataURI);
        const arrayBuffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // Write to file
        await IOUtils.write(fp.file.path, uint8Array);

        this.showButtonFeedback("save-button", "success", "qrcode-save-success");
      } catch (error) {
        console.error("Failed to save QR code:", error);
        this.showButtonFeedback("save-button", "error", "qrcode-save-error");
      }
    }
  },

  showButtonFeedback(buttonId, type, l10nId) {
    const button = document.getElementById(buttonId);
    const originalLabel = button.label;

    // Clear any existing timeout for this button
    const timeoutProp = `_${buttonId.replace("-button", "")}TimeoutId`;
    if (this[timeoutProp]) {
      clearTimeout(this[timeoutProp]);
    }

    // Apply feedback class and change label
    button.classList.remove("success", "error");
    button.classList.add(type);
    document.l10n.setAttributes(button, l10nId);

    // Reset after 2 seconds
    this[timeoutProp] = setTimeout(() => {
      button.classList.remove("success", "error");
      button.label = originalLabel;
      // Reset the l10n attribute to original
      document.l10n.setAttributes(button,
        buttonId === "copy-button" ? "qrcode-copy-button" : "qrcode-save-button");
    }, 2000);
  },

  cleanup() {
    // Clear any pending timeouts
    if (this._copyTimeoutId) {
      clearTimeout(this._copyTimeoutId);
    }
    if (this._saveTimeoutId) {
      clearTimeout(this._saveTimeoutId);
    }
  }
};

// Initialize when dialog loads
window.addEventListener("DOMContentLoaded", () => {
  QRCodeDialog.init();
});

window.addEventListener("unload", () => {
  QRCodeDialog.cleanup();
});