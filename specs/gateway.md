# Spec: Gateway Multi-Plataforma (24/7)

**Versão:** 1.0
**Status:** Aprovada
**Created by:** BollaNetwork
**Data:** 2026-03-24

---

## 1. Resumo

O **Gateway** é o porteiro 24/7 do TurionZ. Ele recebe mensagens de múltiplas plataformas (Telegram, WhatsApp, Discord, API REST), traduz todas para um formato interno padronizado, e encaminha pro TurionZ processar. Quando o TurionZ responde, o Gateway envia a resposta de volta pela plataforma original.

Cada plataforma é um **adaptador independente** — se um cair, os outros continuam funcionando.

---

## 2. Contexto e Motivação

**Problema:**
Limitar o agente a uma única plataforma (ex: só Telegram) restringe a utilidade. Usuários querem interagir pela plataforma que estão usando no momento.

**Por que agora:**
As bibliotecas de cada plataforma (grammy, discord.js, baileys) são maduras e estáveis. Separar em adaptadores independentes desde o início facilita adicionar novas plataformas no futuro.

---

## 3. Goals (Objetivos)

- [ ] G-01: Receber mensagens de **Telegram, WhatsApp, Discord e API REST**.
- [ ] G-02: Traduzir todas as mensagens pra um **formato interno único**.
- [ ] G-03: Encaminhar respostas do TurionZ **pela plataforma original**.
- [ ] G-04: Cada adaptador roda como **serviço independente**.
- [ ] G-05: Suportar texto, documentos (PDF/MD), áudio (voz) e notificações de progresso.

**Métricas de sucesso:**

| Métrica | Baseline atual | Target | Prazo |
|---------|---------------|--------|-------|
| Latência gateway → core | N/A | < 500ms | MVP |
| Uptime por adaptador | 0% | 99% independente | 30 dias |

---

## 4. Non-Goals (Fora do Escopo)

- NG-01: Não suportará chamadas de vídeo ou tela compartilhada.
- NG-02: Não terá interface web própria nesta fase (API REST serve pra integrações, não como UI).

---

## 5. Requisitos Funcionais

### 5.1 Formato Interno Padronizado

Todas as mensagens de qualquer plataforma são traduzidas para:

```
InternalMessage {
    id: string                    // ID único da mensagem
    userId: string                // ID do usuário na plataforma
    platform: string              // 'telegram' | 'whatsapp' | 'discord' | 'api'
    conversationId: string        // ID da conversa
    type: string                  // 'text' | 'document' | 'voice' | 'audio'
    content: string               // Texto da mensagem (ou texto transcrito)
    attachments: [{               // Arquivos anexados
        type: string              // 'pdf' | 'md' | 'audio' | 'image'
        data: Buffer              // Conteúdo do arquivo
        filename: string
        mimeType: string
    }]
    flags: {
        requires_audio_reply: boolean
        source_type: string       // 'text' | 'voice' | 'document'
        voice_id: string          // modelo TTS se áudio
    }
    timestamp: Date
}
```

### 5.2 Adaptadores por Plataforma

| Plataforma | Biblioteca | Método de Conexão | Tipos Suportados |
|-----------|-----------|-------------------|-----------------|
| Telegram | grammy | Long Polling | Texto, PDF, MD, Voz, Áudio |
| WhatsApp | whatsapp-web.js / Baileys | WebSocket | Texto, PDF, Voz, Áudio |
| Discord | discord.js | WebSocket | Texto, Arquivos, Voz |
| API REST | Express/Fastify | HTTP Server | Texto, JSON, Arquivos |

### 5.3 Fluxo Principal

```
1. Usuário manda mensagem no Telegram
2. Telegram Adapter recebe via grammy
3. Valida whitelist (ID autorizado?)
4. Traduz pra InternalMessage
5. Message Router encaminha pro TurionZ Core
6. TurionZ processa (AgentLoop, sub-agents, etc)
7. TurionZ devolve resposta + flags
8. Message Router identifica plataforma original (telegram)
9. Telegram Adapter traduz de volta e envia
10. Usuário recebe no Telegram
```

### 5.4 Notificações de Progresso

```
TurionZ processando tarefa longa...

Gateway recebe notificação de progresso:
├── Telegram: ctx.reply("🔄 Sub-agent Frontend: criando componentes...")
├── WhatsApp: client.sendMessage(chatId, "🔄 Sub-agent Frontend...")
├── Discord: channel.send("🔄 Sub-agent Frontend...")
└── API: WebSocket push ou callback URL
```

---

## 6. Requisitos Não-Funcionais

| ID | Requisito | Valor alvo | Observação |
|----|-----------|-----------|------------|
| RNF-01 | Uptime individual | 99% | Cada adaptador independente. |
| RNF-02 | Latência de tradução | < 100ms | Tradução de formato é operação simples. |
| RNF-03 | Isolamento de falha | 100% | Queda do Discord não afeta Telegram. |

---

## 7. Edge Cases e Tratamento de Erros

| Cenário | Comportamento esperado |
|---------|----------------------|
| Adaptador cai | Outros continuam. Tentativa de restart automático. Log na DB. |
| Mensagem de plataforma não suportada (imagem) | Responde: "No momento não processo imagens." |
| Rate limit da plataforma (429) | Sleep pelo tempo indicado no header Retry-After. |
| Usuário bloqueia o bot | Descarta mensagem, loga "user blocked bot". |
| Mensagem muito grande | Trunca com aviso ou rejeita com mensagem amigável. |

---

## 8. Segurança

- **Whitelist por plataforma:** Cada adaptador valida IDs antes de encaminhar.
- **Sem dados sensíveis no log:** Mensagens logadas sem conteúdo completo (apenas metadados).
- **API REST:** Autenticação via API key ou JWT.

---

## 9. Plano de Rollout

1. **Fase 1:** Telegram (padrão, prioridade máxima).
2. **Fase 2:** API REST (pra integrações e testes).
3. **Fase 3:** Discord.
4. **Fase 4:** WhatsApp.

---

## 10. Open Questions

| Questão | Status |
|---------|--------|
| WhatsApp: usar whatsapp-web.js (grátis, instável) ou API oficial (paga, estável)? | Pendente |
| API REST: autenticação via API key simples ou JWT? | Pendente |
