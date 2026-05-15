# Pixel Compare Pages

A tiny Chrome extension for visually comparing the current page against another page by overlaying the other page in a draggable, semi-transparent iframe.

It is meant for design implementation checks: open the page you are building, overlay the mockup page, adjust opacity, and nudge either the mockup iframe or the control panel independently.

<img width="815" height="650" alt="Screenshot 2026-05-15 at 14 26 26" src="https://github.com/user-attachments/assets/f5595702-25df-4f6a-8d2d-5cb47871734c" />



## Features

- Overlay any embeddable page in a full-window iframe.
- Automatically match long page height and keep the comparison iframe vertically synced while you scroll.
- Adjust overlay opacity.
- Hide/show the comparison iframe without removing controls.
- Drag the comparison iframe independently from the controls.
- Drag the controls independently from the iframe.
- Restore tab state after refresh.
- No external service, tracking, or analytics.

## Install locally

1. Open Chrome and go to `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the cloned `pixel-compare-pages` folder.

## Use

1. Open the page you are building.
2. Click the `Pixel Compare Pages` extension button.
3. Enter the mockup URL, for example `http://localhost:3000/mockup`.
4. Choose opacity and click `Show overlay`.
5. Use the popup for URL, reset, and remove actions.
6. Use the bottom on-page control panel to hide/show the iframe and open opacity controls.
7. Drag the `Move iframe` handle to move the iframe separately from the page controls.
8. Drag the bottom control panel header to move the controls.

The overlay iframe is click-through, except for the on-page control panel and the `Move iframe` handle.

Overlay state is saved per tab. If you refresh the compared page, the extension restores the overlay URL, opacity, iframe position, control panel position, iframe visibility, and expanded controls automatically.

## Limitations

Some pages cannot be embedded in an iframe. Chrome will block the overlay page if it sends restrictive `X-Frame-Options` or `Content-Security-Policy: frame-ancestors` headers.

Chrome also blocks extension injection on internal pages such as `chrome://extensions` and the Chrome Web Store.

For `file://` pages, Chrome requires enabling `Allow access to file URLs` for the extension on `chrome://extensions`.

## Privacy

The extension stores overlay settings locally in Chrome extension storage. It does not send page URLs, mockup URLs, or browsing data to any external service.

## Development

This extension is plain Manifest V3 HTML/CSS/JavaScript. There is no build step.

After changing files, reload the unpacked extension on `chrome://extensions`, then refresh the page you are testing.

## License

MIT
