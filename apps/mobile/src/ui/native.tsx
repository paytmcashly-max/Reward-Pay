import type React from "react";
import {
  Alert,
  Linking,
  Pressable as NativePressable,
  ScrollView as NativeScrollView,
  Text as NativeText,
  View as NativeView,
  useWindowDimensions,
} from "react-native";

type AnyComponent = React.ComponentType<any>;

export const View = NativeView as unknown as AnyComponent;
export const Text = NativeText as unknown as AnyComponent;
export const ScrollView = NativeScrollView as unknown as AnyComponent;
export const Pressable = NativePressable as unknown as AnyComponent;

export { Alert, Linking, useWindowDimensions };
