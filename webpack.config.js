const path = require("path");
const HtmlWebpackPlugin = require('html-webpack-plugin');

/** @type {import('webpack').Configuration} */
module.exports = {
  mode: "development",
  devtool: "source-map",
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
    modules: "./src/modules/",
  },
  output: {
    filename: "[name].bundle.js",
    path: path.resolve(__dirname, "dist"),
    // publicPath: "http://127.0.0.1:9000"
  },
  devServer: {
    webSocketServer: false,
    client: false,
    static: {
      directory: path.join(__dirname, "public"),
    },
    compress: true,
    // port: 443,
    // host: '0.0.0.0',
    allowedHosts: ["all"],
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
    new HtmlWebpackPlugin({
      path: "index.html",
      template: "public/index.html",
      minify: false,
      chunks: ["bootstrapper"],
    }),
  ],
};
