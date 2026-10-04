"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Lock, Mail, AlertCircle, Sparkles } from "lucide-react";

import { Card, CardHeader, CardTitle, CardDescription, CardContent, Input, Button } from "@/components/ui";
import { api } from "@/lib/api";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Please provide both email and password.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await api.auth.login(email.trim(), password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid institutional credentials. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickFill = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword("CampusFlow@2026!");
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#050816] text-[#F8FAFC] flex flex-col justify-center items-center px-4 py-8 sm:px-6 lg:px-8 relative selection:bg-[#4F8CFF]/30">
      {/* Background ambient lighting */}
      <div className="absolute inset-0 bg-radial-[circle_at_50%_20%] from-primary/10 via-transparent to-transparent pointer-events-none" />

      {/* Back to Home Link */}
      <div className="w-full max-w-md mb-6 z-10">
        <Link
          href="/"
          className="inline-flex items-center text-xs sm:text-sm text-muted hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5 transition-transform group-hover:-translate-x-1" />
          Back to CampusFlow Home
        </Link>
      </div>

      {/* Main Sign-in Card */}
      <Card className="w-full max-w-md border border-border bg-[#0B1224]/95 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-10 p-6 sm:p-8">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 h-12 w-12 rounded-xl bg-primary/20 border border-primary/50 flex items-center justify-center shadow-[0_0_20px_rgba(79,140,255,0.2)]">
            <div className="h-4 w-4 bg-primary rounded-sm shadow-[0_0_10px_#4F8CFF]" />
          </div>
          <CardTitle className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Sign In
          </CardTitle>
          <CardDescription className="text-sm text-muted mt-2">
            Access your university account to manage academic timetables, laboratories, and resource reservations.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4">
          {error && (
            <div
              className="mb-5 flex items-start gap-3 rounded-lg border border-danger/40 bg-danger/10 p-3.5 text-xs sm:text-sm text-danger"
              role="alert"
            >
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                label="Institutional Email"
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="student@campusflow.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div>
              <Input
                label="Password"
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={isLoading}
              className="w-full mt-2 shadow-[0_0_25px_rgba(79,140,255,0.25)]"
            >
              Sign In to CampusFlow
            </Button>
          </form>

          {/* Quick Demo Logins Section */}
          <div className="mt-8 pt-6 border-t border-border/70">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Quick Demo Credentials:
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleQuickFill("student@campusflow.edu")}
                className="text-xs py-1.5 px-2 rounded bg-surface-2 hover:bg-surface-2/80 border border-border text-foreground transition-colors font-medium text-center"
              >
                Student
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill("faculty@campusflow.edu")}
                className="text-xs py-1.5 px-2 rounded bg-surface-2 hover:bg-surface-2/80 border border-border text-foreground transition-colors font-medium text-center"
              >
                Faculty
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill("admin@campusflow.edu")}
                className="text-xs py-1.5 px-2 rounded bg-surface-2 hover:bg-surface-2/80 border border-border text-foreground transition-colors font-medium text-center"
              >
                Admin
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Footer copyright */}
      <p className="mt-8 text-center text-xs text-muted/70 z-10">
        &copy; {new Date().getFullYear()} CampusFlow Academic Platform. Enterprise SSO & RBAC enabled.
      </p>
    </div>
  );
}
