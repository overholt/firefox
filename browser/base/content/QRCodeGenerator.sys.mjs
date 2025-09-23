/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// QR Code library will be loaded dynamically

export class QRCodeGenerator {
  static async generateQRCodeWithLogo(text, options = {}) {
    const {
      size = 256,
      logoSize = size * 0.2,
    } = options;

    // Create canvas for QR code
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = size;
    canvas.height = size;

    try {
      console.log("Starting QR code generation for text:", text);

      // Load QR code library and generate actual QR code
      await this.loadQRCodeLibrary();

      // Create a temporary element for QR code generation
      const tempContainer = document.createElement('div');
      tempContainer.style.position = 'absolute';
      tempContainer.style.left = '-9999px';
      tempContainer.style.top = '-9999px';
      document.body.appendChild(tempContainer);

      try {
        // Generate QR code using the library
        console.log("Generating QR code with library");
        const qr = new window.QRCode(tempContainer, {
          text: text,
          width: size,
          height: size,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: window.QRCode.CorrectLevel.M
        });

        // Wait a moment for the QR code to be generated
        await new Promise(resolve => setTimeout(resolve, 100));

        // Find the generated canvas
        const qrCanvas = tempContainer.querySelector('canvas');
        if (qrCanvas) {
          console.log("QR canvas found, copying to main canvas");
          ctx.drawImage(qrCanvas, 0, 0);
        } else {
          console.log("No QR canvas found, falling back to simple pattern");
          this.drawSimpleQRPattern(ctx, size, text);
        }
      } finally {
        // Clean up temporary container
        document.body.removeChild(tempContainer);
      }

      // Load and draw Firefox logo in the center
      try {
        const logo = await this.loadFirefoxLogo();
        const logoX = (size - logoSize) / 2;
        const logoY = (size - logoSize) / 2;

        // Create a white background circle for the logo
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, logoSize / 2 + 5, 0, 2 * Math.PI);
        ctx.fill();

        // Draw the Firefox logo
        ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
      } catch (error) {
        console.warn("Could not load Firefox logo:", error);
      }

    } catch (error) {
      console.error("Error generating QR code:", error);

      // Fallback: draw a simple placeholder
      ctx.fillStyle = "#f0f0f0";
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = "#666";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("QR Code Error", size / 2, size / 2);
    }

