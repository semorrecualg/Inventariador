# 📱 Guia Visual das Telas de Login

## Versão Mobile (300px - 667px)

### Tela 1: Boas-vindas (LoginWelcome)

```
╔═══════════════════════════════════╗
║                                   ║
║         ┌─────────────┐            ║
║         │  GBR LOGO   │            ║
║         │   (Azul)    │            ║
║         └─────────────┘            ║
║                                   ║
║     Bem-vindo ao Inventariador    ║
║                                   ║
║   Sistema inteligente de gestão   ║
║      de ativos em tempo real      ║
║                                   ║
║ ┌──────────────────────────────┐  ║
║ │ 🏢 Gestão Completa           │  ║
║ │    Controle total de ativos  │  ║
║ └──────────────────────────────┘  ║
║                                   ║
║ ┌──────────────────────────────┐  ║
║ │ 🔒 Segurança                 │  ║
║ │    Autenticação biométrica   │  ║
║ └──────────────────────────────┘  ║
║                                   ║
║ ┌──────────────────────────────┐  ║
║ │ ⚡ Rápido                    │  ║
║ │    Sem necessidade de internet   │
║ └──────────────────────────────┘  ║
║                                   ║
║  ╔═══════════════════════════════╗ ║
║  ║  Continuar →                  ║ ║
║  ║ Gradiente azul | Branco texto  ║ ║
║  ╚═══════════════════════════════╝ ║
║                                   ║
║  ┌─────────────────────────────┐  ║
║  │ Modo Demonstração           │  ║
║  │ Fundo branco | Bordas cinzas    │
║  └─────────────────────────────┘  ║
║                                   ║
║  Versão 2.6.0 | © 2024           ║
║                                   ║
╚═══════════════════════════════════╝
```

