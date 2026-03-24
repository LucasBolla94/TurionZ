# Spec: Sistema de Sub-Agents

**Versão:** 1.0
**Status:** Aprovada
**Created by:** BollaNetwork
**Data:** 2026-03-24

---

## 1. Resumo

O TurionZ é o agente principal (diretor). Ele pode criar **sub-agents especializados ilimitados** para delegar tarefas complexas. Cada sub-agent pode criar até **3 sub-sub-agents**, sendo obrigatório pelo menos 1 verificador. Os sub-agents herdam as configurações (modelo, parâmetros) escolhidas pelo TurionZ e os sub-sub-agents herdam do sub-agent pai.

Sub-agents podem se comunicar entre si e esperar uns pelos outros. Tudo é logado na DB da Bolla Network.

---

## 2. Contexto e Motivação

**Problema:**
Tarefas complexas exigem múltiplas especialidades. Um único agente tentando fazer tudo produz resultados medianos — ele não consegue ser especialista em frontend, backend, banco de dados e testes ao mesmo tempo.

**Evidências:**
Sistemas como Claude Code e Cursor usam sub-agents pra paralelizar trabalho e manter qualidade. Cada sub-agent foca na sua área e entrega resultado verificado.

**Por que agora:**
Com acesso ao OpenRouter (múltiplos modelos por API), o TurionZ pode escolher o modelo ideal pra cada sub-tarefa, otimizando qualidade e custo.

---

## 3. Goals (Objetivos)

- [ ] G-01: TurionZ pode criar **sub-agents ilimitados**, cada um especialista na sua tarefa.
- [ ] G-02: Cada sub-agent pode criar até **3 sub-sub-agents** que herdam suas configs.
- [ ] G-03: Todo sub-agent deve **obrigatoriamente** spawnar pelo menos 1 sub-sub-agent verificador.
- [ ] G-04: TurionZ escolhe o **modelo ideal** via OpenRouter pra cada sub-agent.
- [ ] G-05: TurionZ monta **briefing completo** (contexto + instruções + critérios) pra cada sub-agent.
- [ ] G-06: Sub-agents podem **se comunicar e esperar** uns pelos outros.
- [ ] G-07: Tudo **logado** na DB da Bolla Network.

**Métricas de sucesso:**

| Métrica | Baseline atual | Target | Prazo |
|---------|---------------|--------|-------|
| Taxa de verificação bem-sucedida | N/A | 95% dos sub-agents entregam verificado | Em produção |
| Comunicação entre sub-agents | N/A | < 500ms de latência na troca de dados | Em produção |

---

## 4. Non-Goals (Fora do Escopo)

- NG-01: Sub-sub-agents **não podem** criar mais agents abaixo deles. Máximo 3 níveis (TurionZ → sub-agent → sub-sub-agent).
- NG-02: Sub-agents **não podem** alterar as configs que receberam do TurionZ.

---

## 5. Usuários e Personas

**Quem cria sub-agents:** O AgentLoop do TurionZ, quando identifica que a tarefa precisa de especialistas.

**Quem cria sub-sub-agents:** Os sub-agents, dentro do limite de 3, quando precisam de apoio ou verificação.

---

## 6. Requisitos Funcionais

