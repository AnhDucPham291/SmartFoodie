# SmartFoodie

A responsive, browser-based food discovery and ordering prototype.

## Preview on this computer or phone

Run from this folder:

```bash
python3 serve.py
```

Open the `localhost` address printed in the terminal on this computer. The server also prints a Wi-Fi address for phones and other devices on the same local network. Open that Wi-Fi address on this computer, select **Share**, then scan its QR code with your phone. Keep the server running, and make sure both devices are on the same Wi-Fi. If port 8000 is busy, the server automatically tries the next 19 ports. You can also choose a starting port with `python3 serve.py --port 8100`.

## Publish a public link with GitHub Pages

The included `.github/workflows/deploy.yml` publishes the website when files are pushed to the `main` or `master` branch.

1. Create a GitHub repository for SmartFoodie and add these project files.
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push the files to `main` or `master`, then wait for the **Deploy SmartFoodie to GitHub Pages** workflow to finish.
4. GitHub will show the public URL in **Settings → Pages** and in the workflow deployment summary.

The website does not require an image API key. The healthy meal section includes only dishes with food photographs. Restaurant listings and feedback are sample data displayed locally in the website.

## Share with a QR code

Select **Share** in the header to create a QR code from the URL currently open, copy the link, or download a PNG QR code. For local phone access, first open the Wi-Fi URL printed by `serve.py` on the computer, then display its QR code for the phone to scan. A `localhost` QR works only on that computer. A LAN QR works on the same Wi-Fi while `serve.py` is running; use the GitHub Pages URL for a QR that works over the internet.

## Install on a phone

On supported browsers, use the browser menu's **Add to Home Screen** or **Install app** action. The site shell is cached for repeat visits; restaurant and food-photo searches still require an internet connection.
