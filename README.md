# Apostila to Prompt Splitter

Aplicação web para fatiar apostilas (`.docx`) em módulos e gerar prompts automáticos para IA, com armazenamento em nuvem gratuito e sem bloqueios por inatividade via **Google Firebase (Firestore + Auth)**.

---

## 🚀 Como Configurar o Firebase (2 Minutos)

### 1. Criar Projeto no Firebase
1. Acesse o [Firebase Console](https://console.firebase.google.com/).
2. Clique em **Adicionar projeto** e dê um nome (ex: `apostila-splitter`).
3. Desative o Google Analytics (opcional) e clique em **Criar projeto**.

### 2. Ativar o Firestore Database
1. No menu lateral, acesse **Build > Firestore Database**.
2. Clique em **Criar banco de dados** e escolha a localização (ex: `southamerica-east1` - São Paulo ou `us-central1`).
3. Em **Regras de segurança**, inicie no modo de teste ou configure as regras abaixo:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true; // ou: if request.auth != null;
    }
  }
}
```

### 3. Ativar Autenticação (Email/Senha)
1. No menu lateral, acesse **Build > Authentication**.
2. Clique em **Primeiros passos** e na aba **Sign-in method**, ative o provedor **E-mail/senha**.

### 4. Obter as Chaves Web do Projeto
1. Na engrenagem de configurações do projeto (lado superior esquerdo) > **Configurações do projeto**.
2. Na seção "Seus aplicativos", clique no ícone Web `</>`.
3. Registre o app e copie os valores das credenciais para o seu arquivo `.env`:

```env
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=seu-projeto
VITE_FIREBASE_STORAGE_BUCKET=seu-projeto.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

---

## 🌐 Configuração na Vercel

Ao fazer o deploy na [Vercel](https://vercel.com):
1. Vá em **Project Settings > Environment Variables**.
2. Adicione as 6 variáveis acima (`VITE_FIREBASE_API_KEY`, etc.).
3. Faça o redeploy.

---

## 🛠️ Desenvolvimento Local

```bash
# Instalar dependências
npm install

# Rodar localmente
npm run dev

# Gerar build de produção
npm run build
```
