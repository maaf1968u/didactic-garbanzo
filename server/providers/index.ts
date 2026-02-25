import type { CloudPhoneProvider, ScreenshotResult } from "./types";
import { GeeLarkProvider } from "./geelark";
import { DuoPlusProvider } from "./duoplus";
import { VMOSProvider } from "./vmos";
import { DHL_PAKET_PACKAGE } from "./types";
import { log } from "../index";

const providers: Map<string, CloudPhoneProvider> = new Map();

export function initProviders() {
  if (process.env.GEELARK_API_TOKEN) {
    providers.set("GeeLark", new GeeLarkProvider());
    log("GeeLark provider initialized", "providers");
  }

  if (process.env.DUOPLUS_API_KEY) {
    providers.set("DuoPlus", new DuoPlusProvider());
    log("DuoPlus provider initialized", "providers");
  }

  if (process.env.VMOS_ACCESS_KEY && process.env.VMOS_SECRET_KEY) {
    providers.set("VMOS Cloud", new VMOSProvider());
    log("VMOS Cloud provider initialized", "providers");
  }

  log(`${providers.size} cloud phone provider(s) active`, "providers");
}

export function getProvider(providerName: string): CloudPhoneProvider | undefined {
  return providers.get(providerName);
}

export function getAllProviders(): Map<string, CloudPhoneProvider> {
  return providers;
}

async function ensureDeviceOnline(provider: CloudPhoneProvider, deviceId: string): Promise<ScreenshotResult | null> {
  const status = await provider.getDeviceStatus(deviceId);
  log(`Device ${deviceId} status: ${JSON.stringify(status)}`, "providers");
  if (!status.online) {
    log(`Device ${deviceId} is offline, attempting to start...`, "providers");
    const started = await provider.startDevice(deviceId);
    if (!started) {
      return { success: false, error: "Device is offline and could not be started. Please power on the device manually from your provider console first." };
    }
    log(`Waiting 15s for device ${deviceId} to boot...`, "providers");
    await new Promise(resolve => setTimeout(resolve, 15000));

    const recheckStatus = await provider.getDeviceStatus(deviceId);
    if (!recheckStatus.online) {
      return { success: false, error: "Device was started but is not online yet. Please wait a moment and try again." };
    }
  }
  return null;
}

export async function captureQrCode(providerName: string, deviceId: string): Promise<ScreenshotResult> {
  const provider = providers.get(providerName);
  if (!provider) {
    return { success: false, error: `Provider "${providerName}" not found or not configured` };
  }

  try {
    log(`Starting QR code capture on ${providerName} device ${deviceId}`, "providers");

    const offlineError = await ensureDeviceOnline(provider, deviceId);
    if (offlineError) return offlineError;

    log(`Launching DHL Paket app on ${deviceId}...`, "providers");
    const launched = await provider.launchApp(deviceId, DHL_PAKET_PACKAGE);
    if (!launched) {
      return { success: false, error: "Failed to launch DHL Paket app" };
    }

    await new Promise(resolve => setTimeout(resolve, 5000));

    log(`Taking screenshot on ${deviceId}...`, "providers");
    const screenshot = await provider.takeScreenshot(deviceId);

    if (screenshot.success) {
      log(`QR code captured successfully from ${providerName} device ${deviceId}`, "providers");
    } else {
      log(`Screenshot failed on ${deviceId}: ${screenshot.error}`, "providers");
    }

    return screenshot;
  } catch (err: any) {
    log(`QR code capture failed: ${err.message}`, "providers");
    return { success: false, error: err.message };
  }
}

export async function captureQrCodeForTracking(providerName: string, deviceId: string, trackingNumber: string): Promise<ScreenshotResult> {
  const provider = providers.get(providerName);
  if (!provider) {
    return { success: false, error: `Provider "${providerName}" not found or not configured` };
  }

  try {
    log(`Starting QR code capture for tracking ${trackingNumber} on ${providerName} device ${deviceId}`, "providers");

    const offlineError = await ensureDeviceOnline(provider, deviceId);
    if (offlineError) return offlineError;

    log(`Launching DHL Paket app on ${deviceId}...`, "providers");
    const launched = await provider.launchApp(deviceId, DHL_PAKET_PACKAGE);
    if (!launched) {
      return { success: false, error: "Failed to launch DHL Paket app" };
    }

    await new Promise(resolve => setTimeout(resolve, 5000));

    log(`Navigating to tracking tab on ${deviceId}...`, "providers");
    await provider.executeCommand(deviceId, "input tap 70 1850");
    await new Promise(resolve => setTimeout(resolve, 2000));

    log(`Tapping search/tracking input on ${deviceId}...`, "providers");
    await provider.executeCommand(deviceId, "input tap 540 300");
    await new Promise(resolve => setTimeout(resolve, 1000));

    await provider.executeCommand(deviceId, "input text ''");
    await new Promise(resolve => setTimeout(resolve, 500));

    log(`Entering tracking number ${trackingNumber} on ${deviceId}...`, "providers");
    await provider.executeCommand(deviceId, `input text '${trackingNumber}'`);
    await new Promise(resolve => setTimeout(resolve, 1000));

    await provider.executeCommand(deviceId, "input keyevent 66");
    await new Promise(resolve => setTimeout(resolve, 3000));

    log(`Tapping on tracking result on ${deviceId}...`, "providers");
    await provider.executeCommand(deviceId, "input tap 540 500");
    await new Promise(resolve => setTimeout(resolve, 3000));

    log(`Taking screenshot of QR code for tracking ${trackingNumber} on ${deviceId}...`, "providers");
    const screenshot = await provider.takeScreenshot(deviceId);

    if (screenshot.success) {
      log(`QR code captured for tracking ${trackingNumber} from ${providerName} device ${deviceId}`, "providers");
    } else {
      log(`Screenshot failed on ${deviceId}: ${screenshot.error}`, "providers");
    }

    return screenshot;
  } catch (err: any) {
    log(`QR code capture for tracking failed: ${err.message}`, "providers");
    return { success: false, error: err.message };
  }
}

export async function syncDevicesFromProvider(providerName: string): Promise<{ devices: import("./types").ProviderDevice[]; error?: string }> {
  const provider = providers.get(providerName);
  if (!provider) {
    return { devices: [], error: `Provider "${providerName}" not found` };
  }

  try {
    const devices = await provider.listDevices();
    log(`Synced ${devices.length} devices from ${providerName}`, "providers");
    return { devices };
  } catch (err: any) {
    return { devices: [], error: err.message };
  }
}

export async function testProvider(providerName: string): Promise<{ success: boolean; message: string; devices?: number }> {
  const provider = providers.get(providerName);
  if (!provider) {
    return { success: false, message: `Provider "${providerName}" not configured. Missing API key.` };
  }

  try {
    const devices = await provider.listDevices();
    return {
      success: true,
      message: `Connected to ${providerName}. Found ${devices.length} device(s).`,
      devices: devices.length,
    };
  } catch (err: any) {
    return { success: false, message: `Connection failed: ${err.message}` };
  }
}
