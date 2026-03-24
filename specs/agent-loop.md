# Spec: Agent Loop (Motor de Raciocínio)

**Versão:** 2.0
**Status:** Aprovada
**Created by:** BollaNetwork
**Data:** 2026-03-24

---

## 1. Resumo

O **Agent Loop** é o coração do TurionZ. É o módulo que faz a IA **pensar e agir** de verdade, em vez de só responder texto.

Funciona assim: o usuário manda uma mensagem → o cérebro (LLM) pensa no que fazer → decide se precisa usar alguma ferramenta (criar arquivo, buscar dados, etc.) → executa a ferramenta → olha o resultado → pensa de novo → até ter uma resposta final pro usuário.

Esse ciclo se chama **ReAct** (Reasoning and Acting — Raciocinar e Agir). Ele repete em loop, com um limite máximo de rodadas para nunca ficar preso infinitamente.

### O que mudou da v1.0 para v2.0

| Mudança | Antes (v1) | Agora (v2) |
|---------|-----------|------------|
| Nome do projeto | SandecoClaw | **TurionZ** |
| Tools por rodada | 1 por vez | **Múltiplas por rodada** (estilo Claude Code) |
| Se uma tool falha | Não definido | **As outras continuam**, LLM recebe relatório completo |
| Quando a API falha | Morria com erro | **Tenta de novo com espera crescente** (1s → 3s → 6s) |
| Logs | Console.log básico | **Painel estruturado** (tempo, custo, etapa) |
| Flags do input (áudio, etc.) | Não propagava | **Propaga até o output** |
| Abort pelo usuário | Impossível | **Checa mensagens novas entre rodadas** |
| System Prompt + Tools | Montado dentro do loop | **Recebe pronto de fora** |
| Providers LLM | Gemini/DeepSeek | **Claude, GPT, OpenRouter** |

---

## 2. Contexto e Motivação

**Problema:**
Um LLM sozinho é como um livro — ele sabe coisas, mas não **faz** nada. Ele não cria arquivos, não busca informação atualizada, não executa código. Para virar um agente de verdade, ele precisa de um ciclo onde pensa, age no mundo real, vê o resultado, e pensa de novo.

**Por que não dá pra fazer tudo de uma vez?**
Se você pedir "cria um arquivo e me diz o que tem dentro", sem o loop, a IA vai **inventar** o conteúdo em vez de realmente criar e ler. Ela alucina. O loop força ela a executar de verdade e só responder depois de ver o resultado real.

**Por que agora:**
Precisamos separar a parte do Telegram (receber/enviar mensagens) da parte de processamento inteligente (pensar e usar ferramentas). O Agent Loop é essa separação.

---

## 3. Goals (Objetivos)

- [ ] G-01: Rodar um ciclo de raciocínio onde o LLM pode dar uma resposta final OU pedir para usar ferramentas.
- [ ] G-02: Suportar **múltiplas ferramentas por rodada** — executa todas, devolve todos os resultados etiquetados, e o LLM decide o próximo passo (abordagem estilo Claude Code).
- [ ] G-03: Parar de forma segura por um limite máximo configurável de rodadas (`MAX_ITERATIONS`, padrão: 5).
- [ ] G-04: Quando a API do LLM falhar temporariamente (503, 429), **tentar de novo** com esperas crescentes antes de desistir.
- [ ] G-05: Registrar um **painel de monitoramento** em cada etapa (quanto tempo demorou, quantos tokens gastou, qual ferramenta usou).
- [ ] G-06: **Checar entre rodadas** se o usuário mandou uma mensagem nova pedindo para parar, e abortar o loop se for o caso.
- [ ] G-07: Propagar **flags de contexto** (como `requires_audio_reply`) do input até o output final sem perder no caminho.

**Métricas de sucesso:**

| Métrica | Baseline atual | Target | Prazo |
|---------|---------------|--------|-------|
| Taxa de conclusão (loops que terminam antes do limite) | N/A | 95% | Em produção |
| Hard limit triggers (estouros do MAX) | Sem controle | Estoura limpo com mensagem amigável | Imediato |
| Tempo médio por rodada | N/A | < 15s (sem contar latência da API) | Em produção |
| Retry bem-sucedido em falha temporária | 0% | 80% recuperam sem o usuário perceber | Em produção |