### 6.1 Requisitos Principais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | TurionZ deve escolher o modelo ideal via OpenRouter pra cada sub-agent, baseado no catálogo mensal salvo no banco. | Must | Sub-agent de código usa modelo bom em código. Sub-agent de texto usa modelo bom em texto. |
| RF-02 | TurionZ deve montar um **briefing completo** pra cada sub-agent contendo: contexto da tarefa, instruções detalhadas, critérios de sucesso, e skills/tools disponíveis. | Must | Sub-agent consegue trabalhar de forma autônoma sem precisar pedir mais contexto. |
| RF-03 | Cada sub-agent herda do TurionZ: modelo, parâmetros de configuração, e skills designadas. **Não pode alterar.** | Must | Sub-agent não troca de modelo sozinho. |
| RF-04 | Cada sub-sub-agent herda as configs do sub-agent pai (que veio do TurionZ). | Must | Cadeia de herança: TurionZ → sub-agent → sub-sub-agent. |
| RF-05 | Máximo de **3 sub-sub-agents** por sub-agent. | Must | Tentativa de criar o 4º é bloqueada com erro claro. |
| RF-06 | Cada sub-agent deve **obrigatoriamente** spawnar pelo menos 1 sub-sub-agent com papel de **verificador**. | Must | Verificador testa, explora e valida o trabalho antes da entrega. |
| RF-07 | Sub-agents podem **se comunicar entre si** — trocar dados e esperar uns pelos outros. | Must | Sub-agent A pode esperar sub-agent B terminar pra usar seu resultado. |
| RF-08 | Cada sub-agent possui seu **próprio AgentLoop** (ReAct) com as mesmas regras (multi-tools, retry, logs, etc). | Must | Sub-agent não é "burro" — ele pensa e age igual ao TurionZ, só mais focado. |
| RF-09 | Toda ação de todo agent (TurionZ, sub, sub-sub) deve ser **logada** na DB da Bolla Network. | Must | É possível rastrear exatamente o que cada agent fez, quando, e quanto custou. |
| RF-10 | Sub-agents devem **notificar progresso** periodicamente pro TurionZ, que repassa pro usuário. | Should | Usuário vê "Sub-agent de Frontend: 60% concluído" no chat. |

### 6.2 Hierarquia e Regras

```
TurionZ (Diretor)
│
├── PODE: criar sub-agents ilimitados
├── PODE: escolher modelo ideal por tarefa
├── PODE: designar skills específicas por sub-agent
├── PODE: cancelar sub-agents a qualquer momento
│
├── Sub-agent (Gerente)
│   ├── HERDA: modelo, configs e skills do TurionZ
│   ├── NÃO PODE: alterar configs herdadas
│   ├── PODE: criar até 3 sub-sub-agents
│   ├── DEVE: criar pelo menos 1 verificador
│   ├── PODE: se comunicar com outros sub-agents
│   └── PODE: esperar outro sub-agent terminar
│   │
│   └── Sub-sub-agent (Funcionário)
│       ├── HERDA: configs do sub-agent pai
│       ├── NÃO PODE: alterar configs herdadas
│       ├── NÃO PODE: criar mais agents abaixo
│       └── PODE: ser verificador ou trabalhador
```

### 6.3 Fluxo Principal — Tarefa com Sub-agents

```
Usuário: "Cria um site com frontend React, backend Node e banco PostgreSQL"

TurionZ pensa: "Preciso de 3 especialistas"

1. PLANEJAMENTO (TurionZ)
   ├── Consulta catálogo OpenRouter no banco
   ├── Decide:
   │   ├── Sub-agent Frontend → Claude Sonnet (bom em código React)
   │   ├── Sub-agent Backend → Claude Sonnet (bom em Node.js)
   │   └── Sub-agent Banco → GPT-4 (bom em SQL)
   └── Monta briefing completo pra cada um

2. CRIAÇÃO DOS SUB-AGENTS
   ├── Sub-agent Frontend:
   │   ├── Briefing: "Crie estrutura React com componentes X, Y, Z..."
   │   ├── Skills: ["code-analyzer"]
   │   ├── Critérios: "Componentes renderizam sem erro. Testes passam."
   │   └── Modelo: Claude Sonnet (herdado do TurionZ)
   │
   ├── Sub-agent Backend:
   │   ├── Briefing: "Crie API REST com rotas /users, /products..."
   │   ├── Skills: ["code-analyzer", "git-manager"]
   │   ├── Critérios: "Todas as rotas respondem 200. Testes passam."
   │   └── Dependência: ESPERA Sub-agent Banco terminar (precisa das tabelas)
   │
   └── Sub-agent Banco:
       ├── Briefing: "Crie tabelas users, products com migrations..."
       ├── Skills: ["code-analyzer"]
       └── Critérios: "Migrations rodam sem erro. Tabelas existem."

3. EXECUÇÃO
   ├── Sub-agent Banco inicia (sem dependência)
   │   ├── Trabalha no seu próprio AgentLoop
   │   ├── Spawna sub-sub-agent verificador
   │   ├── Verificador testa: migrations rodam? tabelas existem? ✅
   │   └── Notifica: "Banco pronto!"
   │
   ├── Sub-agent Frontend inicia (sem dependência)
   │   ├── Trabalha em paralelo com o Banco
   │   ├── Spawna sub-sub-agent verificador
   │   ├── Verificador testa: componentes renderizam? ✅
   │   └── Notifica: "Frontend pronto!"
   │
   └── Sub-agent Backend inicia APÓS Sub-agent Banco terminar
       ├── Recebe resultado do Banco (tabelas e schemas)
       ├── Trabalha sabendo as tabelas exatas
       ├── Spawna sub-sub-agent verificador
       ├── Verificador testa: rotas respondem? testes passam? ✅
       └── Notifica: "Backend pronto!"

4. ENTREGA
   ├── TurionZ recebe tudo:
   │   ├── Frontend: ✅ verificado
   │   ├── Backend: ✅ verificado
   │   └── Banco: ✅ verificado
   ├── Junta tudo e responde ao usuário
   └── Tudo logado na DB da Bolla Network
```

