import { createHmac } from "crypto";
import { log } from "./index";

const MAINNET_URL = "https://pay.crypt.bot/api";
const TESTNET_URL = "https://testnet-pay.crypt.bot/api";

export interface CryptoInvoice {
  invoice_id: number;
  status: string;
  asset: string;
  amount: string;
  bot_invoice_url: string;
  mini_app_invoice_url?: string;
  web_app_invoice_url?: string;
  description?: string;
  payload?: string;
  created_at: string;
  expiration_date?: string;
  paid_at?: string;
}

export interface CryptoPayConfig {
  token: string;
  testnet?: boolean;
}

let config: CryptoPayConfig | null = null;

export function initCryptoPay() {
  const token = process.env.CRYPTO_BOT_TOKEN;
  if (!token) {
    log("CRYPTO_BOT_TOKEN not set, CryptoBot payments disabled", "cryptopay");
    return;
  }

  const isTestnet = process.env.CRYPTO_BOT_TESTNET === "true";
  config = { token, testnet: isTestnet };
  log(`CryptoBot initialized (${isTestnet ? "testnet" : "mainnet"})`, "cryptopay");
}

export function isCryptoPayEnabled(): boolean {
  return config !== null;
}

function getBaseUrl(): string {
  return config?.testnet ? TESTNET_URL : MAINNET_URL;
}

async function apiRequest(method: string, params?: Record<string, any>): Promise<any> {
  if (!config) throw new Error("CryptoBot not configured");

  const url = `${getBaseUrl()}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Crypto-Pay-API-Token": config.token,
      "Content-Type": "application/json",
    },
    body: params ? JSON.stringify(params) : undefined,
  });

  const data = await res.json();
  if (!data.ok) {
    log(`CryptoBot API error: ${JSON.stringify(data)}`, "cryptopay");
    throw new Error(data.error?.name || "CryptoBot API error");
  }

  return data.result;
}

export async function getExchangeRates(): Promise<Array<{ source: string; target: string; rate: string; is_valid: boolean }>> {
  return apiRequest("getExchangeRates");
}

export async function convertEurToAsset(eurAmount: number, asset: string): Promise<string> {
  try {
    const rates = await getExchangeRates();

    const eurToUsd = rates.find(r => r.source === "EUR" && r.target === "USD" && r.is_valid);
    const assetToUsd = rates.find(r => r.source === asset && r.target === "USD" && r.is_valid);

    if (eurToUsd && assetToUsd) {
      const eurInUsd = eurAmount * parseFloat(eurToUsd.rate);
      const assetAmount = eurInUsd / parseFloat(assetToUsd.rate);
      return assetAmount.toFixed(asset === "BTC" ? 8 : 2);
    }

    const direct = rates.find(r => r.source === asset && r.target === "EUR" && r.is_valid);
    if (direct) {
      const assetAmount = eurAmount / parseFloat(direct.rate);
      return assetAmount.toFixed(asset === "BTC" ? 8 : 2);
    }

    log(`No exchange rate found for EUR to ${asset}`, "cryptopay");
    throw new Error(`Cannot convert EUR to ${asset}`);
  } catch (err: any) {
    log(`Exchange rate conversion failed: ${err.message}`, "cryptopay");
    throw err;
  }
}

export async function createInvoice(options: {
  asset: string;
  amount: string;
  description?: string;
  payload?: string;
  expiresIn?: number;
}): Promise<CryptoInvoice> {
  const params: Record<string, any> = {
    asset: options.asset,
    amount: options.amount,
  };

  if (options.description) params.description = options.description;
  if (options.payload) params.payload = options.payload;
  if (options.expiresIn) params.expires_in = options.expiresIn;
  params.paid_btn_name = "callback";
  params.paid_btn_url = `https://t.me/${process.env.TELEGRAM_BOT_USERNAME || "DHLQRCodeSolverbot"}`;

  const invoice = await apiRequest("createInvoice", params);
  log(`Invoice created: ${invoice.invoice_id} for ${options.amount} ${options.asset}`, "cryptopay");
  return invoice;
}

export async function getInvoice(invoiceId: number): Promise<CryptoInvoice | null> {
  try {
    const invoices = await apiRequest("getInvoices", { invoice_ids: invoiceId.toString() });
    return invoices?.items?.[0] || null;
  } catch {
    return null;
  }
}

export function verifyWebhookSignature(body: string, signature: string): boolean {
  if (!config) return false;

  const secret = createHmac("sha256", "WebAppData").update(config.token).digest();
  const expectedSignature = createHmac("sha256", secret).update(body).digest("hex");

  return expectedSignature === signature;
}

export const SUPPORTED_ASSETS = ["USDT", "BTC", "TON", "LTC", "ETH"] as const;
export type SupportedAsset = typeof SUPPORTED_ASSETS[number];
