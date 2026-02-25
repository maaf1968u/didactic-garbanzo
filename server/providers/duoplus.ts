import type { CloudPhoneProvider, ProviderDevice, DeviceStatus, ScreenshotResult, CommandResult } from "./types";
import { log } from "../index";

const BASE_URL = "https://openapi.duoplus.net";

export class DuoPlusProvider implements CloudPhoneProvider {
  name = "DuoPlus";
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.DUOPLUS_API_KEY || "";
    if (!this.apiKey) {
      log("DUOPLUS_API_KEY not set", "duoplus");
    }
  }

  private get headers() {
    return {
      "DuoPlus-API-Key": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  private async request(path: string, body?: unknown): Promise<any> {
    const url = `${BASE_URL}${path}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: this.headers,
        body: body ? JSON.stringify(body) : JSON.stringify({}),
      });

      if (!res.ok) {
        const text = await res.text();
        log(`DuoPlus API error ${res.status}: ${text}`, "duoplus");
        throw new Error(`DuoPlus API error: ${res.status} ${text}`);
      }

      const data = await res.json();
      if (data.code !== 200) {
        log(`DuoPlus API response code ${data.code}: ${data.message}`, "duoplus");
        throw new Error(`DuoPlus error: ${data.message}`);
      }
      return data.data;
    } catch (err: any) {
      log(`DuoPlus request failed: ${err.message}`, "duoplus");
      throw err;
    }
  }

  async listDevices(): Promise<ProviderDevice[]> {
    try {
      const data = await this.request("/api/v1/cloudPhone/list", { page: 1, pagesize: 100 });
      const devices = data?.list || [];
      return devices.map((d: any) => ({
        id: d.id,
        name: d.name || `DuoPlus-${d.id}`,
        status: this.mapStatus(d.status),
        os: d.os,
        ip: d.ip,
      }));
    } catch (err) {
      log(`Failed to list DuoPlus devices: ${err}`, "duoplus");
      return [];
    }
  }

  async getDeviceStatus(deviceId: string): Promise<DeviceStatus> {
    try {
      const devices = await this.listDevices();
      const device = devices.find(d => d.id === deviceId);
      if (!device) {
        return { online: false, status: "not_found" };
      }
      return {
        online: device.status === "online",
        status: device.status,
      };
    } catch (err) {
      return { online: false, status: "error", details: { error: String(err) } };
    }
  }

  async startDevice(deviceId: string): Promise<boolean> {
    const endpoints = [
      { path: "/api/v1/cloudPhone/batchPowerOn", body: { image_ids: [deviceId] } },
      { path: "/api/v1/cloudPhone/powerOn", body: { image_ids: [deviceId] } },
      { path: "/api/v1/cloudPhone/powerOn", body: { ids: [deviceId] } },
      { path: "/api/v1/cloudPhone/powerOn", body: { cloud_phone_ids: [deviceId] } },
    ];

    for (const ep of endpoints) {
      try {
        await this.request(ep.path, ep.body);
        log(`DuoPlus device ${deviceId} power on requested via ${ep.path}`, "duoplus");
        return true;
      } catch (err: any) {
        log(`Power on attempt ${ep.path} failed: ${err.message}`, "duoplus");
        if (err.message.includes("permission")) continue;
        if (err.message.includes("required")) continue;
        return false;
      }
    }

    log(`All power on attempts failed for DuoPlus device ${deviceId}`, "duoplus");
    return false;
  }

  async stopDevice(deviceId: string): Promise<boolean> {
    try {
      await this.request("/api/v1/cloudPhone/batchPowerOff", { image_ids: [deviceId] });
      log(`DuoPlus device ${deviceId} power off requested`, "duoplus");
      return true;
    } catch (err) {
      log(`Failed to stop DuoPlus device ${deviceId}: ${err}`, "duoplus");
      return false;
    }
  }

  async launchApp(deviceId: string, packageName: string): Promise<boolean> {
    try {
      const result = await this.executeCommand(deviceId, `monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`);
      if (result.success) {
        log(`Launched ${packageName} on DuoPlus device ${deviceId}`, "duoplus");
        return true;
      }
      log(`Launch command returned: ${result.output || result.error}`, "duoplus");
      return true;
    } catch (err) {
      log(`Failed to launch app on DuoPlus device ${deviceId}: ${err}`, "duoplus");
      return false;
    }
  }

  async takeScreenshot(deviceId: string): Promise<ScreenshotResult> {
    try {
      const screenshotPath = `/sdcard/screenshot_${Date.now()}.png`;

      const capResult = await this.executeCommand(deviceId, `screencap -p ${screenshotPath}`);
      log(`Screencap result: ${JSON.stringify(capResult)}`, "duoplus");

      await new Promise(resolve => setTimeout(resolve, 2000));

      const b64Result = await this.executeCommand(deviceId, `cat ${screenshotPath} | base64 -w 0`);
      log(`Base64 result length: ${b64Result.output?.length || 0}`, "duoplus");

      if (b64Result.success && b64Result.output && b64Result.output.length > 100) {
        const cleaned = b64Result.output.replace(/[\r\n\s]/g, "");
        const imageData = Buffer.from(cleaned, "base64");

        this.executeCommand(deviceId, `rm ${screenshotPath}`).catch(() => {});

        log(`Screenshot captured, image size: ${imageData.length} bytes`, "duoplus");
        return { success: true, imageData };
      }

      log(`Screenshot data insufficient. Output preview: ${(b64Result.output || "").substring(0, 200)}`, "duoplus");
      return { success: false, error: "Could not retrieve screenshot data" };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async executeCommand(deviceId: string, command: string): Promise<CommandResult> {
    try {
      const data = await this.request("/api/v1/cloudPhone/command", {
        image_id: deviceId,
        command,
      });

      log(`ADB command response for "${command.substring(0, 50)}": ${JSON.stringify(data).substring(0, 500)}`, "duoplus");

      if (data && typeof data === "object") {
        if (deviceId in data) {
          const deviceResult = data[deviceId];
          return { success: true, output: deviceResult?.content || deviceResult?.output || "" };
        }

        if (data.content !== undefined) {
          return { success: true, output: data.content };
        }
        if (data.output !== undefined) {
          return { success: true, output: data.output };
        }
        if (data.result !== undefined) {
          return { success: true, output: typeof data.result === "string" ? data.result : JSON.stringify(data.result) };
        }
      }

      return { success: true, output: typeof data === "string" ? data : JSON.stringify(data) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  private mapStatus(status: number): ProviderDevice["status"] {
    switch (status) {
      case 1:
        return "online";
      case 2:
        return "offline";
      case 0:
      case 3:
      case 4:
        return "offline";
      case 10:
      case 11:
        return "starting";
      default:
        return "unknown";
    }
  }
}
