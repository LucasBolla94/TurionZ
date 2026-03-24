# Spec: Skill Management System (Hot-Reload + Criador Automático)

**Versão:** 2.0
**Status:** Aprovada
**Created by:** BollaNetwork
**Data:** 2026-03-24

---

## 1. Resumo

A arquitetura de Skills do TurionZ permite que novas habilidades sejam adicionadas dinamicamente sem reiniciar o sistema (**hot-reload**). Cada skill pode conter instruções (Markdown), scripts e **tools próprias** em qualquer linguagem (TypeScript, Python, etc.).

Existe um **sub-agent fixo chamado SkillCreator** que cria skills completas automaticamente — ele entende a necessidade, cria instruções, scripts, tools, testa tudo, e instala a skill pronta pra uso pelo TurionZ e sub-agents.

O sistema funciona em pipeline: **Loader → Router → Executor**.

---

## 2. Contexto e Motivação

**Problema:**
Adicionar habilidades num agente em nível de código causa instabilidade e requer reboot. Além disso, carregar TODAS as skills o tempo todo enche a janela de contexto e gasta dinheiro.

**Evidências:**
Se o LLM receber instruções enormes fixas no prompt, ele perde atenção nas diretivas essenciais. Melhor carregar só a skill necessária por demanda.

**Por que agora:**
O sistema de plugins via pasta (.agents/skills) permite hot-reload. O SkillCreator automatiza a criação.

---

## 3. Goals (Objetivos)

- [ ] G-01: Ler todas as skills de `.agents/skills/` automaticamente.
- [ ] G-02: Router identifica qual skill usar pra cada mensagem do usuário.
- [ ] G-03: Injetar instruções da skill no contexto apenas durante aquela interação.
- [ ] G-04: Skills podem ter **tools próprias** em qualquer linguagem.
- [ ] G-05: **Hot-reload** — nova skill é reconhecida sem reiniciar.
- [ ] G-06: Sub-agents podem usar skills designadas pelo TurionZ.
- [ ] G-07: **SkillCreator** (sub-agent fixo) cria, testa e instala skills automaticamente.

---

## 4. Requisitos Funcionais

### 4.1 Estrutura de uma Skill

```
.agents/skills/
├── skill-creator/              # Sub-agent fixo (sempre presente)
│   ├── SKILL.md                # Instruções do criador
│   └── tools/
│       ├── create_skill.ts     # Ferramenta pra criar skills
│       └── test_skill.ts       # Ferramenta pra testar skills
│
├── prd-manager/                # Exemplo de skill
│   ├── SKILL.md                # Instruções detalhadas
│   ├── tools/                  # Tools exclusivas (opcional)
│   │   ├── generate_prd.ts
│   │   └── validate_prd.py
│   └── templates/              # Templates da skill (opcional)
│       └── prd-template.md
│
├── code-analyzer/
│   ├── SKILL.md
│   └── tools/
│       └── analyze_code.ts
│
└── git-manager/
    ├── SKILL.md
    └── tools/
        ├── git_commit.ts
        ├── git_push.ts
        └── git_log.ts
```

### 4.2 Formato do SKILL.md

```markdown
---
name: prd-manager
description: Cria documentos de projeto (PRD) profissionais
version: 1.0
author: BollaNetwork
tools:
  - generate_prd
  - validate_prd
languages:
  - typescript
  - python
---

# Instruções da Skill PRD Manager

(Instruções detalhadas de como o LLM deve usar essa skill...)
```

### 4.3 Pipeline: Loader → Router → Executor

```
1. LOADER (a cada mensagem):
   ├── Lê todas as pastas dentro de .agents/skills/
   ├── Extrai YAML frontmatter de cada SKILL.md (nome + descrição)
   ├── Monta lista leve de skills disponíveis
   └── Hot-reload: se uma pasta nova aparecer, reconhece automaticamente

2. ROUTER (decisão rápida):
   ├── Recebe: mensagem do usuário + lista de skills disponíveis
   ├── Usa LLM (chamada leve/barata) pra decidir:
   │   "Qual skill serve pra esse pedido?"
   ├── Retorna: { skillName: "prd-manager" } ou null
   └── Se null: cai no modo conversa livre (sem skill)

3. EXECUTOR (ativação):
   ├── Lê SKILL.md completo da skill identificada
   ├── Carrega tools exclusivas da skill (se houver)
   ├── Injeta instruções no system prompt do AgentLoop
   ├── AgentLoop roda com a skill ativa
   └── Após responder: descarta skill da memória (limpa pro próximo pedido)
```

