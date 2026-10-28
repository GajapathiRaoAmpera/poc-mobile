import { z } from "zod";

// Mirrors backend rules (app/core/security.py, app/modules/auth/schemas.py).
export const emailSchema = z.string().trim().min(1, "Enter your email address").pipe(z.email("Enter a valid email address"));
export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128, "Use at most 128 characters");
export const nameSchema = z.string().trim().min(1, "Enter your name").max(120, "Use at most 120 characters");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
});

export const registerSchema = z
  .object({ name: nameSchema, email: emailSchema, password: passwordSchema })
  .refine((v) => v.password.trim().toLowerCase() !== v.email.trim().toLowerCase(), {
    path: ["password"],
    message: "Password must not be the same as your email",
  });

export const forgotSchema = z.object({ email: emailSchema });

export const resetSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

export const changePasswordSchema = z
  .object({ current_password: z.string().min(1, "Enter your current password"), new_password: passwordSchema, confirm: z.string() })
  .refine((v) => v.new_password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;

export type Role = "USER" | "SUPER_ADMIN";
export type UserStatus = "ACTIVE" | "DISABLED";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  last_login_at: string | null;
  created_at: string;
}
