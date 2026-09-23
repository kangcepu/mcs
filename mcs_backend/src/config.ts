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
  scheduleCronExpr: process.env.SCHEDULE_CRON_EXPR ?? '0 * * * *',
  preventiveAlarmCronExpr: process.env.PREVENTIVE_ALARM_CRON_EXPR ?? '30 15 * * *',
  employeeSyncCronExpr: process.env.EMPLOYEE_SYNC_CRON_EXPR ?? '*/15 * * * *',
  legacyBaseUrl: (process.env.LEGACY_BASE_URL ?? 'https://mcs.padmoasm.com').replace(/\/+$/, ''),
  firebaseServiceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? '',
  erpMssql: {
    host: process.env.ERP_MSSQL_HOST ?? '192.168.10.100',
    user: process.env.ERP_MSSQL_USER ?? 'sa',
    password: process.env.ERP_MSSQL_PASSWORD ?? '',
    port: integer('ERP_MSSQL_PORT', 1433),
    databases: {
      UC: process.env.ERP_MSSQL_DB_UC ?? 'AS_UC_2017',
      RU: process.env.ERP_MSSQL_DB_RU ?? 'AS_RU',
      GSU: process.env.ERP_MSSQL_DB_GSU ?? 'AS_GSU',
      GSU_TEST5: process.env.ERP_MSSQL_DB_GSU_TEST5 ?? 'AS_GSU_TEST5',
    },
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
