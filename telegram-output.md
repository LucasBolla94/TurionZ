# Spec: Telegram Output Handler (Gateway Adapter)

**Versão:** 2.0
**Status:** Aprovada
**Created by:** BollaNetwork
**Data:** 2026-03-24

---

## 1. Resumo

O módulo Telegram Output é o adaptador de saída do Gateway para a plataforma Telegram. Ele recebe a resposta processada do TurionZ e decide a melhor estratégia de envio: texto fatiado (chunking), arquivo Markdown, áudio (TTS via Edge-TTS), ou notificação de progresso.

---

## 2. Contexto e Motivação

**Problema:**
O Telegram tem limite de 4096 caracteres por mensagem. LLMs geram outputs de 10k-30k tokens facilmente. Além disso, documentos gerados devem ser enviados como arquivos, e respostas de áudio precisam de TTS.

**Por que agora:**
Com o sistema multi-plataforma, cada plataforma precisa do seu adaptador de saída que entende as limitações e capacidades específicas.

---

## 3. Goals (Objetivos)

- [ ] G-01: Fatiar textos > 4096 caracteres em múltiplas mensagens sem cortar palavras.
- [ ] G-02: Enviar documentos gerados (.md) como arquivo anexo no Telegram.
- [ ] G-03: Sintetizar texto em áudio via **Edge-TTS** quando flag `requires_audio_reply` estiver ativa.
- [ ] G-04: Enviar **notificações de progresso** periódicas durante tarefas longas.
- [ ] G-05: Formatar erros de forma amigável (sem expor detalhes técnicos internos).

---

## 4. Requisitos Funcionais

### 4.1 Estratégias de Output

| Estratégia | Quando usa | Como funciona |
|-----------|-----------|---------------|
| TextOutput | Resposta < 4096 chars | Envia direto como mensagem de texto. |
| ChunkOutput | Resposta > 4096 chars | Fatia em pedaços de ~4000 chars (sem cortar palavras). Envia em sequência. |
| FileOutput | Flag de arquivo detectada | Salva como .md no TMP, envia como document, deleta TMP. |
| AudioOutput | Flag `requires_audio_reply: true` | Limpa markdown do texto, gera .ogg via Edge-TTS, envia como voice, deleta TMP. |
| ErrorOutput | Status "error" no resultado | Formata: "⚠️ [mensagem amigável]". Nunca expõe stack traces. |
| ProgressOutput | Notificação periódica | Envia update: "🔄 [status atual]" |

### 4.2 Fluxo de Áudio (TTS)

```
1. Resultado chega com flags.requires_audio_reply = true
2. Sinaliza 'record_voice' no chat do Telegram
3. Remove formatação Markdown do texto (limpa pra fala natural)
4. Envia texto limpo pro Edge-TTS (voz: pt-BR-ThalitaMultilingualNeural)
5. Recebe buffer de áudio .ogg
6. Salva no ./tmp/
7. Envia como Voice Note via replyWithVoice()
8. Deleta arquivo do ./tmp/
```

### 4.3 Fluxo de Chunks (Texto Grande)

```
1. Resultado tem 12.000 caracteres
2. Divide em 3 chunks (~4000 cada)
3. Envia chunk 1 → aguarda confirmação da API
4. Envia chunk 2 → aguarda
5. Envia chunk 3
6. Ordem cronológica garantida (for...of sequencial, nunca Promise.all)
```

---

## 5. Requisitos Não-Funcionais

| ID | Requisito | Valor alvo | Observação |
|----|-----------|-----------|------------|
| RNF-01 | Ordem dos chunks | 100% cronológico | Sequencial estrito, nunca paralelo. |
| RNF-02 | Limpeza TMP | 100% | Áudio e arquivos deletados após envio. |
| RNF-03 | Latência de TTS | < 10s | Pra textos curtos/médios. |

---

## 6. Edge Cases

| Cenário | Comportamento |
|---------|--------------|
| Rate limit Telegram (429) | Sleep pelo Retry-After do header. Re-envia sem perder chunk. |
| Falha ao gerar TTS | Fallback pra TextOutput. Avisa: "Não consegui gerar áudio, aqui vai em texto." |
| Arquivo .md muito grande | Envia como arquivo (sem chunk). Telegram suporta até 50MB. |
| Usuário bloqueou o bot | Erro "Forbidden" capturado. Loga e descarta sem crashar. |
| Falha ao escrever TMP | Fallback pra texto em chunks. Avisa o usuário. |

---

## 7. Segurança

- Mensagens de erro **nunca expõem** API keys, paths internos, ou stack traces.
- Arquivos temporários são deletados no `finally`.
- Logs de envio registram metadados (tamanho, tipo) mas **não o conteúdo** completo da mensagem.

---

## 8. Plano de Rollout

1. **Fase 1:** TextOutput + ChunkOutput.
2. **Fase 2:** FileOutput (.md).
3. **Fase 3:** AudioOutput (Edge-TTS).
4. **Fase 4:** ProgressOutput (notificações periódicas).
