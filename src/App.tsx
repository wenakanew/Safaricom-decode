import React, { useState, useEffect, useMemo } from "react";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  setDoc, 
  doc, 
  getDoc, 
  getDocs,
  orderBy,
  limit,
  Timestamp,
  getDocFromServer
} from "firebase/firestore";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User as FirebaseUser,
  signOut
} from "firebase/auth";
import { auth, db } from "./firebase";
import { 
  Transaction, 
  TransactionType, 
  Insight, 
  CreditScore, 
  OperationType, 
  FirestoreErrorInfo 
} from "./types";
import { calculateInsights, calculateCreditScore } from "./services/financialEngine";
import { getFinancialAdvice, parseSmsToTransaction } from "./services/geminiService";
import { 
  LayoutDashboard, 
  PlusCircle, 
  MessageSquare, 
  LogOut, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  ChevronRight, 
  Send, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Zap,
  Loader2,
  Trash2,
  FileText
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from "recharts";
import { format, parseISO } from "date-fns";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import ErrorBoundary from "./components/ErrorBoundary";
import ReactMarkdown from "react-markdown";

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Components ---

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("bg-white rounded-2xl shadow-sm border border-gray-100 p-5", className)}>
    {children}
  </div>
);

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  className, 
  disabled,
  isLoading
}: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  className?: string;
  disabled?: boolean;
  isLoading?: boolean;
}) => {
  const variants = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700",
    secondary: "bg-indigo-50 text-indigo-700 hover:bg-indigo-100",
    outline: "border border-gray-200 text-gray-700 hover:bg-gray-50",
    ghost: "text-gray-600 hover:bg-gray-100",
    danger: "bg-red-50 text-red-700 hover:bg-red-100",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading}
      className={cn(
        "px-4 py-2.5 rounded-xl font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95",
        variants[variant],
        className
      )}
    >
      {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
};

const Input = ({ 
  label, 
  type = "text", 
  value, 
  onChange, 
  placeholder, 
  className 
}: { 
  label?: string; 
  type?: string; 
  value: string | number; 
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; 
  placeholder?: string;
  className?: string;
}) => (
  <div className={cn("flex flex-col gap-1.5", className)}>
    {label && <label className="text-sm font-medium text-gray-700 ml-1">{label}</label>}
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-gray-50/50"
    />
  </div>
);

