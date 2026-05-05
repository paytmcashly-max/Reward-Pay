import type {
  DepositCheckoutSession,
  DepositOrder,
  PaymentProvider,
  PayoutTransferStatus,
  WithdrawBeneficiary,
  WithdrawRequest,
} from "@reward-wallet/shared";
import { AppError } from "./errors.js";

type DepositOrderInput = {
  depositId: string;
  amount: number;
  provider: PaymentProvider;
  customer: {
    customerId: string;
    customerPhone: string;
    customerName: string;
  };
};

type CashfreeConfig = {
  clientId?: string;
  clientSecret?: string;
  apiVersion?: string;
  baseUrl: string;
};

export interface PaymentProviderAdapter {
  readonly provider: PaymentProvider;
  createDepositOrder(input: DepositOrderInput): Promise<DepositCheckoutSession>;
  verifyPayment(order: DepositOrder): Promise<{
    successful: boolean;
    terminal: boolean;
    providerStatus?: string;
    description?: string;
  }>;
  resolveWebhook(input: Record<string, unknown>): Promise<{ providerOrderId?: string; successful: boolean }>;
}

export interface PayoutProviderAdapter {
  readonly provider: PaymentProvider;
  validateDestination(beneficiary: WithdrawBeneficiary): boolean;
  createPayout(input: { withdrawal: WithdrawRequest; beneficiary: WithdrawBeneficiary }): Promise<PayoutTransferStatus>;
  pollPayoutStatus(providerReference: string): Promise<PayoutTransferStatus>;
}

const createCashfreeHeaders = (config: CashfreeConfig) => {
  if (!config.clientId || !config.clientSecret || !config.apiVersion) {
    throw new AppError("cashfree_not_configured", "Cashfree credentials are incomplete", 500);
  }
  return {
    "Content-Type": "application/json",
    "x-client-id": config.clientId,
    "x-client-secret": config.clientSecret,
    "x-api-version": config.apiVersion,
  };
};

const normalizeCashfreeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/$/, "");

export class CashfreePaymentProviderAdapter implements PaymentProviderAdapter {
  readonly provider = "cashfree" as const;

  constructor(private readonly config: CashfreeConfig) {}

