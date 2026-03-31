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
import { motion, AnimatePresence } from "framer-motion";
import clsx, { type ClassValue } from "clsx";
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
      userId: auth.currentUser?.uid || 'unknown',
      email: auth.currentUser?.email || 'unknown',
      emailVerified: auth.currentUser?.emailVerified || false,
      isAnonymous: auth.currentUser?.isAnonymous || false,
      tenantId: auth.currentUser?.tenantId || '',
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName || '',
        email: provider.email || '',
        photoUrl: provider.photoURL || ''
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

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 transition-all",
        active ? "text-indigo-600 scale-110" : "text-gray-400 hover:text-gray-600"
      )}
    >
      <div className={cn(
        "p-2 rounded-xl transition-all",
        active ? "bg-indigo-50" : "bg-transparent"
      )}>
        {React.isValidElement(icon) && React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: "w-6 h-6" })}
      </div>
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </button>
  );
}

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
      
      if (txs.length > 0) {
        const newInsight = calculateInsights(txs, user.uid);
        const newScore = calculateCreditScore(txs, user.uid);
        
        setInsight(newInsight);
        setCreditScore(newScore);

        setDoc(doc(db, "insights", user.uid), newInsight).catch(e => handleFirestoreError(e, OperationType.WRITE, `insights/${user.uid}`));
        setDoc(doc(db, "credit_scores", user.uid), newScore).catch(e => handleFirestoreError(e, OperationType.WRITE, `credit_scores/${user.uid}`));
      }
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "transactions");
    });

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
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
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
                key="dashboard"
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
                key="add"
                uid={user.uid} 
                onSuccess={() => setActiveTab('dashboard')} 
              />
            )}
            {activeTab === 'chat' && (
              <ChatView 
                key="chat"
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
  setIsLoading: (val: boolean) => void;
  user: FirebaseUser;
}) {
  const generateSampleData = async () => {
    setIsLoading(true);
    try {
      const samples: Omit<Transaction, 'id'>[] = [
        { uid: user.uid, amount: 5000, category: 'Salary', date: new Date().toISOString(), description: 'Monthly Pay', type: TransactionType.INCOME },
        { uid: user.uid, amount: 1200, category: 'Rent', date: new Date(Date.now() - 86400000).toISOString(), description: 'Apartment', type: TransactionType.EXPENSE },
        { uid: user.uid, amount: 150, category: 'Food', date: new Date(Date.now() - 172800000).toISOString(), description: 'Grocery Store', type: TransactionType.EXPENSE },
        { uid: user.uid, amount: 80, category: 'Transport', date: new Date(Date.now() - 259200000).toISOString(), description: 'Fuel', type: TransactionType.EXPENSE },
        { uid: user.uid, amount: 200, category: 'Utilities', date: new Date(Date.now() - 345600000).toISOString(), description: 'Electricity', type: TransactionType.EXPENSE },
      ];

      for (const s of samples) {
        await addDoc(collection(db, "transactions"), s);
      }
    } catch (error) {
      console.error("Error generating sample data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const balance = useMemo(() => {
    return transactions.reduce((acc, tx) => {
      return tx.type === TransactionType.INCOME ? acc + tx.amount : acc - tx.amount;
    }, 0);
  }, [transactions]);

  const chartData = useMemo(() => {
    const categories: Record<string, number> = {};
    transactions.filter(tx => tx.type === TransactionType.EXPENSE).forEach(tx => {
      categories[tx.category] = (categories[tx.category] || 0) + tx.amount;
    });
    return Object.entries(categories).map(([name, value]) => ({ name, value }));
  }, [transactions]);

  const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  if (isLoading && transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-4" />
        <p className="text-gray-500 font-medium">Loading your finances...</p>
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
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hello, {user.displayName?.split(' ')[0] || 'User'}!</h1>
          <p className="text-gray-500">Here's your financial overview.</p>
        </div>
        {transactions.length === 0 && (
          <Button variant="secondary" onClick={generateSampleData} className="text-xs py-2">
            Load Samples
          </Button>
        )}
      </div>

      {/* Balance Card */}
      <Card className="bg-indigo-600 text-white border-none shadow-indigo-200 shadow-lg relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
        <div className="relative z-10">
          <p className="text-indigo-100 text-sm font-medium uppercase tracking-wider mb-1">Total Balance</p>
          <h2 className="text-4xl font-bold mb-6">${balance.toLocaleString()}</h2>
          <div className="flex gap-4">
            <div className="bg-white/10 rounded-xl p-3 flex-1 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-indigo-100 text-xs mb-1">
                <ArrowUpRight className="w-3 h-3" /> Income
              </div>
              <p className="font-bold text-lg">
                ${transactions.filter(t => t.type === TransactionType.INCOME).reduce((a, b) => a + b.amount, 0).toLocaleString()}
              </p>
            </div>
            <div className="bg-white/10 rounded-xl p-3 flex-1 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-indigo-100 text-xs mb-1">
                <ArrowDownLeft className="w-3 h-3" /> Expenses
              </div>
              <p className="font-bold text-lg">
                ${transactions.filter(t => t.type === TransactionType.EXPENSE).reduce((a, b) => a + b.amount, 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Credit Score & Insights */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="flex flex-col items-center text-center justify-center py-6">
          <div className="relative w-24 h-24 flex items-center justify-center mb-3">
            <svg className="w-full h-full transform -rotate-90">
              <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-gray-100" />
              <circle 
                cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" 
                strokeDasharray={251.2}
                strokeDashoffset={251.2 - (251.2 * (creditScore?.score || 0) / 1000)}
                className="text-indigo-600 transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-bold text-gray-900 leading-none">{creditScore?.score || 0}</span>
              <span className="text-[10px] text-gray-400 font-bold uppercase mt-1">Score</span>
            </div>
          </div>
          <h3 className="font-bold text-sm text-gray-800">Credit Health</h3>
          <p className="text-xs text-gray-500 mt-1">{creditScore?.rating || 'Calculating...'}</p>
        </Card>

        <Card className="flex flex-col items-center text-center justify-center py-6 bg-amber-50 border-amber-100">
          <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mb-3">
            <Zap className="w-6 h-6 text-amber-600" />
          </div>
          <h3 className="font-bold text-sm text-amber-900">AI Insight</h3>
          <p className="text-xs text-amber-700 mt-1 line-clamp-2">
            {insight?.summary || "Add transactions to see insights."}
          </p>
        </Card>
      </div>

      {/* Spending Chart */}
      {chartData.length > 0 && (
        <Card>
          <h3 className="font-bold text-gray-900 mb-4">Spending by Category</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {chartData.map((entry, index) => (
              <div key={entry.name} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                <span className="text-xs text-gray-500 font-medium">{entry.name}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Recent Transactions */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">Recent Transactions</h3>
          <button className="text-indigo-600 text-sm font-bold">See All</button>
        </div>
        <div className="space-y-3">
          {transactions.slice(0, 5).map((tx) => (
            <Card key={tx.id} className="p-3 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center",
                  tx.type === TransactionType.INCOME ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                )}>
                  {tx.type === TransactionType.INCOME ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                </div>
                <div>
                  <p className="font-bold text-sm text-gray-900">{tx.description}</p>
                  <p className="text-xs text-gray-400 font-medium">{tx.category} • {format(parseISO(tx.date), 'MMM d')}</p>
                </div>
              </div>
              <p className={cn(
                "font-bold text-sm",
                tx.type === TransactionType.INCOME ? "text-emerald-600" : "text-gray-900"
              )}>
                {tx.type === TransactionType.INCOME ? '+' : '-'}${tx.amount.toLocaleString()}
              </p>
            </Card>
          ))}
          {transactions.length === 0 && (
            <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-200">
              <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">No transactions yet.</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function AddTransactionView({ uid, onSuccess }: { uid: string; onSuccess: () => void }) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Food');
  const [type, setType] = useState<TransactionType>(TransactionType.EXPENSE);
  const [smsText, setSmsText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const categories = [
    { label: 'Food', value: 'Food' },
    { label: 'Rent', value: 'Rent' },
    { label: 'Transport', value: 'Transport' },
    { label: 'Utilities', value: 'Utilities' },
    { label: 'Salary', value: 'Salary' },
    { label: 'Entertainment', value: 'Entertainment' },
    { label: 'Health', value: 'Health' },
    { label: 'Shopping', value: 'Shopping' },
    { label: 'Other', value: 'Other' },
  ];

  const handleSave = async () => {
    if (!amount || !description) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, "transactions"), {
        uid,
        amount: parseFloat(amount),
        description,
        category,
        type,
        date: new Date().toISOString()
      });
      onSuccess();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "transactions");
    } finally {
      setIsSaving(false);
    }
  };

  const handleParseSms = async () => {
    if (!smsText) return;
    setIsParsing(true);
    try {
      const parsed = await parseSmsToTransaction(smsText);
      if (parsed) {
        setAmount(parsed.amount.toString());
        setDescription(parsed.description);
        setCategory(parsed.category);
        setType(parsed.type);
      }
    } catch (error) {
      console.error("SMS Parse error:", error);
    } finally {
      setIsParsing(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <h1 className="text-2xl font-bold text-gray-900">Add Transaction</h1>

      <Card className="space-y-4">
        <div className="flex p-1 bg-gray-100 rounded-xl">
          <button 
            onClick={() => setType(TransactionType.EXPENSE)}
            className={cn(
              "flex-1 py-2 rounded-lg text-sm font-bold transition-all",
              type === TransactionType.EXPENSE ? "bg-white text-rose-600 shadow-sm" : "text-gray-500"
            )}
          >
            Expense
          </button>
          <button 
            onClick={() => setType(TransactionType.INCOME)}
            className={cn(
              "flex-1 py-2 rounded-lg text-sm font-bold transition-all",
              type === TransactionType.INCOME ? "bg-white text-emerald-600 shadow-sm" : "text-gray-500"
            )}
          >
            Income
          </button>
        </div>

        <Input 
          label="Amount" 
          type="number" 
          value={amount} 
          onChange={(e) => setAmount(e.target.value)} 
          placeholder="0.00" 
        />
        <Input 
          label="Description" 
          value={description} 
          onChange={(e) => setDescription(e.target.value)} 
          placeholder="What was this for?" 
        />
        <Select 
          label="Category" 
          value={category} 
          onChange={(e) => setCategory(e.target.value)} 
          options={categories} 
        />

        <Button onClick={handleSave} className="w-full py-4 mt-2" isLoading={isSaving}>
          Save Transaction
        </Button>
      </Card>

      <div className="relative py-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200"></div>
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-gray-50 px-2 text-gray-400 font-bold">Or Parse from SMS</span>
        </div>
      </div>

      <Card className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700 ml-1">SMS Text</label>
          <textarea 
            value={smsText}
            onChange={(e) => setSmsText(e.target.value)}
            placeholder="Paste your mobile money SMS here..."
            className="w-full h-32 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-gray-50/50 resize-none"
          />
        </div>
        <Button variant="secondary" onClick={handleParseSms} className="w-full" isLoading={isParsing}>
          <Zap className="w-4 h-4" /> Parse with AI
        </Button>
      </Card>
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
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', text: string }[]>([
    { role: 'ai', text: "Hi! I'm your FinAI assistant. Ask me anything about your spending, savings, or how to improve your credit score." }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsTyping(true);

    try {
      const advice = await getFinancialAdvice(userMsg, transactions, creditScore, insight);
      setMessages(prev => [...prev, { role: 'ai', text: advice }]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, { role: 'ai', text: "Sorry, I'm having trouble connecting right now. Please try again later." }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex flex-col h-[calc(100vh-180px)]"
    >
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
