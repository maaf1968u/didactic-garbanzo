import TelegramBot from "node-telegram-bot-api";
import { storage } from "./storage";
import { captureQrCode, captureQrCodeForTracking } from "./providers";
import { RENTAL_PLANS } from "@shared/schema";
import { log } from "./index";
import path from "path";
import fs from "fs";
import {
  initCryptoPay,
  isCryptoPayEnabled,
  createInvoice,
  convertEurToAsset,
  getInvoice,
  verifyWebhookSignature,
  SUPPORTED_ASSETS,
  type SupportedAsset,
} from "./crypto-pay";

let bot: TelegramBot | null = null;

const pendingPlanSelections = new Map<string, string>();
const pendingTrackingInput = new Set<string>();

export function getBot(): TelegramBot | null {
  return bot;
}

export function initTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    log("TELEGRAM_BOT_TOKEN not set, bot will not start", "telegram");
    return;
  }

  initCryptoPay();

  bot = new TelegramBot(token, { polling: true });
  log("Telegram bot started with polling", "telegram");

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id.toString() || "";
    const firstName = msg.from?.first_name || "";
    const lastName = msg.from?.last_name || "";
    const username = msg.from?.username || "";

    let customer = await storage.getCustomerByTelegramId(telegramId);
    if (!customer) {
      customer = await storage.createCustomer({
        telegramId,
        telegramUsername: username || null,
        firstName: firstName || null,
        lastName: lastName || null,
        isBlocked: false,
      });
      log(`New customer registered: ${firstName} (${telegramId})`, "telegram");
    }

    const activeSub = await storage.getActiveSubscriptionByCustomer(customer.id);

    let welcomeText: string;
    const buttons: TelegramBot.InlineKeyboardButton[][] = [];

    if (activeSub) {
      const expiresAt = activeSub.expiresAt ? new Date(activeSub.expiresAt).toLocaleDateString() : "unknown";
      welcomeText = `Welcome back, ${firstName}!\n\nYou have an active subscription.\nPlan: ${activeSub.plan}\nExpires: ${expiresAt}\n\nUse /account to see your DHL Packstation details.\nUse /request to get a pickup QR code with your tracking number.`;
      buttons.push([{ text: "📦 View Account Details", callback_data: "account_info" }]);
      buttons.push([{ text: "📱 Request QR Code", callback_data: "request_qr" }]);
      buttons.push([{ text: "My Subscription", callback_data: "check_status" }]);
    } else {
      welcomeText = `Welcome to DHL QR Code Service, ${firstName}!\n\nSubscribe to get a dedicated DHL Packstation account. Order packages to your assigned Packstation, then submit a tracking number to receive the pickup QR code.\n\nPlans:\n  1 Week  — €15\n  2 Weeks — €25\n  1 Month — €45\n\nPayment via CryptoBot (BTC, USDT, TON, LTC, ETH).`;
      buttons.push([{ text: "Subscribe Now", callback_data: "subscribe" }]);
      buttons.push([{ text: "Help", callback_data: "help" }]);
    }

    bot!.sendMessage(chatId, welcomeText, {
      reply_markup: { inline_keyboard: buttons },
    });
  });

  bot.onText(/\/subscribe/, async (msg) => {
    await handleSubscribe(msg.chat.id, msg.from?.id.toString() || "");
  });

  bot.onText(/\/request/, async (msg) => {
    await handleQrRequest(msg.chat.id, msg.from?.id.toString() || "");
  });

  bot.onText(/\/account/, async (msg) => {
    await handleAccountInfo(msg.chat.id, msg.from?.id.toString() || "");
  });

  bot.onText(/\/status/, async (msg) => {
    await handleStatusCheck(msg.chat.id, msg.from?.id.toString() || "");
  });

  bot.onText(/\/help/, async (msg) => {
    const cryptoPayNote = isCryptoPayEnabled()
      ? "Payment is handled securely via @CryptoBot."
      : "Payment via crypto.";

    const helpText = `DHL QR Code Service\n\nHow it works:\n1. Subscribe to a plan\n2. Pay with crypto via CryptoBot\n3. Get your DHL Packstation account details (/account)\n4. Order packages to your assigned Packstation\n5. Enter your tracking number via /request\n6. Receive the pickup QR code\n\nPlans:\n  1 Week  — €15\n  2 Weeks — €25\n  1 Month — €45\n\n${cryptoPayNote}\n\nCommands:\n/start - Main menu\n/subscribe - Choose a plan\n/account - View DHL Packstation details\n/request - Request QR code (enter tracking number)\n/status - Check subscription status\n/help - Show this help`;

    bot!.sendMessage(msg.chat.id, helpText);
  });

  bot.on("message", async (msg) => {
    if (!msg.text || msg.text.startsWith("/")) return;
    const telegramId = msg.from?.id.toString() || "";
    const chatId = msg.chat.id;

    if (pendingTrackingInput.has(telegramId)) {
      pendingTrackingInput.delete(telegramId);
      await handleTrackingNumberSubmit(chatId, telegramId, msg.text.trim());
    }
  });

  bot.on("callback_query", async (query) => {
    const chatId = query.message?.chat.id;
    const telegramId = query.from.id.toString();
    if (!chatId) return;

    bot!.answerCallbackQuery(query.id);

    const data = query.data || "";

    if (data === "subscribe") {
      await handleSubscribe(chatId, telegramId);
    } else if (data.startsWith("plan_")) {
      await handlePlanSelection(chatId, telegramId, data.replace("plan_", ""));
    } else if (data.startsWith("asset_")) {
      await handleAssetSelection(chatId, telegramId, data.replace("asset_", ""));
    } else if (data === "request_qr") {
      await handleQrRequest(chatId, telegramId);
    } else if (data === "check_status") {
      await handleStatusCheck(chatId, telegramId);
    } else if (data === "check_payment") {
      await handleCheckPayment(chatId, telegramId);
    } else if (data === "help") {
      bot!.sendMessage(chatId, `DHL QR Code Service\n\nHow it works:\n1. Choose a subscription plan\n2. Pay with crypto via CryptoBot\n3. Payment confirmed automatically\n4. Request unlimited QR codes\n\nCommands:\n/subscribe - Choose a plan\n/request - Request a QR code\n/status - Check status`);
    } else if (data === "account_info") {
      await handleAccountInfo(chatId, telegramId);
    } else if (data === "cancel_session") {
      await handleCancelSession(chatId, telegramId);
    } else if (data === "cancel_subscription") {
      await handleCancelPendingSubscription(chatId, telegramId);
    }
  });

  bot.on("polling_error", (error) => {
    log(`Polling error: ${error.message}`, "telegram");
  });
}

