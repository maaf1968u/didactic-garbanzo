import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Smartphone, Plus, Wifi, WifiOff, Wrench, Monitor, Pencil, Trash2, Eye, EyeOff, KeyRound, Mail, User, Hash } from "lucide-react";
import type { CloudPhone } from "@shared/schema";
import { useState } from "react";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Wifi }> = {
  available: { label: "Available", variant: "default", icon: Wifi },
  in_use: { label: "In Use", variant: "secondary", icon: Monitor },
  maintenance: { label: "Maintenance", variant: "outline", icon: Wrench },
  offline: { label: "Offline", variant: "destructive", icon: WifiOff },
};

const emptyForm = { name: "", provider: "GeeLark", deviceId: "", dhlAccountEmail: "", dhlAccountPassword: "", dhlAccountName: "", postnummer: "", status: "available" as string };

export default function Devices() {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingDevice, setDeletingDevice] = useState<CloudPhone | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  const { data: devices, isLoading } = useQuery<CloudPhone[]>({
    queryKey: ["/api/devices"],
    refetchInterval: 10000,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof emptyForm) => {
      const res = await apiRequest("POST", "/api/devices", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setAddOpen(false);
      setFormData(emptyForm);
      toast({ title: "Device added", description: "Cloud phone has been registered." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add device.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof emptyForm }) => {
      const res = await apiRequest("PATCH", `/api/devices/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setEditOpen(false);
      setEditingId(null);
      setFormData(emptyForm);
      toast({ title: "Device updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update device.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/devices/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setDeleteOpen(false);
      setDeletingDevice(null);
      toast({ title: "Device deleted" });
    },
  });

  function openEdit(device: CloudPhone) {
    setEditingId(device.id);
    setFormData({
      name: device.name,
      provider: device.provider,
      deviceId: device.deviceId,
      dhlAccountEmail: device.dhlAccountEmail || "",
      dhlAccountPassword: device.dhlAccountPassword || "",
      dhlAccountName: device.dhlAccountName || "",
      postnummer: device.postnummer || "",
      status: device.status,
    });
    setEditOpen(true);
  }

  function openDelete(device: CloudPhone) {
    setDeletingDevice(device);
    setDeleteOpen(true);
  }

  function DeviceForm({ mode }: { mode: "add" | "edit" }) {
    return (
      <Tabs defaultValue="device" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="device" className="flex-1" data-testid={`tab-${mode}-device`}>Device Info</TabsTrigger>
          <TabsTrigger value="dhl" className="flex-1" data-testid={`tab-${mode}-dhl`}>DHL Account</TabsTrigger>
        </TabsList>

        <TabsContent value="device" className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor={`${mode}-name`}>Device Name</Label>
            <Input
              id={`${mode}-name`}
              data-testid={`input-${mode}-device-name`}
              placeholder="e.g. GeeLark-Phone-1"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${mode}-provider`}>Provider</Label>
            <Select value={formData.provider} onValueChange={(v) => setFormData({ ...formData, provider: v })}>
              <SelectTrigger data-testid={`select-${mode}-provider`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GeeLark">GeeLark</SelectItem>
                <SelectItem value="DuoPlus">DuoPlus</SelectItem>
                <SelectItem value="VMOS Cloud">VMOS Cloud</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${mode}-deviceId`}>Provider Device ID</Label>
            <Input
              id={`${mode}-deviceId`}
              data-testid={`input-${mode}-device-id`}
              placeholder="The device ID from your cloud phone provider"
              value={formData.deviceId}
              onChange={(e) => setFormData({ ...formData, deviceId: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              This is the actual device/instance ID from your {formData.provider} account. Use the Providers page to sync and find your device IDs.
            </p>
          </div>
          {mode === "edit" && (
            <div className="space-y-2">
              <Label htmlFor={`${mode}-status`}>Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger data-testid={`select-${mode}-status`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="in_use">In Use</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </TabsContent>

        <TabsContent value="dhl" className="space-y-4 pt-2">
          <div className="p-3 rounded-md bg-muted/50 text-sm text-muted-foreground">
            Configure the DHL Packstation details for this device. Name and Postnummer are shared with customers for package delivery.
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${mode}-dhlAccountName`} className="flex items-center gap-2">
              <User className="h-3.5 w-3.5" />
              DHL Account Name
            </Label>
            <Input
              id={`${mode}-dhlAccountName`}
              data-testid={`input-${mode}-dhl-account-name`}
              placeholder="e.g. Max Mustermann"
              value={formData.dhlAccountName}
              onChange={(e) => setFormData({ ...formData, dhlAccountName: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">Full name on the DHL account (shared with customer)</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${mode}-postnummer`} className="flex items-center gap-2">
              <Hash className="h-3.5 w-3.5" />
              Postnummer
            </Label>
            <Input
              id={`${mode}-postnummer`}
              data-testid={`input-${mode}-postnummer`}
              placeholder="e.g. 12345678"
              value={formData.postnummer}
              onChange={(e) => setFormData({ ...formData, postnummer: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">DHL Postnummer (shared with customer for Packstation delivery)</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${mode}-dhlEmail`} className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5" />
              DHL Account Email
            </Label>
            <Input
              id={`${mode}-dhlEmail`}
              type="email"
              data-testid={`input-${mode}-dhl-email`}
              placeholder="your-dhl-account@email.de"
              value={formData.dhlAccountEmail}
              onChange={(e) => setFormData({ ...formData, dhlAccountEmail: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${mode}-dhlPassword`} className="flex items-center gap-2">
              <KeyRound className="h-3.5 w-3.5" />
              DHL Account Password
            </Label>
            <div className="relative">
              <Input
                id={`${mode}-dhlPassword`}
                type={showPasswords[mode] ? "text" : "password"}
                data-testid={`input-${mode}-dhl-password`}
                placeholder="DHL account password"
                value={formData.dhlAccountPassword}
                onChange={(e) => setFormData({ ...formData, dhlAccountPassword: e.target.value })}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="absolute right-0 top-0 h-full"
                data-testid={`button-toggle-password-${mode}`}
                onClick={() => setShowPasswords(prev => ({ ...prev, [mode]: !prev[mode] }))}
              >
                {showPasswords[mode] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-devices-title">Cloud Phones</h1>
          <p className="text-muted-foreground mt-1">Manage your cloud phone device pool and DHL account credentials</p>
        </div>

        <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) setFormData(emptyForm); }}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-device">
              <Plus className="h-4 w-4 mr-2" />
              Add Device
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Cloud Phone</DialogTitle>
            </DialogHeader>
            <DeviceForm mode="add" />
            <DialogFooter>
              <Button
                className="w-full"
                data-testid="button-submit-add-device"
                onClick={() => createMutation.mutate(formData)}
                disabled={!formData.name || !formData.deviceId || createMutation.isPending}
              >
                {createMutation.isPending ? "Adding..." : "Add Device"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) { setEditingId(null); setFormData(emptyForm); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Cloud Phone</DialogTitle>
          </DialogHeader>
          <DeviceForm mode="edit" />
          <DialogFooter>
            <Button
              className="w-full"
              data-testid="button-submit-edit-device"
              onClick={() => editingId && updateMutation.mutate({ id: editingId, data: formData })}
              disabled={!formData.name || !formData.deviceId || updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={(open) => { setDeleteOpen(open); if (!open) setDeletingDevice(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Device</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <span className="font-medium text-foreground">{deletingDevice?.name}</span>? This action cannot be undone.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} data-testid="button-cancel-delete">Cancel</Button>
            <Button
              variant="destructive"
              data-testid="button-confirm-delete"
              onClick={() => deletingDevice && deleteMutation.mutate(deletingDevice.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-5 space-y-3">
                <div className="h-5 w-32 bg-muted rounded animate-pulse" />
                <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                <div className="h-4 w-40 bg-muted rounded animate-pulse" />
                <div className="h-8 w-full bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : devices && devices.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((device) => {
            const config = statusConfig[device.status] || statusConfig.offline;
            const StatusIcon = config.icon;
            const pwVisible = showPasswords[device.id];
            return (
              <Card key={device.id} data-testid={`card-device-${device.id}`}>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-md bg-primary/10">
                        <Smartphone className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium" data-testid={`text-device-name-${device.id}`}>{device.name}</p>
                        <p className="text-xs text-muted-foreground">{device.provider}</p>
                      </div>
                    </div>
                    <Badge variant={config.variant} data-testid={`badge-device-status-${device.id}`}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {config.label}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Device ID</span>
                      <span className="font-mono text-xs truncate max-w-[180px]">{device.deviceId}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">DHL Name</span>
                      <span className="text-xs truncate max-w-[180px]">
                        {device.dhlAccountName || <span className="text-muted-foreground/60 italic">Not set</span>}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Postnummer</span>
                      <span className="text-xs truncate max-w-[180px]">
                        {device.postnummer || <span className="text-muted-foreground/60 italic">Not set</span>}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">DHL Email</span>
                      <span className="text-xs truncate max-w-[180px]">
                        {device.dhlAccountEmail || <span className="text-muted-foreground/60 italic">Not set</span>}
                      </span>
                    </div>
                    {device.lastUsed && (
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Last Used</span>
                        <span className="text-xs">{new Date(device.lastUsed).toLocaleString()}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex-1"
                      data-testid={`button-edit-device-${device.id}`}
                      onClick={() => openEdit(device)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      data-testid={`button-delete-device-${device.id}`}
                      onClick={() => openDelete(device)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <Smartphone className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="font-medium mb-1">No devices yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Add your first cloud phone to get started.</p>
            <p className="text-xs text-muted-foreground">
              Tip: Go to the Providers page first to test your API connections and find your device IDs.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
