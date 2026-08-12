import React from 'react';
import {
  Building2,
  Factory,
  Landmark,
  Warehouse,
  ChevronRight,
  LogOut,
  ShieldCheck,
  Briefcase
} from 'lucide-react';
import BackButton from './BackButton';
import type { User } from '../types';
import {
  WorkContext,
  groupContextsByTenant,
  normalizeWorkTenant
} from '../utils/workContextUtils';

interface TenantWorkSelectorProps {
  user: User;
  contexts: WorkContext[];
  onSelect: (ctx: WorkContext) => void;
  onLogout: () => void;
}

/**
 * Seletor de Contrato de Trabalho (pós-login).
 *
 * Aparece quando o usuário está autorizado em mais de um contexto
 * (tenantid + filial). Botões grandes de toque rápido, agrupados por
 * contrato — ideal para ambiente mobile/Android. A escolha define QUAIS
 * dados são carregados (isolamento por contrato).
 */
const TenantWorkSelector: React.FC<TenantWorkSelectorProps> = ({
  user,
  contexts,
  onSelect,
  onLogout
}) => {
  const groups = groupContextsByTenant(contexts);

  const getTenantIdentity = (tenantid: string) => {
    const hash = tenantid.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const palettes = [
      'bg-blue-50 text-blue-700 border-blue-100',
      'bg-emerald-50 text-emerald-700 border-emerald-100',
      'bg-purple-50 text-purple-700 border-purple-100',
      'bg-amber-50 text-amber-700 border-amber-100',
      'bg-rose-50 text-rose-700 border-rose-100',
      'bg-indigo-50 text-indigo-700 border-indigo-100'
    ];
    const icons = [Building2, Factory, Landmark, Warehouse];
    return {
      style: palettes[hash % palettes.length],
      Icon: icons[hash % icons.length]
    };
  };

  const roleLabel = (user.role || '').toString();
  const userLabel = user.name || user.username || user.email || '';

  return (
    <div className="flex flex-col h-[100dvh] bg-bg-main animate-fadeIn overflow-hidden">
      {/* Header Slim Fixo */}
      <div className="pt-7 pb-4 px-4 bg-white border-b border-gray-100 flex flex-col gap-3.5 shadow-sm shrink-0 min-h-20">
        <div className="flex items-center justify-between w-full h-12">
          <div className="flex-shrink-0 flex items-center">
            <BackButton
              onClick={onLogout}
              label="Sair"
              subLabel="Cancelar"
            />
          </div>

          <div className="flex-1 flex flex-col items-center justify-center text-center px-1">
            <h2 className="text-[13px] sm:text-sm font-black text-ink uppercase tracking-[0.1em] leading-tight select-none">
              Contrato de Trabalho
            </h2>
            <p className="text-accent text-[8px] font-extrabold uppercase tracking-widest mt-0.5 leading-none select-none">
              Escolha o Contrato e a Filial
            </p>
          </div>

          <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center text-white shadow-md flex-shrink-0">
            <Briefcase size={16} />
          </div>
        </div>

        {/* Identificação do usuário */}
        <div className="flex items-center justify-between bg-bg-main rounded-xl px-3.5 py-2.5 border border-border">
          <div className="flex items-center space-x-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
              <ShieldCheck size={15} />
            </div>
            <div className="min-w-0 text-left">
              <p className="text-[10px] font-black uppercase tracking-wider text-ink truncate">
                {userLabel}
              </p>
              <p className="text-[8px] font-bold uppercase tracking-widest text-ink-muted truncate">
                {roleLabel} · {user.email}
              </p>
            </div>
          </div>
          <span className="text-[8px] font-black uppercase tracking-widest text-ink-muted/60 flex-shrink-0">
            {contexts.length} contratos
          </span>
        </div>
      </div>

      {/* Corpo com scroll */}
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-28 space-y-5">
        <p className="text-[9px] font-bold uppercase tracking-widest text-ink-muted text-center leading-relaxed">
          Você está autorizado em mais de um contrato.
          <br />
          Selecione onde deseja trabalhar agora.
        </p>

        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <div className="w-14 h-14 bg-amber-50 border border-amber-100 rounded-2xl flex items-center justify-center text-amber-500 mb-4">
              <Briefcase size={26} />
            </div>
            <p className="font-extrabold uppercase tracking-[0.1em] text-[10px] text-amber-600 mb-2">
              Nenhum contrato disponível
            </p>
            <p className="text-[9px] font-bold text-ink-muted uppercase tracking-wider max-w-[240px] leading-relaxed">
              Contate o administrador do sistema para vincular seu contrato.
            </p>
          </div>
        ) : (
          groups.map((group) => {
            const { style, Icon } = getTenantIdentity(group.tenantid);
            const buttons = group.filiais.length
              ? group.filiais
              : [''];
            return (
              <div key={group.tenantid} className="space-y-2.5">
                {/* Cabeçalho do contrato */}
                <div className="flex items-center space-x-2.5 px-1">
                  <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${style}`}>
                    <Icon size={18} strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.12em] text-ink truncate">
                      {group.tenantid}
                    </p>
                    <p className="text-[7.5px] font-extrabold uppercase tracking-widest text-ink-muted">
                      CONTRATO (TENANTID)
                    </p>
                  </div>
                  {buttons.length > 1 && (
                    <span className="text-[8px] font-black uppercase tracking-widest text-ink-muted/50">
                      {buttons.length} filiais
                    </span>
                  )}
                </div>

                {/* Botões de filial — toque rápido */}
                <div className="space-y-2">
                  {buttons.map((filial) => (
                    <button
                      key={filial || group.tenantid}
                      type="button"
                      onClick={() => onSelect({ tenantid: group.tenantid, filial })}
                      className="w-full bg-white rounded-2xl px-4 py-4 flex items-center justify-between shadow-sm border border-gray-100 active:scale-[0.98] active:border-accent hover:border-accent/40 transition-all cursor-pointer min-h-[60px]"
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
                          <Building2 size={17} strokeWidth={2.5} />
                        </div>
                        <div className="min-w-0 text-left">
                          <p className="text-[13px] font-bold text-ink truncate">
                            {filial || group.tenantid}
                          </p>
                          <p className="text-[8px] font-extrabold uppercase tracking-widest text-ink-muted">
                            {filial ? `FILIAL · ${normalizeWorkTenant(group.tenantid)}` : 'TODAS AS FILIAIS'}
                          </p>
                        </div>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-bg-main flex items-center justify-center text-accent flex-shrink-0">
                        <ChevronRight size={16} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Barra inferior: sair da conta */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-xl border-t border-border z-50 shadow-lg">
        <button
          type="button"
          onClick={onLogout}
          className="w-full py-3.5 rounded-xl border border-red-100 bg-red-50 text-red-600 font-extrabold uppercase text-[9px] tracking-[0.15em] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <LogOut size={15} />
          Sair da conta
        </button>
      </div>
    </div>
  );
};

export default TenantWorkSelector;
