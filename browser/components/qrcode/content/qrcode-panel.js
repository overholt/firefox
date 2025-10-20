/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { QRCodeGenerator } = ChromeUtils.importESModule(
  "resource:///modules/QRCodeGenerator.sys.mjs"
);

const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "logConsole", function () {
  return console.createInstance({
    prefix: "QRCodePanel",
    maxLogLevel: Services.prefs.getBoolPref("browser.qrcode.log", false)
      ? "Debug"
      : "Warn",
  });
});

// Timeout tracking for button feedback
let copyButtonTimeout = null;
let saveButtonTimeout = null;

document.addEventListener("DOMContentLoaded", async () => {
  const loadingMessage = document.getElementById("loading-message");
  const errorMessage = document.getElementById("error-message");
  const qrcodeImage = document.getElementById("qrcode-image");
  const qrcodeUrl = document.getElementById("qrcode-url");
  const qrcodeActions = document.getElementById("qrcode-actions");
  const copyButton = document.getElementById("copy-button");
  const saveButton = document.getElementById("save-button");

  try {
    // Get the URL from the parent window
    const browser = window.browsingContext.topChromeWindow.gBrowser.selectedBrowser;
    const url = browser.currentURI.spec;

    // Display the URL
    qrcodeUrl.textContent = url;

    // Generate the QR code
    const qrCodeDataUri = await QRCodeGenerator.generateQRCode(url, document);

    // Wait for image to load before displaying
    await new Promise((resolve, reject) => {
      qrcodeImage.onload = resolve;
      qrcodeImage.onerror = reject;
      qrcodeImage.src = qrCodeDataUri;
    });

    // Only show after successful load
    qrcodeImage.classList.remove("hidden");
    qrcodeUrl.classList.remove("hidden");
    qrcodeActions.classList.remove("hidden");
    loadingMessage.classList.add("hidden");

    // Store the data URI for copying/saving
    window.qrCodeDataUri = qrCodeDataUri;

    // Set up button handlers
    copyButton.addEventListener("click", async () => {
      // Prevent multiple simultaneous operations
      if (copyButton.disabled) {
        return;
      }

      // Clear any existing timeout
      if (copyButtonTimeout) {
        clearTimeout(copyButtonTimeout);
        copyButtonTimeout = null;
      }

      // Disable both buttons during operation
      copyButton.disabled = true;
      saveButton.disabled = true;

      try {
        // Convert data URI to blob
        const response = await fetch(qrCodeDataUri);
        const blob = await response.blob();

        // Copy to clipboard
        const item = new ClipboardItem({ "image/png": blob });
        await navigator.clipboard.write([item]);

        // Show feedback
        const successText = await document.l10n.formatValue("qrcode-copy-success");
        copyButton.textContent = successText;

        // Track timeout for cleanup
        copyButtonTimeout = setTimeout(async () => {
          document.l10n.setAttributes(copyButton, "qrcode-copy-button");
          copyButton.disabled = false;
          saveButton.disabled = false;
          copyButtonTimeout = null;
        }, 2000);
      } catch (e) {
        lazy.logConsole.error("Failed to copy QR code:", e);
        const errorText = await document.l10n.formatValue("qrcode-copy-error");
        alert(errorText);
        copyButton.disabled = false;
        saveButton.disabled = false;
      }
    });

    saveButton.addEventListener("click", async () => {
      // Prevent multiple simultaneous operations
      if (saveButton.disabled) {
        return;
      }

      // Clear any existing timeout
      if (saveButtonTimeout) {
        clearTimeout(saveButtonTimeout);
        saveButtonTimeout = null;
      }

      // Disable both buttons during operation
      saveButton.disabled = true;
      copyButton.disabled = true;

      try {
        const { Downloads } = ChromeUtils.importESModule(
          "resource://gre/modules/Downloads.sys.mjs"
        );
        const { FileUtils } = ChromeUtils.importESModule(
          "resource://gre/modules/FileUtils.sys.mjs"
        );

        // Get the page title for the filename
        const title = browser.contentTitle || "qrcode";
        const sanitizedTitle = title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
        const filename = `qrcode_${sanitizedTitle}.png`;

        // Show file picker
        const { nsIFilePicker } = Ci;
        const fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
        const saveTitle = await document.l10n.formatValue("qrcode-save-title");
        const filterLabel = await document.l10n.formatValue("qrcode-save-filter");
        fp.init(window, saveTitle, nsIFilePicker.modeSave);
        fp.appendFilter(filterLabel, "*.png");
        fp.defaultString = filename;
        fp.defaultExtension = "png";

        const result = await new Promise(resolve => fp.open(resolve));
        if (result !== nsIFilePicker.returnOK && result !== nsIFilePicker.returnReplace) {
          // User cancelled - re-enable buttons
          saveButton.disabled = false;
          copyButton.disabled = false;
          return;
        }

        // Save the file
        const download = await Downloads.createDownload({
          source: qrCodeDataUri,
          target: fp.file.path,
        });

        await download.start();

        // Show feedback
        const successText = await document.l10n.formatValue("qrcode-save-success");
        saveButton.textContent = successText;

        // Track timeout for cleanup
        saveButtonTimeout = setTimeout(async () => {
          document.l10n.setAttributes(saveButton, "qrcode-save-button");
          saveButton.disabled = false;
          copyButton.disabled = false;
          saveButtonTimeout = null;
        }, 2000);
      } catch (e) {
        lazy.logConsole.error("Failed to save QR code:", e);
        const errorText = await document.l10n.formatValue("qrcode-save-error");
        alert(errorText);
        saveButton.disabled = false;
        copyButton.disabled = false;
      }
    });
  } catch (e) {
    lazy.logConsole.error("Failed to generate QR code:", e);
    loadingMessage.classList.add("hidden");
    errorMessage.classList.remove("hidden");
  }
});

// Add cleanup on unload
window.addEventListener("unload", () => {
  if (copyButtonTimeout) {
    clearTimeout(copyButtonTimeout);
    copyButtonTimeout = null;
  }
  if (saveButtonTimeout) {
    clearTimeout(saveButtonTimeout);
    saveButtonTimeout = null;
  }
});
