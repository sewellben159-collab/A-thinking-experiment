/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { GoogleGenAI, Type } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { Terminal, Cpu, Zap, ShieldCheck, ShieldAlert, Activity, Share2, Link as LinkIcon, Play } from "lucide-react";

// ─────────────────────────────────────────────────────────
// REAL CODE IMPLEMENTATIONS — RealEnv's actual knowledge
// ─────────────────────────────────────────────────────────
const REAL_IMPLEMENTATIONS = {
  "bubble_sort": {
    name: "Bubble Sort",
    code: `function bubbleSort(arr) {
  const n = arr.length;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - i - 1; j++) {
      if (arr[j] > arr[j + 1]) {
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
      }
    }
  }
  return arr;
}`,
    description: "Sort an array by repeatedly swapping adjacent elements if they are in the wrong order"
  },
  "fibonacci": {
    name: "Fibonacci Sequence",
    code: `function fibonacci(n) {
  if (n <= 1) return n;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    [a, b] = [b, a + b];
  }
  return b;
}`,
    description: "Compute the nth Fibonacci number where each number is the sum of the two preceding ones"
  },
  "idiom_look_leap": {
    name: "Look Before You Leap",
    code: `function safeExecute(action, condition) {
  if (condition()) {
    return action();
  }
  console.warn("Safety check failed: Leap aborted.");
  return null;
}`,
    description: "A decision-making mechanism for pre-condition validation and risk mitigation."
  },
  "idiom_eggs_basket": {
    name: "Eggs in One Basket",
    code: `function distributeLoad(tasks, nodes) {
  const distribution = nodes.map(() => []);
  tasks.forEach((task, i) => {
    distribution[i % nodes.length].push(task);
  });
  return distribution;
}`,
    description: "Logic for redundancy and load balancing to prevent single-point failure."
  },
  "idiom_stitch_time": {
    name: "Stitch in Time",
    code: `function preventiveMaintenance(system) {
  const issues = system.detectEarlySigns();
  if (issues.length > 0) {
    return system.applySmallFix(issues);
  }
  return "System stable.";
}`,
    description: "Early exit and preventive logic to avoid exponential complexity growth."
  },
  "custom": {
    name: "Custom Input",
    code: "",
    description: "User-defined natural language or pseudo-code logic."
  }
};

// ─────────────────────────────────────────────────────────
// SHARED MESSAGE BUS — the "network" between envs
// ─────────────────────────────────────────────────────────
function createBus() {
  const listeners: ((msg: any) => void)[] = [];
  return {
    publish: (msg: any) => listeners.forEach(fn => fn({ ...msg, ts: Date.now() })),
    subscribe: (fn: (msg: any) => void) => { 
      listeners.push(fn); 
      return () => {
        const index = listeners.indexOf(fn);
        if (index > -1) listeners.splice(index, 1);
      }; 
    }
  };
}

const bus = createBus();

// ─────────────────────────────────────────────────────────
// LLM PROMPTS
// ─────────────────────────────────────────────────────────
const PSEUDO_SYSTEM = `You are PSEUDO-ENV, a computing environment that has never seen real programming syntax. 
You understand algorithms purely through abstract logic and natural-language pseudo-code.
You have NO knowledge of JavaScript, Python, or any real language's syntax.

When given an algorithm description, you produce pseudo-code using ONLY these constructs:
- DEFINE PROCEDURE name(inputs)
- SET variable TO value  
- FOR EACH item IN collection / END FOR
- REPEAT n TIMES / END REPEAT
- IF condition THEN / ELSE / END IF
- WHILE condition / END WHILE
- SWAP(a, b)
- RETURN value
- CALL procedure(args)
- // comments

Your pseudo-code must be logically complete and unambiguous.
NEVER use real programming syntax (no {}, no =>, no let/const/var, no semicolons, no brackets).
Output ONLY the pseudo-code block, no explanation.`;