async function handleSubscribe(chatId: number, telegramId: string) {
  if (!bot) return;

  const customer = await storage.getCustomerByTelegramId(telegramId);
  if (!customer) {
    bot.sendMessage(chatId, "Please use /start first to register.");
    return;
  }

  if (customer.isBlocked) {
    bot.sendMessage(chatId, "Your account has been restricted. Please contact support.");
    return;
  }

  const activeSub = await storage.getActiveSubscriptionByCustomer(customer.id);
  if (activeSub) {
    const expiresAt = activeSub.expiresAt ? new Date(activeSub.expiresAt).toLocaleDateString() : "unknown";
    bot.sendMessage(chatId, `You already have an active subscription!\n\nPlan: ${activeSub.plan}\nExpires: ${expiresAt}\n\nUse /request to get a QR code.`, {
      reply_markup: {
        inline_keyboard: [[{ text: "Request QR Code", callback_data: "request_qr" }]],
      },
    });
    return;
  }

  const pendingSub = await storage.getPendingSubscriptionByCustomer(customer.id);
  if (pendingSub) {
    const buttons: TelegramBot.InlineKeyboardButton[][] = [];

    if (pendingSub.cryptoBotInvoiceId) {
      buttons.push([{ text: "Check Payment Status", callback_data: "check_payment" }]);
    }
    buttons.push([{ text: "Cancel & Start Over", callback_data: "cancel_subscription" }]);

    bot.sendMessage(chatId, `You already have a pending subscription awaiting payment.\n\nPlan: ${pendingSub.plan}\nAmount: €${pendingSub.priceEur}${pendingSub.cryptoAmount ? `\nCrypto: ${pendingSub.cryptoAmount} ${pendingSub.cryptoAsset}` : ""}\n\nPlease complete the payment or cancel to start over.`, {
      reply_markup: { inline_keyboard: buttons },
    });
    return;
  }

  bot.sendMessage(chatId, "Choose your subscription plan:\n\nAll plans include unlimited QR code requests.", {
    reply_markup: {
      inline_keyboard: RENTAL_PLANS.map(plan => ([
        { text: `${plan.label} — €${plan.priceEur}`, callback_data: `plan_${plan.id}` },
      ])),
    },
  });
}

