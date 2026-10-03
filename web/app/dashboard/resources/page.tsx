"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Database,
  Search,
  Building2,
  Users,
  CalendarDays,
  ArrowRight,
  Filter,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

import { PageContainer, PageHeader } from "@/components/layout";
import { Card, Badge, Button, Input, Skeleton, EmptyState } from "@/components/ui";
import { api, type Resource } from "@/lib/api";

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedBuilding, setSelectedBuilding] = useState<string>("ALL");

  const fetchResources = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await api.resources.list({ limit: 100 });
      setResources(res.resources || []);
    } catch (err: unknown) {
      console.error("Failed to fetch resources", err);
      const message =
        err instanceof Error
          ? err.message
          : "Unable to load campus resources. Please try again.";
      setFetchError(message);
      setResources([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  // Compute unique buildings for filter tabs
  const buildings = useMemo(() => {
    const bSet = new Set<string>();
    for (const r of resources) {
      if (r.location?.building) {
        bSet.add(r.location.building);
      }
    }
    return Array.from(bSet).sort();
  }, [resources]);

  // Filtered resources
  const filteredResources = useMemo(() => {
    return resources.filter((r) => {
      const matchesSearch =
        searchQuery.trim().length === 0 ||
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.location?.building &&
          r.location.building.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesBuilding =
        selectedBuilding === "ALL" || r.location?.building === selectedBuilding;

      return matchesSearch && matchesBuilding;
    });
  }, [resources, searchQuery, selectedBuilding]);

  return (
    <div className="min-h-full py-8 grid-background">
      <PageContainer className="space-y-6">
        <PageHeader
          title="Campus Resource Catalogue"
          description="Browse university lecture halls, computer laboratories, and collaborative facilities."
          action={
            <Link href="/dashboard/calendar">
              <Button size="sm" icon={<CalendarDays className="h-4 w-4" />}>
                View Full Calendar
              </Button>
            </Link>
          }
        />

        {/* Filter & Search Bar */}
        <Card className="p-4 bg-surface-2/40 border-border/80">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="w-full sm:w-80 relative">
              <Input
                placeholder="Search facility name, code, or building..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Building Quick Filters */}
            <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setSelectedBuilding("ALL")}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  selectedBuilding === "ALL"
                    ? "bg-primary text-white"
                    : "bg-surface text-muted hover:text-foreground border border-border"
                }`}
              >
                All Facilities ({resources.length})
              </button>
              {buildings.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setSelectedBuilding(b)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    selectedBuilding === b
                      ? "bg-primary text-white"
                      : "bg-surface text-muted hover:text-foreground border border-border"
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Resources Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="p-5 space-y-4">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-10 w-full" />
              </Card>
            ))}
          </div>
        ) : fetchError ? (
          <Card className="min-h-[350px] flex items-center justify-center border-destructive/40 bg-destructive/5">
            <div className="flex flex-col items-center gap-4 text-center p-8 max-w-md">
              <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center border border-destructive/30">
                <AlertTriangle className="h-7 w-7 text-destructive" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground mb-1">
                  Failed to Load Resources
                </h3>
                <p className="text-sm text-muted leading-relaxed">
                  {fetchError}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                icon={<RefreshCw className="h-4 w-4" />}
                onClick={fetchResources}
              >
                Retry
              </Button>
            </div>
          </Card>
        ) : filteredResources.length === 0 ? (
          <Card className="min-h-[350px] flex items-center justify-center">
            <EmptyState
              icon={<Database className="h-8 w-8 text-primary" />}
              title={
                resources.length === 0
                  ? "No Facilities Available"
                  : "No Matching Facilities"
              }
              description={
                resources.length === 0
                  ? "No campus resources have been configured yet. Contact your administrator."
                  : "No campus resources matched your current search filters. Try clearing your query."
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredResources.map((resource) => (
              <Card
                key={resource._id}
                className="flex flex-col justify-between p-5 border-border hover:border-primary/50 transition-all duration-300 shadow-sm hover:shadow-lg bg-surface/90"
              >
                <div className="space-y-3">
                  {/* Top Bar: Code & Status */}
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-primary-bright px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                      {resource.code}
                    </span>
                    <Badge
                      variant={resource.status === "ACTIVE" ? "available" : "warning"}
                      dot
                    >
                      {resource.status}
                    </Badge>
                  </div>

                  {/* Resource Name & Description */}
                  <div>
                    <h3 className="text-lg font-semibold text-foreground leading-snug">
                      {resource.name}
                    </h3>
                    <p className="text-xs text-muted line-clamp-2 mt-1">
                      {resource.description || "University campus resource facility."}
                    </p>
                  </div>

                  {/* Metadata Chips */}
                  <div className="space-y-1.5 pt-2 border-t border-border/50 text-xs text-muted">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 text-primary" />
                      <span>{resource.location?.building}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span>
                        Floor {resource.location?.floor || "1"} • Room{" "}
                        {resource.location?.roomNumber || resource.code}
                      </span>
                      <span className="flex items-center gap-1 font-medium text-foreground">
                        <Users className="h-3.5 w-3.5 text-muted" />
                        {resource.capacity} seats
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Action Link to Calendar */}
                <div className="pt-5 mt-4 border-t border-border/50">
                  <Link
                    href={`/dashboard/calendar?resourceId=${resource._id}`}
                    className="block w-full"
                  >
                    <Button
                      variant="primary"
                      className="w-full justify-between group"
                    >
                      <span>View Schedule & Book</span>
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </PageContainer>
    </div>
  );
}
