"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { sendPasswordResetEmail } from "firebase/auth";
import type { z } from "zod";
import { auth } from "@/lib/firebase/client";
import { forgotPasswordSchema } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/common/field";
import { Input } from "@/components/ui/input";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const form = useForm<z.infer<typeof forgotPasswordSchema>>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = form.handleSubmit(async ({ email }) => {
    // Always show the same message so the form doesn't reveal which emails have accounts.
    await sendPasswordResetEmail(auth(), email).catch(() => undefined);
    setSent(true);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset password</CardTitle>
        <CardDescription>We&apos;ll email you a link to choose a new password.</CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="grid gap-4 text-sm">
            <p>If an account exists for that email, a reset link is on its way. Check your inbox.</p>
            <Button asChild variant="outline">
              <Link href="/login">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-4" noValidate>
            <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message}>
              <Input id="email" type="email" autoComplete="email" autoFocus {...form.register("email")} />
            </Field>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Sending…" : "Send reset link"}
            </Button>
            <Link href="/login" className="text-center text-sm text-muted-foreground hover:underline">
              Back to sign in
            </Link>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