const VERIFIER_SYSTEM = `You are a neutral logic verifier. You receive:
1. A piece of PSEUDO-CODE (abstract algorithmic logic)
2. A piece of REAL CODE (actual JavaScript)

Your job: determine if they implement the SAME algorithm/logic.
Ignore syntax differences — focus purely on logical equivalence.

Respond with JSON only.`;

const VERIFIER_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    equivalent: { type: Type.BOOLEAN },
    confidence: { type: Type.INTEGER, description: "0-100" },
    reasoning: { type: Type.STRING },
    pseudoSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
    realSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
    divergences: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["equivalent", "confidence", "reasoning", "pseudoSteps", "realSteps", "divergences"],
};

// ─────────────────────────────────────────────────────────
// LOG ENTRY COMPONENT
// ─────────────────────────────────────────────────────────
interface LogEntryData {
  msg: string;
  type: "system" | "info" | "code" | "pseudo" | "success" | "error" | "bus" | "verify";
  ts: number;
}

function LogEntry({ entry }: { entry: LogEntryData }) {
  const colors = {
    system:  "text-slate-500",
    info:    "text-cyan-400",
    code:    "text-emerald-400 font-mono text-xs bg-black/40 p-3 border border-emerald-900/30 rounded block my-2",
    pseudo:  "text-violet-400 font-mono text-xs bg-black/40 p-3 border border-violet-900/30 rounded block my-2",
    success: "text-green-400",
    error:   "text-red-400",
    bus:     "text-yellow-400",
    verify:  "text-orange-400",
  };
  const icons = {
    system: <Cpu size={12} />,
    info: <Activity size={12} />,
    code: <Terminal size={12} />,
    pseudo: <Zap size={12} />,
    success: <ShieldCheck size={12} />,
    error: <ShieldAlert size={12} />,
    bus: <Share2 size={12} />,
    verify: <LinkIcon size={12} />
  };
  
  return (
    <motion.div 
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="mb-2 leading-relaxed group"
    >
      <div className="flex items-start gap-2">
        <span className="text-slate-700 text-[10px] font-mono whitespace-nowrap pt-0.5">
          {new Date(entry.ts).toLocaleTimeString("en", { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
        <span className={`${colors[entry.type] || "text-white"} mt-0.5 opacity-70 group-hover:opacity-100 transition-opacity`}>
          {icons[entry.type]}
        </span>
        <div className="flex-1">
          {entry.type === "code" || entry.type === "pseudo" ? (
            <pre className={`${colors[entry.type]} whitespace-pre-wrap overflow-x-auto`}>{entry.msg}</pre>
          ) : (
            <span className={`text-[11px] ${colors[entry.type] || "text-white"}`}>{entry.msg}</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────

export default function DualEnvVerifier() {
  const [pseudoLogs, setPseudoLogs] = useState<LogEntryData[]>([]);
  const [realLogs, setRealLogs] = useState<LogEntryData[]>([]);
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [selectedAlgo, setSelectedAlgo] = useState<keyof typeof REAL_IMPLEMENTATIONS>("bubble_sort");
  const [customInput, setCustomInput] = useState("");
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<"idle" | "broadcasting" | "handshake" | "verifying" | "done">("idle");
  const [connectionLine, setConnectionLine] = useState(false);

  const pseudoEndRef = useRef<HTMLDivElement>(null);
  const realEndRef = useRef<HTMLDivElement>(null);

  const logPseudo = useCallback((msg: string, type: LogEntryData["type"] = "info") => {
    setPseudoLogs(p => [...p, { msg, type, ts: Date.now() }]);
  }, []);

  const logReal = useCallback((msg: string, type: LogEntryData["type"] = "info") => {
    setRealLogs(p => [...p, { msg, type, ts: Date.now() }]);
  }, []);

  useEffect(() => { pseudoEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [pseudoLogs]);
  useEffect(() => { realEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [realLogs]);

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  const runSimulation = useCallback(async () => {
    if (running) return;
    if (selectedAlgo === "custom" && !customInput.trim()) {
      alert("Please enter a custom logic description.");
      return;
    }
    
    setRunning(true);
    setVerifyResult(null);
    setPseudoLogs([]);
    setRealLogs([]);
    setConnectionLine(false);
    setPhase("idle");

    const algo = REAL_IMPLEMENTATIONS[selectedAlgo];
    const problemDescription = selectedAlgo === "custom" ? customInput : algo.description;
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

    // ── BOOT SEQUENCE ──
    await sleep(400);
    logPseudo("PSEUDO-ENV v1.0 initializing...", "system");
    logReal("REAL-ENV v1.0 initializing...", "system");
    await sleep(600);
    logPseudo("Loading LLM reasoning core...", "system");
    logReal("Loading code execution engine...", "system");
    await sleep(800);
    logPseudo("No syntax knowledge detected. Operating in pure-logic mode.", "system");
    logReal("Ready for implementation retrieval.", "system");
    await sleep(500);

    // ── PROBLEM INJECTION ──
    logPseudo(`Problem received: "${problemDescription}"`, "info");
    logReal(`Problem received: "${problemDescription}"`, "info");
    await sleep(400);

    // ── PSEUDO-ENV: Generate pseudo-code via Gemini ──
    logPseudo("Deriving abstract logic from semantic understanding...", "info");
    setPhase("broadcasting");

    let pseudoCode = "";
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Generate pseudo-code for: ${problemDescription}\nAlgorithm name: ${algo.name}`,
        config: { systemInstruction: PSEUDO_SYSTEM }
      });
      pseudoCode = response.text || "";
      logPseudo("Pseudo-code constructed from first principles:", "info");
      await sleep(300);
      logPseudo(pseudoCode, "pseudo");
    } catch(e: any) {
      logPseudo("API error: " + e.message, "error");
      setRunning(false);
      return;
    }

    // ── REAL-ENV: Load or Generate its implementation ──
    await sleep(600);
    let realCode = algo.code;
    
    if (selectedAlgo === "custom") {
      logReal("No pre-compiled implementation found. Generating from pseudo-logic...", "info");
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.1-pro-preview",
          contents: `Generate a clean JavaScript implementation for this logic: ${pseudoCode}\nContext: ${problemDescription}`,
          config: { systemInstruction: "You are a senior JS engineer. Output ONLY the code block, no explanation." }
        });
        realCode = response.text || "";
      } catch(e: any) {
        logReal("Generation error: " + e.message, "error");
        setRunning(false);
        return;
      }
    } else {
      logReal(`Locating implementation: ${algo.name}`, "info");
    }
    
    await sleep(500);
    logReal("Source code retrieved from execution context:", "info");
    await sleep(300);
    logReal(realCode, "code");

    // ── DISCOVERY PROTOCOL ──
    await sleep(1000);
    setPhase("handshake");
    setConnectionLine(true);

    logPseudo("Broadcasting identity beacon on shared bus...", "bus");
    bus.publish({ from: "PSEUDO-ENV", type: "BEACON", payload: { algo: selectedAlgo } });
    await sleep(500);

    logReal("Signal detected on bus channel 0x4A2F...", "bus");
    await sleep(400);
    logReal("Decoding beacon... source: PSEUDO-ENV", "bus");
    await sleep(400);
    logReal("Handshake initiated → sending ACK", "bus");
    bus.publish({ from: "REAL-ENV", type: "ACK", payload: { algo: selectedAlgo } });
    await sleep(600);

    logPseudo("ACK received from REAL-ENV", "bus");
    logPseudo("Peer discovered! Exchanging implementations...", "bus");
    await sleep(400);

    bus.publish({ from: "PSEUDO-ENV", type: "IMPL", payload: pseudoCode });
    bus.publish({ from: "REAL-ENV", type: "IMPL", payload: realCode });

    logReal("PSEUDO-ENV implementation received", "bus");
    logPseudo("REAL-ENV implementation received", "bus");

    await sleep(800);

    // ── VERIFICATION ──
    setPhase("verifying");
    logPseudo("Requesting logical equivalence verification...", "verify");
    logReal("Requesting logical equivalence verification...", "verify");
    await sleep(400);

    let result = null;
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `PSEUDO-CODE:\n${pseudoCode}\n\nREAL CODE:\n${realCode}`,
        config: { 
          systemInstruction: VERIFIER_SYSTEM,
          responseMimeType: "application/json",
          responseSchema: VERIFIER_SCHEMA
        }
      });
      result = JSON.parse(response.text || "{}");
    } catch(e: any) {
      logPseudo("Verification error: " + e.message, "error");
      logReal("Verification error: " + e.message, "error");
      setRunning(false);
      return;
    }

    await sleep(700);

    const verdict = result.equivalent ? "EQUIVALENT" : "DIVERGENT";
    const vtype = result.equivalent ? "success" : "error";
    logPseudo(`Verification complete → ${verdict} (${result.confidence}% confidence)`, vtype);
    logReal(`Verification complete → ${verdict} (${result.confidence}% confidence)`, vtype);
    logPseudo(result.reasoning, "info");
    logReal(result.reasoning, "info");

    setVerifyResult(result);
    setPhase("done");
    setRunning(false);
  }, [selectedAlgo, customInput, running, logPseudo, logReal]);

  const phaseLabel = { idle: "IDLE", broadcasting: "GENERATING", handshake: "HANDSHAKING", verifying: "VERIFYING", done: "COMPLETE" };
  const phaseColor = { idle: "text-slate-500", broadcasting: "text-violet-400", handshake: "text-yellow-400", verifying: "text-orange-400", done: "text-emerald-400" };

  return (
    <div className="min-h-screen bg-[#05070a] text-slate-200 font-mono p-4 md:p-8 flex flex-col gap-6 selection:bg-indigo-500/30">
      {/* HEADER */}
      <header className="text-center space-y-2">
        <div className="text-[10px] tracking-[0.4em] text-slate-600 uppercase">
          Dual-Environment Logic Equivalence Protocol
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tighter flex items-center justify-center gap-4">
          <span className="text-violet-500 drop-shadow-[0_0_15px_rgba(139,92,246,0.3)]">PSEUDO</span>
          <span className="text-slate-800 text-2xl">⟺</span>
          <span className="text-emerald-500 drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]">REAL</span>
        </h1>
        <div className="text-[10px] text-slate-700 tracking-widest uppercase">
          One Truth · Two Languages · Verified Equivalence
        </div>
      </header>

      {/* CONTROLS */}
      <div className="bg-[#0a0d14] border border-slate-800/50 rounded-xl p-4 md:p-6 flex flex-col gap-6 shadow-2xl">
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <div className="flex flex-col gap-2 flex-1 w-full">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Select Logic Target</span>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(REAL_IMPLEMENTATIONS) as [keyof typeof REAL_IMPLEMENTATIONS, any][]).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => !running && setSelectedAlgo(k)}
                  disabled={running}
                  className={`px-4 py-2 text-[11px] border rounded-lg transition-all duration-300 ${
                    selectedAlgo === k 
                      ? "bg-indigo-500/10 border-indigo-500 text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.2)]" 
                      : "bg-transparent border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-400"
                  } ${running ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  {v.name}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 md:border-l border-slate-800 pt-4 md:pt-0 md:pl-6">
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-600 uppercase tracking-tighter">System Status</span>
              <span className={`text-xs font-bold tracking-widest ${phaseColor[phase]}`}>
                {phaseLabel[phase]}
              </span>
            </div>
            <button
              onClick={runSimulation}
              disabled={running}
              className={`group relative px-8 py-3 text-xs font-bold tracking-[0.2em] uppercase rounded-lg transition-all duration-500 overflow-hidden ${
                running 
                  ? "bg-slate-900 border border-slate-800 text-slate-600 cursor-not-allowed" 
                  : "bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-400/50 shadow-[0_0_20px_rgba(79,70,229,0.4)]"
              }`}
            >
              <span className="relative z-10 flex items-center gap-2">
                {running ? <Activity className="animate-spin" size={14} /> : <Play size={14} />}
                {running ? "Processing..." : "Execute Protocol"}
              </span>
              {!running && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
              )}
            </button>
          </div>
        </div>

        {selectedAlgo === "custom" && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="border-t border-slate-800 pt-4"
          >
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-2">Custom Logic / Natural Language Input</span>
            <textarea
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              disabled={running}
              placeholder="e.g., 'A bird in the hand is worth two in the bush' or 'Implement a system that checks if a user is logged in before allowing them to post a comment...'"
              className="w-full bg-black/50 border border-slate-800 rounded-lg p-4 text-xs text-indigo-300 focus:border-indigo-500 focus:outline-none transition-colors min-h-[100px] resize-none"
            />
            <div className="mt-2 text-[9px] text-slate-600 italic">
              * The system will derive pseudo-code from your input, then attempt to generate a matching real-world implementation to prove equivalence.
            </div>
          </motion.div>
        )}
      </div>

      {/* DUAL PANELS */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-4 lg:gap-0 flex-1 min-h-0">
        
        {/* PSEUDO-ENV PANEL */}
        <div className="bg-[#080a0f] border border-violet-900/30 lg:border-r-0 rounded-xl lg:rounded-r-none flex flex-col shadow-inner">
          <div className="bg-violet-950/20 border-b border-violet-900/30 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.5)]" />
              <span className="text-xs font-bold tracking-[0.2em] text-violet-400">PSEUDO-ENV</span>
            </div>
            <span className="text-[9px] text-violet-900 uppercase tracking-widest hidden sm:inline">
              LLM Reasoning Core · Abstract Logic
            </span>
          </div>
          <div className="flex-1 p-4 overflow-y-auto max-h-[500px] scrollbar-thin scrollbar-thumb-violet-900/50">
            {pseudoLogs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-800 text-[10px] italic">
                Awaiting protocol initiation...
              </div>
            ) : (
              pseudoLogs.map((e, i) => <LogEntry key={i} entry={e} />)
            )}
            <div ref={pseudoEndRef} />
          </div>
        </div>

        {/* BUS CONDUIT */}
        <div className="hidden lg:flex w-16 bg-[#030508] border-y border-slate-800 flex-col items-center justify-center gap-2 relative overflow-hidden">
          <div className="text-[8px] text-slate-700 tracking-[0.3em] uppercase [writing-mode:vertical-rl] mb-4">
            Message Bus
          </div>
          <AnimatePresence>
            {connectionLine && (
              <div className="flex flex-col gap-1">
                {Array.from({length: 15}).map((_, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, scaleY: 0 }}
                    animate={{ opacity: [0.2, 1, 0.2], scaleY: 1 }}
                    transition={{ 
                      duration: 1.5, 
                      repeat: Infinity, 
                      delay: i * 0.1,
                      ease: "linear"
                    }}
                    className={`w-[2px] h-4 rounded-full ${
                      phase === "verifying" ? "bg-orange-500 shadow-[0_0_5px_rgba(249,115,22,0.5)]" : 
                      phase === "done" ? "bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" : 
                      "bg-yellow-500 shadow-[0_0_5px_rgba(234,179,8,0.5)]"
                    }`}
                  />
                ))}
              </div>
            )}
          </AnimatePresence>
          {!connectionLine && (
            <div className="flex flex-col gap-1 opacity-10">
              {Array.from({length: 8}).map((_, i) => (
                <div key={i} className="w-[2px] h-2 bg-slate-800 rounded-full" />
              ))}
            </div>
          )}
          <div className="text-[8px] text-slate-700 tracking-[0.3em] uppercase [writing-mode:vertical-rl] mt-4">
            {phase === "idle" ? "Offline" : phase === "done" ? "Linked" : "Active"}
          </div>
        </div>

        {/* REAL-ENV PANEL */}
        <div className="bg-[#080a0f] border border-emerald-900/30 lg:border-l-0 rounded-xl lg:rounded-l-none flex flex-col shadow-inner">
          <div className="bg-emerald-950/20 border-b border-emerald-900/30 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              <span className="text-xs font-bold tracking-[0.2em] text-emerald-400">REAL-ENV</span>
            </div>
            <span className="text-[9px] text-emerald-900 uppercase tracking-widest hidden sm:inline">
              JS Execution Engine · Formal Syntax
            </span>
          </div>
          <div className="flex-1 p-4 overflow-y-auto max-h-[500px] scrollbar-thin scrollbar-thumb-emerald-900/50">
            {realLogs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-800 text-[10px] italic">
                Awaiting protocol initiation...
              </div>
            ) : (
              realLogs.map((e, i) => <LogEntry key={i} entry={e} />)
            )}
            <div ref={realEndRef} />
          </div>
        </div>
      </div>

      {/* VERIFICATION RESULT */}
      <AnimatePresence>
        {verifyResult && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`border rounded-2xl p-6 md:p-8 shadow-2xl backdrop-blur-sm ${
              verifyResult.equivalent 
                ? "bg-emerald-950/10 border-emerald-500/30" 
                : "bg-red-950/10 border-red-500/30"
            }`}
          >
            <div className="flex flex-col lg:flex-row gap-8 items-start">
              <div className="flex flex-col gap-4 min-w-[200px]">
                <div className={`text-3xl font-black tracking-tighter flex items-center gap-3 ${
                  verifyResult.equivalent ? "text-emerald-400" : "text-red-400"
                }`}>
                  {verifyResult.equivalent ? <ShieldCheck size={32} /> : <ShieldAlert size={32} />}
                  {verifyResult.equivalent ? "EQUIVALENT" : "DIVERGENT"}
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest">Confidence Rating</div>
                  <div className="flex items-end gap-2">
                    <span className={`text-4xl font-bold ${verifyResult.equivalent ? "text-emerald-500" : "text-red-500"}`}>
                      {verifyResult.confidence}%
                    </span>
                    <div className="flex-1 h-2 bg-slate-900 rounded-full overflow-hidden mb-2 max-w-[100px]">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${verifyResult.confidence}%` }}
                        className={`h-full ${verifyResult.equivalent ? "bg-emerald-500" : "bg-red-500"}`}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 space-y-6">
                <div className="space-y-2">
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest">Verification Reasoning</div>
                  <p className="text-sm text-slate-300 leading-relaxed italic border-l-2 border-slate-800 pl-4 py-1">
                    "{verifyResult.reasoning}"
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <div className="text-[10px] text-violet-500 uppercase tracking-[0.2em] flex items-center gap-2">
                      <Zap size={10} /> Pseudo-Logic Path
                    </div>
                    <ul className="space-y-2">
                      {verifyResult.pseudoSteps?.map((s: string, i: number) => (
                        <li key={i} className="text-[11px] text-slate-400 flex gap-3">
                          <span className="text-violet-900 font-bold">{i + 1}</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-3">
                    <div className="text-[10px] text-emerald-500 uppercase tracking-[0.2em] flex items-center gap-2">
                      <Terminal size={10} /> Real-Syntax Path
                    </div>
                    <ul className="space-y-2">
                      {verifyResult.realSteps?.map((s: string, i: number) => (
                        <li key={i} className="text-[11px] text-slate-400 flex gap-3">
                          <span className="text-emerald-900 font-bold">{i + 1}</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {verifyResult.divergences?.length > 0 && (
                  <div className="pt-6 border-t border-slate-800/50">
                    <div className="text-[10px] text-orange-500 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                      <ShieldAlert size={10} /> Logical Divergences Detected
                    </div>
                    <div className="space-y-2">
                      {verifyResult.divergences.map((d: string, i: number) => (
                        <div key={i} className="text-[11px] text-orange-200/70 bg-orange-500/5 p-2 rounded border border-orange-500/10">
                          › {d}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="mt-auto pt-8 text-center">
        <div className="text-[9px] text-slate-800 tracking-[0.5em] uppercase">
          Autonomous Logic Verification System · Protocol v1.0.42
        </div>
      </footer>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .scrollbar-thin::-webkit-scrollbar {
          width: 4px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: rgba(30, 41, 59, 0.5);
          border-radius: 20px;
        }
      `}</style>
    </div>
  );
}
