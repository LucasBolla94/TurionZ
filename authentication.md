# Spec: Autenticação Multi-Plataforma

**Versão:** 1.0
**Status:** Aprovada
**Created by:** BollaNetwork
**Data:** 2026-03-24

---

## 1. Resumo

O sistema de autenticação do TurionZ controla **quem pode usar o agente** em cada plataforma. Inspirado no modelo do OpenClaw, usa **duas camadas**: um modo de pareamento (pairing) para novos usuários e uma allowlist de IDs numéricos para acesso permanente.

Usuários não autorizados são **ignorados silenciosamente** — sem resposta, sem erro, como se o bot estivesse offline.

---

## 2. Contexto e Motivação

**Problema:**
O TurionZ tem acesso a ferramentas poderosas (criar arquivos, instalar programas, acessar banco de dados). Se qualquer pessoa pudesse usar, seria um risco de segurança enorme.

**Referência:**
O OpenClaw usa um sistema simples e eficaz: IDs numéricos de usuário como identidade + allowlist no config + pairing manual pra novos usuários. Sem OAuth, sem tokens complexos.

---

## 3. Goals (Objetivos)

- [ ] G-01: Autenticar usuários por **ID numérico** em cada plataforma.
- [ ] G-02: Suportar **pairing flow** — novo usuário solicita acesso, Lucas aprova.
- [ ] G-03: Suportar **allowlist estática** — IDs pré-autorizados no config.
- [ ] G-04: Usuários não autorizados → **silêncio total** (sem resposta, sem erro).
- [ ] G-05: Autenticação **independente por plataforma** (aprovado no Telegram ≠ aprovado no Discord).
- [ ] G-06: Credenciais de bot (tokens) armazenadas no **Vault** (criptografadas).

---

## 4. Requisitos Funcionais

### 4.1 Modos de Acesso por Plataforma

| Modo | Comportamento |
|------|--------------|
| `pairing` (padrão) | Novo usuário passa por fluxo de aprovação |
| `allowlist` | Só IDs listados no config podem usar |
| `open` | Qualquer pessoa pode usar (requer confirmação explícita: `allowFrom: ["*"]`) |
| `disabled` | Plataforma desativada |

### 4.2 Configuração

```json
{
  "auth": {
    "owner": {
      "name": "Lucas",
      "telegram_id": "tg:123456789"
    },
    "channels": {
      "telegram": {
        "botToken": "vault:telegram_bot_token",
        "dmPolicy": "allowlist",
        "allowFrom": ["tg:123456789"]
      },
      "discord": {
        "botToken": "vault:discord_bot_token",
        "dmPolicy": "pairing",
        "allowFrom": []
      },
      "whatsapp": {
        "dmPolicy": "allowlist",
        "allowFrom": ["wa:5511999999999"]
      },
      "api": {
        "authMethod": "api_key",
        "apiKey": "vault:api_access_key"
      }
    }
  }
}
```

**Nota:** Valores com prefixo `vault:` são lidos do Vault automaticamente (criptografados).

### 4.3 Pairing Flow (Aprovação de Novo Usuário)

```
1. Pessoa desconhecida manda mensagem pro bot no Telegram
2. TurionZ verifica: ID está na allowlist? → NÃO
3. TurionZ verifica: dmPolicy é "pairing"? → SIM
4. TurionZ gera código de pareamento (expira em 1 hora):
   Código: "TZ-8F3K-9M2P"
5. TurionZ envia pro usuário desconhecido:
   "Solicitação de acesso registrada.
    Seu código: TZ-8F3K-9M2P
    Aguarde aprovação do administrador."
6. TurionZ notifica o Lucas (owner) na plataforma principal:
   "Nova solicitação de acesso no Telegram:
    Usuário: @nome_usuario (ID: 987654321)
    Código: TZ-8F3K-9M2P
    Aprovar? (sim/não)"
7. Lucas responde: "sim"
8. TurionZ adiciona ID à allowlist e salva no banco:
   { platform: "telegram", userId: "tg:987654321", approved_by: "Lucas" }
9. TurionZ avisa o novo usuário: "Acesso aprovado! Pode usar normalmente."
```

### 4.4 Allowlist (Acesso Direto)

```
1. Pessoa manda mensagem pro bot
2. TurionZ verifica: ID está na allowlist? → SIM
3. Processa normalmente
4. Sem delay, sem código, sem aprovação
```