### 6.4 Fluxo do Verificador (Sub-sub-agent obrigatório)

```
Sub-agent de Backend terminou de criar a API.
Antes de entregar, spawna o verificador:

Verificador (sub-sub-agent):
├── Recebe: código da API + critérios de sucesso
├── Testa: "As rotas respondem 200?"
│   ├── GET /users → 200 ✅
│   ├── GET /products → 200 ✅
│   └── POST /users → 500 ❌ ERRO!
├── Reporta pro sub-agent pai: "POST /users tá falhando"
├── Sub-agent corrige o código
├── Verificador testa de novo: POST /users → 201 ✅
└── Verificador confirma: "Tudo ok, pode entregar"
```

### 6.5 Fluxo de Comunicação entre Sub-agents

```
Sub-agent Backend precisa saber as tabelas que o Sub-agent Banco criou.

1. Sub-agent Backend registra: "Espero resultado de Sub-agent Banco"
2. TurionZ gerencia a fila de espera
3. Sub-agent Banco termina e entrega resultado
4. TurionZ repassa o resultado pro Sub-agent Backend
5. Sub-agent Backend continua seu trabalho com os dados do Banco

A comunicação PASSA pelo TurionZ (ele sempre sabe o que tá acontecendo).
```

---

## 7. Requisitos Não-Funcionais

| ID | Requisito | Valor alvo | Observação |
|----|-----------|-----------|------------|
| RNF-01 | Latência de criação de sub-agent | < 2s | Inclui seleção de modelo e montagem de briefing. |
| RNF-02 | Comunicação entre agents | < 500ms | Via TurionZ como mediador. |
| RNF-03 | Logging de toda ação | 100% | Nenhuma ação de nenhum agent passa sem log. |

---

## 8. Design e Interface

**Interface do SubAgentManager:**

```
CRIAÇÃO:
├── createSubAgent(briefing, model, skills, criteria, dependencies[])
│   → retorna subAgentId
├── createSubSubAgent(parentId, briefing, role: 'worker' | 'verifier')
│   → retorna subSubAgentId (máximo 3 por parent)

CONTROLE:
├── waitFor(subAgentId)           → espera terminar e retorna resultado
├── cancelAgent(agentId)          → cancela agent e seus filhos
├── getProgress(agentId)          → retorna % e status atual
├── communicateResult(fromId, toId, data)  → repassa dados entre agents

CONSULTA:
├── listActiveAgents()            → todos os agents rodando
├── getAgentLogs(agentId)         → logs completos de um agent
└── getAgentMetrics(agentId)      → tokens, tempo, modelo, custo
```

---

## 9. Modelo de Dados

