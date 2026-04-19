"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
// import { useWallet } from "@/context/WalletContext";
import { useCart } from "@/context/CartContext";

type Message = { role: "user" | "assistant"; content: string };
type Profile = { name: string; role: "user" | "admin" };

const USER_CHIPS = [
  "Show products",
  "My cart",
  "Empty cart",
  "Remove from cart",
  "My debts",
  "My orders",
];
const ADMIN_CHIPS = ["Dashboard stats", "All orders", "View debts", "All users"];

function welcomeMsg(name: string, role: string) {
  return role === "admin"
    ? `Welcome back, **${name}**! You're logged in as **Admin**. How can I assist you today?`
    : `Hi **${name}**! I'm your NavyBits assistant. Ask me about products, your cart, orders, or debts!`;
}

function renderText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\n)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} style={{ fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <code key={i} style={{
          background: "rgba(0,0,0,0.07)", padding: "1px 5px",
          borderRadius: 5, fontSize: 12, fontFamily: "monospace",
        }}>
          {part.slice(1, -1)}
        </code>
      );
    if (part === "\n") return <br key={i} />;
    return <span key={i}>{part}</span>;
  });
}

// SVG icons
const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const BotIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h3a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3h3V5.73A2 2 0 0 1 10 4a2 2 0 0 1 2-2zm-4 9a1.5 1.5 0 0 0 0 3 1.5 1.5 0 0 0 0-3zm8 0a1.5 1.5 0 0 0 0 3 1.5 1.5 0 0 0 0-3zm-4 4a4 4 0 0 1-3.16-1.54l-.01-.01a.5.5 0 0 1 .79-.61A3 3 0 0 0 12 14a3 3 0 0 0 2.38-1.16.5.5 0 0 1 .79.61A4 4 0 0 1 12 15z" />
  </svg>
);

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ChatIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sbRef = useRef(createClient());
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const sb = sbRef.current;
    const { data: listener } = sb.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        lastUserIdRef.current = null;
        setUserId(null);
        setProfile(null);
        setMessages([]);
        setAuthChecked(true);
        return;
      }
      if (session.user.id === lastUserIdRef.current) {
        setAuthChecked(true);
        return;
      }
      lastUserIdRef.current = session.user.id;
      setUserId(session.user.id);
      const { data } = await sb.from("profiles").select("name, role").eq("id", session.user.id).single();
      if (data) {
        setProfile(data);
        setMessages([{ role: "assistant", content: welcomeMsg(data.name, data.role) }]);
      }
      setAuthChecked(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const router = useRouter();
  // const { refreshBalance } = useWallet();
  const { refreshCart, isApproved } = useCart();

  const sendMessage = useCallback(
    async (text?: string) => {
      const content = (text !== undefined ? text : input).trim();
      if (!content || loading) return;

      if (!userId) {
        setMessages((prev) => [
          ...prev,
          { role: "user", content },
          { role: "assistant", content: "Please **log in** to use the assistant." },
        ]);
        setInput("");
        return;
      }

      const userMsg: Message = { role: "user", content };
      setInput("");
      setLoading(true);

      const updatedMessages = await new Promise<Message[]>((resolve) => {
        setMessages((prev) => {
          const updated = [...prev, userMsg];
          resolve(updated);
          return updated;
        });
      });

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: updatedMessages, userId }),
        });
        const data = await res.json() as { message?: string; error?: string; navigate_to?: string; refresh_cart?: boolean; refresh_debt?: boolean };
        setMessages((m) => [...m, { role: "assistant", content: data.message ?? data.error ?? "No response." }]);

        // Refresh cart badge if the bot mutated cart or confirmed an order
        if (data.refresh_cart) await refreshCart();

        // Tell the debt page to re-fetch if the bot paid a debt
        if (data.refresh_debt) window.dispatchEvent(new CustomEvent("debt-updated"));

        // Navigate the browser to the requested page
        if (data.navigate_to) router.push(data.navigate_to);
      } catch {
        setMessages((m) => [...m, { role: "assistant", content: "Something went wrong. Please try again." }]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, userId, refreshCart, router]
  );

  const isAdmin = profile?.role === "admin";
  const chips = isAdmin ? ADMIN_CHIPS : USER_CHIPS;

  // Theme
  const primary = isAdmin ? "#00AECC" : "#1B2D72";
  const primaryDark = isAdmin ? "#0090AC" : "#152260";
  const primaryLight = isAdmin ? "#E6F8FB" : "#E6F4F8";
  const primaryMid = isAdmin ? "#007A96" : "#1B2D72";

  return (
    <>
      <style>{`
        @keyframes cw-slide-up {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes cw-dot-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40%            { transform: translateY(-6px); opacity: 1; }
        }
        @keyframes cw-pulse-ring {
          0%   { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.55); opacity: 0; }
        }
        @keyframes cw-msg-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .cw-panel { animation: cw-slide-up 0.25s cubic-bezier(0.34,1.56,0.64,1); }
        .cw-msg   { animation: cw-msg-in 0.2s ease; }
        .cw-input:focus { outline: none; }
        .cw-btn-fab:hover { transform: scale(1.08) !important; }
        .cw-chip:hover { opacity: 0.85; transform: translateY(-1px); }
        .cw-send:hover:not(:disabled) { opacity: 0.88; transform: scale(1.05); }
        .cw-scroll::-webkit-scrollbar { width: 4px; }
        .cw-scroll::-webkit-scrollbar-track { background: transparent; }
        .cw-scroll::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 99px; }
      `}</style>

      {/* Floating action button */}
      <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999 }}>
        {/* Pulse ring — only when closed */}
        {!open && userId && (
          <div style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            background: primary, opacity: 0.5,
            animation: "cw-pulse-ring 2s ease-out infinite",
            pointerEvents: "none",
          }} />
        )}

        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle chat"
          className="cw-btn-fab"
          style={{
            width: 56, height: 56, borderRadius: "50%", border: "none",
            background: `linear-gradient(135deg, ${primary}, ${primaryMid})`,
            color: "#fff", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 4px 24px ${primary}60`,
            transition: "transform 0.2s, box-shadow 0.2s",
            position: "relative",
          }}
        >
          <div style={{
            transition: "transform 0.3s, opacity 0.2s",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
          }}>
            {open ? <CloseIcon /> : <ChatIcon />}
          </div>

          {/* Unread dot */}
          {!open && messages.length > 1 && (
            <div style={{
              position: "absolute", top: 4, right: 4,
              width: 10, height: 10, borderRadius: "50%",
              background: "#ef4444", border: "2px solid #fff",
            }} />
          )}
        </button>

        {/* Role badge */}
        {isAdmin && !open && (
          <div style={{
            position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%)",
            background: primary, color: "#fff", fontSize: 9, fontWeight: 800,
            padding: "2px 8px", borderRadius: 99, letterSpacing: "0.08em",
            whiteSpace: "nowrap", boxShadow: `0 2px 8px ${primary}50`,
          }}>
            ADMIN
          </div>
        )}
      </div>

      {/* Chat panel */}
      {open && (
        <div
          className="cw-panel"
          style={{
            position: "fixed", bottom: 96, right: 24, zIndex: 9998,
            width: 380, height: 560,
            background: "#fff", borderRadius: 24,
            boxShadow: "0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)",
            display: "flex", flexDirection: "column", overflow: "hidden",
            border: "1px solid rgba(0,0,0,0.06)",
          }}
        >
          {/* ── Header ── */}
          <div style={{
            background: `linear-gradient(135deg, ${primaryDark} 0%, ${primary} 60%, ${primaryMid} 100%)`,
            padding: "16px 18px", flexShrink: 0,
            display: "flex", alignItems: "center", gap: 12,
          }}>
            {/* Bot avatar */}
            <div style={{
              width: 42, height: 42, borderRadius: "50%",
              background: "rgba(255,255,255,0.15)",
              backdropFilter: "blur(6px)",
              border: "2px solid rgba(255,255,255,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, color: "#fff",
            }}>
              <BotIcon size={22} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, color: "#fff", fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>
                {isAdmin ? "Admin Assistant" : "NavyBits Assistant"}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", flexShrink: 0 }} />
                <p style={{ margin: 0, color: "rgba(255,255,255,0.75)", fontSize: 11.5 }}>
                  {profile ? `${profile.name} · ` : ""}Online · Powered by Groq
                </p>
              </div>
            </div>

            <button
              onClick={() => setOpen(false)}
              style={{
                width: 30, height: 30, borderRadius: "50%", border: "none",
                background: "rgba(255,255,255,0.15)", color: "#fff",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, transition: "background 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.28)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.15)")}
            >
              <CloseIcon />
            </button>
          </div>

          {/* ── Messages area ── */}
          <div
            className="cw-scroll"
            style={{
              flex: 1, overflowY: "auto",
              padding: "18px 14px 10px",
              display: "flex", flexDirection: "column", gap: 12,
              background: "#f9fafb",
            }}
          >
            {/* Auth loading */}
            {!authChecked && (
              <div style={{ margin: "auto", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                <div style={{ display: "flex", gap: 5, justifyContent: "center", marginBottom: 8 }}>
                  {[0, 0.15, 0.3].map((d, i) => (
                    <div key={i} style={{
                      width: 8, height: 8, borderRadius: "50%", background: "#d1d5db",
                      animation: `cw-dot-bounce 1.2s ${d}s ease-in-out infinite`,
                    }} />
                  ))}
                </div>
                Loading...
              </div>
            )}

            {/* Not logged in */}
            {authChecked && !userId && messages.length === 0 && (
              <div style={{
                margin: "auto", textAlign: "center",
                padding: "28px 20px",
              }}>
                <div style={{
                  width: 64, height: 64, borderRadius: "50%", margin: "0 auto 14px",
                  background: primaryLight,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: primary,
                }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <p style={{ margin: "0 0 6px", fontWeight: 700, color: "#111827", fontSize: 15 }}>
                  Sign in to chat
                </p>
                <p style={{ margin: 0, color: "#6b7280", fontSize: 13, lineHeight: 1.5 }}>
                  Log in to your account to<br />use the AI assistant.
                </p>
              </div>
            )}

            {/* Account pending approval */}
            {authChecked && userId && isApproved === false && (
              <div style={{
                margin: "auto", textAlign: "center",
                padding: "28px 20px",
              }}>
                <div style={{
                  width: 64, height: 64, borderRadius: "50%", margin: "0 auto 14px",
                  background: "#fef3c7",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#d97706",
                }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <p style={{ margin: "0 0 6px", fontWeight: 700, color: "#111827", fontSize: 15 }}>
                  Account pending approval
                </p>
                <p style={{ margin: 0, color: "#6b7280", fontSize: 13, lineHeight: 1.5 }}>
                  The assistant will be available<br />once an admin approves your account.
                </p>
              </div>
            )}

            {/* Messages */}
            {messages.map((m, i) => (
              <div
                key={i}
                className="cw-msg"
                style={{
                  display: "flex",
                  justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                  alignItems: "flex-end",
                  gap: 8,
                }}
              >
                {/* Bot avatar */}
                {m.role === "assistant" && (
                  <div style={{
                    width: 30, height: 30, borderRadius: "50%",
                    background: primaryLight,
                    border: `1.5px solid ${primary}20`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: primary, flexShrink: 0,
                  }}>
                    <BotIcon size={15} />
                  </div>
                )}

                <div style={{
                  maxWidth: "75%",
                  padding: "10px 14px",
                  borderRadius: m.role === "user"
                    ? "18px 18px 4px 18px"
                    : "18px 18px 18px 4px",
                  fontSize: 13.5,
                  lineHeight: 1.6,
                  background: m.role === "user"
                    ? `linear-gradient(135deg, ${primary}, ${primaryMid})`
                    : "#fff",
                  color: m.role === "user" ? "#fff" : "#1f2937",
                  boxShadow: m.role === "user"
                    ? `0 2px 12px ${primary}40`
                    : "0 1px 6px rgba(0,0,0,0.07)",
                  border: m.role === "assistant" ? "1px solid #f0f0f0" : "none",
                }}>
                  {renderText(m.content)}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="cw-msg" style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: "50%",
                  background: primaryLight,
                  border: `1.5px solid ${primary}20`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: primary, flexShrink: 0,
                }}>
                  <BotIcon size={15} />
                </div>
                <div style={{
                  padding: "12px 16px", borderRadius: "18px 18px 18px 4px",
                  background: "#fff", border: "1px solid #f0f0f0",
                  boxShadow: "0 1px 6px rgba(0,0,0,0.07)",
                  display: "flex", gap: 5, alignItems: "center",
                }}>
                  {[0, 0.18, 0.36].map((delay, j) => (
                    <div key={j} style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: primary,
                      animation: `cw-dot-bounce 1.2s ${delay}s ease-in-out infinite`,
                    }} />
                  ))}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* ── Quick chips ── */}
          {userId && isApproved !== false && messages.length <= 1 && !loading && (
            <div style={{
              padding: "10px 14px 6px",
              display: "flex", flexWrap: "wrap", gap: 6,
              background: "#f9fafb",
              borderTop: "1px solid #f0f0f0",
            }}>
              <p style={{ width: "100%", margin: "0 0 4px", fontSize: 11, color: "#9ca3af", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Quick actions
              </p>
              {chips.map((chip) => (
                <button
                  key={chip}
                  className="cw-chip"
                  onClick={() => sendMessage(chip)}
                  style={{
                    padding: "5px 13px", fontSize: 12.5, borderRadius: 99,
                    border: `1.5px solid ${primary}30`,
                    background: primaryLight,
                    color: primary,
                    cursor: "pointer",
                    fontWeight: 500,
                    transition: "all 0.15s",
                  }}
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          {/* ── Input bar ── */}
          <div style={{
            padding: "12px 14px",
            borderTop: "1px solid #f0f0f0",
            display: "flex", gap: 8, flexShrink: 0,
            background: "#fff",
          }}>
            <input
              ref={inputRef}
              className="cw-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && sendMessage()}
              placeholder={
                !userId ? "Log in to chat..." :
                isApproved === false ? "Account pending approval..." :
                isAdmin ? "Manage products, orders, debts..." :
                "Ask about products, orders, wallet..."
              }
              disabled={loading || !userId || isApproved === false}
              style={{
                flex: 1, padding: "10px 16px",
                borderRadius: 14, fontSize: 13.5,
                border: "1.5px solid #e5e7eb",
                background: !userId || isApproved === false ? "#f9fafb" : "#fff",
                color: "#1f2937",
                transition: "border-color 0.15s, box-shadow 0.15s",
                opacity: !userId || isApproved === false ? 0.6 : 1,
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = primary;
                e.currentTarget.style.boxShadow = `0 0 0 3px ${primary}15`;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#e5e7eb";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
            <button
              className="cw-send"
              onClick={() => sendMessage()}
              disabled={loading || !input.trim() || !userId || isApproved === false}
              style={{
                width: 42, height: 42, flexShrink: 0,
                borderRadius: 13,
                background: loading || !input.trim() || !userId || isApproved === false
                  ? "#e5e7eb"
                  : `linear-gradient(135deg, ${primary}, ${primaryMid})`,
                color: loading || !input.trim() || !userId || isApproved === false ? "#9ca3af" : "#fff",
                border: "none",
                cursor: loading || !input.trim() || !userId || isApproved === false ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
                boxShadow: loading || !input.trim() || !userId || isApproved === false ? "none" : `0 2px 10px ${primary}40`,
              }}
            >
              <SendIcon />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
