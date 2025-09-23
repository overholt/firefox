/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  CustomizableUI: "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs",
});

export const QRCodeCustomizableWidget = {
  init() {
    const widgetId = "qr-code-button";
    lazy.CustomizableUI.createWidget({
      id: widgetId,
      l10nId: "navbar-qrcode",
      onCommand(aEvent) {
        // Import and call the QR code generation function
        const win = aEvent.currentTarget.ownerGlobal;
        if (win && win.QRCodeUtils) {
          win.QRCodeUtils.generateAndShowQRCode();
        }
      },
    });
  },

  uninit() {
    lazy.CustomizableUI.destroyWidget("qr-code-button");
  },
};