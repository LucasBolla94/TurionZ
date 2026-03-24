# Spec: Memory Module (PostgreSQL + Embedding)

**Versão:** 2.0
**Status:** Aprovada
**Created by:** BollaNetwork
**Data:** 2026-03-24

---

## 1. Resumo

O módulo de memória do TurionZ gerencia toda a persistência de estado do agente. Ele usa **PostgreSQL** como banco principal e **nomic-embed** (local) para busca semântica. O sistema opera com uma janela de contexto de **150k tokens** e, quando a janela enche, aciona automaticamente um resumo inteligente que salva a conversa no banco com embedding e inicia uma nova janela com o contexto compactado.

O módulo também suporta **memory_search** — busca por significado em conversas antigas usando embedding, sem precisar lembrar palavras exatas.

---

## 2. Contexto e Motivação

**Problema:**
LLMs são stateless — esquecem tudo entre chamadas de API. Sem memória persistente, o agente perde utilidade como assistente pessoal. Além disso, a janela de contexto tem limite — não dá pra jogar todas as mensagens antigas pro LLM.

**Evidências:**
Arrays in-memory no Node.js funcionam só até o app reiniciar. O histórico se perdia. E mesmo com banco de dados, enviar tudo pro LLM estoura o contexto ou fica caro demais.

**Por que agora:**
PostgreSQL com pgvector permite combinar persistência robusta com busca semântica. O nomic-embed roda localmente sem custo e sem afetar performance do TurionZ.

---

## 3. Goals (Objetivos)

- [ ] G-01: Persistir todas as mensagens (user, assistant, tool, system) no PostgreSQL com embedding.
- [ ] G-02: Operar com janela de contexto de **150k tokens**, autoconfigurável pelo TurionZ.
- [ ] G-03: Quando a janela atingir **70% da capacidade**, acionar automaticamente a skill de resumo.
- [ ] G-04: Prover **memory_search** — busca semântica em conversas antigas via embedding.
- [ ] G-05: Gerar embeddings via **nomic-embed local**, de forma independente e sem afetar o uso do TurionZ.
- [ ] G-06: Suportar cache de prompt pra APIs que oferecem isso (Claude, GPT), evitando reprocessar mensagens já lidas.

**Métricas de sucesso:**

| Métrica | Baseline atual | Target | Prazo |
|---------|---------------|--------|-------|
| Tempo de escrita no banco | N/A | < 50ms | Constante |
| Tempo de memory_search | N/A | < 500ms | Constante |
| Geração de embedding | N/A | < 2s por mensagem (CPU) | Constante |
| Resumo automático | N/A | Aciona sem erro em 100% dos casos | MVP |

---

## 4. Non-Goals (Fora do Escopo)

- NG-01: Não usará banco de dados vetorial separado (Chroma, Pinecone, etc). PostgreSQL + pgvector é suficiente.
- NG-02: Não usará ORMs pesados. SQL nativo ou query builder leve.
- NG-03: O embedding NÃO será via API externa. É local (nomic-embed), sempre.

---

## 5. Usuários e Personas

**Módulos que usam a memória:**
- **AgentLoop:** Lê histórico filtrado e salva respostas.
- **SubAgentManager:** Cada sub-agent pode consultar memória do contexto pai.
- **SelfImprovement:** Lê conversas da semana para análise.
- **RecoveryManager:** Lê estado salvo para retomar após falha.
- **SkillExecutor:** Pode consultar memória para contexto adicional.

---

## 6. Requisitos Funcionais

