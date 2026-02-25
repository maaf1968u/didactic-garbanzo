import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Users, ShieldBan, ShieldCheck } from "lucide-react";
import type { Customer } from "@shared/schema";

export default function Customers() {
  const { toast } = useToast();

  const { data: customers, isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    refetchInterval: 10000,
  });

  const blockMutation = useMutation({
    mutationFn: async ({ id, blocked }: { id: string; blocked: boolean }) => {
      const res = await apiRequest("PATCH", `/api/customers/${id}/block`, { blocked });
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: vars.blocked ? "Customer blocked" : "Customer unblocked" });
    },
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-customers-title">Customers</h1>
        <p className="text-muted-foreground mt-1">Telegram users who have interacted with the bot</p>
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
      ) : customers && customers.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Telegram ID</TableHead>
                  <TableHead className="text-center">Sessions</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer.id} data-testid={`row-customer-${customer.id}`}>
                    <TableCell>
                      <div>
                        <p className="font-medium" data-testid={`text-customer-name-${customer.id}`}>
                          {customer.firstName || ""} {customer.lastName || ""}
                        </p>
                        {customer.telegramUsername && (
                          <p className="text-xs text-muted-foreground">@{customer.telegramUsername}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{customer.telegramId}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{customer.totalSessions}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {customer.isBlocked ? (
                        <Badge variant="destructive" data-testid={`badge-customer-blocked-${customer.id}`}>Blocked</Badge>
                      ) : (
                        <Badge variant="default" data-testid={`badge-customer-active-${customer.id}`}>Active</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {new Date(customer.createdAt).toLocaleDateString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={customer.isBlocked ? "default" : "destructive"}
                        data-testid={`button-toggle-block-${customer.id}`}
                        onClick={() => blockMutation.mutate({ id: customer.id, blocked: !customer.isBlocked })}
                        disabled={blockMutation.isPending}
                      >
                        {customer.isBlocked ? (
                          <>
                            <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                            Unblock
                          </>
                        ) : (
                          <>
                            <ShieldBan className="h-3.5 w-3.5 mr-1.5" />
                            Block
                          </>
                        )}
                      </Button>
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
            <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="font-medium mb-1">No customers yet</h3>
            <p className="text-sm text-muted-foreground">Customers will appear here when they interact with the Telegram bot.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
