"use client";

import {useQuery} from "@tanstack/react-query";
import {AlertTriangle,CheckCircle2,Clock3} from "lucide-react";
import {Card} from "@/components/ui/primitives";
import {getSubmoduleCatalog} from "@/lib/api/dashboard";

export function SubmoduleMiniDashboard({group}:{group:'ASSET'|'MAINTENANCE'|'SPAREPART'|'FLEET'|'ENERGY'|'GOVERNANCE'|'GENERAL_AFFAIR'}){
 const query=useQuery({queryKey:['submodule-mini-dashboard',group],queryFn:({signal})=>getSubmoduleCatalog({group},signal)});const rows=query.data?.data??[];
 if(query.isLoading)return <div className="h-24 animate-pulse rounded-xl bg-slate-100"/>;
 if(query.error)return null;
 if(!rows.length)return <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Belum ada aktivitas submodul yang ditugaskan kepada Anda.</p>;
 return <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{rows.map(x=><Card key={x.module_code} className="p-3 shadow-none"><div className="flex items-start gap-2"><span className="rounded bg-blue-50 px-2 py-1 text-[11px] font-bold text-brand-700">{x.module_code}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold" title={x.module_name}>{x.module_name}</p><p className="text-[10px] text-slate-400">{x.rollout_status.replaceAll('_',' ')}</p></div></div><div className="mt-3 grid grid-cols-3 gap-1 text-center"><Metric icon={CheckCircle2} label="Transaksi" value={x.transaction_count}/><Metric icon={Clock3} label="Validasi" value={x.pending_count}/><Metric icon={AlertTriangle} label="Overdue" value={x.overdue_count} danger={Number(x.overdue_count)>0}/></div></Card>)}</div>;
}
function Metric({icon:Icon,label,value,danger=false}:{icon:typeof Clock3;label:string;value:number;danger?:boolean}){return <span className={`rounded-md p-1.5 ${danger?'bg-rose-50 text-rose-700':'bg-slate-50 text-slate-600'}`}><span className="flex items-center justify-center gap-1 text-sm font-bold"><Icon className="h-3 w-3"/>{Number(value).toLocaleString('id-ID')}</span><span className="block text-[9px]">{label}</span></span>}