---

## 4. Non-Goals (Fora do Escopo)

- NG-01: O loop **não vai pausar esperando o usuário** responder no meio de uma execução. Uma vez que começa, ele termina sozinho (ou é abortado).
- NG-02: O loop **não monta o system prompt** nem a lista de ferramentas — ele **recebe pronto** de quem o chamou (AgentController/SkillExecutor).
- NG-03: O loop **não salva no banco de dados** diretamente — ele devolve o resultado final para quem chamou, e esse módulo salva via MemoryManager.

---

## 5. Usuários e Personas

**Quem usa o Agent Loop?** Não é o usuário final diretamente. São os **outros módulos** do sistema:

- O **AgentController** (controlador geral) chama o loop passando as mensagens do usuário e a lista de ferramentas disponíveis.
- O **SkillExecutor** (executor de habilidades) chama o loop quando uma skill específica foi identificada, passando as instruções detalhadas da skill.

**Analogia:** O Agent Loop é como um **cozinheiro**. Ele não vai ao mercado (isso é o Input Handler), não serve a mesa (isso é o Output Handler). Ele recebe os ingredientes prontos, cozinha, e entrega o prato.

---

## 6. Requisitos Funcionais

### 6.1 Requisitos Principais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | O loop deve receber de fora: (a) array de mensagens, (b) system prompt, (c) lista de tools registradas, (d) flags de contexto. | Must | O loop não busca nada sozinho — tudo vem como parâmetro. |
| RF-02 | Quando o LLM pedir **uma ou mais ferramentas**, o loop deve executar **todas na ordem pedida**, e injetar **todos os resultados etiquetados** de volta no array de mensagens. | Must | Se o LLM pediu 3 tools, as 3 executam. Se uma falha, as outras continuam. LLM recebe tudo e decide o próximo passo. |
| RF-03 | O loop deve parar quando `rodada_atual > MAX_ITERATIONS`. | Must | Nunca gera billing infinito. Padrão: 5 rodadas. Valor lido do `.env`, com fallback para 5 se não existir. |
| RF-04 | Cada etapa do loop deve gerar um **log estruturado** com: timestamp, número da rodada, ação tomada (thought/tool_call/observation/final_answer), duração em ms, e tokens consumidos. | Must | O desenvolvedor consegue ver exatamente o que aconteceu e onde está o gargalo. |
| RF-05 | Quando a API do LLM retornar erro temporário (HTTP 429 ou 503), o loop deve **esperar e tentar de novo** até 3 vezes, com esperas crescentes (1s → 3s → 6s). Após 3 falhas, desiste e retorna erro amigável. | Must | O usuário não precisa reenviar a mensagem se foi só um soluço da API. |
| RF-06 | **Entre cada rodada**, o loop deve verificar se existe uma mensagem nova do usuário no Telegram. Se a mensagem contiver intenção de cancelamento (ex: "para", "cancela", "esquece", "stop"), o loop aborta e responde "Ok, parei o processamento!". | Should | O usuário tem controle sobre processos longos. |
| RF-07 | O loop deve **propagar flags** recebidas (como `requires_audio_reply`, `source_type`) intactas no resultado final, para que o Output Handler saiba como responder. | Must | Se o input veio por áudio, a resposta volta em áudio. |
| RF-08 | Antes de executar qualquer tool call, o sistema deve **validar o JSON dos argumentos**. Se estiver malformado, devolve erro pro LLM pedindo correção, **sem gastar rodada**. | Must | Checagem instantânea (milissegundos), sem custo. Evita execuções desnecessárias. |
| RF-09 | Se o LLM pedir mais de **5 tools** numa única resposta, o sistema executa as 5 primeiras, devolve os resultados, e o LLM pede as próximas na rodada seguinte. | Should | Evita sobrecarga. O LLM recebe aviso: "Executei 5 de X tools. Peça as restantes." |
| RF-10 | **Antes de cada tool**, o sistema faz uma checagem de saúde rápida: (a) o loop ainda está no limite? (b) o usuário pediu pra parar? (c) o sistema está operacional? Só executa se tudo estiver ok. | Must | Sistema anti-pânico. Nenhuma tool executa em condição insegura. |

