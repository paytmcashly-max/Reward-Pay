import type React from "react";
import { LinearGradient as NativeLinearGradient } from "expo-linear-gradient";

export const LinearGradient = NativeLinearGradient as unknown as React.ComponentType<any>;
