"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Box, Shield, Zap, Sparkles, Building2, Calendar, Users, Map, CheckCircle2 } from "lucide-react";

import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingScene } from "@/components/landing/landing-scene";
import { Button } from "@/components/ui";

// Fade up settings
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (custom: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: custom * 0.1, duration: 0.6, ease: [0.21, 0.47, 0.32, 0.98] as const }
  })
};

// Reusable viewport configurations for repeated animations
const viewPortConfig = { once: false, amount: 0.2, margin: "0px" };
const viewPortReveal = { once: false, amount: 0.3, margin: "0px" };

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#050816] text-[#F8FAFC] selection:bg-[#4F8CFF]/30 overflow-x-hidden">
      <LandingNavbar />

      <main>
        {/* HERO SECTION */}
        <section className="relative h-[100dvh] w-full flex items-center justify-center overflow-hidden">
          {/* 3D Background */}
          <div className="absolute inset-0 z-0">
            <LandingScene />
          </div>

          <div className="absolute inset-0 bg-gradient-to-r from-[#050816] via-[#050816]/80 to-transparent z-[1] w-full lg:w-2/3 pointer-events-none" />

          {/* Hero Content Overlay */}
          <div className="relative z-10 w-full max-w-7xl mx-auto px-4 md:px-6 flex flex-col md:flex-row items-center h-full pt-16 pointer-events-none">

            <div className="w-full md:w-3/5 lg:w-1/2 flex flex-col items-start text-left mt-10 md:mt-0 pointer-events-auto">
              <motion.div
                custom={1} initial="hidden" animate="visible" variants={fadeUp}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full surface border border-border mb-6 pointer-events-auto shadow-[0_0_20px_rgba(79,140,255,0.1)]"
              >
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-xs md:text-sm font-medium tracking-wide">Next-Gen Campus Platform</span>
              </motion.div>

              <motion.h1
                custom={2} initial="hidden" animate="visible" variants={fadeUp}
                className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 drop-shadow-2xl leading-[1.1]"
              >
                Campus resource <br className="hidden md:block" />
                management,<br className="hidden md:block" />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary-bright">reimagined.</span>
              </motion.h1>

              <motion.p
                custom={3} initial="hidden" animate="visible" variants={fadeUp}
                className="text-base md:text-xl text-muted/90 max-w-xl mb-10 drop-shadow-lg leading-relaxed"
              >
                Navigate your university through an interactive digital twin. Book laboratories, seminar halls, and equipment from one intelligent, unified interface.
              </motion.p>

              <motion.div
                custom={4} initial="hidden" animate="visible" variants={fadeUp}
                className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto pointer-events-auto"
              >
                <Link href="/dashboard" className="w-full sm:w-auto">
                  <Button size="lg" variant="primary" className="group h-14 px-8 text-base shadow-[0_0_30px_rgba(79,140,255,0.25)] w-full w-full">
                    Explore Campus
                    <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
                <Link href="#how-it-works" className="w-full sm:w-auto">
                  <Button size="lg" variant="secondary" className="h-14 px-8 text-base bg-surface-2/80 backdrop-blur-md hover:bg-surface-2/100 border border-border w-full">
                    See How It Works
                  </Button>
                </Link>
              </motion.div>
            </div>

            {/* The right side is intentionally left empty so the 3D campus breathes */}
            <div className="hidden md:block w-full md:w-2/5 lg:w-1/2"></div>
          </div>

          <div className="absolute bottom-0 w-full h-32 bg-gradient-to-t from-[#050816] to-transparent z-10 pointer-events-none" />
        </section>

        {/* FEATURES SECTION */}
        <section id="features" className="py-24 relative z-20 bg-[#050816]">
          <div className="container mx-auto px-4 md:px-6">
            <motion.div
              initial="hidden" whileInView="visible" viewport={viewPortReveal} custom={1} variants={fadeUp}
              className="text-center mb-20 max-w-3xl mx-auto"
            >
              <h2 className="text-3xl md:text-5xl font-bold mb-6 tracking-tight">Unified platform for all resources</h2>
              <p className="text-lg md:text-xl text-muted">
                Replace fragmented systems with one intuitive, modern ecosystem designed to optimize space and equipment utilization.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                {
                  icon: <Box className="h-6 w-6 text-cyan-400" />,
                  bg: "bg-cyan-400/10",
                  borderHover: "hover:border-cyan-400/40 hover:shadow-[0_0_30px_rgba(34,211,238,0.1)]",
                  title: "Digital Twin 3D View",
                  desc: "Navigate visually. See resource availability mapped directly to specific buildings and floors in real-time."
                },
                {
                  icon: <Building2 className="h-6 w-6 text-violet-400" />,
                  bg: "bg-violet-400/10",
                  borderHover: "hover:border-violet-400/40 hover:shadow-[0_0_30px_rgba(167,139,250,0.1)]",
                  title: "Facility Management",
                  desc: "Manage everything from large lecture halls and sports complexes to individual workstations and specialized equipment."
                },
                {
                  icon: <Zap className="h-6 w-6 text-emerald-400" />,
                  bg: "bg-emerald-400/10",
                  borderHover: "hover:border-emerald-400/40 hover:shadow-[0_0_30px_rgba(52,211,153,0.1)]",
                  title: "Real-time Availability",
                  desc: "Prevent double-bookings effortlessly. Status updates instantly across the platform as soon as a reservation is made."
                },
                {
                  icon: <Calendar className="h-6 w-6 text-amber-500" />,
                  bg: "bg-amber-500/10",
                  borderHover: "hover:border-amber-500/40 hover:shadow-[0_0_30px_rgba(245,158,11,0.1)]",
                  title: "Smart Scheduling",
                  desc: "Automated conflict resolution and intelligent suggestions for alternative spaces tailored to your requirements."
                },
                {
                  icon: <Users className="h-6 w-6 text-cyan-400" />,
                  bg: "bg-cyan-400/10",
                  borderHover: "hover:border-cyan-400/40 hover:shadow-[0_0_30px_rgba(34,211,238,0.1)]",
                  title: "Role-based Access",
                  desc: "Granular permissions for students, faculty, and administrative staff ensuring resources are utilized correctly."
                },
                {
                  icon: <Shield className="h-6 w-6 text-rose-400" />,
                  bg: "bg-rose-400/10",
                  borderHover: "hover:border-rose-400/40 hover:shadow-[0_0_30px_rgba(251,113,133,0.1)]",
                  title: "Enterprise Security",
                  desc: "Built with secure cloud infrastructure and protected authentication to safeguard institutional data and privacy."
                }
              ].map((feature, i) => (
                <motion.div
                  key={i}
                  initial="hidden" whileInView="visible" viewport={viewPortConfig} custom={(i % 3) + 1} variants={fadeUp}
                  className={`bg-[#101a31]/90 rounded-2xl p-8 border border-border transition-all duration-300 group hover:-translate-y-1 shadow-[0_4px_24px_rgba(0,0,0,0.25)] ${feature.borderHover}`}
                >
                  <div className={`h-14 w-14 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 ${feature.bg}`}>
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-semibold mb-3 tracking-tight">{feature.title}</h3>
                  <p className="text-muted leading-relaxed text-sm md:text-base">{feature.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how-it-works" className="py-24 relative z-20 bg-[#0B1224]">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

          <div className="container mx-auto px-4 md:px-6">
            <motion.div
              initial="hidden" whileInView="visible" viewport={viewPortReveal} custom={1} variants={fadeUp}
              className="text-center mb-20 max-w-2xl mx-auto"
            >
              <h2 className="text-3xl md:text-5xl font-bold mb-6 tracking-tight">How it works</h2>
              <p className="text-lg md:text-xl text-muted">
                Secure a facility or vital equipment block in three intuitive steps.
              </p>
            </motion.div>

            <div className="relative flex flex-col md:flex-row items-start justify-between gap-12 max-w-5xl mx-auto">

              {/* Desktop Connecting Line */}
              <div className="hidden md:block absolute top-[44px] left-[15%] right-[15%] h-[2px] bg-border z-0">
                <motion.div
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={viewPortReveal}
                  transition={{ duration: 1.5, ease: "easeInOut" }}
                  className="h-full bg-primary origin-left"
                />
              </div>

              {[
                {
                  icon: <Map className="h-6 w-6 text-primary" />,
                  title: "Find Space",
                  desc: "Use the map or advanced search to pinpoint the facility that meets your specific technical or capacity needs."
                },
                {
                  icon: <Calendar className="h-6 w-6 text-primary" />,
                  title: "Select Time",
                  desc: "Check real-time availability, select a timeslot, and submit any necessary departmental approval requests."
                },
                {
                  icon: <CheckCircle2 className="h-6 w-6 text-primary" />,
                  title: "Confirm & Use",
                  desc: "Receive instant confirmation and digital access keys to proceed seamlessly into your booked environment."
                }
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial="hidden" whileInView="visible" viewport={viewPortConfig} custom={i + 2} variants={fadeUp}
                  className="flex-1 flex flex-col items-center text-center relative z-10 w-full"
                >
                  <div className="h-[88px] w-[88px] rounded-full bg-[#101a31]/90 border-[4px] border-[#0B1224] flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(79,140,255,0.15)]">
                    {item.icon}
                  </div>
                  <h3 className="text-xl font-bold mb-3 tracking-tight">{item.title}</h3>
                  <p className="text-muted leading-relaxed max-w-[280px]">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        </section>

        {/* CTA */}
        <section className="py-32 relative z-20 bg-[#050816] overflow-hidden">
          <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-[400px] bg-primary/20 blur-[120px] rounded-full pointer-events-none opacity-50" />

          <div className="container mx-auto px-4 md:px-6 text-center relative z-10">
            <motion.div initial="hidden" whileInView="visible" viewport={viewPortReveal} custom={1} variants={fadeUp}>
              <h2 className="text-4xl md:text-6xl font-bold mb-6 tracking-tight">Ready to streamline your campus?</h2>
              <p className="text-lg md:text-xl text-muted max-w-2xl mx-auto mb-10">
                Deploy a scalable space management system designed to prevent conflicts, maximize utilization, and provide visibility across all university facilities.
              </p>
              <Link href="/dashboard">
                <Button size="lg" variant="primary" className="h-14 px-10 text-lg shadow-[0_4px_20px_rgba(79,140,255,0.4)] group">
                  Enter Campus Digital Twin
                  <ArrowRight className="ml-3 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
            </motion.div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="bg-[#050816] py-12 border-t border-border relative z-20">
        <div className="container mx-auto px-4 md:px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 grayscale opacity-80 hover:grayscale-0 hover:opacity-100 transition-all">
            <div className="h-6 w-6 rounded-md bg-primary/20 border border-primary/50 flex items-center justify-center">
              <div className="h-2 w-2 bg-primary rounded-sm shadow-[0_0_10px_#4F8CFF]" />
            </div>
            <span className="font-semibold text-white tracking-tight">CampusFlow</span>
          </div>

          <p className="text-sm text-muted">
            &copy; {new Date().getFullYear()} Campus Booking Platform.
          </p>

          <div className="flex gap-6 text-sm font-medium text-muted">
            <Link href="#" className="hover:text-primary transition-colors">Privacy</Link>
            <Link href="#" className="hover:text-primary transition-colors">Terms of Service</Link>
            <Link href="#" className="hover:text-primary transition-colors">Support</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
