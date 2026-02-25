import type { CloudPhoneProvider, ProviderDevice, DeviceStatus, ScreenshotResult, CommandResult } from "./types";
import { log } from "../index";

const BASE_URL = "https://api.geelark.com";

export class GeeLarkProvider implements CloudPhoneProvider {
  name = "GeeLark";
  private token: string;

  constructor() {
    this.token = process.env.GEELARK_API_TOKEN || "";
    if (!this.token) {
      log("GEELARK_API_TOKEN not set", "geelark");
    }
  }

  private get headers() {
    return {
      "Authorization": `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };
  }

  private async request(method: string, path: string, body?: unknown): Promise<any> {
    const url = `${BASE_URL}${path}`;
    try {
      const res = await fetch(url, {
        method,
        headers: this.headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        const text = await res.text();
        log(`GeeLark API error ${res.status}: ${text}`, "geelark");
        throw new Error(`GeeLark API error: ${res.status} ${text}`);
      }

      const contentType = res.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        return await res.json();
      }
      return await res.arrayBuffer();
    } catch (err: any) {
      log(`GeeLark request failed: ${err.message}`, "geelark");
      throw err;
    }
  }

  async listDevices(): Promise<ProviderDevice[]> {
    try {
      const data = await this.request("GET", "/devices");
      const devices = Array.isArray(data) ? data : (data?.devices || data?.data || []);
      return devices.map((d: any) => ({
        id: d.id || d.device_id,
        name: d.name || d.profile_name || `GeeLark-${d.id}`,
        status: this.mapStatus(d.status),
        os: d.os || d.android_version,
        ip: d.ip,
      }));
    } catch (err) {
      log(`Failed to list GeeLark devices: ${err}`, "geelark");
      return [];
    }
  }

  async getDeviceStatus(deviceId: string): Promise<DeviceStatus> {
    try {
      const data = await this.request("GET", `/devices/${deviceId}`);
      return {
        online: data?.status === "running" || data?.status === "online",
        status: data?.status || "unknown",
        details: data,
      };
    } catch (err) {
      return { online: false, status: "error", details: { error: String(err) } };
    }
  }

  async startDevice(deviceId: string): Promise<boolean> {
    try {
      await this.request("POST", `/devices/${deviceId}/start`);
      log(`GeeLark device ${deviceId} started`, "geelark");
      return true;
    } catch (err) {
      log(`Failed to start GeeLark device ${deviceId}: ${err}`, "geelark");
      return false;
    }
  }

  async stopDevice(deviceId: string): Promise<boolean> {
    try {
      await this.request("POST", `/devices/${deviceId}/stop`);
      log(`GeeLark device ${deviceId} stopped`, "geelark");
      return true;
    } catch (err) {
      log(`Failed to stop GeeLark device ${deviceId}: ${err}`, "geelark");
      return false;
    }
  }

  async launchApp(deviceId: string, packageName: string): Promise<boolean> {
    try {
      await this.request("POST", `/devices/${deviceId}/launch-app`, { package_name: packageName });
      log(`Launched ${packageName} on GeeLark device ${deviceId}`, "geelark");
      return true;
    } catch (err) {
      log(`Failed to launch app on GeeLark device ${deviceId}: ${err}`, "geelark");
      return false;
    }
  }

  async takeScreenshot(deviceId: string): Promise<ScreenshotResult> {
    try {
      const data = await this.request("GET", `/devices/${deviceId}/screenshot`);
      if (data instanceof ArrayBuffer) {
        return { success: true, imageData: Buffer.from(data) };
      }
      if (data?.url || data?.image_url) {
        return { success: true, imageUrl: data.url || data.image_url };
      }
      return { success: false, error: "Unexpected response format" };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async executeCommand(deviceId: string, command: string): Promise<CommandResult> {
    try {
      const data = await this.request("POST", `/devices/${deviceId}/command`, { command });
      return { success: true, output: data?.output || JSON.stringify(data) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  private mapStatus(status: string): ProviderDevice["status"] {
    switch (status?.toLowerCase()) {
      case "running":
      case "online":
      case "on":
        return "online";
      case "stopped":
      case "offline":
      case "off":
        return "offline";
      case "starting":
      case "booting":
        return "starting";
      case "stopping":
        return "stopping";
      default:
        return "unknown";
    }
  }
}
