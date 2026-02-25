import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Smartphone, Users, Clock, QrCode, Activity, Server, CreditCard } from "lucide-react";

interface Stats {
  totalDevices: number;
  activeDevices: number;
  totalCustomers: number;
  activeSessions: number;
  totalSessions: number;
  totalQrCodes: number;
  activeSubscriptions: number;
}

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ["/api/stats"],
    refetchInterval: 10000,
  });

  const statCards = [
    {
      title: "Cloud Phones",
      value: stats?.totalDevices ?? 0,
      subtitle: `${stats?.activeDevices ?? 0} in use`,
      icon: Smartphone,
      color: "text-blue-500 dark:text-blue-400",
      bg: "bg-blue-500/10 dark:bg-blue-400/10",
    },
    {
      title: "Active Sessions",
      value: stats?.activeSessions ?? 0,
      subtitle: `${stats?.totalSessions ?? 0} total`,
      icon: Activity,
      color: "text-emerald-500 dark:text-emerald-400",
      bg: "bg-emerald-500/10 dark:bg-emerald-400/10",
    },
    {
      title: "Customers",
      value: stats?.totalCustomers ?? 0,
      subtitle: "registered via Telegram",
      icon: Users,
      color: "text-violet-500 dark:text-violet-400",
      bg: "bg-violet-500/10 dark:bg-violet-400/10",
    },
    {
      title: "Subscriptions",
      value: stats?.activeSubscriptions ?? 0,
      subtitle: "active plans",
      icon: CreditCard,
      color: "text-amber-500 dark:text-amber-400",
      bg: "bg-amber-500/10 dark:bg-amber-400/10",
    },
    {
      title: "QR Codes",
      value: stats?.totalQrCodes ?? 0,
      subtitle: "generated",
      icon: QrCode,
      color: "text-rose-500 dark:text-rose-400",
      bg: "bg-rose-500/10 dark:bg-rose-400/10",
    },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-dashboard-title">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Monitor your DHL QR Code rental service</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.title} data-testid={`card-stat-${stat.title.toLowerCase().replace(/\s/g, "-")}`}>
            <CardContent className="p-5">
              {isLoading ? (
                <div className="space-y-3">
                  <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                  <div className="h-8 w-16 bg-muted rounded animate-pulse" />
                  <div className="h-3 w-20 bg-muted rounded animate-pulse" />
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground font-medium">{stat.title}</p>
                    <p className="text-3xl font-bold tabular-nums">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.subtitle}</p>
                  </div>
                  <div className={`p-2.5 rounded-md ${stat.bg}`}>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Server className="h-4 w-4 text-muted-foreground" />
              Service Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">Telegram Bot</span>
              <Badge variant="default" data-testid="badge-bot-status">Online</Badge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">Cloud Phone Pool</span>
              <Badge variant="default" data-testid="badge-pool-status">
                {stats ? `${stats.totalDevices - stats.activeDevices}/${stats.totalDevices} Available` : "..."}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">Database</span>
              <Badge variant="default" data-testid="badge-db-status">Connected</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Quick Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">Plans</span>
              <span className="text-sm text-muted-foreground">1W/2W/1M</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">Pricing</span>
              <span className="text-sm text-muted-foreground">{"\u20ac"}15 / {"\u20ac"}25 / {"\u20ac"}45</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">Payment</span>
              <span className="text-sm text-muted-foreground">Crypto (BTC, USDT, LTC)</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">Supported Providers</span>
              <span className="text-sm text-muted-foreground">GeeLark, DuoPlus, VMOS</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
