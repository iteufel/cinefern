# Cinefern website

The GitHub Pages landing page lives in `website/`. It is a static site with
plain HTML, CSS, and JavaScript. It uses the current Cinefern branding and
locally bundled Blender film artwork. The application and its Expo web
renderer remain separate.

The website pairs a light pearl background, system typography, and green
accents with dark product previews. The application uses the same rounded
controls and typography on charcoal surfaces, with translucent navigation
on phones. Shared application colors, radii, and materials live in
`src/ui/theme.ts`; website equivalents live in `website/styles.css`.

## Preview and build

Node.js 22.13 or newer is sufficient; no dependency installation is needed.

```sh
npm run site:dev
# http://127.0.0.1:4173/cinefern/
```

The preview server builds the website when it starts. After editing files,
run `npm run site:build` and refresh the page. Set `PORT` to use another port.
The server supports both `/` and `/cinefern/` so relative asset URLs can be
checked against the GitHub Pages project path.

```sh
npm run site:build
# Output: dist-site/
```

`dist-site/` is ignored by Git. The build copies `website/`, the project
license, and a `.nojekyll` marker. No application bundles, credentials, or
repository metadata are included. `SITE_URL` can override the deployed base
URL used for the social preview image; the workflow passes the Pages URL.

## GitHub Pages deployment

1. In the repository, open **Settings → Pages** and choose **GitHub Actions**
   as the build and deployment source.
2. Merge the website changes into `main`.
3. The **GitHub Pages** workflow builds and deploys `dist-site/`. Its deployment
   environment links to the published website. You can also run the workflow
   manually on `main`.

The expected default URL is `https://iteufel.github.io/cinefern/`. All asset
and internal page links are relative, so custom domains and other repository
paths work too. For a fork, update the project links in the HTML and JavaScript.

Pull requests run syntax checks and build the website, without deployment
permissions. Only `main` can deploy. The workflow follows GitHub's
[custom Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
Private repositories need a GitHub plan that supports Pages; repository,
documentation, and Actions artifact links still require repository access.
The workflow does not change repository visibility.

## Content and interaction

- `index.html`: landing page, platform guides, FAQs, and accessible film dialog.
- `styles.css`: responsive layout, device illustrations, and reduced-motion support.
- `main.js`: film selection, opt-in trailer/open-film playback, keyboard-accessible
  platform tabs, mobile navigation, and command copying.
- `credits.html`: public artwork attribution and Creative Commons license links.
- `assets/films/`: resized/compressed copies of existing project artwork, with
  CSS cropping for presentation; originals remain in the root `assets/films/`.
- `assets/social-card.png`: social preview using the Cinefern wordmark and colors.

The film preview is an illustrative presentation, not an embedded application.
Videos are requested from W3C's public media server only after clicking play;
closing the dialog stops playback and releases the stream. All fonts, icons,
styles, scripts, and artwork are local. Essential content and navigation work
without JavaScript; all platform instructions remain visible in that case.

There are no signed public releases at the time of writing. The page links to
the real build workflow and source instructions rather than inventing download
URLs or app store listings. Update these links and the availability copy when
public releases become available.