const Select = ({ 
  label, 
  value, 
  onChange, 
  options 
}: { 
  label?: string; 
  value: string; 
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; 
  options: { label: string; value: string }[] 
}) => (
  <div className="flex flex-col gap-1.5">
    {label && <label className="text-sm font-medium text-gray-700 ml-1">{label}</label>}
    <select
      value={value}
      onChange={onChange}
      className="px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-gray-50/50 appearance-none"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'add' | 'chat'>('dashboard');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [creditScore, setCreditScore] = useState<CreditScore | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // --- Auth ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
      if (!u) setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Sign in error:", error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setTransactions([]);
      setInsight(null);
      setCreditScore(null);
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  // --- Data Fetching ---
  useEffect(() => {
    if (!user || !isAuthReady) return;

    setIsLoading(true);

    const q = query(
      collection(db, "transactions"),
      where("uid", "==", user.uid),
      orderBy("date", "desc")
    );

    const unsubscribeTransactions = onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      setTransactions(txs);
      
      // Calculate and update insights/score if data changed
      if (txs.length > 0) {
        const newInsight = calculateInsights(txs, user.uid);
        const newScore = calculateCreditScore(txs, user.uid);
        
        setInsight(newInsight);
        setCreditScore(newScore);

        // Sync with Firestore (optional, but good for persistence)
        setDoc(doc(db, "insights", user.uid), newInsight).catch(e => handleFirestoreError(e, OperationType.WRITE, `insights/${user.uid}`));
        setDoc(doc(db, "credit_scores", user.uid), newScore).catch(e => handleFirestoreError(e, OperationType.WRITE, `credit_scores/${user.uid}`));
      }
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "transactions");
    });

    // Test connection
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    return () => {
      unsubscribeTransactions();
    };
  }, [user, isAuthReady]);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white p-10 rounded-3xl shadow-xl border border-gray-100"
        >
          <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-lg shadow-indigo-200">
            <Wallet className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-3 tracking-tight">FinAI Assistant</h1>
          <p className="text-gray-500 mb-10 leading-relaxed">
            Your personal AI-powered financial guide. Track spending, improve your credit score, and get smart insights.
          </p>
          <Button onClick={handleSignIn} className="w-full py-4 text-lg">
            Get Started with Google
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50 pb-24 font-sans text-gray-900">
        {/* Header */}
        <header className="bg-white border-b border-gray-100 sticky top-0 z-10 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-100">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-lg tracking-tight leading-none">FinAI</h2>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mt-1">Assistant</p>
            </div>
          </div>
          <button 
            onClick={handleSignOut}
            className="p-2.5 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </header>

        <main className="max-w-md mx-auto p-6">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <DashboardView 
                transactions={transactions} 
                insight={insight} 
                creditScore={creditScore} 
                isLoading={isLoading}
                setIsLoading={setIsLoading}
                user={user}
              />
            )}
            {activeTab === 'add' && (
              <AddTransactionView 
                uid={user.uid} 
                onSuccess={() => setActiveTab('dashboard')} 
              />
            )}
            {activeTab === 'chat' && (
              <ChatView 
                transactions={transactions} 
                creditScore={creditScore} 
                insight={insight} 
              />
            )}
          </AnimatePresence>
        </main>

        {/* Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-gray-100 px-8 py-4 flex justify-between items-center z-20">
          <NavButton 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
            icon={<LayoutDashboard />} 
            label="Home" 
          />
          <NavButton 
            active={activeTab === 'add'} 
            onClick={() => setActiveTab('add')} 
            icon={<PlusCircle />} 
            label="Add" 
          />
          <NavButton 
            active={activeTab === 'chat'} 
            onClick={() => setActiveTab('chat')} 
            icon={<MessageSquare />} 
            label="Chat" 
          />
        </nav>
      </div>
    </ErrorBoundary>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 transition-all",
        active ? "text-indigo-600 scale-110" : "text-gray-400 hover:text-gray-600"
      )}
    >
      {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<any>, { className: "w-6 h-6" }) : icon}
      <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
    </button>
  );
}

// --- Views ---

function DashboardView({ 
  transactions, 
  insight, 
  creditScore, 
  isLoading,
  setIsLoading,
  user
}: { 
  transactions: Transaction[]; 
  insight: Insight | null; 
  creditScore: CreditScore | null; 
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  user: FirebaseUser;
}) {
  const balance = (insight?.totalIncome || 0) - (insight?.totalExpenses || 0);

  const chartData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return format(d, 'MMM dd');
    }).reverse();

    return last7Days.map(day => {
      const dayTxs = transactions.filter(t => format(parseISO(t.date), 'MMM dd') === day);
      const income = dayTxs.filter(t => t.type === 'receive').reduce((s, t) => s + t.amount, 0);
      const expense = dayTxs.filter(t => t.type !== 'receive').reduce((s, t) => s + t.amount, 0);
      return { day, income, expense };
    });
  }, [transactions]);

  const handleGenerateSampleData = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const sampleTxs: Omit<Transaction, 'id'>[] = [];
      const now = new Date();
      
      for (let i = 0; i < 30; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        
        // Random patterns
        const isIncome = Math.random() > 0.7;
        const type: TransactionType = isIncome ? 'receive' : (Math.random() > 0.5 ? 'send' : 'paybill');
        const amount = isIncome ? Math.floor(Math.random() * 500) + 100 : Math.floor(Math.random() * 100) + 10;
        
        sampleTxs.push({
          uid: user.uid,
          amount,
          type,
          date: date.toISOString(),
          description: `Sample ${type} transaction`,
          createdAt: new Date().toISOString(),
        });
      }

      const batch = sampleTxs.map(tx => addDoc(collection(db, "transactions"), tx));
      await Promise.all(batch);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "transactions");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="space-y-6"
    >
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hello, {user.displayName?.split(' ')[0] || 'User'}</h1>
          <p className="text-sm text-gray-500 font-medium">Here's your financial summary</p>
        </div>
        <div className="w-12 h-12 rounded-full border-2 border-white shadow-sm overflow-hidden">
          <img src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} alt="Avatar" referrerPolicy="no-referrer" />
        </div>
      </div>

      {transactions.length === 0 && (
        <Card className="bg-indigo-50 border-indigo-100 text-center py-8">
          <TrendingUp className="w-10 h-10 text-indigo-600 mx-auto mb-3" />
          <h3 className="font-bold text-indigo-900 mb-2">Welcome to FinAI!</h3>
          <p className="text-sm text-indigo-700 mb-6 px-4">Start by adding your transactions or generate some sample data to see how it works.</p>
          <Button onClick={handleGenerateSampleData} variant="primary" className="mx-auto">
            Generate Sample Data
          </Button>
        </Card>
      )}

      {/* Balance Card */}
      <Card className="bg-indigo-600 text-white border-none shadow-xl shadow-indigo-200 relative overflow-hidden">
        <div className="relative z-10">
          <p className="text-indigo-100 text-sm font-medium uppercase tracking-wider mb-1">Estimated Balance</p>
          <h2 className="text-4xl font-bold tracking-tight mb-6">${balance.toLocaleString()}</h2>
          <div className="flex gap-4">
            <div className="flex-1 bg-white/10 backdrop-blur-md p-3 rounded-xl">
              <p className="text-[10px] text-indigo-100 uppercase font-bold tracking-widest mb-1">Income</p>
              <div className="flex items-center gap-1.5">
                <ArrowDownLeft className="w-4 h-4 text-emerald-300" />
                <span className="font-bold text-lg">${insight?.totalIncome.toLocaleString()}</span>
              </div>
            </div>
            <div className="flex-1 bg-white/10 backdrop-blur-md p-3 rounded-xl">
              <p className="text-[10px] text-indigo-100 uppercase font-bold tracking-widest mb-1">Expenses</p>
              <div className="flex items-center gap-1.5">
                <ArrowUpRight className="w-4 h-4 text-orange-300" />
                <span className="font-bold text-lg">${insight?.totalExpenses.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
        {/* Abstract background shapes */}
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-indigo-400/20 rounded-full blur-3xl" />
      </Card>

      {/* Credit Score & Insight */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="flex flex-col items-center text-center p-4">
          <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-2">Credit Score</p>
          <div className="relative w-20 h-20 flex items-center justify-center mb-2">
            <svg className="w-full h-full transform -rotate-90">
              <circle cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-gray-100" />
              <circle 
                cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="6" fill="transparent" 
                strokeDasharray={226}
                strokeDashoffset={226 - (226 * (creditScore?.score || 0)) / 100}
                className="text-indigo-600 transition-all duration-1000"
              />
            </svg>
            <span className="absolute text-xl font-bold">{creditScore?.score || 0}</span>
          </div>
          <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
            {creditScore?.score && creditScore.score > 70 ? 'Excellent' : creditScore?.score && creditScore.score > 40 ? 'Good' : 'Fair'}
          </p>
        </Card>

        <Card className="p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
              <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">AI Insight</p>
            </div>
            <p className="text-xs font-medium text-gray-700 leading-relaxed line-clamp-3">
              {insight?.message || "Add more transactions to get insights."}
            </p>
          </div>
          <button className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-1 mt-2">
            Details <ChevronRight className="w-3 h-3" />
          </button>
        </Card>
      </div>

      {/* Chart */}
      <Card className="p-4">
        <h3 className="text-sm font-bold text-gray-900 mb-4 px-1">Weekly Activity</h3>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis hide />
              <Tooltip 
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              />
              <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} barSize={8} />
              <Bar dataKey="expense" fill="#f97316" radius={[4, 4, 0, 0]} barSize={8} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Recent Transactions */}
      <div>
        <div className="flex items-center justify-between mb-4 px-1">
          <h3 className="text-sm font-bold text-gray-900">Recent Transactions</h3>
          <button className="text-xs font-bold text-indigo-600 uppercase tracking-widest">See All</button>
        </div>
        <div className="space-y-3">
          {transactions.slice(0, 5).map((tx) => (
            <div key={tx.id} className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center",
                  tx.type === 'receive' ? "bg-emerald-50 text-emerald-600" : 
                  tx.type === 'send' ? "bg-orange-50 text-orange-600" : "bg-blue-50 text-blue-600"
                )}>
                  {tx.type === 'receive' ? <ArrowDownLeft className="w-5 h-5" /> : 
                   tx.type === 'send' ? <ArrowUpRight className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                </div>
                <div>
                  <p className="font-bold text-sm text-gray-900 capitalize">{tx.type}</p>
                  <p className="text-[10px] text-gray-400 font-medium">{format(parseISO(tx.date), 'MMM dd, yyyy')}</p>
                </div>
              </div>
              <p className={cn(
                "font-bold text-sm",
                tx.type === 'receive' ? "text-emerald-600" : "text-gray-900"
              )}>
                {tx.type === 'receive' ? '+' : '-'}${tx.amount.toLocaleString()}
              </p>
            </div>
          ))}
          {transactions.length === 0 && (
            <div className="text-center py-10 text-gray-400">
              <p className="text-sm">No transactions yet.</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function AddTransactionView({ uid, onSuccess }: { uid: string; onSuccess: () => void }) {
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<TransactionType>("send");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [smsText, setSmsText] = useState("");
  const [isParsing, setIsParsing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !type || !date) return;

    setIsSubmitting(true);
    try {
      const tx: Omit<Transaction, 'id'> = {
        uid,
        amount: parseFloat(amount),
        type,
        date,
        description,
        createdAt: new Date().toISOString(),
      };
      await addDoc(collection(db, "transactions"), tx);
      onSuccess();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "transactions");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSmsParse = async () => {
    if (!smsText) return;
    setIsParsing(true);
    const result = await parseSmsToTransaction(smsText);
    if (result && result.amount) {
      setAmount(result.amount.toString());
      setType(result.type);
      if (result.date) setDate(result.date);
      if (result.description) setDescription(result.description);
    }
    setIsParsing(false);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Add Transaction</h1>
        <p className="text-sm text-gray-500 font-medium">Keep your records up to date</p>
      </div>

      {/* SMS Parser */}
      <Card className="bg-indigo-50 border-indigo-100">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare className="w-4 h-4 text-indigo-600" />
          <h3 className="text-xs font-bold text-indigo-900 uppercase tracking-widest">Paste SMS Log</h3>
        </div>
        <textarea
          value={smsText}
          onChange={(e) => setSmsText(e.target.value)}
          placeholder="Paste your mobile money SMS here..."
          className="w-full h-24 p-3 rounded-xl border border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white text-sm"
        />
        <Button 
          variant="secondary" 
          className="w-full mt-3 text-xs py-2" 
          onClick={handleSmsParse}
          isLoading={isParsing}
        >
          Parse SMS with AI
        </Button>
      </Card>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Input 
          label="Amount" 
          type="number" 
          value={amount} 
          onChange={(e) => setAmount(e.target.value)} 
          placeholder="0.00" 
        />
        <Select 
          label="Transaction Type" 
          value={type} 
          onChange={(e) => setType(e.target.value as TransactionType)}
          options={[
            { label: "Send Money", value: "send" },
            { label: "Receive Money", value: "receive" },
            { label: "Pay Bill", value: "paybill" },
          ]}
        />
        <Input 
          label="Date & Time" 
          type="datetime-local" 
          value={date} 
          onChange={(e) => setDate(e.target.value)} 
        />
        <Input 
          label="Description (Optional)" 
          value={description} 
          onChange={(e) => setDescription(e.target.value)} 
          placeholder="What was this for?" 
        />
        <div className="pt-4">
          <Button isLoading={isSubmitting} className="w-full py-4 text-lg">
            Save Transaction
          </Button>
          <Button variant="ghost" className="w-full mt-2" onClick={onSuccess}>
            Cancel
          </Button>
        </div>
      </form>
    </motion.div>
  );
}

function ChatView({ 
  transactions, 
  creditScore, 
  insight 
}: { 
  transactions: Transaction[]; 
  creditScore: CreditScore | null; 
  insight: Insight | null; 
}) {
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([
    { role: 'ai', text: "Hello! I'm your FinAI assistant. How can I help you with your finances today?" }
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg = input;
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput("");
    setIsTyping(true);

    const aiResponse = await getFinancialAdvice(userMsg, transactions, creditScore || undefined, insight || undefined);
    
    setMessages(prev => [...prev, { role: 'ai', text: aiResponse }]);
    setIsTyping(false);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col h-[calc(100vh-180px)]"
    >
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">AI Financial Chat</h1>
        <p className="text-sm text-gray-500 font-medium">Ask me anything about your money</p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 custom-scrollbar">
        {messages.map((msg, i) => (
          <div key={i} className={cn(
            "flex",
            msg.role === 'user' ? "justify-end" : "justify-start"
          )}>
            <div className={cn(
              "max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed",
              msg.role === 'user' 
                ? "bg-indigo-600 text-white rounded-tr-none" 
                : "bg-white border border-gray-100 text-gray-800 rounded-tl-none shadow-sm"
            )}>
              <div className="prose prose-sm prose-indigo max-w-none">
                <ReactMarkdown>
                  {msg.text}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-100 p-4 rounded-2xl rounded-tl-none shadow-sm">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
            </div>
          </div>
        )}
      </div>

      <div className="relative mt-auto">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask a question..."
          className="w-full pl-5 pr-14 py-4 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white shadow-lg shadow-gray-100"
        />
        <button 
          onClick={handleSend}
          className="absolute right-2 top-2 bottom-2 w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center hover:bg-indigo-700 transition-all active:scale-90"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </motion.div>
  );
}
