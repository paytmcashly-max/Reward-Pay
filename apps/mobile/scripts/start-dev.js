#!/usr/bin/env node

process.env.EXPO_NO_DEPENDENCY_VALIDATION =
  process.env.EXPO_NO_DEPENDENCY_VALIDATION || "1";

process.env.EXPO_ROUTER_APP_ROOT =
  process.env.EXPO_ROUTER_APP_ROOT || "./app";

require("./expo-cli.js");
