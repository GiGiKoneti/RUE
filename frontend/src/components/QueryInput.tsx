import { useState } from 'react';
import { motion } from 'framer-motion';

interface QueryInputProps {
  onSubmit: (question: string) => void;
  isLoading: boolean;
}

const SUGGESTIONS = [
  'What is LIME in AI?',
  'What is a transformer in deep learning?',
  'What is gradient descent?',
];

export default function QueryInput({ onSubmit, isLoading }: QueryInputProps) {
  const [value, setValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    if (!q || isLoading) return;
    onSubmit(q);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.96 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center justify-center min-h-screen px-6 max-w-2xl mx-auto relative z-10"
    >
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="mb-6 w-16 h-16 rounded-2xl bg-gradient-to-br from-[#d0bcff]/20 to-[#a078ff]/20
                   border border-[#494454]/20 flex items-center justify-center backdrop-blur-xl"
      >
        <span className="text-2xl font-bold text-[#d0bcff]" style={{ fontFamily: "'Manrope', sans-serif" }}>R</span>
      </motion.div>

      {/* Title */}
      <motion.h1
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-4xl md:text-5xl text-center mb-4 tracking-tight text-[#dae2fd]"
        style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 700, letterSpacing: '-0.02em' }}
      >
        What do you want to<br />
        <span className="bg-gradient-to-r from-[#d0bcff] to-[#a078ff] bg-clip-text text-transparent">
          understand deeply?
        </span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-[#dae2fd]/50 text-lg mb-10 text-center"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        Click any highlighted term in the response to explore deeper.
      </motion.p>

      {/* Input */}
      <motion.form
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        onSubmit={handleSubmit}
        className="w-full"
      >
        <div className="relative">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ask anything... we'll help you truly understand it."
            disabled={isLoading}
            className="w-full px-6 py-5 rounded-2xl text-lg
                       bg-white/5 backdrop-blur-xl border border-white/10
                       text-[#dae2fd] placeholder-[#dae2fd]/25
                       focus:outline-none focus:border-[#d0bcff]/40
                       focus:shadow-[0_0_32px_rgba(208,188,255,0.08)]
                       transition-all duration-300 disabled:opacity-50"
            style={{ fontFamily: "'Inter', sans-serif" }}
            autoFocus
          />
          <button
            type="submit"
            disabled={isLoading || !value.trim()}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-xl
                       bg-gradient-to-tr from-[#d0bcff] to-[#a078ff] flex items-center justify-center
                       transition-all duration-200 hover:shadow-[0_0_20px_rgba(208,188,255,0.3)]
                       disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-[#0b1326] border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5 text-[#0b1326]" viewBox="0 0 20 20" fill="none">
                <path d="M4 10h12M12 4l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        </div>
      </motion.form>

      {/* Suggestions */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="flex flex-wrap justify-center gap-2 mt-8"
      >
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => { setValue(s); onSubmit(s); }}
            disabled={isLoading}
            className="px-4 py-2 text-sm rounded-xl bg-white/5 text-[#dae2fd]/50 border border-white/10
                       hover:bg-white/10 hover:text-[#d0bcff]/80 transition-all duration-200
                       disabled:opacity-30"
          >
            {s}
          </button>
        ))}
      </motion.div>
    </motion.div>
  );
}
