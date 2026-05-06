export const runtimeConfig = {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "",
};

export const isDemoMode = !runtimeConfig.apiBaseUrl;
export const allowTestPayments = __DEV__ || process.env.EXPO_PUBLIC_ALLOW_TEST_PAYMENTS === "true";
