import {
  cloudPhones, customers, rentalSessions, qrCodes, subscriptions,
  type CloudPhone, type InsertCloudPhone,
  type Customer, type InsertCustomer,
  type RentalSession, type InsertRentalSession,
  type QrCode, type InsertQrCode,
  type Subscription, type InsertSubscription,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, gt } from "drizzle-orm";

export interface IStorage {
  getCloudPhones(): Promise<CloudPhone[]>;
  getCloudPhone(id: string): Promise<CloudPhone | undefined>;
  getAvailablePhone(): Promise<CloudPhone | undefined>;
  getAvailablePhones(): Promise<CloudPhone[]>;
  createCloudPhone(phone: InsertCloudPhone): Promise<CloudPhone>;
  updateCloudPhoneStatus(id: string, status: CloudPhone["status"]): Promise<CloudPhone | undefined>;
  updateCloudPhone(id: string, data: Partial<Pick<CloudPhone, "name" | "provider" | "deviceId" | "dhlAccountEmail" | "dhlAccountPassword" | "dhlAccountName" | "postnummer" | "status">>): Promise<CloudPhone | undefined>;
  deleteCloudPhone(id: string): Promise<boolean>;

  getCustomer(id: string): Promise<Customer | undefined>;
  getCustomerByTelegramId(telegramId: string): Promise<Customer | undefined>;
  getCustomers(): Promise<Customer[]>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomerBlocked(id: string, blocked: boolean): Promise<Customer | undefined>;
  incrementCustomerSessions(id: string): Promise<void>;

  getSessions(): Promise<RentalSession[]>;
  getSession(id: string): Promise<RentalSession | undefined>;
  getActiveSessionByCustomer(customerId: string): Promise<RentalSession | undefined>;
  createSession(session: InsertRentalSession): Promise<RentalSession>;
  updateSessionStatus(id: string, status: RentalSession["status"]): Promise<RentalSession | undefined>;
  startSession(id: string, phoneId: string, durationMinutes: number): Promise<RentalSession | undefined>;
  completeSession(id: string): Promise<RentalSession | undefined>;

  getQrCodes(): Promise<QrCode[]>;
  getQrCodesBySession(sessionId: string): Promise<QrCode[]>;
  createQrCode(qr: InsertQrCode): Promise<QrCode>;
  updateQrCodeStatus(id: string, status: QrCode["status"], imageUrl?: string): Promise<QrCode | undefined>;

  getSubscriptions(): Promise<Subscription[]>;
  getSubscription(id: string): Promise<Subscription | undefined>;
  getActiveSubscriptionByCustomer(customerId: string): Promise<Subscription | undefined>;
  getPendingSubscriptionByCustomer(customerId: string): Promise<Subscription | undefined>;
  createSubscription(sub: InsertSubscription): Promise<Subscription>;
  activateSubscription(id: string): Promise<Subscription | undefined>;
  updateSubscriptionStatus(id: string, status: Subscription["status"]): Promise<Subscription | undefined>;
  updateSubscriptionPayment(id: string, txId: string): Promise<Subscription | undefined>;

  getSubscriptionByInvoiceId(invoiceId: number): Promise<Subscription | undefined>;
  assignPhoneToSubscription(subscriptionId: string, phoneId: string): Promise<Subscription | undefined>;

  getStats(): Promise<{ totalDevices: number; activeDevices: number; totalCustomers: number; activeSessions: number; totalSessions: number; totalQrCodes: number; activeSubscriptions: number }>;
}

export class DatabaseStorage implements IStorage {
  async getCloudPhones(): Promise<CloudPhone[]> {
    return db.select().from(cloudPhones).orderBy(desc(cloudPhones.createdAt));
  }

  async getCloudPhone(id: string): Promise<CloudPhone | undefined> {
    const [phone] = await db.select().from(cloudPhones).where(eq(cloudPhones.id, id));
    return phone || undefined;
  }

  async getAvailablePhone(): Promise<CloudPhone | undefined> {
    const [phone] = await db.select().from(cloudPhones).where(eq(cloudPhones.status, "available")).limit(1);
    return phone || undefined;
  }

