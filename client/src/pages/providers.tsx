import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Cloud, TestTube, RefreshCw, Camera, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useState } from "react";

interface Provider {
  name: string;
  configured: boolean;
}

interface TestResult {
  success: boolean;
  message: string;
  devices?: number;
}

interface SyncResult {
  devices: Array<{ id: string; name: string; status: string; os?: string; ip?: string }>;
  error?: string;
}

const providerInfo: Record<string, { url: string; description: string; authType: string }> = {
  GeeLark: {
    url: "geelark.com",
    description: "Antidetect cloud phone platform with profile management",
    authType: "Bearer Token (GEELARK_API_TOKEN)",
  },
  DuoPlus: {
    url: "duoplus.net",
    description: "Cloud phone for multi-account management with ADB support",
    authType: "API Key Header (DUOPLUS_API_KEY)",
  },
  "VMOS Cloud": {
    url: "vmoscloud.com",
    description: "Virtualized Android cloud phone platform with PaaS API",
    authType: "Access Key + Secret Key (VMOS_ACCESS_KEY, VMOS_SECRET_KEY)",
  },
};

export default function Providers() {
  const { toast } = useToast();
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [syncResults, setSyncResults] = useState<Record<string, SyncResult>>({});
  const [screenshotDeviceId, setScreenshotDeviceId] = useState<Record<string, string>>({});
  const [screenshotImages, setScreenshotImages] = useState<Record<string, string>>({});

  const { data: providers, isLoading } = useQuery<Provider[]>({
    queryKey: ["/api/providers"],
  });

  const testMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", `/api/providers/${name}/test`, {});
      return { name, result: await res.json() as TestResult };
    },
    onSuccess: ({ name, result }) => {
      setTestResults(prev => ({ ...prev, [name]: result }));
      toast({
        title: result.success ? "Connection successful" : "Connection failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    },
    onError: (_, name) => {
      setTestResults(prev => ({ ...prev, [name]: { success: false, message: "Request failed" } }));
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", `/api/providers/${name}/sync`, {});
      return { name, result: await res.json() as SyncResult };
    },
    onSuccess: ({ name, result }) => {
      setSyncResults(prev => ({ ...prev, [name]: result }));
      if (result.error) {
        toast({ title: "Sync failed", description: result.error, variant: "destructive" });
      } else {
        toast({ title: "Sync complete", description: `Found ${result.devices.length} device(s) from ${name}` });
      }
    },
  });

  const screenshotMutation = useMutation({
    mutationFn: async ({ name, deviceId }: { name: string; deviceId: string }) => {
      const res = await apiRequest("POST", `/api/providers/${name}/screenshot`, { deviceId });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success && data.imageUrl) {
        const providerName = screenshotMutation.variables?.name || "";
        setScreenshotImages(prev => ({ ...prev, [providerName]: data.imageUrl }));
        toast({ title: "Screenshot captured", description: `Image saved (${data.imageSize} bytes)` });
      } else {
        toast({ title: "Screenshot failed", description: data.error, variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Screenshot request failed", variant: "destructive" });
    },
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-providers-title">Cloud Phone Providers</h1>
        <p className="text-muted-foreground mt-1">Test and manage API connections to cloud phone services</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6 space-y-4">
                <div className="h-6 w-32 bg-muted rounded animate-pulse" />
                <div className="h-4 w-48 bg-muted rounded animate-pulse" />
                <div className="h-10 w-full bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {providers?.map((provider) => {
            const info = providerInfo[provider.name];
            const test = testResults[provider.name];
            const sync = syncResults[provider.name];
            const deviceId = screenshotDeviceId[provider.name] || "";

            return (
              <Card key={provider.name} data-testid={`card-provider-${provider.name}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base font-medium flex items-center gap-2">
                      <Cloud className="h-4 w-4 text-primary" />
                      {provider.name}
                    </CardTitle>
                    <Badge variant={provider.configured ? "default" : "outline"} data-testid={`badge-provider-status-${provider.name}`}>
                      {provider.configured ? "Configured" : "Not Configured"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {info && (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">{info.description}</p>
                      <p className="text-xs text-muted-foreground">Auth: {info.authType}</p>
                      <p className="text-xs text-muted-foreground">URL: {info.url}</p>
                    </div>
                  )}

                  {test && (
                    <div className={`flex items-start gap-2 p-3 rounded-md text-sm ${test.success ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-destructive/10 text-destructive"}`} data-testid={`text-test-result-${provider.name}`}>
                      {test.success ? <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                      <span className="break-words">{test.message}</span>
                    </div>
                  )}

                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="default"
                      data-testid={`button-test-${provider.name}`}
                      onClick={() => testMutation.mutate(provider.name)}
                      disabled={!provider.configured || testMutation.isPending}
                    >
                      {testMutation.isPending && testMutation.variables === provider.name ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <TestTube className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Test Connection
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      data-testid={`button-sync-${provider.name}`}
                      onClick={() => syncMutation.mutate(provider.name)}
                      disabled={!provider.configured || syncMutation.isPending}
                    >
                      {syncMutation.isPending && syncMutation.variables === provider.name ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Sync Devices
                    </Button>
                  </div>

                  {sync && !sync.error && sync.devices.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Devices from API ({sync.devices.length})</p>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {sync.devices.map((d) => (
                          <div key={d.id} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50 text-sm" data-testid={`text-sync-device-${d.id}`}>
                            <div>
                              <span className="font-medium">{d.name}</span>
                              <span className="text-xs text-muted-foreground ml-2">{d.id}</span>
                            </div>
                            <Badge variant="outline" className="text-xs">{d.status}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="border-t pt-4 space-y-2">
                    <Label className="text-xs">Test Screenshot Capture</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Device ID"
                        value={deviceId}
                        className="text-sm"
                        data-testid={`input-screenshot-device-${provider.name}`}
                        onChange={(e) => setScreenshotDeviceId(prev => ({ ...prev, [provider.name]: e.target.value }))}
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        data-testid={`button-screenshot-${provider.name}`}
                        onClick={() => screenshotMutation.mutate({ name: provider.name, deviceId })}
                        disabled={!deviceId || !provider.configured || screenshotMutation.isPending}
                      >
                        {screenshotMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Camera className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                    {screenshotImages[provider.name] && (
                      <div className="mt-2 rounded-md overflow-hidden border" data-testid={`img-screenshot-${provider.name}`}>
                        <img
                          src={screenshotImages[provider.name]}
                          alt="Screenshot"
                          className="w-full h-auto max-h-96 object-contain bg-black"
                        />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">API Integration Architecture</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Each provider is integrated through a unified <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">CloudPhoneProvider</code> interface located in <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">server/providers/</code>:</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-md bg-muted/50">
              <p className="font-medium text-foreground mb-1">GeeLark</p>
              <p className="text-xs">server/providers/geelark.ts</p>
              <p className="text-xs mt-1">REST API with Bearer token auth. Endpoints for device management, app launch, and screenshot capture.</p>
            </div>
            <div className="p-3 rounded-md bg-muted/50">
              <p className="font-medium text-foreground mb-1">DuoPlus</p>
              <p className="text-xs">server/providers/duoplus.ts</p>
              <p className="text-xs mt-1">POST-only API with header API key. Uses ADB commands for screenshots and app launch.</p>
            </div>
            <div className="p-3 rounded-md bg-muted/50">
              <p className="font-medium text-foreground mb-1">VMOS Cloud</p>
              <p className="text-xs">server/providers/vmos.ts</p>
              <p className="text-xs mt-1">STS token auth with AK/SK. OpenAPI for instance control, app management, and screenshots.</p>
            </div>
          </div>
          <p>The QR code capture flow: Start device (if off) &rarr; Launch DHL Paket app &rarr; Wait for app load &rarr; Take screenshot &rarr; Deliver via Telegram.</p>
        </CardContent>
      </Card>
    </div>
  );
}