**Cores:**
- Fundo: Gradiente azul → cinza claro
- Botão Primário: Azul (#2563EB)
- Botão Secundário: Branco com borda cinza
- Texto: Cinza escuro

**Animações:**
- Logo: Scale 0.8 → 1
- Título: Y: 20px → 0
- Features: Fade + Stagger
- Botões: Fade com delay

---

### Tela 2: Email (LoginEmail)

```
╔═══════════════════════════════════╗
║                                   ║
║ [←] Passo 1 de 2 [→]             ║
║  Voltar | Indicador | Próximo    ║
║                                   ║
║           ┌─────────┐             ║
║           │ GBR     │             ║
║           │ (Mini)  │             ║
║           └─────────┘             ║
║                                   ║
║      Qual é seu email?            ║
║   Ou seu nome de usuário          ║
║                                   ║
║   ┌────────────────────────────┐  ║
║   │ 📧 seu.email@exemplo.com  │  ║
║   │    (com foco: azul)         │  ║
║   └────────────────────────────┘  ║
║                                   ║
║ (Sem erro mostrado neste estado)  ║
║                                   ║
║                                   ║
║  ╔═══════════════════════════════╗ ║
║  ║  Próximo →                    ║ ║
║  ║ (Desativado se vazio)         ║ ║
║  ╚═══════════════════════════════╝ ║
║                                   ║
║                                   ║
║  💡 Você pode usar seu email ou    ║
║     nome de usuário para acessar   ║
║                                   ║
╚═══════════════════════════════════╝

SE HOUVER ERRO:

╔═══════════════════════════════════╗
║  ...                              ║
║  ┌────────────────────────────┐   ║
║  │ 📧 [input vazio ou inválido]   ║
║  └────────────────────────────┘   ║
║                                    ║
║  ┌────────────────────────────┐   ║
║  │ ❌ Por favor, digite um     │   ║
║  │    email ou usuário válido      │
║  └────────────────────────────┘   ║
║                                    ║
║  ╔═══════════════════════════════╗ ║
║  ║  Próximo →                    ║ ║
║  ║ (Desativado)                  ║ ║
║  ╚═══════════════════════════════╝ ║
╚════════════════════════════════════╝
```

**Validações Visuais:**
- Vazio: Input cinza, botão desativado
- Focado: Input com borda azul, ícone azul
- Erro: Borda/texto vermelho
- Válido: Input com ícone verde (opcional)

---

### Tela 3: Senha (LoginPassword)

```
╔═══════════════════════════════════╗
║                                   ║
║ [←] Passo 2 de 2 [→]             ║
║                                   ║
║           ┌─────────┐             ║
║           │ GBR     │             ║
║           │ (Mini)  │             ║
║           └─────────┘             ║
║                                   ║
║       Agora sua senha             ║
║   seu.email@exemplo.com           ║
║                                   ║
║   ┌────────────────────────────┐  ║
║   │ 🔒 ••••••••••   👁 (toggle) │  ║
║   │                             │  ║
║   │ (com foco: azul)            │  ║
║   └────────────────────────────┘  ║
║                                   ║
║ (Sem erro mostrado neste estado)  ║
║                                   ║
║  ╔═══════════════════════════════╗ ║
║  ║  👆 Usar Biometria           ║ ║
║  ║ (Verde, se registrado)        ║ ║
║  ╚═══════════════════════════════╝ ║
║                                   ║
║  ╔═══════════════════════════════╗ ║
║  ║  Acessar →                    ║ ║
║  ║ (Azul primário)               ║ ║
║  ╚═══════════════════════════════╝ ║
║                                   ║
║  ┌─────────────────────────────┐  ║
║  │ Voltar                      │  ║
║  │ (Branco com borda)          │  ║
║  └─────────────────────────────┘  ║
║                                   ║
║  🔒 Sua senha é criptografada     ║
║                                   ║
╚═══════════════════════════════════╝

MOSTRANDO SENHA:

╔═══════════════════════════════════╗
║   ┌────────────────────────────┐  ║
║   │ 🔒 minhaSenha123   👁✓ (aberto)  ║
║   └────────────────────────────┘  ║
╚═══════════════════════════════════╝

COM ERRO:

╔═══════════════════════════════════╗
║                                   ║
║   ┌────────────────────────────┐  ║
║   │ 🔒 ••••••••••   👁         │  ║
║   └────────────────────────────┘  ║
║                                   ║
║  ┌────────────────────────────┐   ║
║  │ ❌ Email ou senha incorretos    │
║  └────────────────────────────┘   ║
║                                   ║
║  ╔═══════════════════════════════╗ ║
║  ║  👆 Usar Biometria           ║ ║
║  ║ (Desativado durante erro)     ║ ║
║  ╚═══════════════════════════════╝ ║
║                                   ║
║  ╔═══════════════════════════════╗ ║
║  ║  Acessar →                    ║ ║
║  ║ (Normal ou com spinner)       ║ ║
║  ╚═══════════════════════════════╝ ║
╚═══════════════════════════════════╝
```

**Estados do Botão Biometria:**
- ✅ Registrado: Verde, clicável
- ❌ Não registrado: Escondido
- ⏳ Processando: Spinner animado

---

## Versão Tablet (768px - 1024px)

As telas usam max-width e centralizam-se horizontalmente:

```
                    ┌─────────────────────────────┐
                    │   (Conteúdo Centralizado)   │
                    │   max-width: 20rem / 320px  │
                    │                             │
    [← Passo 1/2]   │   Qual é seu email?        │
                    │   [Email Input]             │
                    │   [Próximo Button]          │
                    │                             │
                    └─────────────────────────────┘
```

---

## Versão Desktop (1024px+)

Mesma estrutura, mas com melhor use de espaço:

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│                                                                  │
│                    ┌──────────────────────┐                      │
│                    │   GBR LOGO           │                      │
│                    │   (Maior)            │                      │
│                    └──────────────────────┘                      │
│                                                                  │
│              Bem-vindo ao Inventariador                          │
│         Sistema inteligente de gestão                           │
│                                                                  │
│              ┌─────────┐  ┌─────────┐  ┌─────────┐             │
│              │Gestão   │  │Segurança│  │ Rápido  │             │
│              │Completa │  │         │  │         │             │
│              └─────────┘  └─────────┘  └─────────┘             │
│                                                                  │
│                    ┌──────────────────┐                         │
│                    │ Continuar →      │                         │
│                    └──────────────────┘                         │
│                                                                  │
│                    ┌──────────────────┐                         │
│                    │ Modo Demonstração│                         │
│                    └──────────────────┘                         │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Transições Entre Telas

### Animação de Entrada

```
Estado Inicial:
┌──────────────────────┐
│ opacity: 0           │
│ translateY: 100px    │
└──────────────────────┘

         Duration: 300ms
         Easing: ease-out
         
Estado Final:
┌──────────────────────┐
│ opacity: 1           │
│ translateY: 0px      │
└──────────────────────┘
```

### Animação de Saída

```
Estado Inicial:
┌──────────────────────┐
│ opacity: 1           │
│ translateY: 0px      │
└──────────────────────┘

         Duration: 300ms
         Easing: ease-in
         
Estado Final:
┌──────────────────────┐
│ opacity: 0           │
│ translateY: -100px   │
└──────────────────────┘
```

---

## Ícones e Símbolos

| Ícone | Significado | Cor |
|-------|------------|-----|
| 📧 | Email/Usuário | Azul |
| 🔒 | Senha/Segurança | Azul |
| 👁 | Mostrar/Esconder | Cinza |
| ✓ | Confirmação/Sucesso | Verde |
| ❌ | Erro | Vermelho |
| 🔄 | Carregando | Azul |
| 👆 | Biometria | Verde |
| [←] | Voltar | Cinza |
| [→] | Próximo | Cinza |

---

## Paleta de Cores

### Cores Principais

```
┌─────────────────────────────────┐
│ Primária: #2563EB              │ ← Azul
│ Fundo: #F8FAFC                 │ ← Cinza claro
│ Texto: #1E293B                 │ ← Cinza escuro
│ Borda: #E2E8F0                 │ ← Cinza claro
│ Sucesso: #10B981               │ ← Verde
│ Erro: #EF4444                  │ ← Vermelho
└─────────────────────────────────┘
```

### Gradientes

```
Welcome:
┌─────────────────────────────────┐
│ from-blue-50 → to-slate-50      │
│ Suave transição                 │
└─────────────────────────────────┘

Botão:
┌─────────────────────────────────┐
│ from-blue-600 → to-blue-700    │
│ Profundidade visual             │
└─────────────────────────────────┘
```

---

## Estados do Botão

### Primário (Continuar/Próximo/Acessar)

```
Normal:
  ┌──────────────────────────────┐
  │ Continuar →                  │
  │ bg-gradient-to-r from-blue-600
  │ text-white                   │
  │ shadow-lg shadow-blue-600/30 │
  └──────────────────────────────┘

Hover:
  ┌──────────────────────────────┐
  │ Continuar →                  │
  │ (shadow-xl shadow-blue-600/40)
  └──────────────────────────────┘

Active:
  ┌──────────────────────────────┐
  │ Continuar →                  │
  │ scale-95 (comprimido)        │
  └──────────────────────────────┘

Disabled:
  ┌──────────────────────────────┐
  │ Carregando...                │
  │ opacity-50                   │
  │ cursor-not-allowed           │
  └──────────────────────────────┘
```

### Secundário (Cancelar/Voltar)

```
Normal:
  ┌──────────────────────────────┐
  │ Voltar                       │
  │ bg-white                     │
  │ border-2 border-slate-200    │
  │ text-slate-900               │
  └──────────────────────────────┘

Hover:
  ┌──────────────────────────────┐
  │ Voltar                       │
  │ bg-slate-50                  │
  └──────────────────────────────┘

Active:
  ┌──────────────────────────────┐
  │ Voltar                       │
  │ scale-95                     │
  └──────────────────────────────┘
```

---

## Elementos de Feedback

### Carregamento

```
┌─────────────────────┐
│  ⟳ Carregando...   │
│ spinner animado     │
└─────────────────────┘

Animação: rotate 360° em 1s (infinito)
```

### Erro

```
┌────────────────────────────────┐
│ ❌ Por favor, digite um email   │
│ bg-red-50                      │
│ border-2 border-red-200        │
│ text-red-700                   │
└────────────────────────────────┘

Animação: fade-in 300ms
```

### Sucesso (Transição)

```
Fade out → Próxima tela
Sem confirmação visual
```

---

## Responsividade

### Breakpoints

| Dispositivo | Viewport | Escala |
|-------------|----------|--------|
| Smartphone | 300-430px | 1x |
| Tablet Pequeno | 430-768px | 1x |
| Tablet | 768-1024px | 1.2x |
| Desktop | 1024px+ | 1.5x |

### Ajustes por Tamanho

- **Padding**: Reduz em dispositivos pequenos
- **Font Size**: Base 16px, máximo 18px
- **Border Radius**: 2xl (16px) consistente
- **Spacing**: Usa escala Tailwind 4px base

---

## Acessibilidade

### Contraste

- Texto em fundo: WCAG AAA (7+:1)
- Botões: WCAG AA (4.5+:1)
- Ícones: Sempre com label de texto

### Keyboard Navigation

```
Tab → Email Input
Tab → Próximo Button
Tab → Voltar Button (se visível)

Enter → Ativa button focado
Escape → Volta para tela anterior
```

---

**Versão**: 2.6.0  
**Data**: 27/07/2026  
**Design System**: Tailwind CSS v4 + Motion React  
**Atualização**: Completo e pronto para implementação