```sql
-- Sub-agents
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES agents(id),  -- null = TurionZ, uuid = sub de alguém
    level INTEGER NOT NULL,                 -- 0=TurionZ, 1=sub-agent, 2=sub-sub-agent
    role VARCHAR NOT NULL,                  -- 'director' | 'worker' | 'verifier'
    model VARCHAR NOT NULL,                 -- modelo OpenRouter designado
    briefing TEXT,
    skills JSONB,                           -- skills designadas
    criteria TEXT,                          -- critérios de sucesso
    config JSONB,                           -- configs herdadas
    status VARCHAR DEFAULT 'created',       -- 'created'|'running'|'waiting'|'completed'|'failed'|'cancelled'
    result TEXT,
    metrics JSONB,                          -- {tokens, duration, tools_used}
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- Comunicação entre agents
CREATE TABLE agent_communications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_agent_id UUID REFERENCES agents(id),
    to_agent_id UUID REFERENCES agents(id),
    data JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Dependências (quem espera quem)
CREATE TABLE agent_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agents(id),          -- quem espera
    depends_on_agent_id UUID REFERENCES agents(id), -- de quem depende
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP
);

-- Índices
CREATE INDEX idx_agents_parent ON agents(parent_id);
CREATE INDEX idx_agents_status ON agents(status);
```

---

## 10. Integrações e Dependências

| Dependência | Tipo | Impacto se indisponível |
|-------------|------|------------------------|
| OpenRouter API | Obrigatória | Sub-agents não podem ser criados (sem modelo). |
| AgentLoop | Obrigatória | Cada sub-agent precisa do seu próprio loop ReAct. |
| PostgreSQL | Obrigatória | Sem logging, sem comunicação, sem estado. |
| ToolRegistry | Obrigatória | Sub-agents precisam de tools pra trabalhar. |
| SkillSystem | Secundária | Sub-agents funcionam sem skills, mas com menos qualidade. |

---

## 11. Edge Cases e Tratamento de Erros

| Cenário | Trigger | Comportamento esperado |
|---------|---------|----------------------|
| EC-01: Sub-agent tenta criar 4º sub-sub-agent | Limite de 3 excedido | Bloqueado com erro claro. Sub-agent deve reorganizar com os 3 disponíveis. |
| EC-02: Sub-agent tenta mudar modelo | Herança violada | Bloqueado. Configs são imutáveis. |
| EC-03: Dependência circular | A espera B, B espera A | Detectado na criação. TurionZ recebe erro e reorganiza. |
| EC-04: Sub-agent falha no meio | Crash ou timeout | TurionZ é notificado. Pode recriar ou cancelar tarefa. |
| EC-05: Verificador reprova infinitamente | Loop de correção sem fim | Limite de 3 tentativas de correção. Após isso, entrega com ressalvas. |
| EC-06: Sub-agent sem verificador | Sub-agent não spawnau verificador | Bloqueado. Não pode entregar sem verificação. Sistema cria verificador automaticamente. |
| EC-07: Comunicação entre agents com dados enormes | Resultado de 1MB sendo repassado | Compressão ou referência (salvar no banco e passar ID). |

---

## 12. Segurança e Privacidade

- Sub-agents herdam as **permissões** do TurionZ. Se TurionZ não pode deletar arquivos sem pedir, sub-agents também não.
- Logs contêm ações mas **nunca API keys ou secrets**.
- Sub-agents rodam no **mesmo contexto de segurança** do TurionZ (mesmo usuário do SO).

---

## 13. Plano de Rollout

1. **Fase 1:** Criação básica de sub-agents com briefing e modelo.
2. **Fase 2:** Sistema de verificador obrigatório.
3. **Fase 3:** Comunicação e dependências entre agents.
4. **Fase 4:** Notificações de progresso.

---

## 14. Open Questions

| Questão | Status |
|---------|--------|
| Timeout máximo de um sub-agent (5min? 10min? configurável?) | Pendente |
| Sub-agents devem ter acesso ao memory_search do TurionZ? | Pendente — recomendação: sim, read-only |
