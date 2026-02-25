export interface CloudPhoneProvider {
  name: string;
  listDevices(): Promise<ProviderDevice[]>;
  getDeviceStatus(deviceId: string): Promise<DeviceStatus>;
  startDevice(deviceId: string): Promise<boolean>;
  stopDevice(deviceId: string): Promise<boolean>;
  launchApp(deviceId: string, packageName: string): Promise<boolean>;
  takeScreenshot(deviceId: string): Promise<ScreenshotResult>;
  executeCommand(deviceId: string, command: string): Promise<CommandResult>;
}

export interface ProviderDevice {
  id: string;
  name: string;
  status: "online" | "offline" | "starting" | "stopping" | "unknown";
  os?: string;
  ip?: string;
}

export interface DeviceStatus {
  online: boolean;
  status: string;
  details?: Record<string, unknown>;
}

export interface ScreenshotResult {
  success: boolean;
  imageData?: Buffer;
  imageUrl?: string;
  error?: string;
}

export interface CommandResult {
  success: boolean;
  output?: string;
  error?: string;
}

export const DHL_PAKET_PACKAGE = "de.dhl.paket";
