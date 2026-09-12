export const companyRoles = ['OWNER', 'OFFICE', 'EMPLOYEE', 'CUSTOMER'] as const;
export type CompanyRole = (typeof companyRoles)[number];

export const membershipStatuses = ['ACTIVE', 'INVITED', 'DISABLED'] as const;
export type MembershipStatus = (typeof membershipStatuses)[number];

export interface Company {
  id: string;
  name: string;
  slug: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  auth_user_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  company_id: string;
  name: string;
  customer_number: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  billing_address: string | null;
  city: string | null;
  postal_code: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CleaningObject {
  id: string;
  company_id: string;
  customer_id: string;
  name: string;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  access_instructions: string | null;
  cleaning_instructions: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
