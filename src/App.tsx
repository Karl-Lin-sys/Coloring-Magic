import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { jsPDF } from 'jspdf';
import { Loader2, Sparkles, Download, MessageSquare, BookOpen, Send, Key } from 'lucide-react';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

function ApiKeyScreen({ onKeySelected }: { onKeySelected: () => void }) {
  const [loading, setLoading] = useState(false);

  const handleSelectKey = async () => {
    setLoading(true);
    try {
      if (window.aistudio) {
        await window.aistudio.openSelectKey();
        onKeySelected();
      } else {
        alert("API key selection is not available in this environment.");
      }
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <Key className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-neutral-900 mb-2">API Key Required</h1>
        <p className="text-neutral-600 mb-8">
          To generate high-quality coloring book images, you need to select a paid Google Cloud project API key.
          <br /><br />
          <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
            Learn more about billing
          </a>
        </p>
        <button
          onClick={handleSelectKey}
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
          Select API Key
        </button>
      </div>
    </div>
  );
}

function GeneratorView() {
  const [theme, setTheme] = useState('');
  const [childName, setChildName] = useState('');
  const [imageSize, setImageSize] = useState('1K');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!theme || !childName) return;
    setIsGenerating(true);
    setGeneratedImages([]);
    setPdfUrl(null);
    setProgress('Brainstorming page ideas...');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY });
      const promptResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Generate 5 distinct, highly descriptive prompts for a children's coloring book page based on the theme: "${theme}".
        The prompts should describe a scene that will be drawn as black-and-white, thick-line art suitable for printing and coloring.
        Return ONLY a JSON array of 5 strings.`,
        config: {
          responseMimeType: 'application/json',
        }
      });

      const prompts = JSON.parse(promptResponse.text || '[]');
      if (!Array.isArray(prompts) || prompts.length !== 5) {
        throw new Error("Failed to generate 5 prompts.");
      }

      const images: string[] = [];
      
      for (let i = 0; i < prompts.length; i++) {
        setProgress(`Generating image ${i + 1} of 5...`);
        const imagePrompt = `A children's coloring book page, black and white, thick clean line art, no shading, simple, suitable for coloring. Scene: ${prompts[i]}`;
        
        // Create a new instance for each call to ensure the latest API key is used
        const imageAi = new GoogleGenAI({ apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY });
        const imageResponse = await imageAi.models.generateContent({
          model: 'gemini-3-pro-image-preview',
          contents: { parts: [{ text: imagePrompt }] },
          config: {
            imageConfig: {
              aspectRatio: '3:4',
              imageSize: imageSize as any,
            }
          }
        });

        let base64Image = '';
        for (const part of imageResponse.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            base64Image = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            break;
          }
        }

        if (base64Image) {
          images.push(base64Image);
          setGeneratedImages(prev => [...prev, base64Image]);
        } else {
          throw new Error(`Failed to generate image ${i + 1}`);
        }
      }

      setProgress('Creating PDF...');
      
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Cover Page
      doc.setFontSize(40);
      doc.setFont('helvetica', 'bold');
      doc.text(`${childName}'s`, pageWidth / 2, pageHeight / 3, { align: 'center' });
      doc.setFontSize(30);
      doc.text('Coloring Book', pageWidth / 2, pageHeight / 3 + 15, { align: 'center' });
      
      doc.setFontSize(20);
      doc.setFont('helvetica', 'normal');
      doc.text(`Theme: ${theme}`, pageWidth / 2, pageHeight / 3 + 40, { align: 'center' });

      // Image Pages
      for (let i = 0; i < images.length; i++) {
        doc.addPage();
        const margin = 10;
        const imgWidth = pageWidth - (margin * 2);
        const imgHeight = (imgWidth * 4) / 3;
        const yPos = (pageHeight - imgHeight) / 2;
        doc.addImage(images[i], 'PNG', margin, yPos > margin ? yPos : margin, imgWidth, imgHeight);
      }

      const pdfBlob = doc.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      setPdfUrl(url);
      setProgress('');

    } catch (error) {
      console.error(error);
      setProgress(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-10">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h2 className="text-3xl font-bold text-neutral-900 mb-2">Create a Coloring Book</h2>
          <p className="text-neutral-600">Generate a custom 5-page coloring book with a personalized cover.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-700">Child's Name</label>
              <input
                type="text"
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                placeholder="e.g. Emma"
                className="w-full px-4 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-700">Theme</label>
              <input
                type="text"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="e.g. Space Dinosaurs"
                className="w-full px-4 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-neutral-700">Image Quality</label>
            <div className="flex gap-4">
              {['1K', '2K', '4K'].map((size) => (
                <label key={size} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="imageSize"
                    value={size}
                    checked={imageSize === size}
                    onChange={(e) => setImageSize(e.target.value)}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-neutral-700">{size}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating || !theme || !childName}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {progress}
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Generate Coloring Book
              </>
            )}
          </button>
        </div>

        {(generatedImages.length > 0 || pdfUrl) && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-neutral-900">Preview</h3>
              {pdfUrl && (
                <a
                  href={pdfUrl}
                  download={`${childName}-Coloring-Book.pdf`}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download PDF
                </a>
              )}
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {generatedImages.map((img, idx) => (
                <div key={idx} className="aspect-[3/4] bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden relative">
                  <img src={img} alt={`Page ${idx + 1}`} className="w-full h-full object-cover" />
                  <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded-md backdrop-blur-sm">
                    Page {idx + 1}
                  </div>
                </div>
              ))}
              {isGenerating && generatedImages.length < 5 && (
                <div className="aspect-[3/4] bg-neutral-100 rounded-xl border-2 border-dashed border-neutral-300 flex flex-col items-center justify-center text-neutral-400">
                  <Loader2 className="w-6 h-6 animate-spin mb-2" />
                  <span className="text-xs">Generating...</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type Message = {
  role: 'user' | 'model';
  text: string;
};

function ChatView() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: "Hi! I'm your creative assistant. I can help you brainstorm fun and exciting themes for your coloring book. What kind of things does the child like?" }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<any>(null);

  useEffect(() => {
    if (!chatRef.current) {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY });
      chatRef.current = ai.chats.create({
        model: 'gemini-3-flash-preview',
        config: {
          systemInstruction: "You are a creative, enthusiastic assistant helping a user brainstorm themes and ideas for a children's coloring book. Ask questions about the child's interests, suggest imaginative combinations (like 'space dinosaurs' or 'underwater castles'), and keep your responses relatively brief, engaging, and encouraging.",
        }
      });
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !chatRef.current) return;
    
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsTyping(true);

    try {
      // Re-initialize chat if needed to pick up latest API key
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY });
      if (!chatRef.current || chatRef.current.model !== 'gemini-3-flash-preview') {
          chatRef.current = ai.chats.create({
            model: 'gemini-3-flash-preview',
            config: {
              systemInstruction: "You are a creative, enthusiastic assistant helping a user brainstorm themes and ideas for a children's coloring book. Ask questions about the child's interests, suggest imaginative combinations (like 'space dinosaurs' or 'underwater castles'), and keep your responses relatively brief, engaging, and encouraging.",
            }
          });
      }

      const response = await chatRef.current.sendMessage({ message: userMsg });
      setMessages(prev => [...prev, { role: 'model', text: response.text }]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'model', text: "Oops, something went wrong. Please try again." }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white">
      <div className="p-6 border-b border-neutral-200 bg-neutral-50">
        <h2 className="text-xl font-bold text-neutral-900">Brainstorm Chat</h2>
        <p className="text-sm text-neutral-500">Chat with our AI to come up with the perfect coloring book theme.</p>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-5 py-3 ${
              msg.role === 'user' 
                ? 'bg-indigo-600 text-white rounded-br-sm' 
                : 'bg-neutral-100 text-neutral-800 rounded-bl-sm'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-neutral-100 text-neutral-800 rounded-2xl rounded-bl-sm px-5 py-4 flex items-center gap-1">
              <div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-neutral-200 bg-white">
        <div className="max-w-4xl mx-auto relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type your message..."
            className="w-full pl-4 pr-12 py-3 bg-neutral-100 border-transparent rounded-full focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function MainApp() {
  const [activeTab, setActiveTab] = useState<'generator' | 'chat'>('generator');

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col md:flex-row">
      <div className="w-full md:w-64 bg-white border-r border-neutral-200 flex flex-col">
        <div className="p-6 border-b border-neutral-200">
          <h1 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            Coloring Magic
          </h1>
        </div>
        <nav className="p-4 flex-1 flex flex-col gap-2">
          <button
            onClick={() => setActiveTab('generator')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
              activeTab === 'generator' ? 'bg-indigo-50 text-indigo-700' : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            <BookOpen className="w-5 h-5" />
            Generator
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
              activeTab === 'chat' ? 'bg-indigo-50 text-indigo-700' : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            <MessageSquare className="w-5 h-5" />
            Brainstorm Chat
          </button>
        </nav>
      </div>

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {activeTab === 'generator' ? <GeneratorView /> : <ChatView />}
      </div>
    </div>
  );
}

export default function App() {
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio) {
        const hasSelected = await window.aistudio.hasSelectedApiKey();
        setHasKey(hasSelected);
      } else {
        setHasKey(true);
      }
    };
    checkKey();
  }, []);

  if (hasKey === null) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;
  }

  if (!hasKey) {
    return <ApiKeyScreen onKeySelected={() => setHasKey(true)} />;
  }

  return <MainApp />;
}
