import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { initTelegramBot, sendMessageToCustomer, handleCryptoPayWebhook } from "./telegram-bot";
import { initProviders, testProvider, syncDevicesFromProvider, getAllProviders, captureQrCode } from "./providers";
import { insertCloudPhoneSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  initProviders();
  initTelegramBot();

  app.get("/api/stats", async (_req, res) => {
    try {
      const stats = await storage.getStats();
      res.json(stats);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  app.get("/api/devices", async (_req, res) => {
    try {
      const devices = await storage.getCloudPhones();
      res.json(devices);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch devices" });
    }
  });

  app.post("/api/devices", async (req, res) => {
    try {
      const parsed = insertCloudPhoneSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid device data", errors: parsed.error.flatten() });
      }
      const device = await storage.createCloudPhone(parsed.data);
      res.status(201).json(device);
    } catch (err) {
      res.status(500).json({ message: "Failed to create device" });
    }
  });

  app.patch("/api/devices/:id/status", async (req, res) => {
    try {
      const { status } = req.body;
      if (!["available", "in_use", "maintenance", "offline"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const device = await storage.updateCloudPhoneStatus(req.params.id, status);
      if (!device) return res.status(404).json({ message: "Device not found" });
      res.json(device);
    } catch (err) {
      res.status(500).json({ message: "Failed to update device" });
    }
  });

  app.patch("/api/devices/:id", async (req, res) => {
    try {
      const { name, provider, deviceId, dhlAccountEmail, dhlAccountPassword, dhlAccountName, postnummer, status } = req.body;
      const data: Record<string, any> = {};
      if (name !== undefined) data.name = name;
      if (provider !== undefined) data.provider = provider;
      if (deviceId !== undefined) data.deviceId = deviceId;
      if (dhlAccountEmail !== undefined) data.dhlAccountEmail = dhlAccountEmail;
      if (dhlAccountPassword !== undefined) data.dhlAccountPassword = dhlAccountPassword;
      if (dhlAccountName !== undefined) data.dhlAccountName = dhlAccountName;
      if (postnummer !== undefined) data.postnummer = postnummer;
      if (status !== undefined) data.status = status;

      const device = await storage.updateCloudPhone(req.params.id, data);
      if (!device) return res.status(404).json({ message: "Device not found" });
      res.json(device);
    } catch (err) {
      res.status(500).json({ message: "Failed to update device" });
    }
  });

  app.delete("/api/devices/:id", async (req, res) => {
    try {
      await storage.deleteCloudPhone(req.params.id);
      res.json({ message: "Device deleted" });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete device" });
    }
  });

  app.get("/api/customers", async (_req, res) => {
    try {
      const customers = await storage.getCustomers();
      res.json(customers);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch customers" });
    }
  });

  app.patch("/api/customers/:id/block", async (req, res) => {
    try {
      const { blocked } = req.body;
      const customer = await storage.updateCustomerBlocked(req.params.id, blocked);
      if (!customer) return res.status(404).json({ message: "Customer not found" });
      res.json(customer);
    } catch (err) {
      res.status(500).json({ message: "Failed to update customer" });
    }
  });

  app.get("/api/sessions", async (_req, res) => {
    try {
      const sessions = await storage.getSessions();
      res.json(sessions);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch sessions" });
    }
  });

  app.patch("/api/sessions/:id/cancel", async (req, res) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) return res.status(404).json({ message: "Session not found" });

      await storage.updateSessionStatus(session.id, "cancelled");
      if (session.phoneId) {
        await storage.updateCloudPhoneStatus(session.phoneId, "available");
      }

      const customer = await storage.getCustomer(session.customerId);
      if (customer) {
        await sendMessageToCustomer(customer.telegramId, "Your session has been cancelled by an administrator.");
      }

      res.json({ message: "Session cancelled" });
    } catch (err) {
      res.status(500).json({ message: "Failed to cancel session" });
    }
  });

  app.get("/api/subscriptions", async (_req, res) => {
    try {
      const subs = await storage.getSubscriptions();
      res.json(subs);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch subscriptions" });
    }
  });

  app.patch("/api/subscriptions/:id/activate", async (req, res) => {
    try {
      const sub = await storage.activateSubscription(req.params.id);
      if (!sub) return res.status(404).json({ message: "Subscription not found" });

      const customer = await storage.getCustomer(sub.customerId);
      if (customer) {
        const expiresAt = sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString() : "unknown";
        await sendMessageToCustomer(customer.telegramId,
          `Your subscription has been activated!\n\nPlan: ${sub.plan}\nExpires: ${expiresAt}\n\nYou can now use /request to get QR codes as many times as you need during your subscription period.`
        );
      }

      res.json(sub);
    } catch (err) {
      res.status(500).json({ message: "Failed to activate subscription" });
    }
  });

  app.patch("/api/subscriptions/:id/cancel", async (req, res) => {
    try {
      const sub = await storage.updateSubscriptionStatus(req.params.id, "cancelled");
      if (!sub) return res.status(404).json({ message: "Subscription not found" });

      const customer = await storage.getCustomer(sub.customerId);
      if (customer) {
        await sendMessageToCustomer(customer.telegramId, "Your subscription has been cancelled.");
      }

      res.json(sub);
    } catch (err) {
      res.status(500).json({ message: "Failed to cancel subscription" });
    }
  });

  app.get("/api/qrcodes", async (_req, res) => {
    try {
      const codes = await storage.getQrCodes();
      res.json(codes);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch QR codes" });
    }
  });

  app.get("/api/providers", async (_req, res) => {
    try {
      const providers = getAllProviders();
      const providerList = Array.from(providers.entries()).map(([name]) => ({
        name,
        configured: true,
      }));

      const allProviders = ["GeeLark", "DuoPlus", "VMOS Cloud"];
      const result = allProviders.map(name => ({
        name,
        configured: providerList.some(p => p.name === name),
      }));

      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch providers" });
    }
  });

  app.post("/api/providers/:name/test", async (req, res) => {
    try {
      const result = await testProvider(req.params.name);
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to test provider" });
    }
  });

  app.post("/api/providers/:name/sync", async (req, res) => {
    try {
      const providerName = req.params.name;
      const result = await syncDevicesFromProvider(providerName);

      const existingPhones = await storage.getCloudPhones();
      const providerPhones = existingPhones.filter(p => p.provider === providerName);

      for (const device of result.devices) {
        const existing = providerPhones.find(p => p.deviceId === device.id);
        if (!existing) {
          await storage.createCloudPhone({
            name: device.name,
            provider: providerName,
            deviceId: device.id,
            status: device.status === "online" ? "available" : "maintenance",
            dhlAccountEmail: null,
            dhlAccountPassword: null,
          });
        }
      }

      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to sync devices" });
    }
  });

  app.post("/api/providers/:name/command", async (req, res) => {
    try {
      const { deviceId, command } = req.body;
      if (!deviceId || !command) {
        return res.status(400).json({ message: "deviceId and command are required" });
      }
      const provider = getAllProviders().get(req.params.name);
      if (!provider) {
        return res.status(404).json({ message: "Provider not found" });
      }
      const result = await provider.executeCommand(deviceId, command);
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to execute command" });
    }
  });

  app.post("/api/providers/:name/screenshot", async (req, res) => {
    try {
      const { deviceId } = req.body;
      if (!deviceId) {
        return res.status(400).json({ message: "deviceId is required" });
      }
      const result = await captureQrCode(req.params.name, deviceId);
      if (result.imageData) {
        const fs = await import("fs");
        const path = await import("path");
        const filename = `screenshot_${req.params.name}_${deviceId}_${Date.now()}.png`;
        const filepath = path.join(process.cwd(), "screenshots", filename);
        fs.writeFileSync(filepath, result.imageData);
        res.json({ success: true, hasImage: true, imageSize: result.imageData.length, imageUrl: `/api/screenshots/${filename}` });
      } else {
        res.json({ success: result.success, imageUrl: result.imageUrl, error: result.error });
      }
    } catch (err) {
      res.status(500).json({ message: "Failed to capture screenshot" });
    }
  });

  app.get("/api/screenshots/:filename", async (req, res) => {
    try {
      const fs = await import("fs");
      const path = await import("path");
      const filepath = path.join(process.cwd(), "screenshots", req.params.filename);
      if (!fs.existsSync(filepath)) {
        return res.status(404).json({ message: "Screenshot not found" });
      }
      res.setHeader("Content-Type", "image/png");
      res.send(fs.readFileSync(filepath));
    } catch (err) {
      res.status(500).json({ message: "Failed to serve screenshot" });
    }
  });

  app.post("/api/cryptopay/webhook", async (req, res) => {
    try {
      const signature = req.headers["crypto-pay-api-signature"] as string;
      const rawBody = (req as any).rawBody?.toString("utf-8") || JSON.stringify(req.body);

      if (!signature) {
        return res.status(400).json({ message: "Missing signature header" });
      }

      const success = await handleCryptoPayWebhook(rawBody, signature);
      res.json({ ok: success });
    } catch (err) {
      res.status(500).json({ message: "Webhook processing failed" });
    }
  });

  return httpServer;
}
