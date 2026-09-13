import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        passes: 3,
        drop_console: true,
        drop_debugger: true,
      },
      mangle: true,
      format: {
        comments: false,
      },
    },
    reportCompressedSize: true,
  },
})
