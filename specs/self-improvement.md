# Spec: Self-Improvement (Auto-Análise Semanal)

**Versão:** 1.0
**Status:** Aprovada
**Created by:** BollaNetwork
**Data:** 2026-03-24

---

## 1. Resumo

O TurionZ **aprende com seus erros e acertos** através de uma auto-análise semanal automática. Todo domingo, ele pega todas as conversas e ações da semana, quebra em partes, analisa o que deu certo e errado, gera lições aprendidas, e aplica mudanças sutis no seu comportamento.

Na semana seguinte, além de fazer a nova análise, ele **verifica se as mudanças da semana anterior foram benéficas**. Se não foram, reverte. Usa um modelo barato via OpenRouter pra economizar.

---

## 2. Contexto e Motivação

**Problema:**
Sem aprendizado, o TurionZ repete os mesmos erros. O usuário precisa corrigir as mesmas coisas várias vezes.

**Por que agora:**
Com PostgreSQL armazenando todas as conversas e logs, temos dados suficientes pra análise automatizada. Modelos baratos via OpenRouter tornam essa análise viável economicamente.

---

## 3. Goals (Objetivos)

- [ ] G-01: Executar auto-análise **semanalmente** (automático, sem intervenção do usuário).
- [ ] G-02: Quebrar conversas em **partes pequenas** pra não estourar contexto do modelo de análise.
- [ ] G-03: Gerar **lições aprendidas** categorizadas e salvar no PostgreSQL.
- [ ] G-04: **Verificar mudanças anteriores** — se foram benéficas mantém, se não reverte.
- [ ] G-05: Usar **modelo barato** pra análise (não desperdiçar dinheiro).
- [ ] G-06: Tudo **logado** na DB da Bolla Network.

---

## 4. Requisitos Funcionais

### 4.1 Ciclo Semanal

```
DOMINGO (automático, sem intervenção):

ETAPA 1 — COLETA
├── Pega do PostgreSQL:
│   ├── Todas as conversas da semana
│   ├── Todos os logs de ações (tools, sub-agents)
│   ├── Todos os erros registrados
│   └── Mudanças aplicadas na semana anterior (se existirem)

ETAPA 2 — FRAGMENTAÇÃO
├── Se o volume for grande (>50k tokens):
│   ├── Quebra em partes de ~20k tokens cada
│   └── Cada parte é analisada individualmente
├── Se for pequeno: analisa tudo de uma vez

ETAPA 3 — ANÁLISE (modelo barato via OpenRouter)
├── Pra cada fragmento, pergunta ao modelo:
│   ├── "O que deu certo nessas interações?"
│   ├── "O que deu errado e por quê?"
│   ├── "O que o usuário corrigiu manualmente?"
│   ├── "Que padrões se repetem?"
│   └── "Que melhorias sugerir?"
├── Consolida respostas de todos os fragmentos

ETAPA 4 — VERIFICAÇÃO DAS MUDANÇAS ANTERIORES
├── Pega as mudanças aplicadas na semana passada
├── Compara métricas antes vs depois:
│   ├── Menos erros? Mais elogios? Menos correções?
│   ├── Se MELHOROU → mantém mudança ✅
│   ├── Se PIOROU → reverte mudança ❌
│   └── Se NEUTRO → mantém mais uma semana ⏳

ETAPA 5 — APLICAÇÃO
├── Salva novas lições no PostgreSQL (tabela lessons_learned)
├── Atualiza MEMORY.md com lições principais
├── Pode sugerir ajustes sutis no SOUL.md (com registro)
├── Pode sugerir criação de novas skills (tarefas repetitivas)
└── Tudo logado com timestamp e detalhes
```

### 4.2 Tipos de Lições Aprendidas

| Categoria | Exemplo |
|-----------|---------|
| Erro técnico | "Configuração de PostgreSQL neste servidor usa porta 5433, não 5432" |
| Preferência do usuário | "Usuário prefere respostas em PT-BR com tom informal" |
| Padrão de tarefa | "Toda vez que pede projeto React, também vai pedir TypeScript" |
| Ferramenta/Skill | "Skill code-analyzer funciona melhor com Claude Sonnet" |
| Comunicação | "Usuário não gosta de mensagens longas — ser mais direto" |

### 4.3 Fluxo de Verificação de Mudanças

```
Semana 1:
├── Análise detecta: "Respostas estão muito curtas"
├── Mudança aplicada: "Aumentar tamanho padrão de resposta"
├── Salva: { mudanca: "respostas maiores", applied_at: "2026-03-22" }

Semana 2:
├── Nova análise + VERIFICAÇÃO da semana 1
├── Verifica: "Respostas maiores ajudaram?"
│   ├── Métricas: menos correções do usuário? Sim ✅
│   └── Resultado: mudança foi benéfica → MANTÉM
├── Atualiza: { was_beneficial: true, verified_at: "2026-03-29" }
└── Aplica novas mudanças da semana 2 (se houver)
```

---

## 5. Modelo de Dados

```sql
-- Já definido no PRD, detalhado aqui:
CREATE TABLE lessons_learned (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR NOT NULL,         -- 'technical' | 'preference' | 'pattern' | 'tool' | 'communication'
    lesson TEXT NOT NULL,
    source_conversations UUID[],       -- IDs das conversas que geraram essa lição
    applied_changes JSONB,             -- mudanças que foram aplicadas por causa dessa lição
    applied_at TIMESTAMP,
    was_beneficial BOOLEAN,            -- verificado na semana seguinte
    verified_at TIMESTAMP,
    reverted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Relatórios semanais
CREATE TABLE weekly_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    conversations_analyzed INTEGER,
    errors_found INTEGER,
    lessons_generated INTEGER,
    changes_applied JSONB,
    previous_changes_verified JSONB,   -- resultado da verificação da semana anterior
    model_used VARCHAR,                -- modelo barato que fez a análise
    tokens_used INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 6. Edge Cases

| Cenário | Comportamento |
|---------|--------------|
| Semana sem conversas | Pula a análise. Loga "Nenhuma conversa pra analisar." |
| Volume enorme (>500k tokens) | Quebra em mais partes. Pode rodar em múltiplas sessões se necessário. |
| Modelo de análise indisponível | Tenta outro modelo barato. Se todos falharem, adia pra próximo domingo. |
| Mudança revertida gera novo problema | Loga como "mudança revertida também problemática". Mantém estado original (pré-mudança). |
| Conflito entre lições | Lição nova contradiz lição antiga. Lição mais recente tem prioridade. Lição antiga é marcada como obsoleta. |

---

## 7. Segurança

- A análise roda **localmente** — conversas não são enviadas pra serviços externos além da API do LLM.
- Mudanças no SOUL.md são **sutis e logadas** — nunca altera drasticamente a personalidade.
- O usuário pode **desativar** a auto-análise se quiser.

---

## 8. Plano de Rollout

1. **Fase 1:** Coleta e análise básica (gerar lições sem aplicar mudanças).
2. **Fase 2:** Aplicação de mudanças sutis com logging.
3. **Fase 3:** Verificação semanal de mudanças anteriores.

---

## 9. Open Questions

| Questão | Status |
|---------|--------|
| Qual modelo barato usar pra análise? (Haiku? GPT-4o-mini?) | Pendente — TurionZ escolhe do catálogo OpenRouter |
| O usuário deve ser notificado do resultado da análise? | Pendente — recomendação: resumo curto opcional |
| Horário exato do domingo pra rodar? | Pendente — sugestão: 3h da manhã (baixo uso) |
