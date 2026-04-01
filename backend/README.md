# Backend RH - Node.js + Firebase

## Como rodar

1. Crie um projeto no Firebase e gere uma chave de serviço (service account JSON).
2. Salve o JSON da service account em um arquivo local ou defina a variável de ambiente FIREBASE_SERVICE_ACCOUNT_JSON com o conteúdo do JSON.
3. Defina a variável de ambiente FIREBASE_STORAGE_BUCKET com o nome do bucket do seu projeto (ex: normatel-rh.appspot.com).
4. Instale as dependências:

```sh
npm install
```

5. Rode o servidor:

```sh
npm run dev
```

## Rotas principais

- `POST /api/envios` — Envia atestado (form-data: arquivos[], nome, funcao, projeto, tipo_atestado, horas_comparecimento, data_inicio, data_fim, dias)
- `GET /api/envios` — Lista todos os atestados
- `GET /api/usuarios/pendentes` — Lista usuários pendentes de aprovação
- `POST /api/usuarios/aprovar/:id` — Aprova usuário (define emailVisibility=true)

## Observações
- Os dados do sistema são gravados diretamente no Firestore (sem fallback local):
	- `envios_atestados` (atestados)
	- `usuarios_rh` (cadastros/aprovações)
	- `eventos_frontend` (logs de uso)
- Os anexos dos atestados são gravados diretamente no Firebase Storage (bucket definido por `FIREBASE_STORAGE_BUCKET` ou `<project_id>.appspot.com`).
- Se o Firestore não estiver configurado ou indisponível, as rotas retornam erro `503`.
- A rota local `/uploads/*` foi desativada; os links de anexos retornados já apontam para URL assinada do Firebase Storage.

## HTTPS e CORS em produção
- O backend redireciona HTTP para HTTPS automaticamente (exceto `localhost`).
- Para desativar o redirecionamento em cenários específicos: `FORCE_HTTPS=false`.
- Defina as origens permitidas no CORS via variável de ambiente:

```sh
ALLOWED_ORIGINS=https://seu-front.web.app,https://seu-dominio.com
```

- Para aceitar domínios dinâmicos (preview) no Vercel, use sufixos permitidos:

```sh
ALLOWED_ORIGIN_SUFFIXES=.vercel.app
```

- Quando o frontend estiver no Vercel e o backend no Firebase/Cloud, defina no navegador (ou injete em `window.__RH_BACKEND_URL__`) a URL HTTPS da API:

```js
localStorage.setItem('rh_backend_url', 'https://SUA-API-EM-NUVEM')
```

- Em desenvolvimento local, `http://localhost:3000`, `http://localhost:5500` e `http://127.0.0.1:5500` já são aceitos por padrão.
