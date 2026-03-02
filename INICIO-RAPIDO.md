# 🚀 Aplicativo RH - Migração para Firebase

Aplicativo web para envio e gerenciamento de atestados médicos integrado com Firebase e Node.js.

## 📋 Pré-requisitos

- **Node.js** 14+ ([Download](https://nodejs.org))
- **Windows PowerShell** ou qualquer navegador moderno

## ⚡ Início Rápido

### 1. Iniciar o Backend

Abra PowerShell na pasta do projeto e execute:

```powershell
.\start-backend.ps1
```

Ou manualmente:

```powershell
cd backend
node index.js
```

O servidor estará disponível em: **http://localhost:3001**

### 2. Abrir a Aplicação

Abra o arquivo `index.html` no navegador:
- Simplesmente clique duas vezes em `index.html`, ou
- Use a extensão Live Server do VS Code, ou
- Acesse `http://localhost:5500` (se usar Live Server)

## 🏗️ Arquitetura

```
├── index.html              # Página principal (envio de atestados)
├── rh-atestados.html       # Painel RH (visualização)
├── rh-usuarios.html        # Gerenciamento de usuários
├── rh-login.html           # Página de login
├── script.js               # Lógica do frontend
├── firebase-config.js      # Configuração do backend
├── styles.css              # Estilos CSS
│
└── backend/
    ├── index.js            # Servidor Express
    ├── package.json        # Dependências
    └── .env                # Variáveis de ambiente
```

## 📡 API do Backend

### Endpoints

#### GET `/`
- **Descrição**: Status do servidor
- **Resposta**: `{ status: "API RH backend online!" }`

#### GET `/api/envios`
- **Descrição**: Listar todos os atestados
- **Resposta**: Array de atestados

#### POST `/api/envios`
- **Descrição**: Enviar novo atestado
- **Body** (JSON):
```json
{
  "nome": "João Silva",
  "funcao": "Engenheiro",
  "projeto": "Projeto 736",
  "tipo_atestado": "Atestado médico",
  "data_inicio": "2026-03-01",
  "data_fim": "2026-03-05",
  "dias": 5,
  "horas_comparecimento": "8"
}
```

#### GET `/api/usuarios/pendentes`
- **Descrição**: Listar usuários pendentes de aprovação
- **Resposta**: Array de usuários

#### POST `/api/usuarios/aprovar/:id`
- **Descrição**: Aprovar um usuário
- **Parâmetro**: `id` - ID do usuário
- **Resposta**: `{ id, aprovado: true }`

## 🔧 Configuração do Firebase (Futuro)

Quando estiver pronto para usar Firebase:

1. Crie um projeto em [Firebase Console](https://console.firebase.google.com)
2. Gere uma chave de serviço (Service Account JSON)
3. Atualize `backend/.env`:
```env
FIREBASE_SERVICE_ACCOUNT_JSON=./seu-arquivo-service-account.json
FIREBASE_STORAGE_BUCKET=seu-projeto.firebasestorage.app
PORT=3001
```

4. Instale as dependências necessar...

## 📝 Funcionalidades

✅ Envio de atestados (PDF, imagem, texto)  
✅ Conversão automática de formatos para PDF  
✅ Upload de múltiplos arquivos  
✅ Painel de visualização de atestados  
✅ Filtro por projeto  
✅ Aprovação de usuários  
✅ Login com Microsoft (preparado)  

## 🛠️ Desenvolvimento

Para modificar o backend, edite `backend/index.js` e reinicie o servidor.

Para modificar o frontend, edite os arquivos `.html` e `.js` - a mudança será refletida ao atualizar o navegador.

## 📚 Tecnologias

- **Frontend**: HTML5, CSS3, JavaScript vanilla
- **Backend**: Node.js (nativo - sem dependências externas)
- **Banco de Dados**: Firebase Firestore (future), atualmente em-memória
- **Autenticação**: Microsoft Entra ID (OAuth 2.0)

## 🐛 Troubleshooting

### Erro: "Port 3001 já está em uso"
```powershell
# Encontre o processo
netstat -ano | findstr :3001

# Elimine o processo (substitua PID)
taskkill /PID <PID> /F
```

### Frontend não conecta ao backend
- Verifique se o backend está rodando em `http://localhost:3001`
- Abra o console do navegador (F12) para ver erros
- Certifique-se que CORS está habilitado (está no código)

### Erro de CORS
O backend tem CORS habilitado para todas as origens. Se tiver problemas, edite `backend/index.js` linha de setCORSHeaders.

## 📞 Suporte

Para dúvidas sobre a migração, consulte o arquivo [CHANGELOG.md](./CHANGELOG.md)

## 📄 Licença

ISC
