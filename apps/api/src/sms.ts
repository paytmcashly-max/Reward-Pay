import type { AppConfig } from "./config.js";
import { AppError } from "./errors.js";
import type { OtpRecord } from "./otp-store.js";

type SendOtpInput = {
  phone: string;
  code: string;
};

type VerifyOtpInput = {
  phone: string;
  code: string;
  session: OtpRecord;
};

export interface OtpProvider {
  readonly channel: "mock" | "msg91";
  sendOtp(input: SendOtpInput): Promise<{ providerSessionId?: string }>;
  verifyOtp(input: VerifyOtpInput): Promise<boolean>;
}

const normalizeIndianPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) {
    return digits;
  }
  if (digits.length === 10) {
    return `91${digits}`;
  }
  return digits;
};

export class MockOtpProvider implements OtpProvider {
  readonly channel = "mock" as const;

  async sendOtp() {
    return { providerSessionId: undefined };
  }

  async verifyOtp(input: VerifyOtpInput) {
    return input.session.code === input.code;
  }
}

export class Msg91OtpProvider implements OtpProvider {
  readonly channel = "msg91" as const;

  constructor(
    private readonly config: {
      baseUrl: string;
      authKey: string;
      templateId: string;
    },
  ) {}

  async sendOtp(input: SendOtpInput) {
    const url = new URL("/api/v5/otp", this.config.baseUrl);
    url.searchParams.set("template_id", this.config.templateId);
    url.searchParams.set("mobile", normalizeIndianPhone(input.phone));
    url.searchParams.set("authkey", this.config.authKey);
    url.searchParams.set("otp", input.code);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const raw = await response.text().catch(() => "");
    if (!response.ok) {
      throw new AppError("msg91_send_failed", "Unable to send OTP", 502, {
        status: response.status,
        body: raw || undefined,
      });
    }

    const body = raw ? (JSON.parse(raw) as { request_id?: string; type?: string; message?: string }) : {};
    if (body.type && body.type.toLowerCase() === "error") {
      throw new AppError("msg91_send_failed", body.message || "Unable to send OTP", 502, { body });
    }

    return {
      providerSessionId: body.request_id,
    };
  }

  async verifyOtp(input: VerifyOtpInput) {
    const url = new URL("/api/v5/otp/verify", this.config.baseUrl);
    url.searchParams.set("mobile", normalizeIndianPhone(input.phone));
    url.searchParams.set("authkey", this.config.authKey);
    url.searchParams.set("otp", input.code);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const raw = await response.text().catch(() => "");
    if (!response.ok) {
      throw new AppError("msg91_verify_failed", "Unable to verify OTP", 502, {
        status: response.status,
        body: raw || undefined,
      });
    }

    const body = raw ? (JSON.parse(raw) as { type?: string; message?: string }) : {};
    return body.type?.toLowerCase() === "success";
  }
}

export const createOtpProvider = (config: AppConfig): OtpProvider => {
  if (config.MSG91_AUTH_KEY && config.MSG91_TEMPLATE_ID && config.NODE_ENV !== "test") {
    return new Msg91OtpProvider({
      baseUrl: config.MSG91_BASE_URL,
      authKey: config.MSG91_AUTH_KEY,
      templateId: config.MSG91_TEMPLATE_ID,
    });
  }

  return new MockOtpProvider();
};
