import { z } from 'zod';

export const signUpSchema = z
  .object({
    email: z.string().trim().min(1, 'Email is required').email('Enter a valid email'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export type SignUpFormData = z.infer<typeof signUpSchema>;

export const logInSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export type LogInFormData = z.infer<typeof logInSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email'),
});

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export const onboardingSchema = z.object({
  business_name: z.string().trim().min(1, 'Business name is required').max(100),
  currency: z.string().trim().min(1, 'Currency is required').max(10),
  timezone: z.string().trim().min(1, 'Timezone is required'),
});

export type OnboardingFormData = z.infer<typeof onboardingSchema>;
