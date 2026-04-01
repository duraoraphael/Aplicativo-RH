// Configuração do MSAL.js para integração com Microsoft Entra ID (Azure AD)
// Guia de configuração: https://learn.microsoft.com/en-us/azure/active-directory/develop/vs-active-directory-add-connected-service

const DEFAULT_CLIENT_ID = "89b8bf1d-7f65-466d-81eb-150c26a0b57a";
const DEFAULT_TENANT_ID = "6b8311fd-897b-42b3-8ec4-bb68ddf44a01";
const LEGACY_CLIENT_ID = "a7004343-2d2e-4073-84db-581f28c20aab";

const storedClientId =
  (typeof localStorage !== 'undefined' && localStorage.getItem('rh_msal_client_id')) || '';

const runtimeClientId =
  (storedClientId && storedClientId !== LEGACY_CLIENT_ID ? storedClientId : '') ||
  DEFAULT_CLIENT_ID;

const runtimeTenantId =
  (typeof localStorage !== 'undefined' && localStorage.getItem('rh_msal_tenant_id')) ||
  DEFAULT_TENANT_ID;

const currentPageRedirect =
  (typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : "http://localhost:5500/account-selector.html");

const normalizedLocalRedirect =
  currentPageRedirect.replace('://127.0.0.1:', '://localhost:');

const hostName = typeof window !== 'undefined' ? String(window.location.hostname || '').toLowerCase() : '';
const isLocalHost = hostName === 'localhost' || hostName === '127.0.0.1';
const localCanonicalRedirect = typeof window !== 'undefined'
  ? `${window.location.origin.replace('://127.0.0.1:', '://localhost:')}/account-selector.html`
  : 'http://localhost:5500/account-selector.html';
const storedRedirectUri = (typeof localStorage !== 'undefined' && localStorage.getItem('rh_msal_redirect_uri')) || '';

const runtimeRedirectUri = isLocalHost
  ? localCanonicalRedirect
  : (storedRedirectUri || normalizedLocalRedirect);

const msalConfig = {
  auth: {
    clientId: runtimeClientId,
    authority: `https://login.microsoftonline.com/${runtimeTenantId}`,
    redirectUri: runtimeRedirectUri,
    postLogoutRedirectUri: runtimeRedirectUri
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: true
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (!containsPii) {
          console.log(`[MSAL] ${message}`);
        }
      },
      logLevel: "Info",
      piiLoggingEnabled: false
    }
  }
};

// Configuração de escopos (permissões)
const loginRequest = {
  scopes: ["openid", "profile", "email"]
};

const tokenRequest = {
  scopes: ["openid", "profile", "email"]
};

// Exportar para uso em outros scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { msalConfig, loginRequest, tokenRequest };
}
