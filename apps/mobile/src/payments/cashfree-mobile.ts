import { NativeModules } from "react-native";

type StartCashfreePaymentInput = {
  paymentSessionId: string;
  orderId: string;
  environment: "sandbox" | "production";
};

export type CashfreePaymentOutcome =
  | { kind: "submitted"; orderId: string; message: string }
  | { kind: "pending"; orderId: string; message: string }
  | { kind: "cancelled"; orderId: string; message: string }
  | { kind: "dropped"; orderId: string; message: string }
  | { kind: "failed"; orderId: string; message: string };

type CashfreeGatewayService = {
  setCallback: (callbacks: {
    onVerify: (orderId?: string) => void;
    onError: (error?: { getMessage?: () => string; getCode?: () => string; getStatus?: () => string }, orderId?: string) => void;
  }) => void;
  removeCallback: () => void;
  doWebPayment: (session: unknown) => void;
};

type CashfreeRuntime = {
  CFPaymentGatewayService: CashfreeGatewayService;
  CFEnvironment: { PRODUCTION: unknown; SANDBOX: unknown };
  CFSession: new (paymentSessionId: string, orderId: string, environment: unknown) => unknown;
};

const getCashfreeModule = () => (NativeModules as Record<string, unknown>).CashfreePgApi;

const getCashfreeRuntime = (): CashfreeRuntime | null => {
  if (!getCashfreeModule()) {
    return null;
  }

  try {
    const sdk = require("react-native-cashfree-pg-sdk") as { CFPaymentGatewayService?: CashfreeGatewayService };
    const contract = require("cashfree-pg-api-contract") as {
      CFEnvironment?: { PRODUCTION: unknown; SANDBOX: unknown };
      CFSession?: new (paymentSessionId: string, orderId: string, environment: unknown) => unknown;
    };

    if (!sdk.CFPaymentGatewayService || !contract.CFEnvironment || !contract.CFSession) {
      return null;
    }

    return {
      CFPaymentGatewayService: sdk.CFPaymentGatewayService,
      CFEnvironment: contract.CFEnvironment,
      CFSession: contract.CFSession,
    };
  } catch {
    return null;
  }
};

export const isCashfreeNativeAvailable = () => Boolean(getCashfreeRuntime());

const classifyCashfreeError = (
  input: StartCashfreePaymentInput,
  error?: { getMessage?: () => string; getCode?: () => string; getStatus?: () => string },
  orderId?: string,
): CashfreePaymentOutcome => {
  const code = error?.getCode?.() ?? "";
  const status = error?.getStatus?.() ?? "";
  const message = error?.getMessage?.() ?? "Cashfree checkout could not be completed.";
  const signature = `${code} ${status} ${message}`.toUpperCase();
  const resolvedOrderId = orderId || input.orderId;

  if (signature.includes("USER_DROPPED") || signature.includes("DROPPED")) {
    return {
      kind: "dropped",
      orderId: resolvedOrderId,
      message: "Checkout was closed before payment confirmation.",
    };
  }

  if (signature.includes("CANCEL")) {
    return {
      kind: "cancelled",
      orderId: resolvedOrderId,
      message: "Payment was cancelled before completion.",
    };
  }

  if (signature.includes("PENDING")) {
    return {
      kind: "pending",
      orderId: resolvedOrderId,
      message: "Payment is pending provider confirmation.",
    };
  }

  if (signature.includes("SIMULATED RESPONSE MESSAGE")) {
    return {
      kind: "pending",
      orderId: resolvedOrderId,
      message: "Provider simulator responded. Final status will be confirmed after sync.",
    };
  }

  return {
    kind: "failed",
    orderId: resolvedOrderId,
    message: resolvedOrderId ? `${message} (${resolvedOrderId})` : message,
  };
};

export async function startCashfreePayment(input: StartCashfreePaymentInput) {
  const runtime = getCashfreeRuntime();

  if (!runtime) {
    throw new Error("In-app Cashfree checkout needs a development build. Expo Go cannot open the native payment flow.");
  }

  const { CFPaymentGatewayService, CFEnvironment, CFSession } = runtime;

  return await new Promise<CashfreePaymentOutcome>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      CFPaymentGatewayService.removeCallback();
    };

    CFPaymentGatewayService.setCallback({
      onVerify(orderID) {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve({
          kind: "submitted",
          orderId: orderID || input.orderId,
          message: "Payment was submitted to Cashfree.",
        });
      },
      onError(error, orderID) {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(classifyCashfreeError(input, error, orderID));
      },
    });

    try {
      const session = new CFSession(
        input.paymentSessionId,
        input.orderId,
        input.environment === "production" ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX,
      );

      CFPaymentGatewayService.doWebPayment(session);
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error("Unable to start Cashfree checkout."));
    }
  });
}
