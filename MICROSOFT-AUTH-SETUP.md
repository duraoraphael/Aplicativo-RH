# Integração Microsoft Azure AD (Entra ID) - Guia de Configuração

## Como Configurar Autenticação Microsoft OAuth 2.0

Este aplicativo foi configurado para usar autenticação real com Microsoft Azure AD (Entra ID). Siga os passos abaixo para ativar a integração.

## Pré-requisitos

- Uma conta Microsoft com acesso ao [Azure Portal](https://portal.azure.com)
- Acesso para registrar aplicações no seu tenant do Azure AD

## Passo 1: Registrar Aplicação no Azure Portal

1. Acesse [https://portal.azure.com](https://portal.azure.com)
2. Procure por **"Azure Active Directory"** ou **"Entra ID"**
3. Clique em **"App registrations"**
4. Clique em **"+ New registration"**

## Passo 2: Preencher Informações da App

Preencha os seguintes campos:

```
Name: RH Normatel (ou outro nome desejado)
Supported account types: Accounts in this organizational directory only (Single tenant)
Redirect URI (optional):
  Web: http://localhost:5500/account-selector.html
```

Clique em **"Register"**

## Passo 3: Obter Client ID

Após registrar:

1. Na página da app, copie o valor de **"Application (client) ID"**
2. Este é seu `CLIENT_ID`

Exemplo:
```
CLIENT_ID = 12345678-1234-1234-1234-123456789012
```

## Passo 4: Obter Tenant ID

1. Ainda na página da app, procure por **"Directory (tenant) ID"**
2. Copie este valor
3. Este é seu `TENANT_ID`

Exemplo:
```
TENANT_ID = abcdef12-abcd-abcd-abcd-abcdefabcdef
```

## Passo 5: Criar Client Secret (Opcional)

Se você precisar de autenticação no backend:

1. Clique em **"Certificates & secrets"** no menu lateral
2. Clique em **"+ New client secret"**
3. Descrição: `Backend Auth`
4. Expire date: `Recomendado: 24 months`
5. Clique em **"Add"**
6. **Copie o "Value" imediatamente** (não pode recuperar depois)

Este é seu `CLIENT_SECRET`

## Passo 6: Configurar arquivo `msal-config.js`

Abra o arquivo `msal-config.js` na raiz do projeto e configure:

```javascript
const msalConfig = {
  auth: {
    clientId: "COLOQUE_AQUI_SEU_CLIENT_ID",           // Passo 3
    authority: "https://login.microsoftonline.com/COLOQUE_AQUI_SEU_TENANT_ID",  // Passo 4
    redirectUri: "http://localhost:5500/account-selector.html",
    postLogoutRedirectUri: "/"
  },
  // ... resto da configuração
};
```

**Exemplo completo:**
```javascript
const msalConfig = {
  auth: {
    clientId: "12345678-1234-1234-1234-123456789012",
    authority: "https://login.microsoftonline.com/abcdef12-abcd-abcd-abcd-abcdefabcdef",
    redirectUri: "http://localhost:5500/account-selector.html",
    postLogoutRedirectUri: "/"
  },
  // ... resto igual ao arquivo original
};
```

## Passo 7: Instalar MSAL.js

No seu HTML (já incluído em `account-selector.html`), você precisa da biblioteca MSAL:

```html
<script src="https://cdn.jsdelivr.net/npm/@azure/msal-browser@3.14.0/dist/msal-browser.min.js"></script>
```

A página já inclui a tag script, você só precisa descommentar ou adicionar se não estiver.

## Passo 8: Adicionar Redirect URIs Adicionais

Se você deseja usar em outros ambientes, adicione mais redirect URIs:

No Azure Portal, vá em **"Redirect URIs"** e adicione:

```
Para Produção:
https://seu-dominio.com/account-selector.html
https://seu-dominio.com/rh-atestados.html

Para Staging:
https://staging.seu-dominio.com/account-selector.html
```

## Testando a Integração

### Passo 1: Reiniciar o Servidor Frontend

```bash
# Se usando Live Server
# A página será recarregada automaticamente
```

### Passo 2: Abrir Página de Login

Acesse: `http://localhost:5500/rh-login.html`

Ou clique no botão **"RH"** na página inicial

### Passo 3: Clicar em "Entrar com Conta Microsoft"

- Você será redirecionado para `account-selector.html`
- Clique em **"Entrar com Conta Microsoft"**
- Você será redirecionado para `login.microsoftonline.com`
- Faça login com sua conta Microsoft
- **Será redirecionado de volta** para `account-selector.html` com token

### Passo 4: Acessar Atestados

Após autenticado, clique em **"Continuar"** para acessar o painel de atestados.

## Troubleshooting

### Erro: "AADSTS650052: The app needs access to a service"

**Solução**: A app precisa de permissões. No Azure Portal:
1. Vá em **"API permissions"**
2. Adicione:
   - `openid`
   - `profile`
   - `email`

### Erro: "AADSTS90144: The request body must contain the following parameter: 'client_assertion' or 'client_secret'"

Isso significa que você precisa de um Client Secret. Siga o **Passo 5** acima.

### Redirect URI não Match

Certifique-se que:
- A URL em `msal-config.js` **exatamente igual** ao registrado no Azure
- Inclua o protocolo `http://` ou `https://`
- Não coloque `/` no final se não estava no Azure

## Próximas Etapas

1. **Implementar no Backend**: 
   - Usar o `CLIENT_SECRET` para validar tokens no Node.js
   - Verificar `iss` (issuer) e `aud` (audience) do token

2. **Adicionar Escopos**:
   - `Mail.Read` - Para ler emails
   - `Calendars.Read` - Para ler calendários
   - `User.Read` - Para ler dados do usuário

3. **Usar em Produção**:
   - Mudar para `https://`
   - Adicionar domínio final em Redirect URIs
   - Usar variáveis de ambiente para Client ID/Secret

## Referências

- [Microsoft MSAL.js Docs](https://learn.microsoft.com/en-us/azure/active-directory/develop/msal-js-overview)
- [Azure AD App Registration](https://learn.microsoft.com/en-us/azure/active-directory/develop/app-objects-and-service-principals)
- [OAuth 2.0 Authorization Code Flow](https://learn.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow)

---

## Status Atual

✅ **Configuração estruturada**  
⏳ **Aguardando Client ID e Tenant ID** (fornecido pelo usuário)  
⏳ **Integração com MSAL.js** (após configuração)  
⏳ **Validação no Backend** (implementação futura)  

Assim que você configurar `msal-config.js` com suas credenciais, a autenticação Microsoft estará funcionando!