### 6.1 Requisitos Principais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | O banco PostgreSQL deve criar as tabelas automaticamente no primeiro startup. | Must | Deletar banco, reiniciar app, tabelas reaparecem. |
| RF-02 | O sistema deve usar WAL (Write-Ahead Logging) para leituras sem bloqueio. | Must | Múltiplas mensagens não congelam o sistema por locks. |
| RF-03 | O MemoryManager deve enviar ao AgentLoop somente as mensagens que cabem na janela de contexto configurada (padrão: 150k tokens). | Must | Chamada ao LLM nunca falha por estouro de contexto. |
| RF-04 | Quando a janela atingir **70% da capacidade**, o sistema deve acionar automaticamente uma skill de resumo. | Must | Resumo gerado, salvo no banco com embedding, nova janela inicia com o resumo como contexto. |
| RF-05 | O sistema deve gerar embeddings para cada mensagem usando **nomic-embed local** de forma assíncrona e independente. | Must | Embedding gerado em background. Se falhar, a mensagem é salva sem embedding (não bloqueia). |
| RF-06 | O sistema deve prover tool **memory_search** que busca conversas antigas por similaridade semântica. | Must | AgentLoop pode chamar memory_search("o que o usuário falou sobre React?") e receber trechos relevantes. |
| RF-07 | O sistema deve suportar **prompt caching** para APIs que oferecem (marcar mensagens já processadas como cache). | Should | Reduz custo significativamente em conversas longas. |
| RF-08 | A janela de contexto (150k) deve ser **autoconfigurável** — o TurionZ pode alterar esse valor se necessário. | Should | TurionZ entende como se configurar e pode ajustar para modelos com janelas maiores/menores. |

### 6.2 Fluxo Principal — Conversa Normal (Dentro da Janela)

```
1. Usuário manda "Olá, como vai?"
2. MemoryManager recebe a mensagem
3. Salva no PostgreSQL (role: 'user', content: texto)
4. Em background: nomic-embed gera embedding e atualiza a linha no banco
5. MemoryManager extrai do banco as últimas mensagens que cabem em 150k tokens
6. Aplica marcação de cache (mensagens antigas = cached, novas = não cached)
7. Devolve array filtrado pro AgentLoop
8. AgentLoop processa e gera resposta
9. Resposta salva no banco (role: 'assistant')
10. Em background: embedding gerado pra resposta também
```

### 6.3 Fluxo de Resumo Automático (Janela Enchendo)

```
1. MemoryManager detecta: janela em 70% da capacidade (~105k tokens)
2. Aciona AUTOMATICAMENTE a skill de resumo
3. Skill de resumo:
   ├── Pega TODA a conversa atual do banco
   ├── Quebra em partes se for muito grande
   ├── Usa um modelo barato (via OpenRouter) pra gerar resumo
   ├── Resumo: "O usuário pediu pra criar um projeto React.
   │   Já fizemos a estrutura de pastas, instalamos dependências,
   │   e configuramos o banco PostgreSQL. Falta fazer os testes."
   └── Salva o resumo no banco com embedding
4. Nova janela começa com:
   ├── System prompt (SOUL.md + skill ativa)
   ├── Resumo como primeira mensagem
   └── Últimas mensagens recentes
5. TurionZ continua respondendo normalmente, sem o usuário perceber a troca
```

### 6.4 Fluxo de Memory Search (Buscar Contexto Antigo)

```
1. Usuário pergunta: "O que eu te pedi semana passada sobre o banco de dados?"
2. AgentLoop não tem essa informação na janela atual
3. LLM decide usar a tool memory_search
4. memory_search({ query: "banco de dados semana passada" })
5. Sistema gera embedding da query via nomic-embed
6. PostgreSQL busca mensagens com embedding mais similares (pgvector)
7. Retorna os 5 trechos mais relevantes com data e contexto
8. AgentLoop injeta os resultados como observação
9. LLM responde: "Semana passada você pediu pra configurar PostgreSQL
   com tabelas de usuários e produtos. Quer que eu continue?"
```

---

## 7. Requisitos Não-Funcionais

| ID | Requisito | Valor alvo | Observação |
|----|-----------|-----------|------------|
| RNF-01 | Escrita no banco | < 50ms | WAL ativo para performance. |
| RNF-02 | Leitura de histórico | < 100ms | Índices em conversation_id e created_at. |
| RNF-03 | Memory search (embedding) | < 500ms | Índice pgvector (ivfflat ou hnsw). |
| RNF-04 | Geração de embedding | < 2s por mensagem | nomic-embed em CPU. Roda em background. |
| RNF-05 | Embedding não bloqueia | 100% | Se embedding falhar, mensagem salva sem embedding. |

---

## 8. Design e Interface

**Interface do MemoryManager:**

