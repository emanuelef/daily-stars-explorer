import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
// Vite 8's esbuild pre-bundler wraps CJS modules in __commonJSMin which does NOT
// handle __esModule:true interop. Two workarounds used:
//   1. react-fusioncharts: dev-only alias to UMD dist (sets module.exports=ReactFC directly)
//   2. react-plotly.js: import-side unwrap (_Plot.default || _Plot) in HourlyStarsChart.jsx
export default defineConfig(({ command }) => ({
  base: '/daily-stars-explorer/',
  plugins: [react()],
  assetsInclude: ["**/*.md"],
  resolve: {
    alias: command === 'serve' ? {
      "react-fusioncharts": "react-fusioncharts/dist/react-fusioncharts.js",
    } : {},
  },
  optimizeDeps: {
    include: ["fusioncharts", "react-fusioncharts"],
  },
}))
