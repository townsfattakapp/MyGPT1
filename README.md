# myGPT (Vite + React + Electron + Multiple AI Providers)

A desktop AI assistant application built with Electron, React, Vite, supporting OpenAI, DeepSeek, and Google Gemini.

## Prerequisites

1. **Node.js**: Make sure you have Node.js installed (v18+ recommended).
2. **Yarn** or **NPM**: Yarn is primarily used in this project.
3. **API Keys**: Choose your preferred AI provider(s) and get their API keys.

## Supported AI Providers

### 🤖 OpenAI
- **Best for**: Most comprehensive features, excellent coding assistance
- **Cost**: Pay-as-you-go ($5 free credits for new users)
- **API Key**: Get from [OpenAI Platform](https://platform.openai.com/api-keys)

### 🔍 DeepSeek
- **Best for**: Cost-effective coding assistance
- **Cost**: Very affordable, generous free tier
- **API Key**: Get from [DeepSeek Platform](https://platform.deepseek.com/)

### 💎 Google Gemini
- **Best for**: Free tier with good performance, excellent image processing
- **Cost**: Generous free tier, pay-as-you-go after limits
- **API Key**: Get from [Google AI Studio](https://aistudio.google.com/)

## Environment Variables

Create a `.env` file in the root of the project with your chosen provider(s):

```env
# Server Port
PORT=3000

# Choose your AI provider: 'openai', 'deepseek', or 'gemini'
VITE_AI_PROVIDER=openai

# OpenAI Configuration (if using OpenAI)
VITE_OPENAI_API_KEY=sk-proj-your-openai-key-here
VITE_OPENAI_ASSISTANT_ID=asst_your-assistant-id-here
VITE_OPENAI_THREAD_ID=thread_your-thread-id-here

# DeepSeek Configuration (if using DeepSeek)
VITE_DEEPSEEK_API_KEY=sk-your-deepseek-key-here

# Gemini Configuration (if using Gemini)
VITE_GEMINI_API_KEY=your-gemini-api-key-here

# Optional: Custom system prompt
VITE_SYSTEM_PROMPT=Your custom system prompt here
```

## Switching Providers

You can switch between AI providers at runtime using the dropdown in the chat header:

1. Click the provider selector in the top-left corner
2. Choose your preferred AI provider
3. The app will automatically switch to use that provider's API

## How to Start the App

## How to Start the App

Follow these steps to run the application in a development environment:

### 1. Install Dependencies

Open a terminal in the project directory and run:

```bash
yarn install
```

_(or `npm install`)_

### 2. Start the Vite React Server

In the same terminal, start the React frontend:

```bash
yarn dev
```

_(or `npm run dev`)_

### 3. Start the Electron App

**Open a second terminal window** in the project directory and run:

```bash
yarn dev:electron
```

_(or `npm run dev:electron`)_

The Electron desktop application will launch and load the React interface!

## Building for Production

To create an executable for your operating system:

```bash
# Build for Mac
yarn dist:mac

# Build for Windows
yarn dist:win

# Build for Linux
yarn dist:linux
```