  async createDepositOrder(input: DepositOrderInput): Promise<DepositCheckoutSession> {
    const response = await fetch(`${normalizeCashfreeBaseUrl(this.config.baseUrl)}/pg/orders`, {
      method: "POST",
      headers: createCashfreeHeaders(this.config),
      body: JSON.stringify({
        order_id: input.depositId,
        order_currency: "INR",
        order_amount: input.amount,
        customer_details: {
          customer_id: input.customer.customerId,
          customer_phone: input.customer.customerPhone,
          customer_name: input.customer.customerName,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new AppError("cashfree_create_order_failed", "Unable to create Cashfree order", 502, {
        status: response.status,
        body: body || undefined,
      });
    }

    const body = (await response.json()) as {
      order_id?: string;
      payment_session_id?: string;
      order_expiry_time?: string;
    };

    return {
      provider: this.provider,
      providerOrderId: body.order_id ?? input.depositId,
      paymentSessionId: body.payment_session_id,
      checkoutUrl: `${normalizeCashfreeBaseUrl(this.config.baseUrl)}/pg/orders/${body.order_id ?? input.depositId}`,
      expiresAt: body.order_expiry_time,
    };
  }

  async verifyPayment(order: DepositOrder) {
    const providerOrderId = order.providerOrderId ?? order.id;
    const response = await fetch(
      `${normalizeCashfreeBaseUrl(this.config.baseUrl)}/pg/orders/${providerOrderId}/payments`,
      { headers: createCashfreeHeaders(this.config) },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new AppError("cashfree_verify_payment_failed", "Unable to verify Cashfree payment", 502, {
        status: response.status,
        body: body || undefined,
      });
    }

    const payments = (await response.json()) as Array<{ payment_status?: string; is_captured?: boolean; payment_message?: string }>;
    if (!payments.length) {
      return {
        successful: false,
        terminal: false,
        providerStatus: "NOT_ATTEMPTED",
        description: "Payment has not been completed yet.",
      };
    }

    const success = payments.find((payment) => payment.is_captured || payment.payment_status === "SUCCESS" || payment.payment_status === "PAID");
    if (success) {
      return {
        successful: true,
        terminal: true,
        providerStatus: success.payment_status ?? "SUCCESS",
        description: success.payment_message ?? "Payment captured successfully.",
      };
    }

    const terminalFailure = payments.find((payment) =>
      ["FAILED", "CANCELLED", "USER_DROPPED", "VOID", "TERMINATED", "EXPIRED"].includes(String(payment.payment_status ?? "").toUpperCase()),
    );
    if (terminalFailure) {
      return {
        successful: false,
        terminal: true,
        providerStatus: terminalFailure.payment_status,
        description: terminalFailure.payment_message ?? "Payment could not be completed.",
      };
    }

    const latest = payments[0];
    return {
      successful: false,
      terminal: false,
      providerStatus: latest.payment_status ?? "PENDING",
      description: latest.payment_message ?? "Payment is still pending confirmation.",
    };
  }

  async resolveWebhook(input: Record<string, unknown>) {
    const rawOrderId =
      (input.order_id as string | undefined) ??
      (input.data as { order?: { order_id?: string }; order_id?: string } | undefined)?.order?.order_id ??
      (input.data as { order_id?: string } | undefined)?.order_id;

    const paymentStatus =
      (input.payment_status as string | undefined) ??
      (input.type as string | undefined) ??
      (input.data as { payment?: { payment_status?: string } } | undefined)?.payment?.payment_status;

    return {
      providerOrderId: rawOrderId,
      successful: paymentStatus === "SUCCESS" || paymentStatus === "PAID" || paymentStatus === "PAYMENT_SUCCESS_WEBHOOK",
    };
  }
}

export class CashfreePayoutProviderAdapter implements PayoutProviderAdapter {
  readonly provider = "cashfree" as const;

  constructor(private readonly config: CashfreeConfig) {}

  validateDestination(beneficiary: WithdrawBeneficiary) {
    if (beneficiary.type === "upi") {
      return Boolean(beneficiary.upiId?.includes("@"));
    }
    return Boolean(beneficiary.bankAccountNumber && beneficiary.ifscCode);
  }

  private async upsertBeneficiary(beneficiary: WithdrawBeneficiary) {
    const response = await fetch(`${normalizeCashfreeBaseUrl(this.config.baseUrl)}/payout/beneficiary`, {
      method: "POST",
      headers: createCashfreeHeaders(this.config),
      body: JSON.stringify({
        beneficiary_id: beneficiary.id,
        beneficiary_name: beneficiary.accountName,
        beneficiary_instrument_details: {
          bank_account_number: beneficiary.bankAccountNumber,
          bank_ifsc: beneficiary.ifscCode,
          vpa: beneficiary.upiId,
        },
        beneficiary_contact_details: {
          beneficiary_email: `${beneficiary.id}@reward-wallet.local`,
          beneficiary_phone: "9999999999",
          beneficiary_country_code: "+91",
          beneficiary_address: beneficiary.label,
          beneficiary_city: "Bengaluru",
          beneficiary_state: "Karnataka",
          beneficiary_postal_code: "560001",
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new AppError("cashfree_beneficiary_failed", "Unable to register payout beneficiary", 502, {
        status: response.status,
        body: body || undefined,
      });
    }
  }

  async createPayout(input: { withdrawal: WithdrawRequest; beneficiary: WithdrawBeneficiary }): Promise<PayoutTransferStatus> {
    await this.upsertBeneficiary(input.beneficiary);
    const response = await fetch(`${normalizeCashfreeBaseUrl(this.config.baseUrl)}/payout/transfers`, {
      method: "POST",
      headers: createCashfreeHeaders(this.config),
      body: JSON.stringify({
        transfer_id: input.withdrawal.id,
        transfer_amount: input.withdrawal.amount,
        beneficiary_details: {
          beneficiary_id: input.beneficiary.id,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new AppError("cashfree_payout_failed", "Unable to create Cashfree payout", 502, {
        status: response.status,
        body: body || undefined,
      });
    }

    const body = (await response.json()) as {
      cf_transfer_id?: string;
      status?: PayoutTransferStatus["status"];
      status_description?: string;
    };

    return {
      provider: this.provider,
      providerReference: body.cf_transfer_id ?? input.withdrawal.id,
      status: body.status ?? "RECEIVED",
      description: body.status_description ?? "Transfer submitted to Cashfree",
    };
  }

  async pollPayoutStatus(providerReference: string): Promise<PayoutTransferStatus> {
    return {
      provider: this.provider,
      providerReference,
      status: "PROCESSING",
      description: "Polling not implemented in this MVP yet",
    };
  }
}

export class MockPaymentProviderAdapter implements PaymentProviderAdapter {
  readonly provider = "mock" as const;

  async createDepositOrder(input: DepositOrderInput) {
    return {
      provider: this.provider,
      providerOrderId: input.depositId,
      paymentSessionId: `mock_session_${input.depositId}`,
      checkoutUrl: `https://sandbox.reward-wallet.local/checkout/${input.provider}/${input.depositId}?amount=${input.amount}`,
    };
  }

  async verifyPayment() {
    return {
      successful: true,
      terminal: true,
      providerStatus: "SUCCESS",
      description: "Mock payment completed successfully.",
    };
  }

  async resolveWebhook(input: Record<string, unknown>) {
    return {
      providerOrderId: input.order_id as string | undefined,
      successful: true,
    };
  }
}

export class MockPayoutProviderAdapter implements PayoutProviderAdapter {
  readonly provider = "mock" as const;

  constructor(
    private readonly result: {
      status: PayoutTransferStatus["status"];
      description: string;
    } = {
      status: "SUCCESS",
      description: "Mock payout completed",
    },
  ) {}

  validateDestination(beneficiary: WithdrawBeneficiary) {
    if (beneficiary.type === "upi") {
      return Boolean(beneficiary.upiId?.includes("@"));
    }
    return Boolean(beneficiary.bankAccountNumber && beneficiary.ifscCode);
  }

  async createPayout(input: { withdrawal: WithdrawRequest }) {
    return {
      provider: this.provider,
      providerReference: `payout_${input.withdrawal.id}`,
      status: this.result.status,
      description: this.result.description,
    };
  }

  async pollPayoutStatus(providerReference: string) {
    return {
      provider: this.provider,
      providerReference,
      status: this.result.status,
      description: this.result.description,
    };
  }
}
