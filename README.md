<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/fe52747e-2743-455f-b8f9-aab6fe3c7c23

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Plivo Web Softphone

The in-app web softphone uses `plivo-browser-sdk`. That package lists `@types/audioworklet` and `@types/emscripten` as runtime dependencies, and their global type declarations conflict with the project's Web Crypto usage (producing `BufferSource` errors during `next build`). `tsconfig.json` therefore restricts `types` to `["node", "react", "react-dom", "papaparse"]`. Do not remove that restriction.
