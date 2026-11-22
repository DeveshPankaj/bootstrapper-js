const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { ModuleFederationPlugin } = require('webpack').container;
const { execFileSync } = require("child_process");

// Keeps the hashes in docs/public/mount/meta.json (boot-time vfs sync) and
// docs/registry.json (App Manager install integrity) in step with the files they
// describe, so a build can never ship stale ones. Runs before a build and before the
// dev server's first compile.
class ManifestHashesPlugin {
  apply(compiler) {
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      for (const script of ["scripts/gen-meta-manifest.mjs", "scripts/gen-registry-integrity.mjs"]) {
        execFileSync(process.execPath, [path.join(__dirname, script)], { stdio: "inherit" });
      }
    };
    compiler.hooks.beforeRun.tap("ManifestHashesPlugin", run);
    compiler.hooks.watchRun.tap("ManifestHashesPlugin", run);
  }
}

// const CopyWebpackPlugin = require("copy-webpack-plugin");

// `npx webpack` builds what GitHub Pages serves from docs/: production mode
// (minified, production React). `pnpm start` (webpack serve) stays in
// development mode. `--mode` on the command line still overrides both.
/** @returns {import('webpack').Configuration} */
module.exports = (env = {}, argv = {}) => ({
  mode: argv.mode || (env.WEBPACK_SERVE ? "development" : "production"),
  devtool: "source-map",
  // remote.bundle.js carries the one copy of Babel standalone (needed to run vfs
  // scripts at boot), ~2.9 MiB minified; warn only if a bundle grows beyond that.
  performance: { maxAssetSize: 3.5 * 1024 * 1024, maxEntrypointSize: 3.5 * 1024 * 1024 },
  // Minify JS only. index.html stays as written: it is tiny, and its CSP <meta> is
  // reviewed by eye and checked by testing/scripts/security (KRN-11).
  optimization: { minimize: { html: false } },
  entry: {
    bootstrapper: "./src/index.ts",
    remote: "./src/remote.ts",
    layout: "./src/core/layout/",
    sw: "./src/sw.ts",
    iframe: "./src/core/iframe/",
    vscode: "./src/apps/vs-code/",
    notepad: "./src/apps/notepad/",
    "game-of-life": "./src/apps/game-of-life/",
    "file-explorer": "./src/apps/file-explorer/",
    "xml-parser": "./src/apps/xml-parser/",
    markdown: "./src/apps/markdown/",
    modules: "./src/modules/",
  },
  output: {
    filename: "[name].bundle.js",
    path: path.resolve(__dirname, "docs"),
    // publicPath: "docs/", // Adjust the public path to match the final location of the assets
  },
  devServer: {
    webSocketServer: false,
    client: false,
    static: {
      directory: path.join(__dirname, 'docs'),
    },
    compress: true,
    allowedHosts: ["all"],
    https: false,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers":
        "X-Requested-With, content-type, Authorization",
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js", ".json"],
    alias: {
      "@shared": path.resolve(__dirname, "src/shared/"),
      "@layout": path.resolve(__dirname, "src/layout/"),
      "@game-of-life": path.resolve(__dirname, "src/projects/game-of-life/"),
      "@xml-parser": path.resolve(__dirname, "src/projects/xml-parser/"),
      "@modules": path.resolve(__dirname, "src/modules"),
    },
    
  },
  plugins: [
    new ManifestHashesPlugin(),
    // new ModuleFederationPlugin({
    //   // adds date-fns as shared module
    //   shared: ['@shared', 'react'],
    // }),
    new HtmlWebpackPlugin({
      filename: "index.html", // Generates index.html inside the docs folder
      template: "/docs/public/index.html",
      minify: false,
      chunks: ["bootstrapper"],
      // publicPath: "./docs", // This ensures the JS paths are relative to the current directory
    }),
    // new CopyWebpackPlugin({
    //   patterns: [
    //     {
    //       from: path.resolve(__dirname, "docs/index.html"),
    //       to: path.resolve(__dirname, "index.html"),
    //       transform(content) {
    //         // Adjust paths in the copied index.html file
    //         return content.toString().replace(/src="\//g, 'src="docs/');
    //       },
    //       noErrorOnMissing: true,
    //     },
    //   ],
    // }),
  ],
});
