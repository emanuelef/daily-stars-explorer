import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
// Vite 8 (esbuild pre-bundler) and Rollup both fail to correctly unwrap __esModule:true
// interop for react-fusioncharts/lib/ReactFC.js, causing fcRoot to be unreachable.
// Aliasing to the UMD dist (which sets module.exports=ReactFC directly) fixes both.
// react-plotly.js is handled at the import level (_Plot.default||_Plot) in HourlyStarsChart.
export default defineConfig({
  base: '/daily-stars-explorer/',
  plugins: [react()],
  assetsInclude: ["**/*.md"],
  resolve: {
    alias: {
      "react-fusioncharts": "react-fusioncharts/dist/react-fusioncharts.js",
    },
  },
  optimizeDeps: {
    include: ["fusioncharts", "react-fusioncharts"],
  },
})
