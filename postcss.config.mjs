/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    // Tailwind CSS v4 ships its own PostCSS plugin and handles vendor
    // prefixing + imports internally (no separate autoprefixer needed).
    "@tailwindcss/postcss": {},
  },
};

export default config;