  async getAvailablePhones(): Promise<CloudPhone[]> {
    return db.select().from(cloudPhones).where(eq(cloudPhones.status, "available"));
  }

  async createCloudPhone(phone: InsertCloudPhone): Promise<CloudPhone> {
    const [created] = await db.insert(cloudPhones).values(phone).returning();
    return created;
  }

  async updateCloudPhoneStatus(id: string, status: CloudPhone["status"]): Promise<CloudPhone | undefined> {
    const [updated] = await db.update(cloudPhones).set({ status, lastUsed: new Date() }).where(eq(cloudPhones.id, id)).returning();
    return updated || undefined;
  }

  async updateCloudPhone(id: string, data: Partial<Pick<CloudPhone, "name" | "provider" | "deviceId" | "dhlAccountEmail" | "dhlAccountPassword" | "dhlAccountName" | "postnummer" | "status">>): Promise<CloudPhone | undefined> {
    const [updated] = await db.update(cloudPhones).set(data).where(eq(cloudPhones.id, id)).returning();
    return updated || undefined;
  }

  async deleteCloudPhone(id: string): Promise<boolean> {
    const result = await db.delete(cloudPhones).where(eq(cloudPhones.id, id));
    return true;
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer || undefined;
  }

  async getCustomerByTelegramId(telegramId: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.telegramId, telegramId));
    return customer || undefined;
  }

  async getCustomers(): Promise<Customer[]> {
    return db.select().from(customers).orderBy(desc(customers.createdAt));
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    const [created] = await db.insert(customers).values(customer).returning();
    return created;
  }

  async updateCustomerBlocked(id: string, blocked: boolean): Promise<Customer | undefined> {
    const [updated] = await db.update(customers).set({ isBlocked: blocked }).where(eq(customers.id, id)).returning();
    return updated || undefined;
  }

  async incrementCustomerSessions(id: string): Promise<void> {
    await db.update(customers).set({ totalSessions: sql`${customers.totalSessions} + 1` }).where(eq(customers.id, id));
  }

  async getSessions(): Promise<RentalSession[]> {
    return db.select().from(rentalSessions).orderBy(desc(rentalSessions.createdAt));
  }

  async getSession(id: string): Promise<RentalSession | undefined> {
    const [session] = await db.select().from(rentalSessions).where(eq(rentalSessions.id, id));
    return session || undefined;
  }

  async getActiveSessionByCustomer(customerId: string): Promise<RentalSession | undefined> {
    const [session] = await db.select().from(rentalSessions)
      .where(and(eq(rentalSessions.customerId, customerId), eq(rentalSessions.status, "active")))
      .limit(1);
    return session || undefined;
  }

  async createSession(session: InsertRentalSession): Promise<RentalSession> {
    const [created] = await db.insert(rentalSessions).values(session).returning();
    return created;
  }

  async updateSessionStatus(id: string, status: RentalSession["status"]): Promise<RentalSession | undefined> {
    const [updated] = await db.update(rentalSessions).set({ status }).where(eq(rentalSessions.id, id)).returning();
    return updated || undefined;
  }

  async startSession(id: string, phoneId: string, durationMinutes: number): Promise<RentalSession | undefined> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);
    const [updated] = await db.update(rentalSessions).set({
      status: "active",
      phoneId,
      startedAt: now,
      expiresAt,
    }).where(eq(rentalSessions.id, id)).returning();
    return updated || undefined;
  }

  async completeSession(id: string): Promise<RentalSession | undefined> {
    const [updated] = await db.update(rentalSessions).set({
      status: "completed",
      completedAt: new Date(),
    }).where(eq(rentalSessions.id, id)).returning();
    return updated || undefined;
  }

  async getQrCodes(): Promise<QrCode[]> {
    return db.select().from(qrCodes).orderBy(desc(qrCodes.createdAt));
  }

  async getQrCodesBySession(sessionId: string): Promise<QrCode[]> {
    return db.select().from(qrCodes).where(eq(qrCodes.sessionId, sessionId));
  }

  async createQrCode(qr: InsertQrCode): Promise<QrCode> {
    const [created] = await db.insert(qrCodes).values(qr).returning();
    return created;
  }

  async updateQrCodeStatus(id: string, status: QrCode["status"], imageUrl?: string): Promise<QrCode | undefined> {
    const updates: Partial<QrCode> = { status };
    if (status === "captured") updates.capturedAt = new Date();
    if (status === "delivered") updates.deliveredAt = new Date();
    if (imageUrl) updates.imageUrl = imageUrl;
    const [updated] = await db.update(qrCodes).set(updates).where(eq(qrCodes.id, id)).returning();
    return updated || undefined;
  }

  async getSubscriptions(): Promise<Subscription[]> {
    return db.select().from(subscriptions).orderBy(desc(subscriptions.createdAt));
  }

  async getSubscription(id: string): Promise<Subscription | undefined> {
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, id));
    return sub || undefined;
  }

  async getActiveSubscriptionByCustomer(customerId: string): Promise<Subscription | undefined> {
    const [sub] = await db.select().from(subscriptions)
      .where(and(
        eq(subscriptions.customerId, customerId),
        eq(subscriptions.status, "active"),
        gt(subscriptions.expiresAt, new Date()),
      ))
      .orderBy(desc(subscriptions.expiresAt))
      .limit(1);
    return sub || undefined;
  }

  async getPendingSubscriptionByCustomer(customerId: string): Promise<Subscription | undefined> {
    const [sub] = await db.select().from(subscriptions)
      .where(and(
        eq(subscriptions.customerId, customerId),
        eq(subscriptions.status, "pending_payment"),
      ))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    return sub || undefined;
  }

  async createSubscription(sub: InsertSubscription): Promise<Subscription> {
    const [created] = await db.insert(subscriptions).values(sub).returning();
    return created;
  }

  async activateSubscription(id: string): Promise<Subscription | undefined> {
    const sub = await this.getSubscription(id);
    if (!sub) return undefined;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + sub.durationDays * 24 * 60 * 60 * 1000);
    const [updated] = await db.update(subscriptions).set({
      status: "active",
      paidAt: now,
      startsAt: now,
      expiresAt,
    }).where(eq(subscriptions.id, id)).returning();
    return updated || undefined;
  }

  async updateSubscriptionStatus(id: string, status: Subscription["status"]): Promise<Subscription | undefined> {
    const [updated] = await db.update(subscriptions).set({ status }).where(eq(subscriptions.id, id)).returning();
    return updated || undefined;
  }

  async updateSubscriptionPayment(id: string, txId: string): Promise<Subscription | undefined> {
    const [updated] = await db.update(subscriptions).set({ paymentTxId: txId }).where(eq(subscriptions.id, id)).returning();
    return updated || undefined;
  }

  async getSubscriptionByInvoiceId(invoiceId: number): Promise<Subscription | undefined> {
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.cryptoBotInvoiceId, invoiceId));
    return sub || undefined;
  }

  async assignPhoneToSubscription(subscriptionId: string, phoneId: string): Promise<Subscription | undefined> {
    const [updated] = await db.update(subscriptions)
      .set({ assignedPhoneId: phoneId })
      .where(eq(subscriptions.id, subscriptionId))
      .returning();
    return updated || undefined;
  }

  async getStats() {
    const allPhones = await db.select().from(cloudPhones);
    const allCustomers = await db.select().from(customers);
    const allSessions = await db.select().from(rentalSessions);
    const allQrCodes = await db.select().from(qrCodes);
    const allSubs = await db.select().from(subscriptions);

    return {
      totalDevices: allPhones.length,
      activeDevices: allPhones.filter(p => p.status === "in_use").length,
      totalCustomers: allCustomers.length,
      activeSessions: allSessions.filter(s => s.status === "active").length,
      totalSessions: allSessions.length,
      totalQrCodes: allQrCodes.length,
      activeSubscriptions: allSubs.filter(s => s.status === "active" && s.expiresAt && new Date(s.expiresAt) > new Date()).length,
    };
  }
}

export const storage = new DatabaseStorage();