async function handlePlanSelection(chatId: number, telegramId: string, planId: string) {
  if (!bot) return;

  const customer = await storage.getCustomerByTelegramId(telegramId);
  if (!customer) return;

  const plan = RENTAL_PLANS.find(p => p.id === planId);
  if (!plan) {
    bot.sendMessage(chatId, "Invalid plan selected.");
    return;
  }

  if (!isCryptoPayEnabled()) {
    bot.sendMessage(chatId, "Payment system is not configured. Please contact support.");
    return;
  }

  pendingPlanSelections.set(telegramId, planId);

  const assetButtons: TelegramBot.InlineKeyboardButton[][] = SUPPORTED_ASSETS.map(asset => ([
    { text: assetLabel(asset), callback_data: `asset_${asset}` },
  ]));

  bot.sendMessage(chatId, `You selected: ${plan.label} (€${plan.priceEur})\n\nChoose your payment currency:`, {
    reply_markup: { inline_keyboard: assetButtons },
  });
}

function mapAssetToPaymentMethod(asset: string): "bitcoin" | "usdt_trc20" | "usdt_erc20" | "litecoin" | "other" {
  const map: Record<string, "bitcoin" | "usdt_trc20" | "usdt_erc20" | "litecoin" | "other"> = {
    BTC: "bitcoin",
    USDT: "usdt_trc20",
    LTC: "litecoin",
    TON: "other",
    ETH: "other",
  };
  return map[asset] || "other";
}

function assetLabel(asset: string): string {
  const labels: Record<string, string> = {
    USDT: "💲 USDT",
    BTC: "₿ Bitcoin",
    TON: "💎 TON",
    LTC: "Ł Litecoin",
    ETH: "⟠ Ethereum",
  };
  return labels[asset] || asset;
}

async function handleAssetSelection(chatId: number, telegramId: string, asset: string) {
  if (!bot) return;

  const customer = await storage.getCustomerByTelegramId(telegramId);
  if (!customer) return;

  const planId = pendingPlanSelections.get(telegramId);
  if (!planId) {
    bot.sendMessage(chatId, "Session expired. Please use /subscribe to start again.");
    return;
  }

  const plan = RENTAL_PLANS.find(p => p.id === planId);
  if (!plan) {
    bot.sendMessage(chatId, "Invalid plan. Please try again with /subscribe.");
    return;
  }

  pendingPlanSelections.delete(telegramId);

  bot.sendMessage(chatId, "⏳ Creating your payment invoice...");

  try {
    const cryptoAmount = await convertEurToAsset(plan.priceEur, asset);

    const invoice = await createInvoice({
      asset,
      amount: cryptoAmount,
      description: `DHL QR Service - ${plan.label} subscription`,
      payload: JSON.stringify({ customerId: customer.id, planId: plan.id, telegramId }),
      expiresIn: 3600,
    });

    const pendingSub = await storage.getPendingSubscriptionByCustomer(customer.id);
    if (pendingSub) {
      await storage.updateSubscriptionStatus(pendingSub.id, "cancelled");
    }

    const sub = await storage.createSubscription({
      customerId: customer.id,
      plan: plan.label,
      durationDays: plan.days,
      priceEur: plan.priceEur.toString(),
      status: "pending_payment",
      paymentMethod: mapAssetToPaymentMethod(asset),
      paymentAddress: null,
      paymentTxId: null,
      cryptoBotInvoiceId: invoice.invoice_id,
      cryptoAsset: asset,
      cryptoAmount: cryptoAmount,
    });

    log(`CryptoBot invoice ${invoice.invoice_id} created for subscription ${sub.id}: ${cryptoAmount} ${asset}`, "telegram");

    bot.sendMessage(chatId, `💰 Payment Invoice Created\n\nPlan: ${plan.label}\nPrice: €${plan.priceEur}\nAmount: ${cryptoAmount} ${asset}\n\nClick the button below to pay via @CryptoBot.\nThe invoice expires in 1 hour.`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: `Pay ${cryptoAmount} ${asset}`, url: invoice.bot_invoice_url }],
          [{ text: "Check Payment Status", callback_data: "check_payment" }],
          [{ text: "Cancel", callback_data: "cancel_subscription" }],
        ],
      },
    });
  } catch (err: any) {
    log(`Failed to create CryptoBot invoice: ${err.message}`, "telegram");
    bot.sendMessage(chatId, `Sorry, there was an error creating your payment invoice. Please try again.\n\nError: ${err.message}`, {
      reply_markup: {
        inline_keyboard: [[{ text: "Try Again", callback_data: "subscribe" }]],
      },
    });
  }
}

