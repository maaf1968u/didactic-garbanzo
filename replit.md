# DHL QR Code Cloud Phone Rental Service

## Overview
A web application with a Telegram bot backend that allows customers to rent temporary access to cloud phone devices (GeeLark, DuoPlus, VMOS Cloud) where the DHL Paket Android app is installed. Customers subscribe via the Telegram bot with crypto payments, receive a dedicated DHL Packstation account (Name + Postnummer), order packages to that Packstation, then submit a tracking number to the bot which navigates the DHL Paket app on the assigned cloud phone and delivers a pickup QR code screenshot.

## Architecture
- **Frontend**: React SPA with admin dashboard (Vite + TypeScript + Tailwind CSS + shadcn/ui)
- **Backend**: Express.js API server with Telegram bot integration
- **Database**: PostgreSQL with Drizzle ORM
- **Bot**: node-telegram-bot-api with polling mode
- **Cloud Phone Providers**: Unified provider interface with GeeLark, DuoPlus, and VMOS Cloud implementations
- **Payments**: Crypto payments via CryptoBot (BTC, USDT, TON, LTC, ETH)

## Key Components

### Backend
- `server/index.ts` - Express server entry point
- `server/routes.ts` - REST API endpoints for admin dashboard + provider management + subscription management
- `server/storage.ts` - Database storage layer (DatabaseStorage implementing IStorage interface)
- `server/db.ts` - PostgreSQL connection via Drizzle ORM
- `server/telegram-bot.ts` - Telegram bot with subscription flow, payment, tracking number input, QR code delivery
- `server/seed.ts` - Seed skipped; devices come from provider sync via dashboard
- `server/crypto-pay.ts` - CryptoBot invoice creation and webhook handling

### Cloud Phone Providers (`server/providers/`)
- `server/providers/types.ts` - Unified CloudPhoneProvider interface
- `server/providers/geelark.ts` - GeeLark API integration
- `server/providers/duoplus.ts` - DuoPlus API integration (ADB commands for app navigation and screenshots)
- `server/providers/vmos.ts` - VMOS Cloud API integration
- `server/providers/index.ts` - Provider manager: init, test, sync, `captureQrCode`, `captureQrCodeForTracking`

### Frontend (Admin Dashboard)
- `client/src/pages/dashboard.tsx` - Overview stats
- `client/src/pages/devices.tsx` - Cloud phone device management (CRUD with DHL Name, Postnummer, Email, Password)
- `client/src/pages/providers.tsx` - Provider API testing, device sync, screenshot testing
- `client/src/pages/subscriptions.tsx` - Subscription management
- `client/src/pages/customers.tsx` - Customer management
- `client/src/pages/sessions.tsx` - Session monitoring

### Database Schema
- `cloud_phones` - Device pool (name, provider, deviceId, status, dhlAccountEmail, dhlAccountPassword, dhlAccountName, postnummer)
- `customers` - Telegram users (telegramId, username, firstName, lastName, isBlocked, totalSessions)
- `rental_sessions` - Session tracking (customerId, phoneId, status, duration, timestamps)
- `qr_codes` - QR code tracking (sessionId, trackingNumber, status, imageUrl)
- `subscriptions` - Plans (customerId, plan, durationDays, priceEur, status, paymentMethod, cryptoAsset, cryptoAmount, cryptoInvoiceId, assignedPhoneId, timestamps)

### Customer Flow (Telegram Bot)
1. `/start` - Register and see welcome message
2. `/subscribe` - Select plan (1W €15, 2W €25, 1M €45), select crypto, pay via CryptoBot
3. On payment: subscription activated, cloud phone assigned, DHL Packstation details shared
4. `/account` - View assigned DHL Packstation details (Name + Postnummer)
5. `/request` - Enter tracking number → bot navigates DHL app on assigned phone → delivers QR code screenshot
6. `/status` - Check subscription status
7. `/help` - Show help

### QR Capture Flow (with tracking)
1. Customer sends `/request`, enters tracking number
2. System uses customer's assigned phone (or assigns one if missing)
3. `captureQrCodeForTracking()` navigates DHL app: opens tracking tab, enters tracking number, searches, taps result
4. Screenshot captured and sent to customer via Telegram

### Device Sync
- Sync endpoint (`POST /api/providers/:name/sync`) auto-creates new devices in DB
- No seeded placeholder devices; real device IDs come from provider sync
- Admin sets dhlAccountName and postnummer on devices via dashboard for customer use

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string
- `TELEGRAM_BOT_TOKEN` - Telegram Bot API token
- `CRYPTOBOT_API_TOKEN` - CryptoBot API token for crypto payments
- `GEELARK_API_TOKEN` - GeeLark Bearer token
- `DUOPLUS_API_KEY` - DuoPlus API key
- `VMOS_ACCESS_KEY` - VMOS Cloud Access Key ID
- `VMOS_SECRET_KEY` - VMOS Cloud Secret Access Key
- `SESSION_SECRET` - Express session secret

## Running
- `npm run dev` - Start development server (Express + Vite)
- `npm run db:push` - Push schema changes to database