### 6.2 Fluxo Principal (Happy Path)

> **Cenário:** Usuário pede "Cria um arquivo chamado notas.md com o texto 'Olá mundo'"

```
Rodada 0 (Preparação):
├── AgentController chama AgentLoop.run() passando:
│   ├── messages: [histórico recente do banco]
│   ├── systemPrompt: "Você é o TurionZ, um agente pessoal..."
│   ├── tools: [criar_arquivo, ler_arquivo, buscar_web, ...]
│   └── flags: { requires_audio_reply: false, source_type: "text" }

Rodada 1 (Pensamento + Ação):
├── Loop envia messages + systemPrompt + tools para o LLM
├── LLM responde: "Vou criar o arquivo" + tool_call: criar_arquivo(...)
├── Checagem de saúde: limite ok? abort? sistema ok? → ✅ Tudo certo
├── Valida JSON dos argumentos → ✅ Válido
├── Executa criar_arquivo
├── Resultado etiquetado: 'criar_arquivo({ nome: "notas.md" }) → "Arquivo criado!"'
├── Injeta resultado no array de mensagens
├── 📊 Log: [Rodada 1 | 2.3s | tool: criar_arquivo | tokens: 340 in / 89 out]
└── Checa mensagens novas do usuário → nenhuma → continua

Rodada 2 (Resposta Final):
├── Loop envia mensagens atualizadas para o LLM
├── LLM responde: "Pronto! Criei o arquivo notas.md com o texto 'Olá mundo'."
├── Loop detecta: é resposta final (sem tool_call)
├── 📊 Log: [Rodada 2 | 1.1s | final_answer | tokens: 430 in / 52 out]
└── Retorna { response, flags, metrics, status: "completed" }
```

### 6.3 Fluxo com Múltiplas Tools (Estilo Claude Code)

> **Cenário:** Usuário pede "Cria uma pasta /projetos/, um arquivo A.md e busca o clima de SP"

```
Rodada 1:
├── LLM responde com 3 tool_calls:
│   ├── tool_call_1: criar_pasta({ caminho: "/projetos/" })
│   ├── tool_call_2: criar_arquivo({ caminho: "/projetos/A.md" })
│   └── tool_call_3: buscar_clima({ cidade: "SP" })
│
├── Checagem de saúde geral → ✅
├── Valida JSON de todas → ✅ Todas válidas
│
├── Executa tool_call_1: criar_pasta → ✅ "Pasta criada!"
├── Checagem de saúde → ✅
├── Executa tool_call_2: criar_arquivo → ✅ "Arquivo criado!"
├── Checagem de saúde → ✅
├── Executa tool_call_3: buscar_clima → ✅ "SP: 28°C, ensolarado"
│
├── Devolve pro LLM (resultados etiquetados):
│   ├── "criar_pasta(/projetos/) → ✅ Pasta criada!"
│   ├── "criar_arquivo(/projetos/A.md) → ✅ Arquivo criado!"
│   └── "buscar_clima(SP) → ✅ 28°C, ensolarado"
│
└── 📊 Log: [Rodada 1 | 4.2s | 3 tools | tokens: 520 in / 180 out]

Rodada 2:
├── LLM vê todos os resultados e dá resposta final
└── "Pronto! Criei a pasta /projetos/, o arquivo A.md, e o clima em SP é 28°C."
```

### 6.4 Fluxo com Erro em uma Tool (As outras continuam)

> **Cenário:** LLM pede 3 tools, a do meio falha