async function handleCheckPayment(chatId: number, telegramId: string) {
  if (!bot) return;

  const customer = await storage.getCustomerByTelegramId(telegramId);
  if (!customer) return;

  const pendingSub = await storage.getPendingSubscriptionByCustomer(customer.id);
  if (!pendingSub || !pendingSub.cryptoBotInvoiceId) {
    bot.sendMessage(chatId, "No pending payment found. Use /subscribe to create one.");
    return;
  }

  try {
    const invoice = await getInvoice(pendingSub.cryptoBotInvoiceId);
    if (!invoice) {
      bot.sendMessage(chatId, "Could not find your invoice. Please try again or create a new subscription.");
      return;
    }

    if (invoice.status === "paid") {
      await activateSubscription(pendingSub.id, customer.telegramId, chatId);
    } else if (invoice.status === "expired") {
      await storage.updateSubscriptionStatus(pendingSub.id, "cancelled");
      bot.sendMessage(chatId, "Your payment invoice has expired. Please create a new subscription.", {
        reply_markup: {
          inline_keyboard: [[{ text: "Subscribe Again", callback_data: "subscribe" }]],
        },
      });
    } else {
      bot.sendMessage(chatId, `Your payment is still pending.\n\nInvoice: ${pendingSub.cryptoAmount} ${pendingSub.cryptoAsset}\nStatus: Awaiting payment\n\nPlease complete the payment via @CryptoBot.`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: `Pay Now`, url: invoice.bot_invoice_url }],
            [{ text: "Check Again", callback_data: "check_payment" }],
          ],
        },
      });
    }
  } catch (err: any) {
    log(`Error checking payment status: ${err.message}`, "telegram");
    bot.sendMessage(chatId, "Error checking payment status. Please try again later.");
  }
}

async function activateSubscription(subscriptionId: string, telegramId: string, chatId?: number) {
  const activated = await storage.activateSubscription(subscriptionId);
  if (!activated) {
    log(`Failed to activate subscription ${subscriptionId}`, "telegram");
    return;
  }

  const availablePhones = await storage.getAvailablePhones();
  const phonesWithAccount = availablePhones.filter(p => p.postnummer && p.dhlAccountName);
  const assignedPhone = phonesWithAccount.length > 0 ? phonesWithAccount[0] : (availablePhones.length > 0 ? availablePhones[0] : null);

  if (assignedPhone) {
    await storage.assignPhoneToSubscription(subscriptionId, assignedPhone.id);
    log(`Phone ${assignedPhone.name} assigned to subscription ${subscriptionId}`, "telegram");
  }

  log(`Subscription ${subscriptionId} activated for customer ${telegramId}`, "telegram");

  const expiresAt = activated.expiresAt ? new Date(activated.expiresAt).toLocaleDateString() : "unknown";
  let message = `✅ Your subscription has been activated!\n\nPlan: ${activated.plan}\nExpires: ${expiresAt}`;

  if (assignedPhone && assignedPhone.postnummer && assignedPhone.dhlAccountName) {
    message += `\n\n📦 Your DHL Packstation Account:\nName: ${assignedPhone.dhlAccountName}\nPostnummer: ${assignedPhone.postnummer}`;
    message += `\n\nUse these details to order packages to a DHL Packstation. Once you have a tracking number, use /request to get the pickup QR code.`;
  } else {
    message += `\n\nUse /account to view your DHL Packstation details.\nUse /request to request a QR code with your tracking number.`;
  }

  const buttons: TelegramBot.InlineKeyboardButton[][] = [
    [{ text: "📦 View Account Details", callback_data: "account_info" }],
    [{ text: "📱 Request QR Code", callback_data: "request_qr" }],
  ];

  if (chatId) {
    bot?.sendMessage(chatId, message, {
      reply_markup: { inline_keyboard: buttons },
    });
  } else {
    const targetChatId = parseInt(telegramId);
    bot?.sendMessage(targetChatId, message, {
      reply_markup: { inline_keyboard: buttons },
    });
  }
}

