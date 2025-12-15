import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3001').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SERVICEDESK_BASE_URL: z.string().url(),
  SERVICEDESK_AUTHTOKEN: z.string().min(1, 'SERVICEDESK_AUTHTOKEN is required'),
  ALLOWED_ORIGINS: z.string().transform((val) => 
    val.split(',').map((origin) => origin.trim()).filter(Boolean)
  ),
  ADMIN_SYNC_KEY: z.string().min(32, 'ADMIN_SYNC_KEY must be at least 32 characters'),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(JSON.stringify(result.error.flatten().fieldErrors, null, 2));
    process.exit(1);
  }
  
  return result.data;
}

export const env = validateEnv();
