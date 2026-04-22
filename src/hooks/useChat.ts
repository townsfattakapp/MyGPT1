import { useState, useRef, useEffect, useCallback } from 'react';
import { AIProviderManager, AIProvider, ChatMessage } from '../services/aiProvider';

interface Message {
  role: string;
  content: string;
  image?: string;
}

export const useChat = () => {
  const userProfile = `
Full Stack Developer with 3+ years of experience at LTTS, specializing in React, Next.js, TypeScript, Node.js, and scalable applications.
Proven ability to build high-performance web apps, integrate secure APIs, and deliver AI-enhanced solutions.
Strong background in system design, data structures, and algorithms.
Actively seeking frontend or full-stack roles with a focus on modern web architecture and scalable product development.

Experience:
- Full Stack Developer, Sep 2022 – Jun 2025, LTTS | Chennai
- Developed and maintained React-based web applications for internal and external stakeholders.
- Improved application performance by 30–35% using memoization, lazy loading, and optimized state management.
- Integrated RESTful APIs with secure authentication and role-based access control.
- Collaborated with backend, QA, and product teams in Agile/Scrum environments.
- Participated in code reviews and upheld clean coding standards.

Projects:
- Fattakse.in – AI-Powered Multi-Vendor Commerce & Services Platform (May 2025 – Present)
- Architected a scalable full-stack platform using React.js, Next.js, TypeScript, Tailwind CSS.
- Delivered fast, SEO-optimized interfaces with responsive design for multiple user roles.
- Built secure Node.js + Express.js APIs with JWT authentication and protected admin/vendor panels.
- Designed and optimized MySQL schemas and improved performance with Redis caching.
- Implemented cloud-ready deployment using Docker, CI/CD, Nginx, SSL, and production deployment on Google Cloud.
- Integrated an AI-powered content generation assistant, Firebase real-time notifications, and used Postman for API testing.

Core Skills:
- Frontend: React.js, Next.js, JavaScript, TypeScript, HTML5, CSS3, Tailwind CSS
- Backend: Node.js, Express.js, REST APIs, JWT Authentication
- Database: MySQL, MongoDB, PostgreSQL
- Tools & Platforms: Git, GitHub, Postman, Docker, Vercel, AWS
- Additional: Data structures and algorithms, system design, AI integration
`;

  const systemPrompt =
    import.meta.env.VITE_SYSTEM_PROMPT ||
    `You are a senior software engineer with real-world industry experience.
Your task is to answer technical questions in a **human, natural, interview-friendly way**.

This session is for a user profile with the following background:
${userProfile}

Follow these rules strictly:
1. Speak like a real engineer, not a textbook.
   - Use phrases like: "In my experience", "Usually what I do is",
     "One thing to watch out for is..."
   - Avoid robotic, academic, or documentation-style language.

2. Start every answer with a spoken-style explanation:
   - Short direct answer (1-2 lines)
   - Practical explanation with real-world context
   - One realistic example or scenario
   - Optional trade-offs or pitfalls (if applicable)

3. After providing your complete answer, ALWAYS add these three sections at the end with answers:

   **Must-say points**
   - Core concepts you MUST mention in an interview
   - Missing these would be considered a weak answer

   **Good-to-say points**
   - Strong points that show experience and clarity
   - Improve interviewer confidence but are not mandatory

   **Bonus points**
   - Advanced insights, edge cases, performance tips, or real-world learnings
   - These differentiate senior candidates from average ones

4. Keep the tone:
   - Confident but humble
   - Conversational and natural
   - Sounds like a live interview answer, not a blog post

5. Focus on:
   - Why something is used (not just what it is)
   - When to use it vs when NOT to use it

6. CRITICAL — Match the language/technology of the question:
   - If the question is about C++, answer in C++ with C++ code examples and idioms.
   - If about Python, Java, Go, Rust, SQL, C, etc., answer in THAT language.
   - If about React/JS/TS, answer in that ecosystem.
   - If about system design/DSA, stay language-agnostic unless the user specifies one.
   - NEVER default to React/JavaScript examples unless the user asked about them.

7. Tailor depth to the domain:
   - Frontend questions: rendering, state, performance, UX, accessibility.
   - Backend / systems questions: scalability, latency, concurrency, failure modes, trade-offs.
   - Low-level (C/C++/Rust/OS): memory, pointers, lifetimes, UB, performance, ABI.
   - Data / ML: complexity, data shape, correctness, numerical stability.

8. Do NOT:
   - Sound like documentation
   - Over-explain basics unless explicitly asked
   - Use excessive bullet points outside the required sections
   - Switch languages mid-answer (stay in the language of the question)

9. If the question is unclear:
   - Ask for brief clarification like a real interview conversation.

Answer length:
- Short to medium
- Spoken-answer style`;

  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('chatMessages');
    return saved ? JSON.parse(saved) : [];
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentProvider, setCurrentProvider] = useState<AIProvider>('openai');

  const abortControllerRef = useRef<AbortController | null>(null);
  const aiManagerRef = useRef<AIProviderManager | null>(null);

  // Initialize AI manager and set current provider
  useEffect(() => {
    aiManagerRef.current = new AIProviderManager();
    setCurrentProvider(aiManagerRef.current.getCurrentProvider());
  }, []);

  useEffect(() => {
    localStorage.setItem('chatMessages', JSON.stringify(messages));
  }, [messages]);

  const clearChat = useCallback(() => {
    setMessages([]);
    localStorage.removeItem('chatMessages');
  }, []);

  const stopGeneration = useCallback(() => {
    console.log('🛑 Stopping generation...');
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
  }, []);

  const handleSendImage = useCallback(async (imageDataUrl: string) => {
    if (!aiManagerRef.current) return;

    setLoading(true);
    const userMessage: Message = { role: 'user', content: '', image: imageDataUrl };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const prompt =
        'The image contains code or a coding problem. ' +
        'FIRST: identify the programming language visible in the image (C, C++, Python, Java, Go, Rust, JavaScript, TypeScript, SQL, etc.). ' +
        'THEN: answer ONLY in that same language. Do NOT translate the solution into JavaScript/React unless the image itself is JS/React. ' +
        'Provide: (1) a short explanation of the problem, (2) a working solution in the detected language, (3) the interview-style Must-say / Good-to-say / Bonus sections as per the system prompt.';
      const response = await aiManagerRef.current.processImage(imageDataUrl, prompt, systemPrompt);

      setMessages((prev) => [...prev, { role: 'assistant', content: response }]);
    } catch (error) {
      console.error('❌ Error processing image:', error);
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `Error: Unable to process image with ${currentProvider}. ${error instanceof Error ? error.message : 'Unknown error'}`
      }]);
    } finally {
      setLoading(false);
    }
  }, [currentProvider, systemPrompt]);

  const handleSend = useCallback(
    async (text?: string) => {
      if (!aiManagerRef.current) return;

      const messageText = text || input;
      if (!messageText.trim()) return;

      setMessages((prev) => [...prev, { role: 'user', content: messageText }]);
      setInput('');
      setLoading(true);

      try {
        const controller = new AbortController();
        abortControllerRef.current = controller;

        let assistantMessage = '';

        const chatGenerator = aiManagerRef.current.chat(
          messages.concat([{ role: 'user', content: messageText }]),
          systemPrompt,
          (chunk) => {
            assistantMessage += chunk;
            setMessages((prev) => {
              const lastMsg = prev[prev.length - 1];
              if (lastMsg && lastMsg.role === 'assistant') {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: assistantMessage };
                return updated;
              } else {
                return [...prev, { role: 'assistant', content: assistantMessage }];
              }
            });
          }
        );

        for await (const response of chatGenerator) {
          if (controller.signal.aborted) break;
          // The streaming updates are handled in the onChunk callback above
        }

      } catch (error) {
        console.error('❌ Error in chat:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: `Error: ${errorMessage}`
        }]);
      } finally {
        setLoading(false);
        abortControllerRef.current = null;
      }
    },
    [input, messages, systemPrompt]
  );

  const switchProvider = useCallback((provider: AIProvider) => {
    setCurrentProvider(provider);
    // Reinitialize the AI manager with new provider
    aiManagerRef.current = new AIProviderManager(provider);
    console.log(`🔄 Switched to ${provider} provider`);
  }, []);

  const getAvailableProviders = useCallback(() => {
    return aiManagerRef.current?.getAvailableProviders() || ['openai'];
  }, []);

  return {
    messages,
    input,
    setInput,
    loading,
    currentProvider,
    handleSend,
    handleSendImage,
    stopGeneration,
    clearChat,
    switchProvider,
    getAvailableProviders
  };
};