```
Rodada 1:
├── LLM pede: [criar_pasta, criar_arquivo, buscar_clima]
│
├── Executa criar_pasta → ❌ ERRO: "Permissão negada"
├── Executa criar_arquivo → ❌ ERRO: "Pasta não existe" (consequência natural)
├── Executa buscar_clima → ✅ "SP: 28°C" (independente, funciona normal)
│
├── Devolve pro LLM (relatório completo e honesto):
│   ├── "criar_pasta(/projetos/) → ❌ ERRO: Permissão negada no caminho"
│   ├── "criar_arquivo(/projetos/A.md) → ❌ ERRO: Pasta /projetos/ não existe"
│   └── "buscar_clima(SP) → ✅ 28°C, ensolarado"
│
└── LLM recebe tudo e PENSA: "A pasta falhou por permissão, o arquivo
    falhou porque a pasta não existia, mas o clima funcionou. Vou tentar
    criar a pasta em outro caminho."

Rodada 2:
├── LLM pede: [criar_pasta({ caminho: "/documentos/" }), criar_arquivo({ caminho: "/documentos/A.md" })]
├── Executa criar_pasta → ✅
├── Executa criar_arquivo → ✅
└── Devolve resultados

Rodada 3:
└── LLM dá resposta final com tudo resolvido
```

**Por que funciona assim?** LLMs modernos (Claude, GPT) são inteligentes o suficiente pra:
- Não pedir tools dependentes juntas na maioria dos casos
- Quando dá erro, entender a causa e corrigir sozinho na próxima rodada
- Esta é a mesma abordagem usada pelo Claude Code e ChatGPT

### 6.5 Fluxo com JSON Malformado (Não gasta rodada)

> **Cenário:** LLM manda argumentos com formato errado

```
Rodada 1:
├── LLM pede: criar_arquivo({ nome: notas.md" })  ← JSON quebrado!
├── Sistema valida JSON ANTES de executar → ❌ Inválido
├── NÃO conta como rodada
├── Devolve pro LLM: "JSON inválido no campo 'nome'. Corrija e reenvie."
│
├── LLM corrige: criar_arquivo({ nome: "notas.md" })  ← Agora tá certo
├── Sistema valida → ✅ Válido
├── Executa normalmente
└── AGORA conta como Rodada 1
```

### 6.6 Fluxo com Mais de 5 Tools (Fila de espera)

> **Cenário:** LLM pede 8 tools de uma vez

```
Rodada 1:
├── LLM pede 8 tool_calls
├── Sistema executa as 5 primeiras (com checagem de saúde antes de cada)
├── Devolve pro LLM:
│   ├── Resultados das 5 tools executadas
│   └── Aviso: "Executei 5 de 8 tools. As ferramentas 6, 7 e 8 não foram
│       executadas nesta rodada. Solicite-as novamente se necessário."
└── 📊 Log: [Rodada 1 | 8.1s | 5 de 8 tools | tokens: 890 in / 320 out]

Rodada 2:
├── LLM pede as 3 tools restantes
├── Executa todas
└── Continua normalmente
```

### 6.7 Fluxo de Abort pelo Usuário

> **Cenário:** Usuário pede algo longo, depois manda "para"

```
Rodada 1:
├── LLM pede tool_call → checagem ok → executa → ok
├── Checa mensagens novas do Telegram → nenhuma → continua

Rodada 2:
├── LLM pede 3 tool_calls
├── Executa tool_call_1 → ok
├── Checagem de saúde antes da tool_call_2:
│   └── Checa mensagens novas → encontrou: "para"
│   └── Intenção de cancelamento? → SIM (regex: "para|cancela|stop|esquece")
├── Aborta o loop (tool_call_2 e _3 não executam)
├── Tool_call_1 que já executou: resultado salvo normalmente
└── Retorna: { response: "Ok, parei!", status: "aborted" }
```

### 6.8 Fluxo de Retry em Falha Temporária da API

> **Cenário:** API do Claude/GPT retorna erro 503 (sobrecarga)

```
Rodada 1:
├── Envia para o LLM → recebe erro 503 (temporário)
├── Retry 1: espera 1 segundo → tenta de novo → erro 503
├── Retry 2: espera 3 segundos → tenta de novo → SUCESSO ✅
├── LLM responde normalmente, loop continua
└── 📊 Log: [Rodada 1 | 6.5s | 2 retries antes de sucesso]
```

