import 'dotenv/config';

const integer = (name: string, fallback: number): number => {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: integer('PORT', 3000),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
  maxUploadBytes: integer('MAX_UPLOAD_MB', 25) * 1024 * 1024,
  jwtSecret: process.env.JWT_SECRET ?? 'ratimdoKey',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '24h',
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: integer('DB_PORT', 3306),
    database: process.env.DB_NAME ?? 'mcs_new',
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
  },
  employeeApi: {
    baseUrl: process.env.EMP_API_BASE_URL ?? 'https://emp.padmoasm.com',
    token: process.env.EMP_API_TOKEN ?? '',
    endpointByCompany: {
      UC: '/api/v1/q/employee-uc',
      RU: '/api/v1/q/employee-ru',
      GSU: '/api/v1/q/employee',
    } as Record<string, string>,
  },
} as const;
