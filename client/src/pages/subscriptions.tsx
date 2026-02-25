import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";
import type { Subscription } from "@shared/schema";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending_payment: { label: "Pending Payment", variant: "outline" },
  active: { label: "Active", variant: "default" },
  expired: { label: "Expired", variant: "secondary" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

export default function Subscriptions() {
  const { toast } = useToast();

  const { data: subs, isLoading } = useQuery<Subscription[]>({
    queryKey: ["/api/subscriptions"],
    refetchInterval: 10000,
  });

  const activateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/subscriptions/${id}/activate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Subscription activated", description: "Customer has been notified via Telegram." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to activate subscription.", variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/subscriptions/${id}/cancel`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Subscription cancelled" });
    },
  });

  const pending = subs?.filter(s => s.status === "pending_payment") || [];
  const active = subs?.filter(s => s.status === "active") || [];
  const other = subs?.filter(s => s.status !== "pending_payment" && s.status !== "active") || [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-subscriptions-title">Subscriptions</h1>
        <p className="text-muted-foreground mt-1">Manage customer subscriptions and payment confirmations</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="h-16 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : subs && subs.length > 0 ? (
        <div className="space-y-6">
          {pending.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Awaiting Payment Confirmation ({pending.length})
              </h2>
              {pending.map(sub => (
                <SubCard
                  key={sub.id}
                  sub={sub}
                  onActivate={() => activateMutation.mutate(sub.id)}
                  onCancel={() => cancelMutation.mutate(sub.id)}
                  isActivating={activateMutation.isPending && activateMutation.variables === sub.id}
                  isCancelling={cancelMutation.isPending && cancelMutation.variables === sub.id}
                />
              ))}
            </div>
          )}

          {active.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Active Subscriptions ({active.length})
              </h2>
              {active.map(sub => (
                <SubCard
                  key={sub.id}
                  sub={sub}
                  onCancel={() => cancelMutation.mutate(sub.id)}
                  isCancelling={cancelMutation.isPending && cancelMutation.variables === sub.id}
                />
              ))}
            </div>
          )}

          {other.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Past Subscriptions ({other.length})
              </h2>
              {other.map(sub => (
                <SubCard key={sub.id} sub={sub} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <CreditCard className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="font-medium mb-1">No subscriptions yet</h3>
            <p className="text-sm text-muted-foreground">Subscriptions will appear here when customers subscribe via the Telegram bot.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SubCard({
  sub,
  onActivate,
  onCancel,
  isActivating,
  isCancelling,
}: {
  sub: Subscription;
  onActivate?: () => void;
  onCancel?: () => void;
  isActivating?: boolean;
  isCancelling?: boolean;
}) {
  const config = statusConfig[sub.status] || statusConfig.cancelled;

  return (
    <Card data-testid={`card-subscription-${sub.id}`}>
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium" data-testid={`text-sub-plan-${sub.id}`}>{sub.plan}</span>
              <Badge variant={config.variant} data-testid={`badge-sub-status-${sub.id}`}>{config.label}</Badge>
              <span className="text-sm font-semibold">{"\u20ac"}{sub.priceEur}</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>Customer: {sub.customerId.substring(0, 8)}...</span>
              {sub.cryptoAsset && sub.cryptoAmount ? (
                <span>Payment: {sub.cryptoAmount} {sub.cryptoAsset}</span>
              ) : (
                <span>Payment: {sub.paymentMethod || "N/A"}</span>
              )}
              {sub.cryptoBotInvoiceId && <span>Invoice: #{sub.cryptoBotInvoiceId}</span>}
              {sub.paymentTxId && <span className="font-mono">TX: {sub.paymentTxId}</span>}
              {sub.startsAt && <span>Started: {new Date(sub.startsAt).toLocaleDateString()}</span>}
              {sub.expiresAt && <span>Expires: {new Date(sub.expiresAt).toLocaleDateString()}</span>}
              <span>Created: {new Date(sub.createdAt).toLocaleDateString()}</span>
            </div>
          </div>

          <div className="flex gap-2 shrink-0">
            {onActivate && sub.status === "pending_payment" && (
              <Button
                size="sm"
                onClick={onActivate}
                disabled={isActivating}
                data-testid={`button-activate-sub-${sub.id}`}
              >
                {isActivating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle className="h-3.5 w-3.5 mr-1.5" />}
                Confirm Payment
              </Button>
            )}
            {onCancel && (sub.status === "pending_payment" || sub.status === "active") && (
              <Button
                size="sm"
                variant="destructive"
                onClick={onCancel}
                disabled={isCancelling}
                data-testid={`button-cancel-sub-${sub.id}`}
              >
                {isCancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <XCircle className="h-3.5 w-3.5 mr-1.5" />}
                Cancel
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
