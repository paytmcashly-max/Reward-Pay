import type React from "react";
import {
  ActivityIndicator as NativeActivityIndicator,
  Banner as NativeBanner,
  Button as NativeButton,
  Card as NativeCard,
  Chip as NativeChip,
  Divider as NativeDivider,
  HelperText as NativeHelperText,
  Modal as NativeModal,
  PaperProvider as NativePaperProvider,
  Portal as NativePortal,
  Surface as NativeSurface,
  Text as NativeText,
  TextInput as NativeTextInput,
} from "react-native-paper";

type AnyComponent = React.ComponentType<any>;
type AnyCompoundComponent = AnyComponent & {
  Content: AnyComponent;
};

export const ActivityIndicator = NativeActivityIndicator as unknown as AnyComponent;
export const Banner = NativeBanner as unknown as AnyComponent;
export const Button = NativeButton as unknown as AnyComponent;
export const Card = NativeCard as unknown as AnyCompoundComponent;
export const Chip = NativeChip as unknown as AnyComponent;
export const Divider = NativeDivider as unknown as AnyComponent;
export const HelperText = NativeHelperText as unknown as AnyComponent;
export const Modal = NativeModal as unknown as AnyComponent;
export const PaperProvider = NativePaperProvider as unknown as AnyComponent;
export const Portal = NativePortal as unknown as AnyComponent;
export const Surface = NativeSurface as unknown as AnyComponent;
export const Text = NativeText as unknown as AnyComponent;
export const TextInput = NativeTextInput as unknown as AnyComponent;
