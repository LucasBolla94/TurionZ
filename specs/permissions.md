# Spec: Sistema de Permissões

**Versão:** 1.0
**Status:** Aprovada
**Created by:** BollaNetwork
**Data:** 2026-03-24

---

## 1. Resumo

O TurionZ opera com um sistema de permissões **"pede uma vez, lembra pra sempre"**. Ações potencialmente perigosas (deletar arquivos, instalar programas, etc.) requerem aprovação do usuário na primeira vez. Depois de aprovada, a permissão é salva no PostgreSQL e nunca mais precisa pedir.

Regra fundamental: o TurionZ **sempre comunica** o que vai fazer. Nunca age em silêncio, mesmo pra ações já autorizadas.

---

## 2. Contexto e Motivação

**Problema:**
Um agente com poder de executar comandos no computador pode causar danos se agir sem controle — deletar arquivos errados, instalar programas indesejados, etc.

**Por que agora:**
O TurionZ terá tools que interagem com o sistema operacional. Sem permissões, qualquer erro do LLM pode causar danos irreversíveis.

---

## 3. Goals (Objetivos)

- [ ] G-01: Ações livres (criar arquivo, ler, buscar web) **não pedem** permissão.
- [ ] G-02: Ações perigosas **pedem permissão uma vez** e salvam no banco.
- [ ] G-03: TurionZ **sempre comunica** o que vai fazer, mesmo sem precisar de permissão.
- [ ] G-04: Sub-agents **herdam** as permissões do TurionZ.
- [ ] G-05: O usuário pode **revogar** permissões a qualquer momento.

---

## 4. Requisitos Funcionais

### 4.1 Classificação de Ações

```
AÇÕES LIVRES (faz sem perguntar, mas comunica):
├── Criar arquivos e pastas
├── Ler arquivos
├── Buscar informação na web
├── Executar código em sandbox
├── Gerar documentos
├── Salvar no banco de dados
└── Comunicar progresso

AÇÕES QUE PEDEM PERMISSÃO (primeira vez):
├── Deletar arquivos ou pastas
├── Instalar programas (npm install, apt-get, pip, etc.)
├── Modificar configurações do sistema
├── Acessar dados marcados como sensíveis
├── Executar comandos que afetam o SO
├── Enviar dados pra fora da máquina
└── Modificar configurações do próprio TurionZ (exceto auto-análise)
```

### 4.2 Fluxo de Permissão

```
PRIMEIRA VEZ:

1. TurionZ precisa instalar o Node.js
2. Envia mensagem ao usuário:
   "Preciso instalar o Node.js pra executar essa tarefa.
    Posso instalar? (sim/não)"
3. Usuário responde: "sim"
4. Permissão salva no banco:
   { action: "install_nodejs", granted: true, granted_at: "2026-03-24" }
5. TurionZ instala e comunica: "Node.js instalado com sucesso!"

PRÓXIMAS VEZES:

1. TurionZ precisa de Node.js de novo
2. Consulta banco: "Já tenho permissão pra instalar Node.js?" → SIM
3. Comunica: "Instalando Node.js..." (sempre comunica, nunca silêncio)
4. Instala normalmente
```

### 4.3 Granularidade das Permissões

```
Permissões são salvas por CATEGORIA + ESPECIFICIDADE:

Exemplo: instalar programas
├── install_nodejs → permissão específica pro Node.js
├── install_python → permissão específica pro Python
├── install_* → permissão genérica pra qualquer instalação

O sistema busca do mais específico pro mais genérico:
1. Tem permissão pra "install_nodejs"? → Se sim, executa
2. Tem permissão genérica "install_*"? → Se sim, executa
3. Nenhuma → pede ao usuário
```

---

## 5. Modelo de Dados

```sql
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action VARCHAR NOT NULL,           -- 'install_nodejs', 'delete_files', etc.
    category VARCHAR NOT NULL,         -- 'install', 'delete', 'modify', 'send'
    is_wildcard BOOLEAN DEFAULT FALSE, -- true se for permissão genérica (install_*)
    granted BOOLEAN NOT NULL,
    granted_by VARCHAR,                -- plataforma onde foi concedida
    granted_at TIMESTAMP DEFAULT NOW(),
    revoked_at TIMESTAMP,              -- null se ainda ativa
    UNIQUE(action)
);
```

---

## 6. Edge Cases

| Cenário | Comportamento |
|---------|--------------|
| Usuário nega permissão | TurionZ aceita. Não insiste. Sugere alternativa se possível. |
| Usuário revoga permissão | Remove do banco. Próxima vez pede de novo. |
| Sub-agent precisa de permissão | Herda do TurionZ. Se TurionZ não tem, Sub-agent não pode pedir diretamente — TurionZ pede ao usuário. |
| Permissão ambígua | Na dúvida, pede. Melhor perguntar do que errar. |
| Banco offline | Sem acesso às permissões → trata tudo como "não autorizado" → pede ao usuário. |

---

## 7. Segurança

- Permissões **nunca expiram** automaticamente (só por revogação manual).
- Log de todas as ações executadas com permissão na DB da Bolla Network.
- O usuário pode ver todas as permissões ativas a qualquer momento.

---

## 8. Plano de Rollout

1. **Fase 1:** Sistema básico — ações livres vs ações que pedem.
2. **Fase 2:** Granularidade com wildcard e categorias.
3. **Fase 3:** Dashboard de permissões (via chat ou API).
