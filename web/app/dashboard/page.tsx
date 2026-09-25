"use client";

import { useState } from "react";
import { Plus, ArrowRight, LayoutDashboard, CalendarDays } from "lucide-react";

import { PageContainer, PageHeader } from "@/components/layout";
import { Card, Badge, Button } from "@/components/ui";
import { CampusScene } from "@/components/3d";

export default function DashboardPage() {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  

  // Dummy logic mapped from 3D configuration
  // Real world would query backend for building details based on selectedBuildingId
  const getSelectedBuildingDetails = () => {
    if (!selectedBuildingId) return null;
    const details = {
      "bld-cs": { name: "Computer Science Block", capacity: 120, bookable: 18, utilization: 78, maint: 2 },
      "bld-ai": { name: "AI Research Lab", capacity: 50, bookable: 4, utilization: 92, maint: 0 },
      "bld-innov": { name: "Innovation Center", capacity: 200, bookable: 12, utilization: 45, maint: 1 },
      "bld-seminar": { name: "Main Seminar Hall", capacity: 500, bookable: 2, utilization: 100, maint: 0 },
      "bld-sports": { name: "Sports Complex", capacity: 1000, bookable: 8, utilization: 10, maint: 5 },
    };
    return details[selectedBuildingId as keyof typeof details];
  };

  const selectedBuildingData = getSelectedBuildingDetails();

  return (
    <div className="min-h-full py-8 grid-background">
      <PageContainer className="space-y-6">
        <PageHeader
          title="Campus Overview"
          description="Interactive digital twin of the university campus."
          action={<Button size="sm" icon={<Plus className="h-4 w-4" />}>New Booking</Button>}
        />

        {/* 3D Dashboard Visualization Area */}
        <div className="flex flex-col xl:flex-row gap-6 h-[750px] xl:h-[600px]">

          {/* Main 3D Canvas */}
          <Card
            className="flex-1 overflow-hidden p-0 relative shadow-2xl border-primary/20 bg-[#050816]/50 backdrop-blur-sm"
            noPadding
          >
            {/* Themed UI Overlay guiding user */}
            <div className="absolute top-4 left-4 z-10 select-none pointer-events-none">
              <h3 className="text-foreground/90 font-semibold tracking-tight text-sm drop-shadow-md">Campus Digital Twin</h3>
              <p className="text-muted/80 text-xs drop-shadow-md">Click any facility to view live status</p>
            </div>

            {/* The interactive WebGL Scene */}
            <div className="w-full h-full relative cursor-grab active:cursor-grabbing">
              <CampusScene
                selectedBuildingId={selectedBuildingId}
                onSelectBuilding={setSelectedBuildingId}
              />
            </div>
          </Card>

          {/* Contextual Side Panel */}
          <div className="w-full xl:w-[380px] flex flex-col gap-6 shrink-0 h-full">

            {/* Building Info Panel (Dynamic depending on selection) */}
            <Card className="flex-1 flex flex-col">
              {selectedBuildingData ? (
                <div className="h-full flex flex-col animate-fade-in space-y-5">
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                       <h3 className="text-lg font-semibold text-foreground leading-tight">
                         {selectedBuildingData.name}
                       </h3>
                       <Badge variant={selectedBuildingData.utilization > 90 ? "occupied" : "available"} dot>
                         {selectedBuildingData.utilization > 90 ? "High Load" : "Active"}
                       </Badge>
                    </div>
                    <p className="text-sm text-muted">ID: {selectedBuildingId}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="surface rounded-[var(--radius-sm)] p-3">
                      <p className="text-xs text-muted font-medium mb-1 uppercase tracking-wider">Bookable</p>
                      <p className="text-2xl font-semibold text-foreground">{selectedBuildingData.bookable}</p>
                    </div>
                    <div className="surface rounded-[var(--radius-sm)] p-3">
                      <p className="text-xs text-muted font-medium mb-1 uppercase tracking-wider">Utilisation</p>
                      <p className="text-2xl font-semibold text-foreground">{selectedBuildingData.utilization}%</p>
                    </div>
                  </div>

                  <div className="surface-elevated rounded-[var(--radius-md)] p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Maintenance Required</p>
                      <p className="text-xs text-muted mt-0.5">{selectedBuildingData.maint} active tickets</p>
                    </div>
                    <Badge variant={selectedBuildingData.maint > 0 ? "warning" : "success"}>
                      {selectedBuildingData.maint} Issues
                    </Badge>
                  </div>

                  <div className="mt-auto space-y-3 pt-4 border-t border-border/50">
                    <Button className="w-full justify-between group" variant="primary">
                      View Resources
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </Button>
                    <Button className="w-full justify-between" variant="secondary">
                      View Availability
                      <CalendarDays className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center animate-fade-in">
                  <div className="h-16 w-16 rounded-full bg-surface-2 flex items-center justify-center mb-4 text-muted border border-border">
                    <LayoutDashboard className="h-8 w-8" />
                  </div>
                  <h3 className="text-base font-medium text-foreground">No Facility Selected</h3>
                  <p className="text-sm text-muted mt-2 max-w-[250px]">
                    Interact with the digital twin to inspect facility status, resource bookings, and usage statistics.
                  </p>
                </div>
              )}
            </Card>

            {/* Quick Stats fixed bottom panel */}
            <Card className="shrink-0 bg-surface-2/50">
              <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">Total Campus Metrics</h4>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted">Active Bookings</span>
                  <span className="text-sm font-medium text-foreground">12</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted">Pending Approvals</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">3</span>
                    <span className="h-2 w-2 rounded-full bg-warning animate-pulse-soft" />
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted">Campus Efficiency</span>
                  <span className="text-sm font-medium text-success">94%</span>
                </div>
              </div>
            </Card>

          </div>
        </div>
      </PageContainer>
    </div>
  );
}
