import Link from "next/link";
import { redirect } from "next/navigation";
import { appPath } from "@/lib/base-path";
import { requireCbaityhyAdmin } from "@/lib/auth";
import "./admin.css";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try { await requireCbaityhyAdmin(); } catch { redirect(appPath("/")); }
  return <div className="backoffice-shell"><aside className="backoffice-nav"><div><strong>CBAItyhy</strong><span>Administração interna</span></div><nav><Link href={appPath("/admin")}>Visão administrativa</Link><Link href={appPath("/admin/municipios")}>Municípios e conexões</Link><Link href={appPath("/admin/processamentos")}>Processamentos</Link><Link href={appPath("/admin/consumo-ia")}>Consumo de IA</Link></nav><Link className="backoffice-return" href={appPath("/")}>← Acessar municípios</Link></aside><section className="backoffice-content">{children}</section></div>;
}
