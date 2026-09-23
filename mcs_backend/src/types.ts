import type { Request } from 'express';

export interface User {
  id_user: number;
  fullname: string;
  username: string;
  email: string;
  avatar: string;
  active: number;
  id_company: string;
  id_division: string;
  id_departement: string;
  id_section: string;
  id_position: string;
  division_code?: string;
  division_name?: string;
  company_name?: string;
  [key: string]: unknown;
}

export interface AuthRequest extends Request {
  user?: User;
  apiClient?: { id: number; name: string };
}
