import { redirect } from 'next/navigation';

export default function EmployeeLoginPage() {
  redirect('/login?app=team');
}
