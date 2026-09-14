import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import { config } from '../config.js';

export interface Employee {
  EmployeeID?: string | number;
  EmployeeCode?: string;
  FullName?: string;
  Email?: string;
  Company?: string;
  Position?: string;
  JobTitle?: string;
  PositionName?: string;
  Division?: string;
  Department?: string;
  DivisionName?: string;
  MobilePhone?: string;
  MOBILEPHONE?: string;
  Mobilephone?: string;
  Mobile_Phone?: string;
  Phone?: string;
  NoHP?: string;
  [key: string]: unknown;
}

export interface EmployeeSearchResult {
  employee_id: string | number | null;
  employee_code: string;
  name: string;
  email: string;
  phone: string;
  position: string;
  division: string;
  company: string;
  company_code: string;
}

const KNOWN_COMPANY_CODES = ['UC', 'RU', 'GSU'] as const;
const employeeCache = new Map<string, Employee[] | null>();

export function resolveCompanyCode(value: string): string {
  const upper = value.trim().toUpperCase();
  if (upper === '') return '';
  if (upper === 'UC' || upper.includes('UTAMA CORPORATION')) return 'UC';
  if (upper === 'RU' || upper.includes('RATIMDO UTAMA')) return 'RU';
  if (upper === 'GSU' || upper.includes('GANDA SARIBU UTAMA')) return 'GSU';
  return upper;
}

function requestJson(path: string): Promise<{ success?: boolean; data?: Employee[] } | null> {
  return new Promise((resolve) => {
    const baseUrl = config.employeeApi.baseUrl.replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(baseUrl)) { resolve(null); return; }
    let target: URL;
    try {
      target = new URL(`${baseUrl}/${path.replace(/^\/+/, '')}`);
    } catch {
      resolve(null);
      return;
    }
    const client = target.protocol === 'https:' ? https : http;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (config.employeeApi.token) headers.Authorization = `Bearer ${config.employeeApi.token}`;

    const request = client.request(target, { method: 'GET', headers, timeout: 15000 }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        const status = response.statusCode ?? 0;
        if (status < 200 || status >= 300) { resolve(null); return; }
        try {
          const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve(parsed && typeof parsed === 'object' ? (parsed as { success?: boolean; data?: Employee[] }) : null);
        } catch {
          resolve(null);
        }
      });
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(null));
    request.end();
  });
}

export async function getEmployeesByCompany(companyCode: string): Promise<Employee[] | null> {
  const code = resolveCompanyCode(companyCode);
  if (code === '') return null;
  if (employeeCache.has(code)) return employeeCache.get(code)!;
  const endpoint = config.employeeApi.endpointByCompany[code] ?? config.employeeApi.endpointByCompany.GSU;
  if (!endpoint) { employeeCache.set(code, null); return null; }
  const result = await requestJson(endpoint);
  if (!result || !result.success || !Array.isArray(result.data)) { employeeCache.set(code, null); return null; }
  employeeCache.set(code, result.data);
  return result.data;
}

export interface EmployeeLookupResult {
  status: 'found' | 'not_found' | 'unavailable';
  employee: Employee | null;
}

export async function findEmployeeForUserResult(companyCode: string, username: string, email = ''): Promise<EmployeeLookupResult> {
  const employees = await getEmployeesByCompany(companyCode);
  if (!employees) return { status: 'unavailable', employee: null };
  const uname = username.trim();
  const mail = email.trim();
  for (const emp of employees) {
    const empCode = String(emp.EmployeeCode ?? '').trim();
    const empEmail = String(emp.Email ?? '').trim();
    if (uname !== '' && empCode !== '' && empCode.toLowerCase() === uname.toLowerCase()) return { status: 'found', employee: emp };
    if (mail !== '' && empEmail !== '' && empEmail.toLowerCase() === mail.toLowerCase()) return { status: 'found', employee: emp };
  }
  return { status: 'not_found', employee: null };
}

export async function searchEmployees(q: string, company = ''): Promise<EmployeeSearchResult[]> {
  const trimmedCompany = company.trim();
  let codes: string[];
  if (trimmedCompany === '' || trimmedCompany === '-' || trimmedCompany === '0') {
    codes = [...KNOWN_COMPANY_CODES];
  } else {
    const resolved = resolveCompanyCode(trimmedCompany);
    codes = (KNOWN_COMPANY_CODES as readonly string[]).includes(resolved) ? [resolved] : [...KNOWN_COMPANY_CODES];
  }

  const needle = q.trim().toLowerCase();
  const out: EmployeeSearchResult[] = [];
  for (const code of codes) {
    const employees = await getEmployeesByCompany(code);
    if (!employees) continue;
    for (const emp of employees) {
      const name = String(emp.FullName ?? '');
      const empCode = String(emp.EmployeeCode ?? '');
      const email = String(emp.Email ?? '');
      if (empCode === '' && name === '') continue;
      const haystack = `${name} ${empCode} ${email}`.toLowerCase();
      if (!haystack.includes(needle)) continue;
      out.push({
        employee_id: (emp.EmployeeID as string | number | undefined) ?? null,
        employee_code: empCode,
        name,
        email,
        phone: String(emp.MobilePhone ?? emp.MOBILEPHONE ?? emp.Mobilephone ?? emp.Mobile_Phone ?? emp.Phone ?? emp.NoHP ?? ''),
        position: String(emp.Position ?? emp.JobTitle ?? emp.PositionName ?? ''),
        division: String(emp.Division ?? emp.Department ?? emp.DivisionName ?? ''),
        company: String(emp.Company ?? code),
        company_code: code,
      });
      if (out.length >= 15) return out;
    }
  }
  return out;
}
