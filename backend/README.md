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
