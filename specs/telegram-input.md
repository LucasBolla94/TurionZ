# Spec: Telegram Input Handler (Gateway Adapter)

**Versão:** 2.0
**Status:** Aprovada
**Created by:** BollaNetwork
**Data:** 2026-03-24

---

## 1. Resumo

O módulo Telegram Input é um **adaptador do Gateway** — ele escuta eventos do Telegram via grammy (Long Polling), valida whitelist, converte anexos (PDF, MD, áudio/voz) em texto, e traduz tudo pro formato interno padronizado (InternalMessage) que o TurionZ entende.

Quando o input é áudio (Voice Note), o sistema transcreve localmente via Whisper e sinaliza que a resposta deve voltar em áudio (TTS).

---

## 2. Contexto e Motivação

**Problema:**
LLMs consomem texto e não sabem descompactar PDFs ou transcrever áudios. O Telegram é a plataforma padrão e precisa de um adaptador que converta tudo pra texto.

**Por que agora:**
Grammy suporta streaming de arquivos. Whisper local permite transcrição PT-BR sem GPU e sem custo de API externa. O modelo de Gateway permite que este adaptador rode independente dos outros.

---

## 3. Goals (Objetivos)

- [ ] G-01: Receber mensagens de texto, documentos (PDF/MD), e áudio (voz) de usuários na whitelist.
- [ ] G-02: Traduzir tudo pro formato **InternalMessage** padronizado do Gateway.
- [ ] G-03: Transcrever áudio via **Whisper local** (CPU, PT-BR).
- [ ] G-04: Sinalizar `requires_audio_reply: true` quando input for voz.
- [ ] G-05: Mostrar feedback instantâneo (typing/recording) enquanto processa.
- [ ] G-06: Limpar arquivos temporários após processamento.

---

## 4. Requisitos Funcionais

### 4.1 Tipos de Input Suportados

| Tipo | Evento Grammy | Processamento |
|------|--------------|---------------|
| Texto | `message:text` | Direto → InternalMessage |
| Documento PDF | `message:document` (application/pdf) | Download → pdf-parse → texto → InternalMessage |
| Documento MD | `message:document` (.md) | Download → leitura direta → InternalMessage |
| Voz | `message:voice` | Download → Whisper STT → texto → InternalMessage + flag áudio |
| Áudio | `message:audio` | Download → Whisper STT → texto → InternalMessage + flag áudio |

### 4.2 Fluxo Principal

```
1. Usuário manda Voice Note no Telegram
2. Grammy intercepta evento message:voice
3. Valida whitelist → OK
4. Sinaliza typing/recording pro usuário
5. Baixa arquivo de áudio pro ./tmp/
6. Envia pro Whisper local → transcrição PT-BR
7. Monta InternalMessage:
   {
     platform: "telegram",
     type: "voice",
     content: "Cria um PRD pro meu app de finanças",
     flags: {
       requires_audio_reply: true,
       source_type: "voice",
       voice_id: "pt-BR-ThalitaMultilingualNeural"
     }
   }
8. Deleta arquivo temporário
9. Encaminha pro Message Router do Gateway
```

### 4.3 Verificação de Mensagens de Abort

```
Quando o AgentLoop está rodando, este adaptador precisa:
1. Continuar escutando mensagens novas
2. Se receber mensagem durante processamento ativo:
   ├── Checar se é pedido de cancelamento (regex: "para|cancela|stop|esquece")
   ├── Se SIM → sinalizar abort pro AgentLoop
   └── Se NÃO → guardar na fila pra próximo processamento
```

---

## 5. Requisitos Não-Funcionais

| ID | Requisito | Valor alvo | Observação |
|----|-----------|-----------|------------|
| RNF-01 | Async IO | 100% Non-Blocking | Download não bloqueia mensagens concorrentes. |
| RNF-02 | STT Performance | < 2x duração do áudio | Whisper em CPU. |
| RNF-03 | Limpeza de TMP | 100% | Nenhum arquivo temporário sobra após processamento. |

---

## 6. Edge Cases

| Cenário | Comportamento |
|---------|--------------|
| Anexo não suportado (DOCX, JPG) | Responde: "No momento processo texto, PDF, MD e áudio." Limpa TMP. |
| Whisper crashou (OOM) | Timeout 60s. Responde: "Falha ao processar áudio." Limpa TMP. |
| Áudio vazio/mudo | Whisper retorna "". Responde: "Áudio vazio. Pode reenviar?" |
| PDF muito grande (>20MB) | Rejeita com aviso. Limpa TMP. |
| Timeout no download | Timeout 15s. Responde: "Falha ao baixar arquivo. Tente novamente." |
| Usuário não autorizado | Ignora silenciosamente. Sem log sensível. |

---

## 7. Segurança

- Transcrições são **locais** (Whisper) — áudio nunca sai da máquina.
- Arquivos temporários são deletados no `finally` (mesmo com erro).
- Whitelist validada **antes** de qualquer processamento.

---

## 8. Plano de Rollout

1. **Fase 1:** Texto + whitelist.
2. **Fase 2:** PDF e MD.
3. **Fase 3:** Áudio/Voz com Whisper local.
4. **Fase 4:** Detecção de abort durante processamento.

---

## 9. Open Questions

| Questão | Status |
|---------|--------|
| Qual build do Whisper local usar? (whisper.cpp, faster-whisper, openai-whisper) | Pendente |
| ffmpeg necessário pra converter formatos de áudio? | Provavelmente sim — instalar junto |
