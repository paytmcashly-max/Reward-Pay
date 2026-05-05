#!/usr/bin/env node

const path = require("path");

process.env.EXPO_ROUTER_APP_ROOT =
  process.env.EXPO_ROUTER_APP_ROOT || "./app";

const expoPackage = require.resolve("expo/package.json", {
  paths: [path.resolve(__dirname, "..")],
});
const expoCliBin = path.resolve(
  path.dirname(expoPackage),
  "node_modules/@expo/cli/build/bin/cli"
);

require(expoCliBin);
