import React, { useRef, useState, useEffect } from "react";
import { motion, useInView } from "framer-motion";

/* ---------------- WordsPullUp ---------------- */
interface WordsPullUpProps {
  text: string;
  className?: string;
  showAsterisk?: boolean;
  style?: React.CSSProperties;
}

export const WordsPullUp = ({ text, className = "", showAsterisk = false, style }: WordsPullUpProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const words = text.split(" ");

  return (
    <div ref={ref} className={`inline-flex flex-wrap ${className}`} style={style}>
      {words.map((word, i) => {
        const isLast = i === words.length - 1;
        return (
          <motion.span
            key={i}
            initial={{ y: 20, opacity: 0 }}
            animate={isInView ? { y: 0, opacity: 1 } : {}}
            transition={{ duration: 0.6, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="inline-block relative"
            style={{ marginRight: isLast ? 0 : "0.25em" }}
          >
            {word}
            {showAsterisk && isLast && (
              <span className="absolute top-[0.65em] -right-[0.3em] text-[0.31em]">*</span>
            )}
          </motion.span>
        );
      })}
    </div>
  );
};

/* ---------------- WordsPullUpMultiStyle ---------------- */
interface Segment {
  text: string;
  className?: string;
}

interface WordsPullUpMultiStyleProps {
  segments: Segment[];
  className?: string;
  style?: React.CSSProperties;
}

export const WordsPullUpMultiStyle = ({ segments, className = "", style }: WordsPullUpMultiStyleProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });

  const words: { word: string; className?: string }[] = [];
  segments.forEach((seg) => {
    seg.text.split(" ").forEach((w) => {
      if (w) words.push({ word: w, className: seg.className });
    });
  });

  return (
    <div ref={ref} className={`inline-flex flex-wrap justify-center ${className}`} style={style}>
      {words.map((w, i) => (
        <motion.span
          key={i}
          initial={{ y: 20, opacity: 0 }}
          animate={isInView ? { y: 0, opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
          className={`inline-block ${w.className ?? ""}`}
          style={{ marginRight: "0.25em" }}
        >
          {w.word}
        </motion.span>
      ))}
    </div>
  );
};

/* ---------------- PrismaHero (Modified for SPA Shell Loader & Laptop Zoom Reveal) ---------------- */
interface PrismaHeroProps {
  progress?: number; // 0 to 100
  statusText?: string;
  navItems?: string[];
  videoSrc?: string;
  onLoadedComplete?: () => void;
  isCompleted?: boolean;
}

export const PrismaHero = ({
  progress = 0,
  statusText = "INITIALIZING KDMES SYSTEM...",
  videoSrc = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_170732_8a9ccda6-5cff-4628-b164-059c500a2b41.mp4",
  onLoadedComplete,
  isCompleted = false
}: PrismaHeroProps) => {
  const [displayCount, setDisplayCount] = useState(0);
  const [isRevealing, setIsRevealing] = useState(false);

  useEffect(() => {
    const target = Math.min(100, Math.max(0, Math.round(progress)));
    const timer = setInterval(() => {
      setDisplayCount((prev) => {
        if (prev < target) return prev + 1;
        if (prev > target) return prev - 1;
        clearInterval(timer);
        return target;
      });
    }, 15);
    return () => clearInterval(timer);
  }, [progress]);

  useEffect(() => {
    if (isCompleted || displayCount >= 100) {
      const revealTimer = setTimeout(() => {
        setIsRevealing(true);
        if (onLoadedComplete) {
          setTimeout(onLoadedComplete, 850);
        }
      }, 250);
      return () => clearTimeout(revealTimer);
    }
  }, [isCompleted, displayCount, onLoadedComplete]);

  return (
    <motion.section
      className="fixed inset-0 z-[99999] h-screen w-screen overflow-hidden bg-[#0a0e27]"
      animate={isRevealing ? { opacity: 0 } : { opacity: 1 }}
      transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
      style={{
        WebkitMaskImage: isRevealing
          ? "radial-gradient(circle at 52% 51.5%, transparent 150%, #000 152%)"
          : "radial-gradient(circle at 52% 51.5%, transparent 0%, #000 1%)",
        maskImage: isRevealing
          ? "radial-gradient(circle at 52% 51.5%, transparent 150%, #000 152%)"
          : "radial-gradient(circle at 52% 51.5%, transparent 0%, #000 1%)",
        transition: "all 0.85s cubic-bezier(0.16, 1, 0.3, 1)"
      }}
    >
      <div className="relative h-full w-full overflow-hidden">
        {/* Background video (Static, unscaled) */}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
          src={videoSrc}
        />

        {/* Noise overlay */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.6] mix-blend-overlay bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />

        {/* Gradient vignette overlay */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/75" />

        {/* Bottom-Left: 0 to 100 Counter */}
        <div className="absolute bottom-6 left-6 z-20 sm:bottom-10 sm:left-10 md:bottom-12 md:left-14">
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline font-mono font-bold leading-none tracking-tighter text-[18vw] sm:text-[15vw] md:text-[12vw] lg:text-[10vw] text-[#E1E0CC]">
              <span>{displayCount.toString().padStart(2, "0")}</span>
              <span className="text-[0.4em] font-light text-[#E1E0CC]/60 ml-2">%</span>
            </div>
            
            <div className="flex items-center gap-2 text-xs font-mono tracking-widest text-[#E1E0CC]/80 uppercase">
              <span className="inline-block h-2 w-2 rounded-full bg-[#3dd5c0] animate-pulse" />
              <span>{displayCount >= 100 ? "SYSTEM READY · REVEALING WORKSPACE" : statusText}</span>
            </div>

            {/* Progress track */}
            <div className="h-1 w-48 sm:w-64 md:w-80 rounded-full bg-white/15 overflow-hidden mt-1 backdrop-blur-sm">
              <motion.div
                className="h-full bg-gradient-to-r from-[#3dd5c0] to-[#E1E0CC] rounded-full"
                animate={{ width: `${displayCount}%` }}
                transition={{ ease: "easeOut", duration: 0.2 }}
              />
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
};

export default PrismaHero;