async function handleCancelPendingSubscription(chatId: number, telegramId: string) {
  if (!bot) return;

  const customer = await storage.getCustomerByTelegramId(telegramId);
  if (!customer) return;

  const pendingSub = await storage.getPendingSubscriptionByCustomer(customer.id);
  if (!pendingSub) {
    bot.sendMessage(chatId, "No pending subscription to cancel.");
    return;
  }

  await storage.updateSubscriptionStatus(pendingSub.id, "cancelled");
  bot.sendMessage(chatId, "Your pending subscription has been cancelled.\n\nUse /subscribe to choose a new plan.", {
    reply_markup: {
      inline_keyboard: [[{ text: "Subscribe", callback_data: "subscribe" }]],
    },
  });

  log(`Subscription ${pendingSub.id} cancelled by customer ${telegramId}`, "telegram");
}

async function handleAccountInfo(chatId: number, telegramId: string) {
  if (!bot) return;

  const customer = await storage.getCustomerByTelegramId(telegramId);
  if (!customer) {
    bot.sendMessage(chatId, "Please use /start first to register.");
    return;
  }

  const activeSub = await storage.getActiveSubscriptionByCustomer(customer.id);
  if (!activeSub) {
    bot.sendMessage(chatId, "You need an active subscription to view account details.\n\nUse /subscribe to choose a plan.", {
      reply_markup: {
        inline_keyboard: [[{ text: "Subscribe Now", callback_data: "subscribe" }]],
      },
    });
    return;
  }

  if (!activeSub.assignedPhoneId) {
    bot.sendMessage(chatId, "No device has been assigned to your subscription yet. Please contact support.");
    return;
  }

  const phone = await storage.getCloudPhone(activeSub.assignedPhoneId);
  if (!phone) {
    bot.sendMessage(chatId, "Your assigned device could not be found. Please contact support.");
    return;
  }

  const expiresAt = activeSub.expiresAt ? new Date(activeSub.expiresAt).toLocaleDateString() : "unknown";
  let message = `📦 Your DHL Packstation Account\n\n`;

  if (phone.dhlAccountName) {
    message += `Name: ${phone.dhlAccountName}\n`;
  }
  if (phone.postnummer) {
    message += `Postnummer: ${phone.postnummer}\n`;
  }
  if (phone.dhlAccountEmail) {
    message += `Email: ${phone.dhlAccountEmail}\n`;
  }

  message += `\nSubscription: ${activeSub.plan}\nExpires: ${expiresAt}`;
  message += `\n\nUse these details when ordering packages to a DHL Packstation. Once you receive a tracking number, use /request to get the pickup QR code.`;

  bot.sendMessage(chatId, message, {
    reply_markup: {
      inline_keyboard: [[{ text: "📱 Request QR Code", callback_data: "request_qr" }]],
    },
  });
}

async function handleQrRequest(chatId: number, telegramId: string) {
  if (!bot) return;

  const customer = await storage.getCustomerByTelegramId(telegramId);
  if (!customer) {
    bot.sendMessage(chatId, "Please use /start first to register.");
    return;
  }

  if (customer.isBlocked) {
    bot.sendMessage(chatId, "Your account has been restricted. Please contact support.");
    return;
  }

  const activeSub = await storage.getActiveSubscriptionByCustomer(customer.id);
  if (!activeSub) {
    bot.sendMessage(chatId, "You need an active subscription to request QR codes.\n\nUse /subscribe to choose a plan.", {
      reply_markup: {
        inline_keyboard: [[{ text: "Subscribe Now", callback_data: "subscribe" }]],
      },
    });
    return;
  }

  pendingTrackingInput.add(telegramId);
  bot.sendMessage(chatId, "📦 Please enter your DHL tracking number:\n\n(Example: 00340434161094042557)", {
    reply_markup: {
      force_reply: true,
      selective: true,
    },
  });
}