### 4.5 Usuário Não Autorizado

```
1. Pessoa desconhecida manda mensagem
2. TurionZ verifica: ID na allowlist? → NÃO
3. TurionZ verifica: dmPolicy é "pairing"? → NÃO (é allowlist)
4. SILÊNCIO TOTAL
   ├── Nenhuma resposta
   ├── Nenhum erro
   ├── Nenhum feedback
   └── Indistinguível de bot offline
5. Log interno (sem dados sensíveis):
   "Mensagem ignorada de ID não autorizado na plataforma telegram"
```

### 4.6 Autenticação por Plataforma (Independente)

```
Ser aprovado no Telegram NÃO dá acesso ao Discord.
Cada plataforma tem sua própria allowlist.

Lucas aprovado em:
├── Telegram: ✅ (allowlist)
├── Discord: ✅ (allowlist)
├── WhatsApp: ✅ (allowlist)
└── API: ✅ (api_key)

Amigo do Lucas:
├── Telegram: ✅ (Lucas aprovou via pairing)
├── Discord: ❌ (não solicitou)
├── WhatsApp: ❌ (não solicitou)
└── API: ❌ (não tem api_key)
```

### 4.7 Identificação do Owner (Lucas)

```
O TurionZ sempre sabe quem é o Lucas:
├── Identificado pelo ID numérico no config auth.owner
├── Tem acesso total em todas as plataformas
├── Pode aprovar/revogar outros usuários
├── Pode pedir a chave do Vault
├── Pode mudar configurações do TurionZ
└── É o único que pode revogar permissões
```

---

## 5. Modelo de Dados

```sql
-- Usuários autorizados
CREATE TABLE authorized_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR NOT NULL,          -- 'telegram' | 'whatsapp' | 'discord' | 'api'
    platform_user_id VARCHAR NOT NULL,  -- ID numérico na plataforma
    username VARCHAR,                   -- @username (informativo, não usado pra auth)
    is_owner BOOLEAN DEFAULT FALSE,
    approved_by VARCHAR,                -- quem aprovou (owner name)
    approved_at TIMESTAMP DEFAULT NOW(),
    revoked_at TIMESTAMP,               -- null se ainda ativo
    UNIQUE(platform, platform_user_id)
);

-- Solicitações de pairing pendentes
CREATE TABLE pairing_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR NOT NULL,
    platform_user_id VARCHAR NOT NULL,
    username VARCHAR,
    pairing_code VARCHAR NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,      -- 1 hora após criação
    status VARCHAR DEFAULT 'pending',   -- 'pending' | 'approved' | 'denied' | 'expired'
    resolved_by VARCHAR,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 6. Edge Cases

| Cenário | Comportamento |
|---------|--------------|
| Código de pairing expirou | Usuário precisa mandar mensagem de novo pra gerar novo código. |
| Lucas nega pairing | Usuário recebe: "Acesso negado." e não pode solicitar de novo por 24h. |
| Username muda (Telegram) | Não afeta — auth usa ID numérico, não username. |
| Bot adicionado a grupo | Grupo tem allowlist separada. Só responde se grupo + usuário forem autorizados. |
| API sem api_key | Request rejeitado com HTTP 401. |
| Múltiplas plataformas, mesmo usuário | Cada plataforma é independente. Precisa estar na allowlist de cada uma. |
| Lucas perde acesso ao Telegram | Pode acessar por outra plataforma autorizada (Discord, WhatsApp, API). |

---

## 7. Segurança

- **IDs numéricos** — não usernames (que podem mudar).
- **Silêncio total** pra não autorizados — não confirma nem a existência do bot.
- **Tokens de bot no Vault** — criptografados, nunca em texto puro.
- **Pairing codes** expiram em 1 hora — não ficam ativos eternamente.
- **Logs não contêm** IDs de usuários rejeitados (só contagem).
- **Owner hardcoded** — Lucas é sempre owner, não pode ser removido por outro usuário.

---

## 8. Plano de Rollout

1. **Fase 1:** Allowlist estática no config (Telegram primeiro).
2. **Fase 2:** Pairing flow com aprovação via chat.
3. **Fase 3:** Multi-plataforma (allowlist independente por plataforma).
4. **Fase 4:** Integração com Vault pra tokens de bot.