> **Cenário:** Erro permanente (chave inválida)

```
Rodada 1:
├── Envia para o LLM → recebe erro 401 (chave inválida)
├── Sistema identifica: NÃO é temporário → NÃO faz retry
└── Retorna imediato: { response: "Erro de autenticação com o provedor.",
    status: "error" }
```

### 6.9 Fluxo de Limite Máximo Atingido

> **Cenário:** O LLM fica "preso" repetindo ferramentas sem chegar numa resposta

```
Rodadas 1-5: LLM continua pedindo tools sem dar resposta final
Rodada 5 (MAX atingido):
├── Loop injeta break forçado
└── Retorna: { response: "Desculpe, não consegui concluir a tarefa dentro
    do limite de processamento. Tente reformular o pedido.",
    status: "max_iterations" }
```

---

## 7. Requisitos Não-Funcionais

| ID | Requisito | Valor alvo | Explicação simples |
|----|-----------|-----------|-------------------|
| RNF-01 | Timeout por chamada ao LLM | < 120 segundos | Se o cérebro demorar mais que 2 minutos, cancela essa chamada. |
| RNF-02 | Tempo de execução de tool | < 30 segundos | Nenhuma ferramenta pode travar o sistema por mais de 30s. |
| RNF-03 | Overhead do loop | < 50ms | O tempo das checagens de saúde e validações deve ser imperceptível. |
| RNF-04 | Validação de JSON | < 5ms | Checagem instantânea antes de executar qualquer tool. |

---

## 8. Design e Interface

**Componentes afetados:**
- Terminal (logs estruturados para o desenvolvedor acompanhar)
- Repasse assíncrono para o Output Handler (texto, arquivo, ou áudio)

**O Agent Loop é interno** — o usuário nunca interage com ele diretamente. Ele só vê o resultado final no Telegram.

**Interface do módulo (o que ele recebe e o que devolve):**

```
ENTRADA (recebe de quem chama):
├── messages: array de mensagens do histórico (já filtrado pelo MemoryManager)
├── systemPrompt: string com as instruções do agente + skill ativa
├── tools: array de ferramentas disponíveis (já montado pelo ToolRegistry)
├── flags: objeto com metadados do input (requires_audio_reply, source_type, etc.)
└── config: { maxIterations, llmTimeout, retryAttempts, maxToolsPerRound }

SAÍDA (devolve para quem chamou):
├── response: string com a resposta final do LLM
├── flags: mesmo objeto de flags recebido (propagado intacto)
├── metrics: { totalDuration, totalTokensIn, totalTokensOut, iterationsUsed, toolsCalled[] }
└── status: "completed" | "max_iterations" | "aborted" | "error"
```

---

## 9. Modelo de Dados

O Agent Loop **não cria tabelas no banco**. Ele trabalha 100% em memória RAM durante a execução.

- **Entrada:** Array de mensagens que veio do banco (via MemoryManager).
- **Durante:** O array cresce com tool_calls e observations a cada rodada.
- **Saída:** A resposta final é devolvida para quem chamou, que decide como salvar no banco.

---

## 10. Integrações e Dependências

| Dependência | Tipo | O que faz | Se falhar... |
|-------------|------|-----------|-------------|
| ILlmProvider (Claude/GPT/OpenRouter) | Obrigatória | É o "cérebro" — processa o texto e decide ações | Loop tenta retry (3x com backoff). Se persistir, retorna erro amigável. |
| ToolRegistry | Obrigatória | Fornece a lista de ferramentas que o LLM pode usar | O LLM só pode conversar, sem usar ferramentas. Não é fatal. |
| MemoryManager | Indireta | Fornece o histórico filtrado (antes do loop começar) | O loop roda sem contexto anterior — não fatal, mas perde qualidade. |
| TelegramInputHandler | Indireta | Usado para checar mensagens novas (abort) entre rodadas | O abort não funciona, mas o loop roda normalmente. |

---

## 11. Edge Cases e Tratamento de Erros

