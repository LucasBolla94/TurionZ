# Spec: Recovery e Auto-Start

**Versão:** 1.0
**Status:** Aprovada
**Created by:** BollaNetwork
**Data:** 2026-03-24

---

## 1. Resumo

O TurionZ **inicia automaticamente** quando o computador liga e **recupera o estado anterior** em caso de falha. Ao iniciar, ele verifica no PostgreSQL onde parou, confere se há arquivos quebrados ou tarefas incompletas, refaz o que for necessário, e retoma de onde parou.

---

## 2. Contexto e Motivação

**Problema:**
Quedas de energia, crashes, reinicializações do SO — qualquer interrupção pode pegar o TurionZ no meio de uma tarefa. Sem recovery, o usuário perde todo o trabalho em andamento.

**Por que agora:**
Com PostgreSQL persistindo o estado dos agents e tarefas, temos toda a informação necessária pra retomar.

---

## 3. Goals (Objetivos)

- [ ] G-01: TurionZ **inicia automaticamente** com o sistema operacional.
- [ ] G-02: Ao iniciar, **verifica estado** no PostgreSQL (tarefas pendentes, sub-agents ativos).
- [ ] G-03: **Confere arquivos** gerados — se estiverem corrompidos, refaz.
- [ ] G-04: **Retoma de onde parou** — não recomeça do zero.
- [ ] G-05: **Notifica o usuário** que voltou e o que está retomando.

---

## 4. Requisitos Funcionais

### 4.1 Auto-Start por SO

| SO | Método |
|----|--------|
| Linux | systemd service (ou crontab @reboot) |
| Windows | Task Scheduler (ou startup folder) |
| Mac | launchd plist (ou Login Items) |

### 4.2 Sequência de Boot

```
STARTUP DO TURIONZ:

1. CONEXÃO
   ├── Conecta ao PostgreSQL
   ├── Se falhar → tenta 3x com backoff → se não conseguir, loga erro fatal
   └── Conecta ao OpenRouter (verifica API key)

2. VERIFICAÇÃO DE ESTADO
   ├── Consulta tabela agents: algum agent com status 'running' ou 'waiting'?
   ├── Consulta tabela messages: alguma conversa incompleta?
   └── Verifica TMP: arquivos temporários órfãos?

3. VERIFICAÇÃO DE INTEGRIDADE
   ├── Arquivos gerados na sessão anterior existem?
   │   ├── Se SIM → verifica se não estão corrompidos (tamanho > 0, formato ok)
   │   └── Se NÃO ou CORROMPIDO → marca pra refazer
   ├── Skills instaladas estão íntegras?
   └── SOUL.md, IDENTITY.md, MEMORY.md existem e são válidos?

4. RECUPERAÇÃO
   ├── Sub-agents que estavam 'running':
   │   ├── Verifica resultado parcial
   │   ├── Se tinha 80%+ pronto → tenta completar
   │   └── Se tinha pouco → recria o sub-agent do zero
   ├── Arquivos corrompidos → refaz via sub-agent ou tool
   ├── Tarefas pendentes → retoma na rodada onde parou
   └── Limpa TMP de arquivos órfãos

5. NOTIFICAÇÃO
   ├── Envia mensagem ao usuário (na plataforma mais recente):
   │   "TurionZ online! Retomando de onde paramos:
   │    - Tarefa X: retomada (estava 70% completa)
   │    - Sub-agent Y: recriado (arquivo corrompido detectado)
   │    - Tudo pronto pra continuar!"
   └── Se não tinha nada pendente: "TurionZ online e pronto!"

6. OPERAÇÃO NORMAL
   ├── Carrega SOUL.md (personalidade)
   ├── Inicia Gateway (todos os adaptadores)
   └── Aguarda mensagens
```

### 4.3 Estado Persistido no PostgreSQL

```
O que é salvo pra recovery:
├── agents: status de cada agent (running, waiting, completed)
├── agent_communications: dados trocados entre agents
├── messages: histórico completo de conversas
├── activity_logs: o que cada agent estava fazendo
└── permissions: permissões concedidas
```

---

## 5. Modelo de Dados

```sql
-- Estado de recovery (checkpoint)
CREATE TABLE recovery_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    component VARCHAR NOT NULL,        -- 'agent_loop', 'sub_agent_X', 'gateway'
    state JSONB NOT NULL,              -- estado serializado do componente
    iteration INTEGER,                 -- em qual rodada estava
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Checkpoints são atualizados a cada rodada do AgentLoop
-- Em caso de crash, o recovery lê o último checkpoint
```

---

## 6. Edge Cases

| Cenário | Comportamento |
|---------|--------------|
| PostgreSQL não inicia | TurionZ tenta 3x. Se falhar, inicia em modo degradado (sem memória, sem recovery). Avisa o usuário. |
| Tarefa pendente de 3 dias atrás | Verifica: ainda é relevante? Se a conversa está ativa, retoma. Se não, marca como abandonada e avisa. |
| Múltiplos crashes seguidos | Após 3 crashes em 10 minutos, entra em "safe mode" — inicia sem sub-agents, sem auto-análise. Avisa o usuário. |
| Arquivo de skill corrompido | Skill é desativada. TurionZ avisa. Pode recriar via SkillCreator se tiver o briefing salvo. |
| Gateway de plataforma não conecta | Tenta 3x. Se falhar, inicia sem aquela plataforma. Tenta reconectar periodicamente em background. |

---

## 7. Segurança

- Recovery **nunca expõe** dados sensíveis nos logs de reinicialização.
- Se SOUL.md foi corrompido, usa **personalidade padrão mínima** (não inventa).
- Checkpoints no banco são **criptografados** se contiverem dados sensíveis.

---

## 8. Plano de Rollout

1. **Fase 1:** Auto-start básico (inicia com o SO, conecta banco, carrega personalidade).
2. **Fase 2:** Recovery de tarefas (retoma sub-agents e conversas pendentes).
3. **Fase 3:** Verificação de integridade (arquivos corrompidos, safe mode).