    return canvas;
  }

  static drawSimpleQRPattern(ctx, size, text) {
    console.log("Drawing simple QR pattern for text:", text);

    // Create a simple QR-like pattern for now
    const blockSize = size / 21; // Standard QR code has 21x21 modules for version 1

    // Clear canvas with white background
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, size, size);

    // Draw a pattern based on the text hash
    ctx.fillStyle = "#000000";
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) & 0xffffffff;
    }

    // Draw finder patterns (corners)
    this.drawFinderPattern(ctx, 0, 0, blockSize);
    this.drawFinderPattern(ctx, size - 7 * blockSize, 0, blockSize);
    this.drawFinderPattern(ctx, 0, size - 7 * blockSize, blockSize);

    // Draw some random-looking but deterministic pattern based on text
    for (let row = 0; row < 21; row++) {
      for (let col = 0; col < 21; col++) {
        // Skip finder pattern areas
        if ((row < 9 && col < 9) ||
            (row < 9 && col > 12) ||
            (row > 12 && col < 9)) continue;

        const x = col * blockSize;
        const y = row * blockSize;

        // Use hash to determine if block should be filled
        const blockHash = (hash + row * 21 + col) % 100;
        if (blockHash > 50) {
          ctx.fillRect(x, y, blockSize, blockSize);
        }
      }
    }
  }

  static drawFinderPattern(ctx, x, y, blockSize) {
    // Draw 7x7 finder pattern
    ctx.fillRect(x, y, 7 * blockSize, 7 * blockSize); // Outer black square
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(x + blockSize, y + blockSize, 5 * blockSize, 5 * blockSize); // Inner white square
    ctx.fillStyle = "#000000";
    ctx.fillRect(x + 2 * blockSize, y + 2 * blockSize, 3 * blockSize, 3 * blockSize); // Center black square
  }

  static async loadQRCodeLibrary() {
    // Check if QRCode is already loaded
    if (window.QRCode) {
      console.log("QR code library already loaded");
      return;
    }

    console.log("Loading QR code library...");
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'chrome://browser/content/qrcode.js';
      script.onload = () => {
        console.log("QR code library loaded successfully");
        console.log("Available objects:", {
          QRCode: !!window.QRCode,
          CorrectLevel: !!window.QRCode?.CorrectLevel
        });

        // Give it a moment to initialize
        setTimeout(() => resolve(), 50);
      };
      script.onerror = (error) => {
        console.error("Failed to load QR code library:", error);
        reject(new Error('Failed to load QR code library'));
      };
      document.head.appendChild(script);
    });
  }

  static async loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  static async loadFirefoxLogo() {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = "chrome://branding/content/about-logo.svg";
    });
  }

  static showQRCodeDialog(canvas, url) {
    const dialog = document.createElement("dialog");
    dialog.style.cssText = `
      padding: 20px;
      border: none;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      background: white;
      max-width: 400px;
    `;

    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    `;

    const title = document.createElement("h3");
    title.textContent = "QR Code for Current Page";
    title.style.cssText = `
      margin: 0;
      color: #333;
      font-family: system-ui, -apple-system, sans-serif;
    `;

    const urlDisplay = document.createElement("div");
    urlDisplay.textContent = url;
    urlDisplay.style.cssText = `
      font-size: 12px;
      color: #666;
      word-break: break-all;
      text-align: center;
      max-width: 300px;
    `;

    canvas.style.cssText = `
      border: 1px solid #ddd;
      border-radius: 4px;
    `;

    const buttonContainer = document.createElement("div");
    buttonContainer.style.cssText = `
      display: flex;
      gap: 8px;
    `;

    const saveButton = document.createElement("button");
    saveButton.textContent = "Save Image";
    saveButton.style.cssText = `
      padding: 8px 16px;
      border: 1px solid #ccc;
      border-radius: 4px;
      background: #f5f5f5;
      cursor: pointer;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      color: #333;
    `;
    saveButton.onclick = () => this.saveQRCode(canvas, "qr-code-firefox.png");

    const closeButton = document.createElement("button");
    closeButton.textContent = "Close";
    closeButton.style.cssText = `
      padding: 8px 16px;
      border: 1px solid #ccc;
      border-radius: 4px;
      background: #f5f5f5;
      cursor: pointer;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      color: #333;
    `;
    closeButton.onclick = () => {
      dialog.close();
      dialog.remove();
    };

    buttonContainer.appendChild(saveButton);
    buttonContainer.appendChild(closeButton);

    container.appendChild(title);
    container.appendChild(urlDisplay);
    container.appendChild(canvas);
    container.appendChild(buttonContainer);

    dialog.appendChild(container);
    document.body.appendChild(dialog);

    dialog.showModal();

    // Close on backdrop click
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) {
        dialog.close();
        dialog.remove();
      }
    });
  }

  static saveQRCode(canvas, filename) {
    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  static async generateAndShowQRCode() {
    try {
      const currentURL = gBrowser.currentURI.spec;
      const canvas = await this.generateQRCodeWithLogo(currentURL);
      this.showQRCodeDialog(canvas, currentURL);
    } catch (error) {
      console.error("Error generating QR code:", error);

      // Show error dialog
      const dialog = document.createElement("dialog");
      dialog.style.cssText = `
        padding: 20px;
        border: none;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
        background: white;
        text-align: center;
      `;

      dialog.innerHTML = `
        <h3>Error</h3>
        <p>Could not generate QR code: ${error.message}</p>
        <button onclick="this.parentElement.close(); this.parentElement.remove();" style="padding: 8px 16px; border: 1px solid #ccc; border-radius: 4px; background: #f5f5f5; cursor: pointer;">Close</button>
      `;

      document.body.appendChild(dialog);
      dialog.showModal();
    }
  }
}