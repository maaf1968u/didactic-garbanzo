import type { CloudPhoneProvider, ProviderDevice, DeviceStatus, ScreenshotResult, CommandResult } from "./types";
import { log } from "../index";

const BASE_URL = "https://openapi-hk.armcloud.net";

export class VMOSProvider implements CloudPhoneProvider {
  name = "VMOS Cloud";
  private accessKey: string;
  private secretKey: string;
  private stsToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.accessKey = process.env.VMOS_ACCESS_KEY || "";
    this.secretKey = process.env.VMOS_SECRET_KEY || "";
    if (!this.accessKey || !this.secretKey) {
      log("VMOS_ACCESS_KEY or VMOS_SECRET_KEY not set", "vmos");
    }
  }

  private async ensureToken(): Promise<string> {
    if (this.stsToken && Date.now() < this.tokenExpiry) {
      return this.stsToken;
    }

    try {
      const res = await fetch(`${BASE_URL}/openapi/open/token/stsToken`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessKey: this.accessKey,
          secretKey: this.secretKey,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Token request failed: ${res.status} ${text}`);
      }

      const data = await res.json();
      if (data.code !== 200) {
        throw new Error(`Token error: ${data.msg}`);
      }

      this.stsToken = data.data?.token || data.data;
      this.tokenExpiry = Date.now() + 55 * 60 * 1000;
      log("VMOS STS token refreshed", "vmos");
      return this.stsToken!;
    } catch (err: any) {
      log(`VMOS token refresh failed: ${err.message}`, "vmos");
      throw err;
    }
  }

  private async request(method: string, path: string, body?: unknown): Promise<any> {
    const token = await this.ensureToken();
    const url = `${BASE_URL}${path}`;

    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        const text = await res.text();
        log(`VMOS API error ${res.status}: ${text}`, "vmos");
        throw new Error(`VMOS API error: ${res.status} ${text}`);
      }

      const data = await res.json();
      if (data.code !== 200) {
        log(`VMOS response code ${data.code}: ${data.msg}`, "vmos");
        throw new Error(`VMOS error: ${data.msg}`);
      }
      return data.data;
    } catch (err: any) {
      log(`VMOS request failed: ${err.message}`, "vmos");
      throw err;
    }
  }

  async listDevices(): Promise<ProviderDevice[]> {
    try {
      const data = await this.request("POST", "/openapi/open/instance/list", { page: 1, size: 100 });
      const devices = data?.list || data?.records || [];
      return devices.map((d: any) => ({
        id: d.padCode || d.id,
        name: d.padName || d.name || `VMOS-${d.padCode || d.id}`,
        status: this.mapStatus(d.padStatus ?? d.status),
        os: d.androidVersion || d.os,
        ip: d.deviceIp || d.padIp,
      }));
    } catch (err) {
      log(`Failed to list VMOS devices: ${err}`, "vmos");
      return [];
    }
  }

  async getDeviceStatus(deviceId: string): Promise<DeviceStatus> {
    try {
      const data = await this.request("POST", "/openapi/open/instance/detail", { padCode: deviceId });
      return {
        online: data?.padStatus === 10 || data?.status === "online",
        status: String(data?.padStatus ?? data?.status ?? "unknown"),
        details: data,
      };
    } catch (err) {
      return { online: false, status: "error", details: { error: String(err) } };
    }
  }

  async startDevice(deviceId: string): Promise<boolean> {
    try {
      await this.request("POST", "/openapi/open/instance/start", { padCodes: [deviceId] });
      log(`VMOS instance ${deviceId} start requested`, "vmos");
      return true;
    } catch (err) {
      log(`Failed to start VMOS instance ${deviceId}: ${err}`, "vmos");
      return false;
    }
  }

  async stopDevice(deviceId: string): Promise<boolean> {
    try {
      await this.request("POST", "/openapi/open/instance/stop", { padCodes: [deviceId] });
      log(`VMOS instance ${deviceId} stop requested`, "vmos");
      return true;
    } catch (err) {
      log(`Failed to stop VMOS instance ${deviceId}: ${err}`, "vmos");
      return false;
    }
  }

  async launchApp(deviceId: string, packageName: string): Promise<boolean> {
    try {
      await this.request("POST", "/openapi/open/instance/app/start", {
        padCode: deviceId,
        packageName,
      });
      log(`Launched ${packageName} on VMOS instance ${deviceId}`, "vmos");
      return true;
    } catch (err) {
      log(`Failed to launch app on VMOS instance ${deviceId}: ${err}`, "vmos");
      return false;
    }
  }

  async takeScreenshot(deviceId: string): Promise<ScreenshotResult> {
    try {
      const data = await this.request("POST", "/openapi/open/instance/screenshot", {
        padCodes: [deviceId],
        rotation: 0,
        broadcast: false,
        definition: 80,
        resolutionHeight: 1920,
        resolutionWidth: 1080,
      });

      const result = Array.isArray(data) ? data[0] : data;

      if (result?.imageUrl || result?.url) {
        const imageUrl = result.imageUrl || result.url;
        try {
          const imgRes = await fetch(imageUrl);
          if (imgRes.ok) {
            const buffer = Buffer.from(await imgRes.arrayBuffer());
            return { success: true, imageData: buffer, imageUrl };
          }
        } catch {
          return { success: true, imageUrl };
        }
      }

      if (result?.taskId) {
        return { success: true, imageUrl: `pending:taskId=${result.taskId}` };
      }

      return { success: false, error: "No screenshot data returned" };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async executeCommand(deviceId: string, command: string): Promise<CommandResult> {
    try {
      const data = await this.request("POST", "/openapi/open/instance/adb/command", {
        padCode: deviceId,
        command,
      });
      return { success: true, output: data?.output || JSON.stringify(data) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  private mapStatus(status: number | string): ProviderDevice["status"] {
    if (typeof status === "number") {
      switch (status) {
        case 10:
          return "online";
        case 20:
        case 0:
          return "offline";
        case 5:
          return "starting";
        case 15:
          return "stopping";
        default:
          return "unknown";
      }
    }
    return "unknown";
  }
}