async function handleTrackingNumberSubmit(chatId: number, telegramId: string, trackingNumber: string) {
  if (!bot) return;

  if (!trackingNumber || trackingNumber.length < 10) {
    bot.sendMessage(chatId, "❌ Invalid tracking number. Please enter a valid DHL tracking number (at least 10 characters).\n\nUse /request to try again.");
    return;
  }

  const customer = await storage.getCustomerByTelegramId(telegramId);
  if (!customer) return;

  const activeSub = await storage.getActiveSubscriptionByCustomer(customer.id);
  if (!activeSub) {
    bot.sendMessage(chatId, "Your subscription has expired. Please renew to request QR codes.");
    return;
  }

  let phone = activeSub.assignedPhoneId ? await storage.getCloudPhone(activeSub.assignedPhoneId) : null;

  if (!phone) {
    const availablePhones = await storage.getAvailablePhones();
    if (availablePhones.length === 0) {
      bot.sendMessage(chatId, "All cloud phone devices are currently busy. Please try again in a few minutes.", {
        reply_markup: {
          inline_keyboard: [[{ text: "Try Again", callback_data: "request_qr" }]],
        },
      });
      return;
    }
    phone = availablePhones[0];
    await storage.assignPhoneToSubscription(activeSub.id, phone.id);
  }

  const session = await storage.createSession({
    customerId: customer.id,
    phoneId: null,
    status: "pending",
    durationMinutes: 5,
  });

  await storage.incrementCustomerSessions(customer.id);

  const qrCode = await storage.createQrCode({
    sessionId: session.id,
    trackingNumber,
    status: "pending",
    imageUrl: null,
  });

  bot.sendMessage(chatId, `⏳ QR Code request submitted!\n\nTracking: ${trackingNumber}\nDevice: ${phone.name}\nProvider: ${phone.provider}\n\nNavigating DHL app to your shipment. Please wait...`);

  await storage.updateCloudPhoneStatus(phone.id, "in_use");
  await storage.startSession(session.id, phone.id, 5);

  log(`Session ${session.id} started for customer ${customer.telegramId} on device ${phone.name}, tracking: ${trackingNumber}`, "telegram");

  (async () => {
    try {
      const screenshot = await captureQrCodeForTracking(phone!.provider, phone!.deviceId, trackingNumber);

      if (screenshot.success) {
        if (screenshot.imageData) {
          const filename = `qr_${session.id}_${Date.now()}.png`;
          const filepath = path.join(process.cwd(), "screenshots", filename);
          fs.writeFileSync(filepath, screenshot.imageData);

          await storage.updateQrCodeStatus(qrCode.id, "captured", `/api/screenshots/${filename}`);

          await bot!.sendPhoto(chatId, screenshot.imageData, {
            caption: `✅ QR code captured for tracking: ${trackingNumber}\n\nPresent this QR code at the DHL Packstation to pick up your package.`,
          });

          await storage.updateQrCodeStatus(qrCode.id, "delivered");
          log(`QR code delivered for tracking ${trackingNumber}, session ${session.id}`, "telegram");
        } else if (screenshot.imageUrl) {
          await storage.updateQrCodeStatus(qrCode.id, "captured", screenshot.imageUrl);
          bot!.sendMessage(chatId, `✅ QR code captured for tracking: ${trackingNumber}. Use it at the DHL Packstation.`);
          await storage.updateQrCodeStatus(qrCode.id, "delivered");
        }
      } else {
        await storage.updateQrCodeStatus(qrCode.id, "failed");
        bot!.sendMessage(chatId, `❌ Sorry, QR code capture failed.\nReason: ${screenshot.error || "Unknown error"}\n\nPlease try again.`, {
          reply_markup: {
            inline_keyboard: [[{ text: "Try Again", callback_data: "request_qr" }]],
          },
        });
        log(`QR code capture failed for tracking ${trackingNumber}, session ${session.id}: ${screenshot.error}`, "telegram");
      }
    } catch (err) {
      await storage.updateQrCodeStatus(qrCode.id, "failed");
      bot!.sendMessage(chatId, "An error occurred while capturing the QR code. Please try again later.");
      log(`Error during QR capture for tracking ${trackingNumber}, session ${session.id}: ${err}`, "telegram");
    }

    await storage.completeSession(session.id);
    await storage.updateCloudPhoneStatus(phone!.id, "available");
  })();
}

