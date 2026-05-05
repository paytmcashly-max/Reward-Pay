import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "reward-wallet-session-token";

export const sessionStorage = {
  getToken: () => SecureStore.getItemAsync(SESSION_KEY),
  setToken: (token: string) => SecureStore.setItemAsync(SESSION_KEY, token),
  clearToken: () => SecureStore.deleteItemAsync(SESSION_KEY),
};