```
ENTRADA:
├── saveMessage(conversationId, role, content, platform)
├── getContextWindow(conversationId, maxTokens)  → mensagens filtradas
├── memorySearch(query, limit)                    → trechos relevantes
├── triggerSummary(conversationId)                → gera resumo automático
└── getConversationState(conversationId)          → estado pra recovery

SAÍDA:
├── messages[]: array de mensagens formatadas pro LLM
├── searchResults[]: trechos com score de relevância
├── summary: string do resumo gerado
└── state: objeto com estado completo pra recovery
```

---

## 9. Modelo de Dados

```sql
-- Extensão necessária
CREATE EXTENSION IF NOT EXISTS vector;

-- Conversas
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL,
    platform VARCHAR NOT NULL,        -- 'telegram' | 'whatsapp' | 'discord' | 'api'
    provider VARCHAR,                 -- modelo LLM ativo
    context_window_size INTEGER DEFAULT 150000,
    current_token_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Mensagens com embedding
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id),
    role VARCHAR NOT NULL,            -- 'user' | 'assistant' | 'system' | 'tool'
    content TEXT NOT NULL,
    token_count INTEGER,
    embedding vector(768),            -- nomic-embed dimension
    is_summary BOOLEAN DEFAULT FALSE, -- true se for resumo automático
    created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_embedding ON messages USING ivfflat (embedding vector_cosine_ops);

-- Resumos automáticos
CREATE TABLE conversation_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id),
    summary TEXT NOT NULL,
    token_count INTEGER,
    messages_summarized INTEGER,      -- quantas mensagens foram resumidas
    embedding vector(768),
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 10. Integrações e Dependências

| Dependência | Tipo | Impacto se indisponível |
|-------------|------|------------------------|
| PostgreSQL | Obrigatória | Sistema sem memória. Modo degradado. |
| pgvector (extensão) | Obrigatória | Sem busca semântica. Fallback pra busca textual. |
| nomic-embed (local) | Secundária | Mensagens salvas sem embedding. Memory search indisponível. |

---

## 11. Edge Cases e Tratamento de Erros

| Cenário | Trigger | Comportamento esperado |
|---------|---------|----------------------|
| EC-01: PostgreSQL offline | Banco inacessível no startup | TurionZ roda em modo degradado sem memória. Avisa o usuário. Tenta reconectar periodicamente. |
| EC-02: Embedding falha | nomic-embed crashou ou deu OOM | Mensagem salva sem embedding. Log de warning. Não bloqueia nada. |
| EC-03: Janela estoura antes do resumo | Mensagem gigante pula de 60% pra 100% | Resumo emergencial: trunca mensagens mais antigas e gera resumo imediato. |
| EC-04: Resumo falha | LLM do resumo retorna erro | Fallback: truncamento simples (remove mensagens mais antigas). Tenta resumo de novo na próxima oportunidade. |
| EC-05: Memory search sem resultados | Embedding não encontra nada similar | Retorna mensagem: "Não encontrei nada relacionado no histórico." |
| EC-06: Banco corrompido após queda | Arquivo do PostgreSQL corrompido | PostgreSQL WAL faz recovery automático. Se falhar, recria tabelas (perde histórico). |
| EC-07: Configuração de janela alterada | TurionZ se autoconfigurou pra 200k | Atualiza context_window_size na conversation. Próxima leitura já usa o novo valor. |

---

## 12. Segurança e Privacidade

- **Dados locais:** PostgreSQL roda local. Nenhum dado de conversa sai da máquina.
- **Embeddings locais:** nomic-embed processa tudo localmente. Zero dados enviados pra fora.
- **Sem secrets no banco:** Mensagens de system prompt com API keys nunca são persistidas.
- **Backup:** Recomendado backup periódico do PostgreSQL (pg_dump).

---

## 13. Plano de Rollout

1. **Fase 1:** PostgreSQL básico — salvar e ler mensagens com janela de contexto.
2. **Fase 2:** nomic-embed — geração de embeddings em background.
3. **Fase 3:** memory_search — busca semântica via pgvector.
4. **Fase 4:** Resumo automático — skill de compactação de contexto.
5. **Fase 5:** Prompt caching — integração com cache das APIs.

---

## 14. Open Questions

| Questão | Status |
|---------|--------|
| Frequência de backup automático do PostgreSQL | Pendente |
| Limite de resultados do memory_search (5? 10?) | Pendente — começar com 5 |
