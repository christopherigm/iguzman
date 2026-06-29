# Cinelog Tv (Samsung Smart TV)

Tizen web app scaffolded by cli/new-smarttv-app. Built with Vite + React and the
@repo/ui-tv component package (Norigin spatial navigation for D-pad focus). This
app is packaged with Samsung tooling, not Docker/Helm.

## Develop in a browser

    pnpm dev --filter=cinelog-tv

Open the printed localhost URL. App-launch calls fall back to opening a new tab
when not running on a real TV.

## Build the web bundle

    pnpm build --filter=cinelog-tv

Output goes to apps/cinelog-tv/dist.

## Package + run on a Samsung TV (Tizen Studio / tizen CLI)

Install Tizen Studio and create a TV certificate profile first. Then:

    # from apps/cinelog-tv
    cp config.xml icon.png dist/
    tizen package -t wgt -s <your-cert-profile> -- dist
    tizen install -n dist/CinelogTv.wgt -t <tv-device>
    tizen run -p CinelogTv0 -t <tv-device>

Connect a physical TV in Developer Mode with: sdb connect <tv-ip>

## Notes

- config.xml is the Tizen manifest. The package id is a placeholder; Tizen Studio
  rewrites it to match your certificate author when you sign.
- Add an icon.png (512x512) at the app root before packaging.
- Deep-linking into a specific video is not a supported Tizen contract; launching
  the target app (YouTube, Prime, etc.) is best-effort. See src/lib/launch-app.ts.
