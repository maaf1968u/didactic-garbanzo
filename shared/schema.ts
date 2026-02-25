import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, pgEnum, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const deviceStatusEnum = pgEnum("device_status", ["available", "in_use", "maintenance", "offline"]);
export const sessionStatusEnum = pgEnum("session_status", ["pending", "active", "completed", "expired", "cancelled"]);
export const qrStatusEnum = pgEnum("qr_status", ["pending", "captured", "delivered", "failed"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["pending_payment", "active", "expired", "cancelled"]);
export const paymentMethodEnum = pgEnum("payment_method", ["bitcoin", "usdt_trc20", "usdt_erc20", "litecoin", "other"]);

export const cloudPhones = pgTable("cloud_phones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  deviceId: text("device_id").notNull(),
  status: deviceStatusEnum("status").notNull().default("available"),
  dhlAccountEmail: text("dhl_account_email"),
  dhlAccountPassword: text("dhl_account_password"),
  dhlAccountName: text("dhl_account_name"),
  postnummer: text("postnummer"),
  lastUsed: timestamp("last_used"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  telegramId: text("telegram_id").notNull().unique(),
  telegramUsername: text("telegram_username"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  isBlocked: boolean("is_blocked").notNull().default(false),
  totalSessions: integer("total_sessions").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const rentalSessions = pgTable("rental_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  phoneId: varchar("phone_id").references(() => cloudPhones.id),
  status: sessionStatusEnum("status").notNull().default("pending"),
  durationMinutes: integer("duration_minutes").notNull().default(5),
  startedAt: timestamp("started_at"),
  expiresAt: timestamp("expires_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const qrCodes = pgTable("qr_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => rentalSessions.id),
  trackingNumber: text("tracking_number"),
  status: qrStatusEnum("status").notNull().default("pending"),
  imageUrl: text("image_url"),
  capturedAt: timestamp("captured_at"),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  assignedPhoneId: varchar("assigned_phone_id").references(() => cloudPhones.id),
  plan: text("plan").notNull(),
  durationDays: integer("duration_days").notNull(),
  priceEur: numeric("price_eur", { precision: 10, scale: 2 }).notNull(),
  status: subscriptionStatusEnum("status").notNull().default("pending_payment"),
  paymentMethod: paymentMethodEnum("payment_method"),
  paymentAddress: text("payment_address"),
  paymentTxId: text("payment_tx_id"),
  cryptoBotInvoiceId: integer("crypto_bot_invoice_id"),
  cryptoAsset: text("crypto_asset"),
  cryptoAmount: text("crypto_amount"),
  paidAt: timestamp("paid_at"),
  startsAt: timestamp("starts_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const cloudPhonesRelations = relations(cloudPhones, ({ many }) => ({
  sessions: many(rentalSessions),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  sessions: many(rentalSessions),
  subscriptions: many(subscriptions),
}));

export const rentalSessionsRelations = relations(rentalSessions, ({ one, many }) => ({
  customer: one(customers, { fields: [rentalSessions.customerId], references: [customers.id] }),
  phone: one(cloudPhones, { fields: [rentalSessions.phoneId], references: [cloudPhones.id] }),
  qrCodes: many(qrCodes),
}));

export const qrCodesRelations = relations(qrCodes, ({ one }) => ({
  session: one(rentalSessions, { fields: [qrCodes.sessionId], references: [rentalSessions.id] }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  customer: one(customers, { fields: [subscriptions.customerId], references: [customers.id] }),
  assignedPhone: one(cloudPhones, { fields: [subscriptions.assignedPhoneId], references: [cloudPhones.id] }),
}));

export const insertCloudPhoneSchema = createInsertSchema(cloudPhones).omit({ id: true, createdAt: true, lastUsed: true });
export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true, totalSessions: true });
export const insertRentalSessionSchema = createInsertSchema(rentalSessions).omit({ id: true, createdAt: true, startedAt: true, expiresAt: true, completedAt: true });
export const insertQrCodeSchema = createInsertSchema(qrCodes).omit({ id: true, createdAt: true, capturedAt: true, deliveredAt: true });
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true, createdAt: true, paidAt: true, startsAt: true, expiresAt: true });

export type CloudPhone = typeof cloudPhones.$inferSelect;
export type InsertCloudPhone = z.infer<typeof insertCloudPhoneSchema>;
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type RentalSession = typeof rentalSessions.$inferSelect;
export type InsertRentalSession = z.infer<typeof insertRentalSessionSchema>;
export type QrCode = typeof qrCodes.$inferSelect;
export type InsertQrCode = z.infer<typeof insertQrCodeSchema>;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;

export const RENTAL_PLANS = [
  { id: "1week", label: "1 Week", days: 7, priceEur: 15 },
  { id: "2weeks", label: "2 Weeks", days: 14, priceEur: 25 },
  { id: "1month", label: "1 Month", days: 30, priceEur: 45 },
] as const;