async function handleStatusCheck(chatId: number, telegramId: string) {
  if (!bot) return;

  const customer = await storage.getCustomerByTelegramId(telegramId);
  if (!customer) {
    bot.sendMessage(chatId, "Please use /start first to register.");
    return;
  }

  const activeSub = await storage.getActiveSubscriptionByCustomer(customer.id);
  const pendingSub = await storage.getPendingSubscriptionByCustomer(customer.id);

  let statusText = "";
  const buttons: TelegramBot.InlineKeyboardButton[][] = [];

  if (activeSub) {
    const expiresAt = activeSub.expiresAt ? new Date(activeSub.expiresAt) : null;
    const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : 0;
    statusText += `✅ Active Subscription\n\nPlan: ${activeSub.plan}\nExpires: ${expiresAt?.toLocaleDateString() || "unknown"}\nDays Remaining: ${daysLeft}\nTotal QR Requests: ${customer.totalSessions}`;
    buttons.push([{ text: "Request QR Code", callback_data: "request_qr" }]);
  } else if (pendingSub) {
    statusText += `⏳ Pending Subscription\n\nPlan: ${pendingSub.plan}\nAmount: €${pendingSub.priceEur}`;
    if (pendingSub.cryptoAmount && pendingSub.cryptoAsset) {
      statusText += `\nCrypto: ${pendingSub.cryptoAmount} ${pendingSub.cryptoAsset}`;
    }
    statusText += `\nStatus: Awaiting payment`;

    if (pendingSub.cryptoBotInvoiceId) {
      buttons.push([{ text: "Check Payment Status", callback_data: "check_payment" }]);
    }
    buttons.push([{ text: "Cancel", callback_data: "cancel_subscription" }]);
  } else {
    statusText = "You don't have an active subscription.\n\nSubscribe to start requesting QR codes!";
    buttons.push([{ text: "Subscribe Now", callback_data: "subscribe" }]);
  }

  bot.sendMessage(chatId, statusText, {
    reply_markup: { inline_keyboard: buttons },
  });
}

async function handleCancelSession(chatId: number, telegramId: string) {
  if (!bot) return;

  const customer = await storage.getCustomerByTelegramId(telegramId);
  if (!customer) return;

  const activeSession = await storage.getActiveSessionByCustomer(customer.id);
  if (!activeSession) {
    bot.sendMessage(chatId, "No active session to cancel.");
    return;
  }

  await storage.updateSessionStatus(activeSession.id, "cancelled");
  if (activeSession.phoneId) {
    await storage.updateCloudPhoneStatus(activeSession.phoneId, "available");
  }

  bot.sendMessage(chatId, "Your session has been cancelled.\n\nUse /request to start a new QR code request.", {
    reply_markup: {
      inline_keyboard: [[{ text: "Request New QR Code", callback_data: "request_qr" }]],
    },
  });

  log(`Session ${activeSession.id} cancelled by customer ${telegramId}`, "telegram");
}

export async function handleCryptoPayWebhook(rawBody: string, signature: string): Promise<boolean> {
  if (!verifyWebhookSignature(rawBody, signature)) {
    log("Invalid CryptoBot webhook signature", "cryptopay");
    return false;
  }

  try {
    const update = JSON.parse(rawBody);

    if (update.update_type === "invoice_paid") {
      const invoiceData = update.payload;
      const invoiceId = invoiceData.invoice_id;

      log(`CryptoBot webhook: invoice ${invoiceId} paid`, "cryptopay");

      const sub = await storage.getSubscriptionByInvoiceId(invoiceId);
      if (!sub) {
        log(`No subscription found for invoice ${invoiceId}`, "cryptopay");
        return true;
      }

      if (sub.status !== "pending_payment") {
        log(`Subscription ${sub.id} already processed (status: ${sub.status})`, "cryptopay");
        return true;
      }

      const customer = await storage.getCustomer(sub.customerId);
      if (!customer) {
        log(`Customer not found for subscription ${sub.id}`, "cryptopay");
        return true;
      }

      await activateSubscription(sub.id, customer.telegramId);
      log(`Subscription ${sub.id} auto-activated via CryptoBot webhook`, "cryptopay");
    }

    return true;
  } catch (err: any) {
    log(`Error processing CryptoBot webhook: ${err.message}`, "cryptopay");
    return false;
  }
}

export async function sendMessageToCustomer(telegramId: string, message: string): Promise<boolean> {
  if (!bot) return false;
  try {
    await bot.sendMessage(parseInt(telegramId), message);
    return true;
  } catch (err) {
    log(`Failed to send message to ${telegramId}: ${err}`, "telegram");
    return false;
  }
}