| Cenário | O que acontece | Como o sistema reage |
|---------|---------------|---------------------|
| EC-01: JSON malformado nos argumentos da tool | O LLM manda argumentos quebrados | Valida ANTES de executar. Devolve erro pro LLM pedindo correção. **Não gasta rodada.** |
| EC-02: Ferramenta dá erro (crash) | A ferramenta tenta algo impossível | Captura o erro, etiqueta com nome da tool e motivo, devolve pro LLM. As outras tools da mesma rodada **continuam executando**. |
| EC-03: MAX_ITERATIONS não configurado | Variável de ambiente vazia ou ausente | Usa o valor padrão de 5 automaticamente. |
| EC-04: LLM retorna resposta vazia | Provider retorna string vazia ou null | Conta como rodada e re-envia pedindo resposta. Se persistir por 2 rodadas, aborta com erro. |
| EC-05: Múltiplas tools com erros misturados | LLM pediu 3 tools, 1 falhou e 2 deram certo | Executa todas. Devolve relatório completo etiquetado. LLM vê o que funcionou e o que não, e decide como prosseguir. |
| EC-06: Mensagem nova do usuário que NÃO é abort | Usuário manda "ah, e adiciona gráficos" durante o loop | Mensagem é **ignorada pelo loop** e fica na fila para o próximo processamento. Apenas intenções claras de cancelamento abortam. |
| EC-07: API do LLM falha permanentemente | Erro 401 (chave inválida) ou 400 (request malformado) | **Não faz retry** (não é temporário). Retorna erro imediato pro usuário. |
| EC-08: Timeout na chamada do LLM | LLM demora mais de 120s | Cancela a chamada e tenta retry. Conta como tentativa de retry, não como rodada. |
| EC-09: LLM pede mais de 5 tools de uma vez | LLM responde com 8 tool calls | Executa as 5 primeiras, avisa o LLM que as restantes não foram executadas, e ele pede na próxima rodada. |
| EC-10: Tool demora mais que 30s | Uma ferramenta trava | Timeout de 30s na tool. Retorna erro etiquetado pro LLM. As outras tools da rodada continuam. |
| EC-11: Erro de retry esgotado | 3 tentativas falharam na API | Desiste e retorna erro amigável: "Não consegui me comunicar com o provedor de IA." |

---

## 12. Segurança e Privacidade

- **Nunca expor chaves de API** nos logs ou nas mensagens de erro para o usuário. Logs internos podem registrar códigos de erro, mas nunca tokens/secrets.
- **Tools executam em sandbox lógico** — cada ferramenta valida seus próprios inputs antes de executar. O loop não confia cegamente no que o LLM pede.
- **Mensagens do abort** são lidas apenas para detectar intenção de cancelamento — nunca são logadas ou processadas como input do LLM.
- **Erros retornados ao LLM** são sanitizados — nunca contêm caminhos completos do sistema, IPs internos, ou informações sensíveis.

---

## 13. Plano de Rollout

1. **Fase 1 — Loop básico:** Ciclo ReAct com single tool call, MAX_ITERATIONS, e validação de JSON.
2. **Fase 2 — Multi tool calls:** Múltiplas ferramentas por rodada com resultados etiquetados e checagem de saúde.
3. **Fase 3 — Retry e logs:** Retry com backoff e painel de monitoramento estruturado.
4. **Fase 4 — Abort:** Checagem de mensagens novas entre rodadas com detecção de intenção de cancelamento.

---

## 14. Open Questions

| Questão | Contexto | Status |
|---------|---------|--------|
| Como detectar intenção de "parar" na mensagem do usuário? | Pode ser regex simples ("para", "cancela", "stop") ou chamada rápida ao LLM. Regex é mais rápido e barato. Recomendação: começar com regex. | Pendente |
| O abort deve matar tools em execução ou esperar terminar? | Abortar uma tool no meio pode deixar estado corrompido (ex: arquivo incompleto). Recomendação: esperar a tool atual terminar e abortar antes da próxima. | Recomendação: esperar tool terminar |
| Qual modelo STT local para transcrição em PT-BR sem GPU? | Necessário modelo que rode em CPU com boa qualidade. Whisper.cpp com modelo "small" ou "medium" é candidato. | Pendente |