### 4.4 SkillCreator (Sub-agent Fixo)

```
O SkillCreator é um sub-agent que SEMPRE existe. Ele cria novas skills.

FLUXO:
1. TurionZ identifica necessidade de uma nova skill
   (ou o usuário pede: "cria uma skill de tradução")
2. TurionZ aciona o SkillCreator

3. SkillCreator:
   ├── Entende a necessidade
   ├── Cria estrutura da pasta:
   │   ├── SKILL.md (instruções completas)
   │   ├── tools/ (scripts nas linguagens ideais)
   │   └── templates/ (se necessário)
   ├── Testa tudo:
   │   ├── SKILL.md tem frontmatter válido?
   │   ├── Tools executam sem erro?
   │   ├── Skill é reconhecida pelo Loader?
   │   └── Router consegue identificar a skill?
   ├── Se algo falhou → corrige e testa de novo
   └── Entrega instalada e pronta

4. TurionZ recebe: "Skill 'tradutor' criada e instalada ✅"
5. Hot-reload: skill já está disponível na próxima mensagem
6. TurionZ sabe usar e pode ensinar sub-agents a usar também
```

### 4.5 Skills com Sub-agents

```
TurionZ cria sub-agent e designa skills pra ele:

createSubAgent({
    briefing: "Crie a estrutura frontend...",
    model: "claude-sonnet",
    skills: ["code-analyzer", "git-manager"],  ← skills designadas
    criteria: "Código compila sem erros"
})

O sub-agent tem acesso a essas 2 skills e suas tools exclusivas.
```

---

## 5. Requisitos Não-Funcionais

| ID | Requisito | Valor alvo | Observação |
|----|-----------|-----------|------------|
| RNF-01 | Hot-reload de skill | < 1s | Reconhece nova pasta na próxima mensagem. |
| RNF-02 | Router (decisão de skill) | < 2s | Chamada leve ao LLM. |
| RNF-03 | Tools em qualquer linguagem | 100% | TypeScript, Python, Go, Bash, etc. |

---

## 6. Modelo de Dados

Não gera tabela própria no PostgreSQL. Skills são baseadas em filesystem (.agents/skills/).

O catálogo de skills disponíveis é montado em runtime pelo Loader a cada mensagem.

---

## 7. Edge Cases

| Cenário | Comportamento |
|---------|--------------|
| Skill duplicada (mesmo nome) | Última instalada sobrescreve a anterior. Warning no log. |
| SKILL.md ausente na pasta | Loader ignora a pasta. Log de warning. Não quebra. |
| Frontmatter inválido | Skill ignorada. Log de erro. Outras skills continuam. |
| Tool de skill falha ao executar | Erro capturado e enviado pro LLM como observação. |
| SkillCreator cria skill com bug | Verificador (sub-sub-agent) detecta e SkillCreator corrige antes de instalar. |
| Sub-agent tenta usar skill não designada | Bloqueado. Só pode usar as skills que o TurionZ designou. |

---

## 8. Segurança

- Skills operam dentro das **permissões** do TurionZ (herdadas).
- Tools de skills são executadas em **contexto controlado** — não têm acesso irrestrito ao SO.
- SkillCreator testa skills antes de instalar — skill com vulnerabilidade é rejeitada.

---

## 9. Plano de Rollout

1. **Fase 1:** Loader + Router + Executor básico (skills com SKILL.md só).
2. **Fase 2:** Tools exclusivas por skill (TypeScript/Python).
3. **Fase 3:** SkillCreator (sub-agent fixo criador automático).
4. **Fase 4:** Integração com sub-agents (designação de skills).

---

## 10. Open Questions

| Questão | Status |
|---------|--------|
| Marketplace de skills no futuro? (compartilhar entre instâncias) | Pendente |
| Skills podem ter dependências npm/pip próprias? | Pendente — recomendação: sim, com sandbox |
