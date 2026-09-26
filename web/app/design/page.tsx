"use client";

import { useState } from "react";
import {
  Beaker,
  CalendarDays,
  GraduationCap,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Search,
  Settings,
  WifiOff,
} from "lucide-react";

import { PageContainer, PageHeader } from "@/components/layout";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  Input,
  Select,
  Textarea,
  Modal,
  Tabs,
  TabPanel,
  Skeleton,
  SkeletonText,
  SkeletonAvatar,
  SkeletonButton,
  SkeletonCard,
  EmptyState,
  ErrorState,
} from "@/components/ui";

/* ─────────────────────────────────────────────
   SECTION WRAPPER — keeps the showcase tidy
   ───────────────────────────────────────────── */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <h2 className="text-lg font-semibold text-foreground border-b border-border pb-3">
        {title}
      </h2>
      {children}
    </section>
  );
}

/* ─────────────────────────────────────────────
   SHOWCASE PAGE
   ───────────────────────────────────────────── */

export default function DesignSystemPage() {
  const [modalOpen, setModalOpen] = useState(false);

  const [activeTab, setActiveTab] = useState("overview");

  return (
    <main className="min-h-screen grid-background py-10">
      <PageContainer className="space-y-14">
        {/* ── Page Header ── */}
        <PageHeader
          title="Design System"
          description="Reusable UI foundation for CampusFlow — Phase 1.2"
          action={
            <Button size="sm" icon={<Settings className="h-4 w-4" />}>
              Settings
            </Button>
          }
        />

        {/* ── Color Tokens ── */}
        <Section title="Color Tokens">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              { name: "Background",       color: "#050816" },
              { name: "Surface",          color: "#0B1224" },
              { name: "Surface 2",        color: "#101A31" },
              { name: "Border",           color: "#1E2A44" },
              { name: "Primary",          color: "#4F8CFF" },
              { name: "Primary Bright",   color: "#7BA7FF" },
              { name: "Success",          color: "#32D583" },
              { name: "Warning",          color: "#F79009" },
              { name: "Danger",           color: "#F04438" },
              { name: "Foreground",       color: "#F8FAFC" },
              { name: "Muted",            color: "#94A3B8" },
            ].map((t) => (
              <div key={t.name} className="space-y-2">
                <div
                  className="h-12 w-full rounded-[var(--radius-md)] border border-border"
                  style={{ backgroundColor: t.color }}
                />
                <div>
                  <p className="text-xs font-medium text-foreground">{t.name}</p>
                  <p className="text-xs text-muted font-mono">{t.color}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Typography ── */}
        <Section title="Typography">
          <div className="space-y-4 max-w-2xl">
            <p className="text-4xl font-semibold tracking-tight">Display — The quick brown fox</p>
            <h1 className="text-3xl font-semibold tracking-tight">H1 — Campus Booking</h1>
            <h2 className="text-2xl font-semibold tracking-tight">H2 — Resource Catalogue</h2>
            <h3 className="text-xl font-semibold">H3 — Availability Rules</h3>
            <p className="text-base text-foreground">Body — Discover classrooms, laboratories, equipment, seminar halls and facilities from one intelligent booking platform.</p>
            <p className="text-sm text-muted">Small — Last updated 5 minutes ago</p>
            <p className="text-xs text-muted">Caption — Building A, Floor 2, Room 201</p>
            <p className="text-[11px] text-muted/60 font-mono">Metadata — ID: res_8f3a2b</p>
          </div>
        </Section>

        {/* ── Buttons ── */}
        <Section title="Buttons">
          <div className="space-y-6">
            {/* Variants */}
            <div>
              <p className="text-sm text-muted mb-3">Variants</p>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="danger">Danger</Button>
                <Button variant="outline">Outline</Button>
              </div>
            </div>

            {/* Sizes */}
            <div>
              <p className="text-sm text-muted mb-3">Sizes</p>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm">Small</Button>
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
              </div>
            </div>

            {/* With icon */}
            <div>
              <p className="text-sm text-muted mb-3">With Icon</p>
              <div className="flex flex-wrap items-center gap-3">
                <Button icon={<Plus className="h-4 w-4" />}>New Booking</Button>
                <Button variant="secondary" icon={<Search className="h-4 w-4" />}>Search</Button>
                <Button variant="outline" icon={<CalendarDays className="h-4 w-4" />}>
                  Calendar
                </Button>
              </div>
            </div>

            {/* States */}
            <div>
              <p className="text-sm text-muted mb-3">States</p>
              <div className="flex flex-wrap items-center gap-3">
                <Button loading>Saving…</Button>
                <Button disabled>Disabled</Button>
                <Button variant="danger" loading>
                  Deleting…
                </Button>
              </div>
            </div>
          </div>
        </Section>

        {/* ── Cards ── */}
        <Section title="Cards">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Computer Science Lab 1</CardTitle>
                <CardDescription>Building A, Floor 2</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted">40 workstations with dual monitors, NVIDIA GPUs, and high-speed networking.</p>
              </CardContent>
              <CardFooter>
                <Badge variant="available" dot>Available</Badge>
              </CardFooter>
            </Card>

            <Card variant="elevated">
              <CardHeader>
                <CardTitle>AI Research Laboratory</CardTitle>
                <CardDescription>Innovation Hub, Floor 3</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted">GPU cluster with 8× A100 nodes, dedicated cooling, restricted access.</p>
              </CardContent>
              <CardFooter>
                <Badge variant="occupied" dot>Occupied</Badge>
              </CardFooter>
            </Card>

            <Card variant="interactive">
              <CardHeader>
                <CardTitle>Innovation Studio</CardTitle>
                <CardDescription>Central Campus, Ground Floor</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted">Flexible space with modular furniture, 3D printers, and collaboration tools.</p>
              </CardContent>
              <CardFooter>
                <Badge variant="pending" dot>Pending Approval</Badge>
              </CardFooter>
            </Card>
          </div>
        </Section>

        {/* ── Badges ── */}
        <Section title="Badges">
          <div className="flex flex-wrap gap-2">
            <Badge variant="available" dot>Available</Badge>
            <Badge variant="occupied" dot>Occupied</Badge>
            <Badge variant="pending" dot>Pending</Badge>
            <Badge variant="approved" dot>Approved</Badge>
            <Badge variant="rejected" dot>Rejected</Badge>
            <Badge variant="maintenance" dot>Maintenance</Badge>
            <Badge variant="cancelled" dot>Cancelled</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="danger">Danger</Badge>
            <Badge variant="neutral">Neutral</Badge>
          </div>
        </Section>

        {/* ── Form Inputs ── */}
        <Section title="Form Inputs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
            <Input
              label="Resource Name"
              placeholder="e.g. Computer Science Lab 1"
              helperText="Enter the full resource name"
            />
            <Input
              label="Email"
              placeholder="you@university.edu"
              type="email"
              required
            />
            <Input
              label="Capacity"
              placeholder="40"
              type="number"
              error="Capacity must be a positive number"
            />
            <Input
              label="Location"
              placeholder="Building A, Floor 2"
              disabled
            />
            <Select
              label="Resource Type"
              placeholder="Select type…"
              options={[
                { value: "lab", label: "Laboratory" },
                { value: "room", label: "Classroom" },
                { value: "hall", label: "Seminar Hall" },
                { value: "equipment", label: "Equipment" },
                { value: "facility", label: "Facility" },
              ]}
              required
            />
            <Select
              label="Building"
              placeholder="Select building…"
              options={[
                { value: "a", label: "Building A — Engineering" },
                { value: "b", label: "Building B — Sciences" },
                { value: "c", label: "Building C — Innovation Hub" },
              ]}
              error="Please select a building"
            />
            <div className="md:col-span-2">
              <Textarea
                label="Description"
                placeholder="Describe the resource, its equipment, and any special requirements…"
                helperText="Maximum 500 characters"
              />
            </div>
          </div>
        </Section>

        {/* ── Tabs ── */}
        <Section title="Tabs">
          <Tabs
            tabs={[
              { id: "overview", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
              { id: "schedule", label: "Schedule", icon: <CalendarDays className="h-4 w-4" /> },
              { id: "equipment", label: "Equipment", icon: <Beaker className="h-4 w-4" /> },
              { id: "disabled", label: "Archived", disabled: true },
            ]}
            activeTab={activeTab}
            onChange={setActiveTab}
          />
          <div className="mt-4">
            <TabPanel id="overview" activeTab={activeTab}>
              <Card>
                <p className="text-sm text-muted">
                  Overview content — resource details, description, capacity, and live status are shown here.
                </p>
              </Card>
            </TabPanel>
            <TabPanel id="schedule" activeTab={activeTab}>
              <Card>
                <p className="text-sm text-muted">
                  Schedule content — weekly availability calendar, upcoming bookings, and blackout periods.
                </p>
              </Card>
            </TabPanel>
            <TabPanel id="equipment" activeTab={activeTab}>
              <Card>
                <p className="text-sm text-muted">
                  Equipment content — list of equipment, consumables, and accessories associated with this resource.
                </p>
              </Card>
            </TabPanel>
          </div>
        </Section>

        {/* ── Modal ── */}
        <Section title="Modal">
          <Button onClick={() => setModalOpen(true)}>Open Modal</Button>
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Confirm Booking"
            description="You are about to book this resource. Please review the details."
          >
            <div className="space-y-4">
              <div className="rounded-[var(--radius-md)] bg-surface p-4 border border-border space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Resource</span>
                  <span className="text-foreground font-medium">Computer Science Lab 1</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Date</span>
                  <span className="text-foreground font-medium">25 Sep 2026</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Time</span>
                  <span className="text-foreground font-medium">10:00 — 12:00</span>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setModalOpen(false)}>
                  Confirm Booking
                </Button>
              </div>
            </div>
          </Modal>
        </Section>

        {/* ── Skeletons ── */}
        <Section title="Skeletons">
          <div className="space-y-6">
            <div>
              <p className="text-sm text-muted mb-3">Individual</p>
              <div className="flex flex-wrap items-center gap-4">
                <SkeletonAvatar />
                <SkeletonButton />
                <Skeleton className="h-4 w-40" />
              </div>
            </div>
            <div>
              <p className="text-sm text-muted mb-3">Text Block</p>
              <div className="max-w-md">
                <SkeletonText />
              </div>
            </div>
            <div>
              <p className="text-sm text-muted mb-3">Card</p>
              <div className="max-w-sm">
                <SkeletonCard />
              </div>
            </div>
          </div>
        </Section>

        {/* ── Empty & Error States ── */}
        <Section title="Empty & Error States">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <EmptyState
                title="No bookings yet"
                description="You haven't made any bookings. Browse resources to get started."
                action={
                  <Button size="sm" icon={<GraduationCap className="h-4 w-4" />}>
                    Explore Resources
                  </Button>
                }
              />
            </Card>
            <Card>
              <ErrorState
                title="Failed to load resources"
                description="We couldn't fetch the resource list. Please check your connection and try again."
                icon={<WifiOff className="h-6 w-6" />}
                action={
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<RefreshCw className="h-4 w-4" />}
                  >
                    Retry
                  </Button>
                }
              />
            </Card>
          </div>
        </Section>

        {/* ── Surface Utilities ── */}
        <Section title="Surface Utilities">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="surface rounded-[var(--radius-lg)] p-5">
              <p className="text-sm font-medium text-foreground">.surface</p>
              <p className="mt-1 text-xs text-muted">Default glass surface</p>
            </div>
            <div className="surface-elevated rounded-[var(--radius-lg)] p-5">
              <p className="text-sm font-medium text-foreground">.surface-elevated</p>
              <p className="mt-1 text-xs text-muted">Raised card, modal</p>
            </div>
            <div className="glass rounded-[var(--radius-lg)] p-5">
              <p className="text-sm font-medium text-foreground">.glass</p>
              <p className="mt-1 text-xs text-muted">Ultra-subtle transparent</p>
            </div>
            <div className="glow rounded-[var(--radius-lg)] p-5 bg-surface">
              <p className="text-sm font-medium text-foreground">.glow</p>
              <p className="mt-1 text-xs text-muted">Primary blue glow</p>
            </div>
          </div>
        </Section>

        {/* Footer spacing */}
        <div className="h-10" />
      </PageContainer>
    </main>
  );
}
