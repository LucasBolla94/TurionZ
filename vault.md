# Spec: Vault (Cofre de Credenciais Criptografado)

**Versão:** 1.0
**Status:** Aprovada
**Created by:** BollaNetwork
**Data:** 2026-03-24

---

## 1. Resumo

O **Vault** é o cofre digital do TurionZ. Ele armazena senhas, API keys, tokens e qualquer dado sensível de forma **criptografada**. Só o TurionZ (para uso operacional) e o Lucas (dono) podem acessar.

O TurionZ **cria e gerencia** a chave de criptografia automaticamente. Se o Lucas precisar, o TurionZ pode fornecer a chave.

---

## 2. Contexto e Motivação

**Problema:**
O TurionZ precisa armazenar API keys (OpenRouter, Telegram, etc.), senhas de banco, tokens de serviços. Guardar isso em texto puro no `.env` ou no banco é inseguro — qualquer acesso ao arquivo expõe tudo.

**Por que agora:**
Com múltiplas integrações (OpenRouter, Telegram, WhatsApp, Discord, PostgreSQL), o número de credenciais cresce. Um cofre criptografado é essencial desde o início.

---

## 3. Goals (Objetivos)

- [ ] G-01: Armazenar todas as credenciais de forma **criptografada** (AES-256-GCM).
- [ ] G-02: TurionZ **cria a chave mestra** automaticamente na primeira inicialização.
- [ ] G-03: TurionZ pode **acessar** credenciais para uso operacional (chamar APIs, etc.).
- [ ] G-04: Lucas pode **solicitar a chave** ao TurionZ a qualquer momento.
- [ ] G-05: O cofre é um **arquivo local criptografado** — não depende de serviço externo.
- [ ] G-06: Credenciais **nunca aparecem** em logs, mensagens de erro, ou respostas ao chat.

---

## 4. Requisitos Funcionais

### 4.1 Estrutura do Vault

```
data/
└── vault/
    ├── vault.enc          # Arquivo criptografado com todas as credenciais
    ├── vault.key          # Chave mestra (protegida por permissões do SO)
    └── vault.meta         # Metadados (versão, data de criação, último acesso)
```

### 4.2 Criptografia

| Parâmetro | Valor |
|-----------|-------|
| Algoritmo | AES-256-GCM |
| Chave mestra | 256 bits gerada por crypto.randomBytes(32) |
| IV (vetor de inicialização) | Único por operação de escrita |
| Proteção da chave | Permissões do SO (chmod 600 em Linux/Mac, ACL em Windows) |

### 4.3 Fluxo de Inicialização (Primeira Vez)

```
1. TurionZ inicia pela primeira vez
2. Detecta: vault.enc não existe
3. Gera chave mestra: crypto.randomBytes(32)
4. Salva chave em vault.key com permissões restritas (só owner lê)
5. Cria vault.enc vazio (criptografado)
6. Comunica ao Lucas:
   "Criei seu cofre de credenciais. A chave mestra foi gerada
    e está protegida. Se precisar dela, é só me pedir."
```

### 4.4 Operações do Vault

```
GUARDAR CREDENCIAL:
├── TurionZ recebe: { nome: "openrouter_api_key", valor: "sk-xxx..." }
├── Descriptografa vault.enc com a chave mestra
├── Adiciona/atualiza a credencial
├── Re-criptografa e salva
└── Log: "Credencial 'openrouter_api_key' salva no vault" (SEM o valor)

LER CREDENCIAL (uso operacional):
├── TurionZ precisa chamar OpenRouter
├── Descriptografa vault.enc
├── Lê "openrouter_api_key"
├── Usa na chamada de API
├── Valor NUNCA aparece em logs, chat, ou mensagens de erro
└── Se falhar: "Erro de autenticação com OpenRouter" (sem expor a key)

FORNECER CHAVE AO LUCAS:
├── Lucas: "Thor, me passa a chave do vault"
├── TurionZ valida: é o Lucas? (whitelist + plataforma autenticada)
├── Envia a chave mestra de forma segura
├── Log: "Chave mestra fornecida ao owner" (SEM a chave nos logs)
└── Aviso: "Guarde essa chave em local seguro."

LISTAR CREDENCIAIS (sem valores):
├── Lucas: "Que senhas eu tenho salvas?"
├── TurionZ lista apenas NOMES:
│   "openrouter_api_key, telegram_bot_token, postgres_password, ..."
└── Nunca mostra os valores na listagem
```

### 4.5 O que vai no Vault

| Credencial | Exemplo |
|-----------|---------|
| API keys | OpenRouter, APIs externas |
| Bot tokens | Telegram, Discord |
| Senhas de banco | PostgreSQL password |
| Tokens OAuth | WhatsApp, integrações |
| Chaves SSH | Se usar Git |
| Qualquer dado sensível | Que o Lucas pedir pra guardar |

### 4.6 O que NÃO vai no Vault

| Item | Onde fica |
|------|----------|
| Conversas | PostgreSQL (tabela messages) |
| Logs | PostgreSQL (tabela activity_logs) |
| Skills | Filesystem (.agents/skills/) |
| Configurações não-sensíveis | Arquivo de config ou banco |

---

## 5. Requisitos Não-Funcionais

| ID | Requisito | Valor alvo | Observação |
|----|-----------|-----------|------------|
| RNF-01 | Tempo de leitura do vault | < 50ms | Descriptografar e ler uma credencial. |
| RNF-02 | Tamanho máximo do vault | 1MB | Suficiente pra centenas de credenciais. |
| RNF-03 | Compatibilidade | Linux/Windows/Mac | Permissões de arquivo adaptadas por SO. |

---

## 6. Edge Cases

| Cenário | Comportamento |
|---------|--------------|
| vault.key deletado acidentalmente | TurionZ detecta na inicialização. Avisa Lucas: "Chave do cofre não encontrada. Preciso da chave mestra pra recuperar. Você tem ela?" |
| vault.enc corrompido | TurionZ tenta ler. Se falhar, avisa: "Cofre corrompido. Se tiver a chave, posso tentar recuperar. Caso contrário, preciso recriar (credenciais serão perdidas)." |
| Alguém copia vault.enc | Sem a chave mestra (vault.key), o arquivo é inútil — tudo criptografado. |
| Lucas pede credencial específica | TurionZ mostra o valor UMA VEZ no chat. Avisa: "Mostrado uma vez. Não fica salvo no histórico do chat." |
| Sub-agent precisa de API key | TurionZ lê do vault e injeta na config do sub-agent. Sub-agent nunca vê a chave — ela é usada internamente. |

---

## 7. Segurança

- **AES-256-GCM** — padrão militar de criptografia.
- **Chave protegida por SO** — permissões de arquivo impedem leitura por outros usuários.
- **Credenciais nunca em logs** — regra absoluta, sem exceções.
- **Credenciais nunca no chat** — exceto quando Lucas pede explicitamente.
- **vault.key e vault.enc no .gitignore** — nunca vão pro repositório.
- **Sub-agents nunca veem credenciais** — TurionZ injeta internamente.

---

## 8. Plano de Rollout

1. **Fase 1:** Vault básico — guardar e ler credenciais com AES-256.
2. **Fase 2:** Integração com TurionZ — leitura automática pra chamadas de API.
3. **Fase 3:** Comandos de gestão — listar, atualizar, deletar credenciais via chat.
