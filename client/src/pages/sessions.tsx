import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Clock, XCircle } from "lucide-react";
import type { RentalSession } from "@shared/schema";

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  active: "default",
  completed: "secondary",
  expired: "destructive",
  cancelled: "destructive",
};

export default function Sessions() {
  const { toast } = useToast();

  const { data: sessions, isLoading } = useQuery<RentalSession[]>({
    queryKey: ["/api/sessions"],
    refetchInterval: 5000,
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/sessions/${id}/cancel`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
      toast({ title: "Session cancelled" });
    },
  });

  function formatDuration(session: RentalSession) {
    if (!session.startedAt) return "-";
    const start = new Date(session.startedAt);
    const end = session.completedAt ? new Date(session.completedAt) : new Date();
    const diffMs = end.getTime() - start.getTime();
    const mins = Math.floor(diffMs / 60000);
    const secs = Math.floor((diffMs % 60000) / 1000);
    return `${mins}m ${secs}s`;
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-sessions-title">Sessions</h1>
        <p className="text-muted-foreground mt-1">Rental session history and active sessions</p>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-muted rounded animate-pulse" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : sessions && sessions.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id} data-testid={`row-session-${session.id}`}>
                    <TableCell>
                      <span className="font-mono text-xs" data-testid={`text-session-id-${session.id}`}>
                        {session.id.slice(0, 8)}...
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusColors[session.status] || "secondary"} data-testid={`badge-session-status-${session.id}`}>
                        {session.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm tabular-nums">{formatDuration(session)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {session.startedAt ? new Date(session.startedAt).toLocaleString() : "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {session.expiresAt ? new Date(session.expiresAt).toLocaleString() : "-"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {(session.status === "active" || session.status === "pending") && (
                        <Button
                          size="sm"
                          variant="destructive"
                          data-testid={`button-cancel-session-${session.id}`}
                          onClick={() => cancelMutation.mutate(session.id)}
                          disabled={cancelMutation.isPending}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1.5" />
                          Cancel
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <Clock className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="font-medium mb-1">No sessions yet</h3>
            <p className="text-sm text-muted-foreground">Sessions will appear when customers request QR codes via the Telegram bot.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
