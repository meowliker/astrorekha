import AdminAccessGate from '@/components/admin/AdminAccessGate';
export default function Layout({children}:{children:React.ReactNode}){return <AdminAccessGate>{children}</AdminAccessGate>;}
